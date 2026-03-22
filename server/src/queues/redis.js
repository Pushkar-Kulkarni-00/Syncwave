/**
 * queues/redis.js
 * Single shared ioredis connection used by BullMQ.
 * Upstash requires TLS (rediss://) and has specific connection options.
 */
"use strict";

const { Redis } = require("ioredis");
const logger    = require("../lib/logger");

if (!process.env.REDIS_URL) {
  console.error("[FATAL] REDIS_URL is not set");
  process.exit(1);
}

// BullMQ requires a dedicated connection — it sets its own event listeners.
// We export a factory function so BullMQ can create separate connections for
// the Queue and the Worker (they must not share a connection).
function createRedisConnection() {
  const conn = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck:     false,
    tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
  });

  conn.on("error",   (err) => logger.error("Redis connection error", err));
  conn.on("connect", ()    => logger.info("Redis connected"));

  return conn;
}

module.exports = { createRedisConnection };
