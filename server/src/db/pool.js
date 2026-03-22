/**
 * db/pool.js
 * PostgreSQL connection pool via the `pg` library.
 * Neon provides a connection string with SSL required — we enforce that here.
 * The pool is created once and reused across all modules.
 */
"use strict";

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("[FATAL] DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },  // Neon requires SSL; never disable this
  max: 10,                             // Max concurrent connections in the pool
  idleTimeoutMillis: 30_000,           // Close idle connections after 30s
  connectionTimeoutMillis: 5_000,      // Fail fast if DB is unreachable
});

pool.on("error", (err) => {
  // Log but don't crash — the pool will recover on next query
  console.error("[DB] Unexpected pool error:", err.message);
});

module.exports = pool;
