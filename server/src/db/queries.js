/**
 * db/queries.js
 * All database operations in one place.
 * Every function uses parameterised queries — no string interpolation,
 * which means SQL injection is structurally impossible here.
 */
"use strict";

const pool        = require("./pool");
const { encrypt, decrypt } = require("../lib/crypto");

// ─── Users ────────────────────────────────────────────────────────────────────

/**
 * Upsert a user after Spotify OAuth.
 * If the Spotify ID already exists, update tokens and display info.
 * Returns the full user row (with decrypted tokens).
 */
async function upsertUser({ spotifyId, displayName, avatarUrl, accessToken, refreshToken }) {
  const refreshEnc = encrypt(refreshToken);
  const accessEnc  = encrypt(accessToken);

  const { rows } = await pool.query(
    `INSERT INTO users (spotify_id, display_name, avatar_url, refresh_token_enc, access_token_enc)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (spotify_id) DO UPDATE SET
       display_name      = EXCLUDED.display_name,
       avatar_url        = EXCLUDED.avatar_url,
       refresh_token_enc = EXCLUDED.refresh_token_enc,
       access_token_enc  = EXCLUDED.access_token_enc
     RETURNING id, spotify_id, display_name, avatar_url`,
    [spotifyId, displayName, avatarUrl, refreshEnc, accessEnc]
  );
  return rows[0];
}

/**
 * Get a user by their internal DB id.
 * Returns decrypted tokens for server-side use.
 */
async function getUserById(id) {
  const { rows } = await pool.query(
    `SELECT id, spotify_id, display_name, avatar_url, refresh_token_enc, access_token_enc
     FROM users WHERE id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  return {
    ...rows[0],
    refresh_token: decrypt(rows[0].refresh_token_enc),
    access_token:  decrypt(rows[0].access_token_enc),
  };
}

/**
 * Get a user by Spotify ID.
 * Returns decrypted tokens for server-side use.
 */
async function getUserBySpotifyId(spotifyId) {
  const { rows } = await pool.query(
    `SELECT id, spotify_id, display_name, avatar_url, refresh_token_enc, access_token_enc
     FROM users WHERE spotify_id = $1`,
    [spotifyId]
  );
  if (!rows[0]) return null;
  return {
    ...rows[0],
    refresh_token: decrypt(rows[0].refresh_token_enc),
    access_token:  decrypt(rows[0].access_token_enc),
  };
}

/**
 * Update only the access token (called after a token refresh).
 * Refresh token stays the same.
 */
async function updateAccessToken(userId, accessToken) {
  await pool.query(
    `UPDATE users SET access_token_enc = $1 WHERE id = $2`,
    [encrypt(accessToken), userId]
  );
}

// ─── Radios ───────────────────────────────────────────────────────────────────

/**
 * Create a new radio for a user.
 * Returns the created radio row.
 */
async function createRadio({ id, hostId, name, isPublic, inviteCode, expiresAt }) {
  const { rows } = await pool.query(
    `INSERT INTO radios (id, host_id, name, is_public, invite_code, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, hostId, name, isPublic, inviteCode, expiresAt || null]
  );
  return rows[0];
}

/**
 * Get a radio by its ID, joined with host user info.
 */
async function getRadioById(radioId) {
  const { rows } = await pool.query(
    `SELECT r.*, u.display_name AS host_name, u.avatar_url AS host_avatar, u.spotify_id AS host_spotify_id
     FROM radios r
     JOIN users u ON u.id = r.host_id
     WHERE r.id = $1`,
    [radioId]
  );
  return rows[0] || null;
}

/**
 * Get a radio by its invite code.
 */
async function getRadioByInviteCode(inviteCode) {
  const { rows } = await pool.query(
    `SELECT r.*, u.display_name AS host_name, u.avatar_url AS host_avatar
     FROM radios r
     JOIN users u ON u.id = r.host_id
     WHERE r.invite_code = $1`,
    [inviteCode]
  );
  return rows[0] || null;
}

