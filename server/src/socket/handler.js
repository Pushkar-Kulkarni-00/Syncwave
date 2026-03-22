/**
 * socket/handler.js
 * Socket.io event handlers.
 *
 * Key difference from v1:
 *   - Users are identified by their DB user ID, not just a socket-local object
 *   - Room state is fetched from PostgreSQL, not an in-memory Map
 *   - Radio polling is managed by BullMQ, not setInterval
 *   - Disconnecting a socket does NOT close the radio or stop polling
 *   - The host can leave and come back — their radio persists
 */
"use strict";

const crypto    = require("crypto");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const db        = require("../db/queries");
const poller    = require("../queues/radioPoller");
const logger    = require("../lib/logger");
const {
  validateSpotifyId, validateDisplayName, validateAvatarUrl,
  validateAccessToken, validateRefreshToken, validateRoomName,
  validateCode, validateDbUserId,
} = require("../lib/validators");

// Per-user socket event rate limiter: 10 events/sec
const socketEventLimiter = new RateLimiterMemory({ points: 10, duration: 1 });
// Per-user room creation throttle: 3 rooms per 10 min
const roomCreationLimiter = new RateLimiterMemory({ points: 3, duration: 10 * 60 });

// In-memory map: socketId → { dbUserId, spotifyId, displayName, avatar, currentRoomId }
// This is intentionally lightweight — source of truth is the DB
const socketUsers = new Map();

