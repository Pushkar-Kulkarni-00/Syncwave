/**
 * lib/search.js
 * YouTube, SoundCloud search + LRCLIB lyrics fetching.
 * All API keys stay server-side, never sent to clients.
 */
"use strict";

const axios  = require("axios");
const logger = require("./logger");

const TIMEOUT = 8_000;

function sanitizeQuery(q) {
  return String(q ?? "").replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, 200);
}

/**
 * Search YouTube for a music video matching the query.
 */
async function searchYouTube(query) {
  try {
    const res = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: {
        part:            "snippet",
        q:               sanitizeQuery(query),
        type:            "video",
        videoCategoryId: "10",
        maxResults:      1,
        key:             process.env.YOUTUBE_API_KEY,
      },
      timeout: TIMEOUT,
    });
    const item = res.data.items?.[0];
    if (!item) return null;
    return {
      id:        item.id.videoId,
      title:     item.snippet.title,
      thumbnail: item.snippet.thumbnails?.medium?.url ?? null,
    };
  } catch (err) {
    logger.error("YouTube search failed", err);
    return null;
  }
}

/**
 * Search SoundCloud for a track matching the query.
 */
async function searchSoundCloud(query) {
  try {
    const res = await axios.get("https://api.soundcloud.com/tracks", {
      params: {
        q:         sanitizeQuery(query),
        limit:     1,
        client_id: process.env.SOUNDCLOUD_CLIENT_ID,
      },
      timeout: TIMEOUT,
    });
    const track = res.data?.[0];
    if (!track) return null;
    return {
      id:        track.id,
      url:       track.permalink_url,
      streamUrl: `${track.stream_url}?client_id=${process.env.SOUNDCLOUD_CLIENT_ID}`,
    };
  } catch (err) {
    logger.error("SoundCloud search failed", err);
    return null;
  }
}

/**
 * Fetch synced lyrics from LRCLIB — free, no API key needed.
 * Returns an array of { time: milliseconds, text: string } or null.
 *
 * LRCLIB returns lyrics in .lrc format:
 *   [01:23.45] Line of lyrics
 * We parse this into timed objects the client can use directly.
 */
async function fetchLyrics(trackName, artistName, durationMs) {
  try {
    const res = await axios.get("https://lrclib.net/api/search", {
      params: {
        track_name:   sanitizeQuery(trackName),
        artist_name:  sanitizeQuery(artistName),
      },
      timeout: TIMEOUT,
      headers: { "User-Agent": "SyncWave/1.0 (https://github.com/syncwave)" },
    });

    const results = res.data;
    if (!results?.length) return null;

    // Pick the best match — prefer synced lyrics, prefer duration match
    let best = null;
    for (const r of results) {
      if (!r.syncedLyrics) continue;
      if (!best) { best = r; continue; }
      // Prefer closer duration match
      const durationSec = durationMs / 1000;
      const diff = Math.abs(r.duration - durationSec);
      const bestDiff = Math.abs(best.duration - durationSec);
      if (diff < bestDiff) best = r;
    }

    if (!best?.syncedLyrics) return null;

    // Parse .lrc format: [mm:ss.xx] lyric line
    const lines = best.syncedLyrics.split("\n");
    const parsed = [];
    const lrcRegex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/;

    for (const line of lines) {
      const match = line.match(lrcRegex);
      if (!match) continue;
      const [, mm, ss, ms, text] = match;
      const timeMs = (parseInt(mm) * 60 + parseInt(ss)) * 1000 + parseInt(ms.padEnd(3, "0"));
      parsed.push({ time: timeMs, text: text.trim() });
    }

    return parsed.length > 0 ? parsed : null;
  } catch (err) {
    logger.error("LRCLIB lyrics fetch failed", err);
    return null;
  }
}

/**
 * Search YouTube + SoundCloud + fetch lyrics simultaneously.
 */
async function searchBoth(trackName, artistName, durationMs) {
  const query = sanitizeQuery(`${trackName} ${artistName}`);
  const [yt, sc, lyrics] = await Promise.all([
    searchYouTube(query),
    searchSoundCloud(query),
    fetchLyrics(trackName, artistName, durationMs),
  ]);
  return {
    youtubeId:           yt?.id        ?? null,
    soundcloudUrl:       sc?.url       ?? null,
    soundcloudStreamUrl: sc?.streamUrl ?? null,
    source:              yt ? "youtube" : sc ? "soundcloud" : null,
    lyrics,  // array of { time, text } or null
  };
}

module.exports = { searchYouTube, searchSoundCloud, fetchLyrics, searchBoth };