/**
 * Get all public active radios for the discovery page.
 * currentTrack is already JSONB — returned as a parsed JS object by pg driver.
 */
async function getPublicRadios() {
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.invite_code, r.current_track,
            u.display_name AS host_name, u.avatar_url AS host_avatar
     FROM radios r
     JOIN users u ON u.id = r.host_id
     WHERE r.is_public = TRUE AND r.is_active = TRUE
     ORDER BY r.updated_at DESC
     LIMIT 50`
  );
  return rows;
}

/**
 * Get all active radios — used by the poller at startup to resume all jobs.
 * Includes host tokens for polling.
 */
async function getAllActiveRadios() {
  const { rows } = await pool.query(
    `SELECT r.id, r.host_id, r.name, r.is_public, r.invite_code, r.current_track,
            u.spotify_id AS host_spotify_id, u.display_name AS host_name,
            u.avatar_url AS host_avatar,
            u.refresh_token_enc, u.access_token_enc
     FROM radios r
     JOIN users u ON u.id = r.host_id
     WHERE r.is_active = TRUE`
  );
  return rows.map((r) => ({
    ...r,
    host_refresh_token: decrypt(r.refresh_token_enc),
    host_access_token:  decrypt(r.access_token_enc),
  }));
}

/**
 * Get all radios created by a specific user.
 */
async function getRadiosByHostId(hostId) {
  const { rows } = await pool.query(
    `SELECT id, name, is_public, invite_code, is_active, current_track, expires_at, created_at
 FROM radios WHERE host_id = $1 ORDER BY created_at DESC`,
    [hostId]
  );
  return rows;
}

/**
 * Update the current track for a radio.
 * Called by the BullMQ poller when a new song is detected.
 */
async function updateCurrentTrack(radioId, track) {
  await pool.query(
    `UPDATE radios SET current_track = $1 WHERE id = $2`,
    [track ? JSON.stringify(track) : null, radioId]
  );
}

/**
 * Set a radio's active state.
 * Deactivating stops the BullMQ poller from picking it up on restart.
 */
async function setRadioActive(radioId, isActive) {
  await pool.query(
    `UPDATE radios SET is_active = $1 WHERE id = $2`,
    [isActive, radioId]
  );
}

/**
 * Delete a radio permanently.
 */
async function deleteRadio(radioId) {
  await pool.query(`DELETE FROM radios WHERE id = $1`, [radioId]);
}

async function addRadioMember(radioId, userId) {
  await pool.query(
    `INSERT INTO radio_members (radio_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [radioId, userId]
  );
}

async function isRadioMember(radioId, userId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM radio_members WHERE radio_id = $1 AND user_id = $2`,
    [radioId, userId]
  );
  return rows.length > 0;
}

async function getRadioMemberships(userId) {
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.invite_code, r.is_active, r.is_public, r.current_track,
            u.display_name AS host_name
     FROM radio_members rm
     JOIN radios r ON r.id = rm.radio_id
     JOIN users u ON u.id = r.host_id
     WHERE rm.user_id = $1 AND r.is_active = TRUE
     ORDER BY rm.joined_at DESC`,
    [userId]
  );
  return rows;
}

async function getExpiredRadios() {
  const { rows } = await pool.query(
    `SELECT id FROM radios
     WHERE is_active = TRUE
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()`
  );
  return rows;
}

module.exports = {
  upsertUser,
  getUserById,
  getUserBySpotifyId,
  updateAccessToken,
  createRadio,
  getRadioById,
  getRadioByInviteCode,
  getPublicRadios,
  getAllActiveRadios,
  getRadiosByHostId,
  updateCurrentTrack,
  setRadioActive,
  deleteRadio,
  addRadioMember,
  isRadioMember,
  getRadioMemberships,
  getExpiredRadios,
};