function registerHandlers(io) {
  io.on("connection", (socket) => {
    logger.info("Socket connected", { socketId: socket.id });

    // ── Per-event rate limiting ──────────────────────────────────────────────
    socket.use(async ([event], next) => {
      const user = socketUsers.get(socket.id);
      const key  = user?.spotifyId ?? socket.id;
      try {
        await socketEventLimiter.consume(key);
        next();
      } catch {
        socket.emit("error", { code: 429, message: "Too many events. Slow down." });
      }
    });

    /**
     * identify
     * Called by the client after connecting, passing Spotify credentials.
     * We look up the user in the DB to confirm they've authenticated properly.
     * The dbUserId links the socket to the persistent DB record.
     */
    socket.on("identify", async (data) => {
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return socket.emit("error", { code: 400, message: "Invalid payload." });
      }

      const spotifyId  = validateSpotifyId(data.spotifyId);
      const dbUserId   = validateDbUserId(data.dbUserId);
      const displayName= validateDisplayName(data.displayName);
      const avatar     = validateAvatarUrl(data.avatar);
      const accessToken= validateAccessToken(data.accessToken);

      if (!spotifyId || !dbUserId || !accessToken) {
        return socket.emit("error", { code: 400, message: "Invalid credentials." });
      }

      // Verify user exists in DB — rejects forged dbUserIds
      const dbUser = await db.getUserById(dbUserId);
      if (!dbUser || dbUser.spotify_id !== spotifyId) {
        return socket.emit("error", { code: 401, message: "User not found." });
      }

      // Revoke any previous socket for the same Spotify user
      for (const [sid, u] of socketUsers) {
        if (u.spotifyId === spotifyId && sid !== socket.id) {
          socketUsers.delete(sid);
        }
      }

      socketUsers.set(socket.id, { dbUserId, spotifyId, displayName, avatar, currentRoomId: null });
      logger.info("User identified", { spotifyId, displayName });
      socket.emit("identified", { ok: true });
    });

    /**
     * create_radio
     * Creates a new radio in the DB and starts a BullMQ polling job for it.
     * The radio persists in the DB even after the host closes their browser.
     */
    socket.on("create_radio", async (data, callback) => {
      if (typeof callback !== "function") return;
      const user = socketUsers.get(socket.id);
      if (!user) return callback({ error: "Not authenticated." });

      try {
        await roomCreationLimiter.consume(user.spotifyId);
      } catch {
        return callback({ error: "Creating rooms too quickly. Wait a few minutes." });
      }

      const radioName = validateRoomName(data?.name) ?? `${user.displayName}'s Radio`;
const isPublic  = data?.isPublic === false ? false : true;

let expiresAt = null;
if (data?.expiresAt) {
  const ts = parseInt(data.expiresAt, 10);
  if (!isNaN(ts) && ts > Date.now()) {
    expiresAt = new Date(ts).toISOString();
  }
}

      const radioId    = crypto.randomBytes(3).toString("hex").toUpperCase();
      const inviteCode = crypto.randomBytes(4).toString("hex").toUpperCase();

      try {
        const radio = await db.createRadio({
          id:         radioId,
          hostId:     user.dbUserId,
          name:       radioName,
          isPublic,
          inviteCode,
          expiresAt,
        });

        // Start the persistent BullMQ polling job
        await poller.startRadioPolling(radioId);

        // Join the socket room so the host receives broadcasts
        socket.join(radioId);
        user.currentRoomId = radioId;

        logger.info("Radio created", { radioId, hostName: user.displayName, isPublic });

        callback({
          radioId,
          inviteCode,
          inviteUrl: `${process.env.CLIENT_URL}/join/${inviteCode}`,
          expiresAt: radio.expires_at,
        });
      } catch (err) {
        logger.error("Failed to create radio", err);
        callback({ error: "Failed to create radio. Please try again." });
      }
    });

    /**
     * join_radio
     * Join an existing radio room.
     * Fetches current track from DB so the listener syncs immediately,
     * even if the host is offline.
     */
    socket.on("join_radio", async (data, callback) => {
      if (typeof callback !== "function") return;
      const user = socketUsers.get(socket.id);
      if (!user) return callback({ error: "Not authenticated." });

      const radioId    = data?.radioId    ? validateCode(data.radioId)                    : null;
      const inviteCode = data?.inviteCode ? validateCode(data.inviteCode?.toUpperCase())  : null;

      if (!radioId && !inviteCode) {
        return callback({ error: "Invalid radio ID or invite code." });
      }

      try {
        const radio = radioId
          ? await db.getRadioById(radioId)
          : await db.getRadioByInviteCode(inviteCode);

        if (!radio || !radio.is_active) {
  return callback({ error: "Radio not found." });
}
// Grant permanent membership when joining via invite code
if (inviteCode && !radio.is_public) {
  await db.addRadioMember(radio.id, user.dbUserId);
}

// Check access for private radios
if (!radio.is_public) {
  const isHost   = radio.host_id === user.dbUserId;
  const isMember = await db.isRadioMember(radio.id, user.dbUserId);
  if (!isHost && !isMember) {
    return callback({ error: "This radio is private. You need an invite link." });
  }
}


        // Leave previous room cleanly
        if (user.currentRoomId && user.currentRoomId !== radio.id) {
          socket.leave(user.currentRoomId);
          const prevRoom = io.sockets.adapter.rooms.get(user.currentRoomId);
          io.to(user.currentRoomId).emit("listener_count", prevRoom?.size ?? 0);
        }

        socket.join(radio.id);
        user.currentRoomId = radio.id;

        const listenerCount = io.sockets.adapter.rooms.get(radio.id)?.size ?? 1;
        io.to(radio.id).emit("listener_count", listenerCount);

        logger.info("User joined radio", { displayName: user.displayName, radioId: radio.id });

        callback({
  ok: true,
  radio: {
    id:           radio.id,
    name:         radio.name,
    host_id:      radio.host_id,
    hostName:     radio.host_name,
    hostAvatar:   radio.host_avatar,
    isPublic:     radio.is_public,
    invite_code:  radio.invite_code,
    expiresAt:    radio.expires_at,
    currentTrack: radio.current_track,
    listenerCount,
  },
});
      } catch (err) {
        logger.error("Failed to join radio", err);
        callback({ error: "Failed to join radio." });
      }
    });

    /**
     * delete_radio
     * Host can permanently delete their radio.
     * Stops the BullMQ job and removes the DB row.
     */
    socket.on("delete_radio", async (data, callback) => {
      if (typeof callback !== "function") return;
      const user = socketUsers.get(socket.id);
      if (!user) return callback({ error: "Not authenticated." });

      const radioId = validateCode(data?.radioId);
      if (!radioId) return callback({ error: "Invalid radio ID." });

      try {
        const radio = await db.getRadioById(radioId);
        if (!radio) return callback({ error: "Radio not found." });
        if (radio.host_id !== user.dbUserId) return callback({ error: "Not your radio." });

        await poller.stopRadioPolling(radioId);
        await db.deleteRadio(radioId);

        io.to(radioId).emit("room_closed", { reason: "Host deleted this radio." });
        logger.info("Radio deleted", { radioId });
        callback({ ok: true });
      } catch (err) {
        logger.error("Failed to delete radio", err);
        callback({ error: "Failed to delete radio." });
      }
    });

    /**
     * get_my_radios
     * Returns all radios owned by the authenticated user.
     * Used to show the host their radios on the dashboard.
     */
    socket.on("get_my_radios", async (callback) => {
      if (typeof callback !== "function") return;
      const user = socketUsers.get(socket.id);
      if (!user) return callback({ error: "Not authenticated." });

      try {
        const [radios, memberRadios] = await Promise.all([
  db.getRadiosByHostId(user.dbUserId),
  db.getRadioMemberships(user.dbUserId),
]);
callback({ ok: true, radios, memberRadios });
} catch (err) {
  logger.error("Failed to fetch user radios", err);
  callback({ error: "Failed to fetch radios." });
}
});

/**
* get_radio_members
* Returns all members of a private radio — host only.
*/
socket.on("get_radio_members", async (data, callback) => {
if (typeof callback !== "function") return;
const user = socketUsers.get(socket.id);
if (!user) return callback({ error: "Not authenticated." });

const radioId = validateCode(data?.radioId);
if (!radioId) return callback({ error: "Invalid radio ID." });

try {
const radio = await db.getRadioById(radioId);
if (!radio) return callback({ error: "Radio not found." });
if (radio.host_id !== user.dbUserId) return callback({ error: "Not your radio." });

const members = await db.getRadioMembers(radioId);
callback({ ok: true, members });
} catch (err) {
logger.error("Failed to get radio members", err);
callback({ error: "Failed to fetch members." });
}
});
socket.on("get_listeners", async (data, callback) => {
  if (typeof callback !== "function") return;
  const user = socketUsers.get(socket.id);
  if (!user) return callback({ error: "Not authenticated." });

  const radioId = validateCode(data?.radioId);
  if (!radioId) return callback({ error: "Invalid radio ID." });

  // Get all sockets currently in this room
  const roomSockets = io.sockets.adapter.rooms.get(radioId);
  if (!roomSockets) return callback({ ok: true, listeners: [] });

  const listeners = [];
  for (const sid of roomSockets) {
    const u = socketUsers.get(sid);
    if (u) {
      listeners.push({
        displayName: u.displayName,
        avatar:      u.avatar,
        dbUserId:    u.dbUserId,
      });
    }
  }
  callback({ ok: true, listeners });
});
/**
* remove_radio_member
* Host removes a member from their private radio.
* The removed user loses access immediately.
*/
socket.on("remove_radio_member", async (data, callback) => {
if (typeof callback !== "function") return;
const user = socketUsers.get(socket.id);
if (!user) return callback({ error: "Not authenticated." });

const radioId      = validateCode(data?.radioId);
const targetUserId = data?.userId ? parseInt(data.userId, 10) : null;

if (!radioId || !targetUserId) return callback({ error: "Invalid data." });

try {
const radio = await db.getRadioById(radioId);
if (!radio) return callback({ error: "Radio not found." });
if (radio.host_id !== user.dbUserId) return callback({ error: "Not your radio." });
if (targetUserId === user.dbUserId) return callback({ error: "Cannot remove yourself." });

await db.removeRadioMember(radioId, targetUserId);

// Kick the removed user out of the room if they're currently connected
for (const [sid, u] of socketUsers) {
  if (u.dbUserId === targetUserId && u.currentRoomId === radioId) {
    io.to(sid).emit("room_closed", { reason: "You have been removed from this radio." });
    const s = io.sockets.sockets.get(sid);
    if (s) {
      s.leave(radioId);
      u.currentRoomId = null;
    }
    break;
  }
}

logger.info("Member removed from radio", { radioId, targetUserId });
callback({ ok: true });
} catch (err) {
logger.error("Failed to remove radio member", err);
callback({ error: "Failed to remove member." });
}
});
    /**
     * leave_radio — voluntary disconnect from a room.
     * Note: this does NOT stop the radio. The BullMQ job keeps running.
     */
    socket.on("leave_radio", () => {
      const user = socketUsers.get(socket.id);
      if (!user?.currentRoomId) return;
      socket.leave(user.currentRoomId);
      const room = io.sockets.adapter.rooms.get(user.currentRoomId);
      io.to(user.currentRoomId).emit("listener_count", room?.size ?? 0);
      user.currentRoomId = null;
    });

    /**
     * disconnect — clean up socket state.
     * Radio polling is NOT stopped — it runs independently in BullMQ.
     */
    socket.on("disconnect", () => {
      const user = socketUsers.get(socket.id);
      if (user?.currentRoomId) {
        const room = io.sockets.adapter.rooms.get(user.currentRoomId);
        io.to(user.currentRoomId).emit("listener_count", (room?.size ?? 1) - 1);
      }
      socketUsers.delete(socket.id);
      logger.info("Socket disconnected", { socketId: socket.id });
    });

  });
}

module.exports = { registerHandlers };
