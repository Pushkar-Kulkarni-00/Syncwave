/**
 * db/migrate.js
 * Run once to create the database schema: node src/db/migrate.js
 *
 * Tables:
 *   users  — one row per Spotify account that has ever logged in
 *   radios — one row per radio a user has created (persists across restarts)
 *
 * Design decisions:
 *   - refresh_token is stored AES-256-GCM encrypted (see lib/crypto.js)
 *   - current_track is a JSONB column — flexible, no schema migration needed when track shape changes
 *   - radios.is_active controls whether the BullMQ poller runs for that radio
 */
"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const pool = require("./pool");

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── users ─────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id               SERIAL PRIMARY KEY,
        spotify_id       VARCHAR(32)  NOT NULL UNIQUE,
        display_name     VARCHAR(100) NOT NULL DEFAULT 'Unknown',
        avatar_url       VARCHAR(512),
        -- Refresh token encrypted with AES-256-GCM before storage.
        -- Never store plaintext tokens in a database.
        refresh_token_enc TEXT        NOT NULL,
        -- Access token is short-lived (1hr) — cache it so we don't refresh
        -- on every server restart. Will be refreshed automatically when it expires.
        access_token_enc  TEXT        NOT NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── radios ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS radios (
        id            VARCHAR(8)   PRIMARY KEY,   -- 6-char hex, e.g. "A3F9C1"
        host_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name          VARCHAR(60)  NOT NULL,
        is_public     BOOLEAN      NOT NULL DEFAULT TRUE,
        invite_code   VARCHAR(8)   NOT NULL UNIQUE,  -- 8-char hex
        is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
        -- JSONB: stores the full current track object.
        -- Null when host is not playing anything.
        current_track JSONB,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    // Index for fast lookup by invite code and host
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_radios_invite_code ON radios(invite_code);
      CREATE INDEX IF NOT EXISTS idx_radios_host_id     ON radios(host_id);
      CREATE INDEX IF NOT EXISTS idx_radios_is_active   ON radios(is_active) WHERE is_active = TRUE;
    `);

    // Auto-update updated_at on any row change
    await client.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS users_set_updated_at  ON users;
      DROP TRIGGER IF EXISTS radios_set_updated_at ON radios;

      CREATE TRIGGER users_set_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      CREATE TRIGGER radios_set_updated_at
        BEFORE UPDATE ON radios
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    await client.query("COMMIT");
    console.log("[migrate] ✓ Schema applied successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[migrate] ✗ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
