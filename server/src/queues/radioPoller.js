/**
 * queues/radioPoller.js
 *
 * This is the core of persistence. Instead of polling inside a socket handler
 * (which dies when the socket disconnects), we use a BullMQ repeating job
 * stored in Redis. Each active radio gets one job with a unique jobId.
 *
 * Key properties:
 *   - Jobs survive server restarts (they live in Redis, not RAM)
 *   - If the server crashes mid-poll, BullMQ retries automatically
 *   - Host can close their browser — radio keeps broadcasting
 *   - At startup, we call resumeAllRadios() to re-register any active radios
 *     that might have lost their jobs (e.g. after a full Redis flush)
 *
 * Job flow per tick:
 *   1. Load radio + host tokens from DB
 *   2. Call Spotify API to get currently playing track
 *   3. If token was refreshed, update DB with new token
 *   4. If track changed → search YouTube + SoundCloud → update DB → broadcast
 *   5. If same track → just broadcast drift-correction position update
 *   6. If nothing playing → update DB (null track) → broadcast "paused" state
 */
"use strict";

const { Queue, Worker, QueueEvents } = require("bullmq");
const db       = require("../db/queries");
const spotify  = require("../lib/spotify");
const search   = require("../lib/search");
const logger   = require("../lib/logger");
const { createRedisConnection } = require("./redis");

const QUEUE_NAME    = "radio-poller";
const POLL_INTERVAL = 5_000; // ms — how often each radio is polled

// BullMQ requires separate Redis connections for Queue vs Worker
const queueConn  = createRedisConnection();
const workerConn = createRedisConnection();

const queue = new Queue(QUEUE_NAME, {
  connection: queueConn,
  defaultJobOptions: {
    removeOnComplete: { count: 1 },  // Keep only the last completed job in Redis
    removeOnFail:     { count: 10 }, // Keep last 10 failed for debugging
    attempts:         3,
    backoff:          { type: "exponential", delay: 2000 },
  },
});

// io is injected after the Socket.io server is created to avoid circular deps
let _io = null;
function setIO(io) { _io = io; }

// In-memory map of the last known track per radio — used to detect song changes
// without hammering the DB. Reset on server restart (that's fine — next poll catches up).
const lastKnownTrack = new Map(); // radioId → spotifyId | null

// ─────────────────────────────────────────────────────────────────────────────
// Job scheduler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start polling for a radio. Creates a repeating BullMQ job in Redis.
 * If a job already exists for this radio (idempotent), it's a no-op.
 */
async function startRadioPolling(radioId) {
  const jobId = `radio:${radioId}`;

  // Check if job already exists to avoid duplicates
  const existing = await queue.getJob(jobId);
  if (existing) {
    logger.info("Polling already running for radio", { radioId });
    return;
  }

  await queue.add(
    "poll",
    { radioId },
    {
      jobId,
      repeat: { every: POLL_INTERVAL },
    }
  );
  logger.info("Started polling for radio", { radioId });
}

/**
 * Stop polling for a radio. Removes the repeating job from Redis.
 * Called when a radio is deleted or deactivated.
 */
async function stopRadioPolling(radioId) {
  const jobId = `radio:${radioId}`;
  try {
    // Remove the repeating job definition
    await queue.removeRepeatable("poll", { every: POLL_INTERVAL }, jobId);
    // Also drain any pending executions of this job
    const job = await queue.getJob(jobId);
    if (job) await job.remove();
    logger.info("Stopped polling for radio", { radioId });
  } catch (err) {
    logger.error("Failed to stop polling for radio", err);
  }
}

/**
 * On server startup, re-register polling for all active radios.
 * This ensures that if the server restarts, all radios resume immediately.
 */
async function resumeAllRadios() {
  try {
    const radios = await db.getAllActiveRadios();
    logger.info(`Resuming polling for ${radios.length} active radios`);
    await Promise.all(radios.map((r) => startRadioPolling(r.id)));
  } catch (err) {
    logger.error("Failed to resume active radios at startup", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker — processes each polling job
// ─────────────────────────────────────────────────────────────────────────────

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { radioId } = job.data;

    // ── 1. Load radio and host from DB ────────────────────────────────────────
    const radio = await db.getRadioById(radioId);
    if (!radio || !radio.is_active) {
      // Radio was deleted or deactivated — stop the job
      await stopRadioPolling(radioId);
      return;
    }

    const host = await db.getUserById(radio.host_id);
    if (!host) {
      logger.warn("Radio has no host in DB — stopping poll", { radioId });
      await stopRadioPolling(radioId);
      return;
    }

    // ── 2. Poll Spotify for host's current track ───────────────────────────────
    const result = await spotify.getCurrentlyPlaying(
      host.id,
      host.access_token,
      host.refresh_token
    );

    if (!result) return; // Network error — job will retry via backoff

    // ── 3. Host is not playing anything ───────────────────────────────────────
    if (result.nothing) {
      // Only update DB + broadcast if we previously had a track
      if (lastKnownTrack.get(radioId) !== null) {
        lastKnownTrack.set(radioId, null);
        await db.updateCurrentTrack(radioId, null);
        // Notify all listeners in this room that the host paused
        _io?.to(radioId).emit("host_paused", { radioId });
        logger.info("Host stopped playing — radio paused", { radioId });
      }
      return;
    }

    const { track, currentToken } = result;

    // If the token was refreshed mid-poll, it's already been saved to DB by
    // spotify.js. Nothing extra needed here.

    // ── 4. Same track — just broadcast a drift-correction tick ────────────────
    if (lastKnownTrack.get(radioId) === track.spotifyId) {
      _io?.to(radioId).emit("position_update", {
        positionMs: track.positionMs,
        isPlaying:  track.isPlaying,
        serverTime: Date.now(),
      });
      return;
    }

    // ── 5. New track detected ─────────────────────────────────────────────────
    logger.info("New track detected", { radioId, title: track.title });
    lastKnownTrack.set(radioId, track.spotifyId);

const mediaResults = await search.searchBoth(track.title, track.artist, track.durationMs);
    const fullTrack = {
      ...track,
      ...mediaResults,
      startedAt: Date.now() - track.positionMs,
    };

    // Persist to DB so new listeners joining mid-song get the current state
    await db.updateCurrentTrack(radioId, fullTrack);

    // Broadcast to all connected listeners in this room
    _io?.to(radioId).emit("track_change", fullTrack);
  },
  {
    connection: workerConn,
    concurrency: 20, // Process up to 20 radio polls simultaneously
  }
);

worker.on("failed", (job, err) => {
  logger.error(`Poll job failed for radio ${job?.data?.radioId}`, err);
});

worker.on("error", (err) => {
  logger.error("BullMQ worker error", err);
});

module.exports = { startRadioPolling, stopRadioPolling, resumeAllRadios, setIO };
