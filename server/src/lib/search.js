/**
 * lib/search.js
 * YouTube and SoundCloud search — API keys stay server-side, never sent to clients.
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
 * Uses videoCategoryId=10 (Music) to bias results toward official tracks.
 * Returns { id, title, thumbnail } or null.
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
        key:             process.env.YOUTUBE_API_KEY, // Server-side only
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
 * Returns { id, url, streamUrl } or null.
 */
async function searchSoundCloud(query) {
  try {
    const res = await axios.get("https://api.soundcloud.com/tracks", {
      params: {
        q:         sanitizeQuery(query),
        limit:     1,
        client_id: process.env.SOUNDCLOUD_CLIENT_ID, // Server-side only
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
 * Search both platforms simultaneously.
 * Returns { youtubeId, soundcloudUrl, soundcloudStreamUrl, source }
 */
async function searchBoth(trackName, artistName) {
  const query = sanitizeQuery(`${trackName} ${artistName}`);
  const [yt, sc] = await Promise.all([searchYouTube(query), searchSoundCloud(query)]);
  return {
    youtubeId:           yt?.id   ?? null,
    soundcloudUrl:       sc?.url  ?? null,
    soundcloudStreamUrl: sc?.streamUrl ?? null,
    source:              yt ? "youtube" : sc ? "soundcloud" : null,
  };
}

module.exports = { searchYouTube, searchSoundCloud, searchBoth };
