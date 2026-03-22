/**
 * lib/spotify.js
 * All Spotify API interactions in one place.
 * Access tokens are refreshed automatically and persisted back to the DB.
 */
"use strict";

const axios   = require("axios");
const db      = require("../db/queries");
const logger  = require("./logger");

const TIMEOUT = 8_000;

/**
 * Refresh a Spotify access token using the stored refresh token.
 * Persists the new access token to the DB so it survives restarts.
 * Returns the new access token string.
 */
async function refreshAccessToken(userId, refreshToken) {
  const params = new URLSearchParams({
    grant_type:    "refresh_token",
    refresh_token: refreshToken,
    client_id:     process.env.SPOTIFY_CLIENT_ID,
    client_secret: process.env.SPOTIFY_CLIENT_SECRET,
  });

  const res = await axios.post(
    "https://accounts.spotify.com/api/token",
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: TIMEOUT }
  );

  const newToken = res.data.access_token;
  // Persist so the next server restart picks up the refreshed token
  await db.updateAccessToken(userId, newToken);
  logger.info("Access token refreshed", { userId });
  return newToken;
}

/**
 * Get the currently playing track for a user.
 * Handles 401 (expired token) by refreshing and retrying once.
 *
 * Returns null if:
 *   - Nothing is playing
 *   - Private session is enabled
 *   - Spotify returns no data
 *
 * Returns a normalised track object on success.
 */
async function getCurrentlyPlaying(userId, accessToken, refreshToken) {
  async function fetchTrack(token) {
    return axios.get("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${token}` },
      timeout: TIMEOUT,
      // 204 = no content (nothing playing) — don't throw on it
      validateStatus: (s) => s === 200 || s === 204,
    });
  }

  let res;
  try {
    res = await fetchTrack(accessToken);
  } catch (err) {
    if (err.response?.status === 401) {
      // Token expired — refresh and retry
      try {
        const newToken = await refreshAccessToken(userId, refreshToken);
        res = await fetchTrack(newToken);
        return parseTrackResponse(res, newToken);
      } catch (refreshErr) {
        logger.error("Token refresh failed during poll", refreshErr);
        return null;
      }
    }
    logger.error("Spotify poll network error", err);
    return null;
  }

  return parseTrackResponse(res, accessToken);
}

function parseTrackResponse(res, currentToken) {
  // 204 = Spotify has nothing playing (paused or stopped)
  if (res.status === 204 || !res.data || !res.data.item) {
    return { nothing: true, currentToken };
  }

  const { item, progress_ms, is_playing } = res.data;

  return {
    nothing:      false,
    currentToken, // Return the (possibly refreshed) token for the caller to store
    track: {
      spotifyId:  item.id,
      title:      item.name,
      artist:     item.artists.map((a) => a.name).join(", "),
      albumArt:   item.album.images?.[0]?.url ?? null,
      durationMs: item.duration_ms,
      positionMs: progress_ms,
      isPlaying:  is_playing,
    },
  };
}

module.exports = { getCurrentlyPlaying, refreshAccessToken };
