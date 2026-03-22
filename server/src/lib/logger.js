/**
 * lib/logger.js
 * Minimal structured logger that scrubs any sensitive fields before output.
 * In production, pipe stdout to a log aggregator (Datadog, Logtail, etc.)
 */
"use strict";

const SENSITIVE = /token|secret|key|password|auth|enc$/i;

function scrub(obj) {
  if (!obj || typeof obj !== "object") return obj;
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !SENSITIVE.test(k))
  );
}

function fmt(level, msg, meta) {
  const ts   = new Date().toISOString();
  const safe = meta ? scrub(meta) : undefined;
  const line = safe && Object.keys(safe).length
    ? `[${level}] ${ts} — ${msg} ${JSON.stringify(safe)}`
    : `[${level}] ${ts} — ${msg}`;
  return line;
}

const logger = {
  info:  (msg, meta) => console.log(fmt("INFO ", msg, meta)),
  warn:  (msg, meta) => console.warn(fmt("WARN ", msg, meta)),
  // Only log err.message — never log full axios errors (contain auth headers)
  error: (msg, err)  => console.error(fmt("ERROR", msg), err?.message ?? String(err ?? "")),
};

module.exports = logger;
