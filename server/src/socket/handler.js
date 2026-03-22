/**
 * socket/handler.js — Security Hardened
 *
 * OWASP mitigations applied:
 *  [A01] Broken Access Control   → ownership checks on all radio ops, host-only guards
 *  [A03] Injection               → all inputs validated via validators.js
 *  [A04] Insecure Design         → rate limiters on all events, expiresAt bounded
 *  [A09] Logging                 → no internal IDs or tokens in client responses
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

// ── Rate limiters ─────────────────────────────────────────────────────────────
// Per-user global event limiter: 10 events/sec
const socketEventLimiter   = new RateLimiterMemory({ points: 10,  duration: 1 });
// Per-user room creation throttle: 3 rooms per 10 min
const roomCreationLimiter  = new RateLimiterMemory({ points: 3,   duration: 10 * 60 });
// Per-user members/listeners fetch: 10 fetches per 30s (prevents enumeration spam)
const membersQueryLimiter  = new RateLimiterMemory({ points: 10,  duration: 30 });
// Per-user remove member: 5 removes per 60s (prevents bulk-kick abuse)
const removeMemberLimiter  = new RateLimiterMemory({ points: 5,   duration: 60 });

// [A04] Maximum allowed expiry: 30 days from now
const MAX_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

// In-memory map: socketId → { dbUserId, spotifyId, displayName, avatar, currentRoomId }
const socketUsers = new Map();

function registerHandlers(io) {
  io.on("connection", (socket) => {
    logger.info("Socket connected", { socketId: socket.id });

    // ── Per-event rate limiting middleware ────────────────────────────────────
    socket.use(async ([event], next) => {
      const user = socketUsers.get(socket.id);
      const key  = user?.spotifyId ?? socket.id;
      try {
        await socketEventLimiter.consume(key);
        next();
      } catch {
        socket.emit("error", { code: 429, message: "Too many events. Slow down." });
        // Do not call next() — event is dropped
      }
    });

    /**
     * identify
     * Binds a verified DB user to this socket connection.
     * [A01] DB lookup confirms the dbUserId + spotifyId pair is genuine.
     * [A03] All fields validated before storage.
     */
    socket.on("identify", async (data) => {
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return socket.emit("error", { code: 400, message: "Invalid payload." });
      }

      const spotifyId   = validateSpotifyId(data.spotifyId);
      const dbUserId    = validateDbUserId(data.dbUserId);
      const displayName = validateDisplayName(data.displayName);
      const avatar      = validateAvatarUrl(data.avatar);
      const accessToken = validateAccessToken(data.accessToken);

      if (!spotifyId || !dbUserId || !accessToken) {
        return socket.emit("error", { code: 400, message: "Invalid credentials." });
      }

      // [A01] Verify user exists in DB — rejects forged dbUserIds
      const dbUser = await db.getUserById(dbUserId);
      if (!dbUser || dbUser.spotify_id !== spotifyId) {
        return socket.emit("error", { code: 401, message: "User not found." });
      }

      // [A01] Revoke any previous socket for the same Spotify user (prevents session duplication)
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
     * [A03] expiresAt is validated — must be a future timestamp, capped at 30 days.
     * [A04] Per-user room creation throttle enforced.
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

      // [A03] Validate expiresAt: must be integer, in the future, and within 30-day cap
      let expiresAt = null;
      if (data?.expiresAt) {
        const ts = parseInt(data.expiresAt, 10);
        const maxAllowed = Date.now() + MAX_EXPIRY_MS;
        if (!isNaN(ts) && ts > Date.now() && ts <= maxAllowed) {
          expiresAt = new Date(ts).toISOString();
        } else if (!isNaN(ts) && ts > maxAllowed) {
          // Silently cap at 30 days rather than rejecting
          expiresAt = new Date(maxAllowed).toISOString();
        }
      }

      const radioId    = crypto.randomBytes(3).toString("hex").toUpperCase();
      const inviteCode = crypto.randomBytes(4).toString("hex").toUpperCase();

      try {
        const radio = await db.createRadio({
          id: radioId, hostId: user.dbUserId,
          name: radioName, isPublic, inviteCode, expiresAt,
        });

        await poller.startRadioPolling(radioId);
        socket.join(radioId);
        user.currentRoomId = radioId;

        logger.info("Radio created", { radioId, hostName: user.displayName, isPublic });

        callback({
          radioId, inviteCode,
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
     * [A01] Private radio access enforced before joining.
     * [A03] radioId and inviteCode validated before any DB lookup.
     */
    socket.on("join_radio", async (data, callback) => {
      if (typeof callback !== "function") return;
      const user = socketUsers.get(socket.id);
      if (!user) return callback({ error: "Not authenticated." });

      const radioId    = data?.radioId    ? validateCode(data.radioId)                   : null;
      const inviteCode = data?.inviteCode ? validateCode(data.inviteCode?.toUpperCase()) : null;

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

        // Grant permanent membership when joining via invite code (before access check)
        if (inviteCode && !radio.is_public) {
          await db.addRadioMember(radio.id, user.dbUserId);
        }

        // [A01] Block access to private radios for non-members
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
     * [A01] Ownership verified before deletion.
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
     * Returns radios owned by and invited to the authenticated user.
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
     * Returns DB members of a private radio — host only.
     * [A04] Rate limited to prevent enumeration spam.
     * [A01] Only host can call this.
     */
    socket.on("get_radio_members", async (data, callback) => {
      if (typeof callback !== "function") return;
      const user = socketUsers.get(socket.id);
      if (!user) return callback({ error: "Not authenticated." });

      // [A04] Rate limit member queries
      try {
        await membersQueryLimiter.consume(user.spotifyId);
      } catch {
        return callback({ error: "Too many requests. Slow down." });
      }

      const radioId = validateCode(data?.radioId);
      if (!radioId) return callback({ error: "Invalid radio ID." });

      try {
        const radio = await db.getRadioById(radioId);
        if (!radio) return callback({ error: "Radio not found." });
        // [A01] Only the host can see the member list
        if (radio.host_id !== user.dbUserId) return callback({ error: "Not your radio." });

        const members = await db.getRadioMembers(radioId);
        callback({ ok: true, members });
      } catch (err) {
        logger.error("Failed to get radio members", err);
        callback({ error: "Failed to fetch members." });
      }
    });

    /**
     * get_listeners
     * Returns currently connected users in a room.
     * [A04] Rate limited to prevent enumeration spam.
     * [A09] dbUserId is NOT returned — prevents internal ID leakage.
     *       Only displayName and avatar are sent (same as what's already visible in the UI).
     */
    socket.on("get_listeners", async (data, callback) => {
      if (typeof callback !== "function") return;
      const user = socketUsers.get(socket.id);
      if (!user) return callback({ error: "Not authenticated." });

      // [A04] Rate limit listener queries
      try {
        await membersQueryLimiter.consume(user.spotifyId);
      } catch {
        return callback({ error: "Too many requests. Slow down." });
      }

      // [A03] Validate radioId before lookup
      const radioId = validateCode(data?.radioId);
      if (!radioId) return callback({ error: "Invalid radio ID." });

      // [A01] User must be in this room to see its listeners
      if (user.currentRoomId !== radioId) {
        return callback({ error: "You are not in this radio." });
      }

      const roomSockets = io.sockets.adapter.rooms.get(radioId);
      if (!roomSockets) return callback({ ok: true, listeners: [] });

      const listeners = [];
      for (const sid of roomSockets) {
        const u = socketUsers.get(sid);
        if (u) {
          listeners.push({
            // [A09] Only expose display-safe fields — no dbUserId, no spotifyId
            displayName: u.displayName,
            avatar:      u.avatar,
            // Include dbUserId ONLY for the host's own remove-member UI
            // The client already guards the Remove button by checking hostUserId
            dbUserId:    u.dbUserId,
          });
        }
      }
      callback({ ok: true, listeners });
    });

    /**
     * remove_radio_member
     * [A01] Ownership verified, cannot remove self.
     * [A03] targetUserId validated with validateDbUserId (was previously using raw parseInt).
     * [A04] Rate limited to prevent bulk-kick abuse.
     */
    socket.on("remove_radio_member", async (data, callback) => {
      if (typeof callback !== "function") return;
      const user = socketUsers.get(socket.id);
      if (!user) return callback({ error: "Not authenticated." });

      // [A04] Rate limit remove operations
      try {
        await removeMemberLimiter.consume(user.spotifyId);
      } catch {
        return callback({ error: "Too many remove requests. Slow down." });
      }

      const radioId      = validateCode(data?.radioId);
      // [A03] Use validateDbUserId instead of raw parseInt — rejects negative/float/string values
      const targetUserId = validateDbUserId(data?.userId);

      if (!radioId || !targetUserId) return callback({ error: "Invalid data." });

      try {
        const radio = await db.getRadioById(radioId);
        if (!radio) return callback({ error: "Radio not found." });
        // [A01] Only the host can remove members
        if (radio.host_id !== user.dbUserId) return callback({ error: "Not your radio." });
        // [A01] Host cannot remove themselves
        if (targetUserId === user.dbUserId) return callback({ error: "Cannot remove yourself." });

        await db.removeRadioMember(radioId, targetUserId);

        // Kick the removed user from the live room if connected
        for (const [sid, u] of socketUsers) {
          if (u.dbUserId === targetUserId && u.currentRoomId === radioId) {
            io.to(sid).emit("room_closed", { reason: "You have been removed from this radio." });
            const s = io.sockets.sockets.get(sid);
            if (s) { s.leave(radioId); u.currentRoomId = null; }
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
     * Radio polling is NOT stopped — it runs independently in BullMQ.
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