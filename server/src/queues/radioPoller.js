/**
 * queues/radioPoller.js — updated with expiry support
 */
"use strict";

const { Queue, Worker } = require("bullmq");
const db       = require("../db/queries");
const spotify  = require("../lib/spotify");
const search   = require("../lib/search");
const logger   = require("../lib/logger");
const { createRedisConnection } = require("./redis");

const QUEUE_NAME    = "radio-poller";
const POLL_INTERVAL = 5_000;

const queueConn  = createRedisConnection();
const workerConn = createRedisConnection();

const queue = new Queue(QUEUE_NAME, {
  connection: queueConn,
  defaultJobOptions: {
    removeOnComplete: { count: 1 },
    removeOnFail:     { count: 10 },
    attempts:         3,
    backoff:          { type: "exponential", delay: 2000 },
  },
});

let _io = null;
function setIO(io) { _io = io; }

const lastKnownTrack = new Map();

async function startRadioPolling(radioId) {
  const jobId = `radio:${radioId}`;
  const existing = await queue.getJob(jobId);
  if (existing) {
    logger.info("Polling already running for radio", { radioId });
    return;
  }
  await queue.add("poll", { radioId }, { jobId, repeat: { every: POLL_INTERVAL } });
  logger.info("Started polling for radio", { radioId });
}

async function stopRadioPolling(radioId) {
  const jobId = `radio:${radioId}`;
  try {
    await queue.removeRepeatable("poll", { every: POLL_INTERVAL }, jobId);
    const job = await queue.getJob(jobId);
    if (job) await job.remove();
    logger.info("Stopped polling for radio", { radioId });
  } catch (err) {
    logger.error("Failed to stop polling for radio", err);
  }
}

async function resumeAllRadios() {
  try {
    const radios = await db.getAllActiveRadios();
    logger.info(`Resuming polling for ${radios.length} active radios`);
    await Promise.all(radios.map((r) => startRadioPolling(r.id)));
  } catch (err) {
    logger.error("Failed to resume active radios at startup", err);
  }
}

// ─── Expiry checker — runs every 60s ─────────────────────────────────────────
// Finds radios whose expires_at has passed and deactivates them cleanly.
async function startExpiryChecker() {
  setInterval(async () => {
    try {
      const expired = await db.getExpiredRadios();
      for (const { id } of expired) {
        logger.info("Radio expired — deactivating", { radioId: id });
        await stopRadioPolling(id);
        await db.setRadioActive(id, false);
        // Notify all connected listeners
        _io?.to(id).emit("room_closed", { reason: "Radio has expired." });
      }
    } catch (err) {
      logger.error("Expiry checker failed", err);
    }
  }, 60_000); // Check every minute
}

// ─── Worker ───────────────────────────────────────────────────────────────────
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { radioId } = job.data;

    const radio = await db.getRadioById(radioId);
    if (!radio || !radio.is_active) {
      await stopRadioPolling(radioId);
      return;
    }

    // ── Check expiry on every poll tick too (belt and suspenders) ────────────
    if (radio.expires_at && new Date(radio.expires_at) <= new Date()) {
      logger.info("Radio expired during poll — deactivating", { radioId });
      await stopRadioPolling(radioId);
      await db.setRadioActive(radioId, false);
      _io?.to(radioId).emit("room_closed", { reason: "Radio has expired." });
      return;
    }

    const host = await db.getUserById(radio.host_id);
    if (!host) {
      logger.warn("Radio has no host in DB — stopping poll", { radioId });
      await stopRadioPolling(radioId);
      return;
    }

    const result = await spotify.getCurrentlyPlaying(
      host.id,
      host.access_token,
      host.refresh_token
    );

    if (!result) return;

    if (result.nothing) {
      if (lastKnownTrack.get(radioId) !== null) {
        lastKnownTrack.set(radioId, null);
        await db.updateCurrentTrack(radioId, null);
        _io?.to(radioId).emit("host_paused", { radioId });
        logger.info("Host stopped playing — radio paused", { radioId });
      }
      return;
    }

    const { track } = result;

    if (lastKnownTrack.get(radioId) === track.spotifyId) {
      _io?.to(radioId).emit("position_update", {
        positionMs: track.positionMs,
        isPlaying:  track.isPlaying,
        serverTime: Date.now(),
      });
      return;
    }

    logger.info("New track detected", { radioId, title: track.title });
    lastKnownTrack.set(radioId, track.spotifyId);

    const mediaResults = await search.searchBoth(track.title, track.artist, track.durationMs);

    const fullTrack = {
      ...track,
      ...mediaResults,
      startedAt: Date.now() - track.positionMs,
    };

    await db.updateCurrentTrack(radioId, fullTrack);
    _io?.to(radioId).emit("track_change", fullTrack);
  },
  { connection: workerConn, concurrency: 20 }
);

worker.on("failed", (job, err) => {
  logger.error(`Poll job failed for radio ${job?.data?.radioId}`, err);
});

worker.on("error", (err) => {
  logger.error("BullMQ worker error", err);
});

module.exports = { startRadioPolling, stopRadioPolling, resumeAllRadios, startExpiryChecker, setIO };