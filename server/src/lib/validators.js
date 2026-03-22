/**
 * lib/validators.js
 * Schema-based input validation used across routes and socket handlers.
 */
"use strict";

const validator = require("validator");

function sanitizeString(str) {
  if (typeof str !== "string") return "";
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

function validateSpotifyId(id) {
  if (typeof id !== "string") return null;
  return /^[a-zA-Z0-9]{10,32}$/.test(id) ? id : null;
}

function validateDisplayName(name) {
  const s = sanitizeString(String(name ?? ""));
  return s.slice(0, 100) || "Unknown";
}

function validateAvatarUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (!validator.isURL(url, { protocols: ["https"], require_protocol: true })) return "";
  try {
    const { hostname } = new URL(url);
    const allowed = ["i.scdn.co", "mosaic.scdn.co", "lineup-images.scdn.co", "thisis-images.scdn.co"];
    if (!allowed.some((d) => hostname === d || hostname.endsWith("." + d))) return "";
  } catch { return ""; }
  return url;
}

function validateAccessToken(token) {
  if (typeof token !== "string") return null;
  if (token.length < 50 || token.length > 512) return null;
  return /^[A-Za-z0-9\-_=.]+$/.test(token) ? token : null;
}

function validateRefreshToken(token) {
  if (typeof token !== "string") return null;
  if (token.length < 20 || token.length > 512) return null;
  return /^[A-Za-z0-9\-_=.]+$/.test(token) ? token : null;
}

function validateRoomName(name) {
  const s = sanitizeString(name);
  return (s && s.length <= 60) ? s : null;
}

function validateCode(code) {
  if (typeof code !== "string") return null;
  return /^[A-F0-9]{6,8}$/.test(code.toUpperCase()) ? code.toUpperCase() : null;
}

function validateDbUserId(id) {
  const n = parseInt(id, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = {
  sanitizeString,
  validateSpotifyId,
  validateDisplayName,
  validateAvatarUrl,
  validateAccessToken,
  validateRefreshToken,
  validateRoomName,
  validateCode,
  validateDbUserId,
};
