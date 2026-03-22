/**
 * routes/radios.js
 * REST endpoints for radio discovery and management.
 */
"use strict";

const express   = require("express");
const rateLimit = require("express-rate-limit");
const db        = require("../db/queries");
const { validateCode } = require("../lib/validators");

const router = express.Router();

const roomsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: "Too many requests." }),
});

// GET /radios — all public active radios for the discovery page
router.get("/", roomsLimiter, async (req, res) => {
  try {
    const radios = await db.getPublicRadios();
    // listener_count is not stored in DB — it comes from the Socket.io room size
    // We attach it from the io instance injected via req.app.locals
    const io = req.app.locals.io;
    const result = radios.map((r) => ({
      id:           r.id,
      name:         r.name,
      hostName:     r.host_name,
      hostAvatar:   r.host_avatar,
      listenerCount: io ? (io.sockets.adapter.rooms.get(r.id)?.size ?? 0) : 0,
      currentTrack: r.current_track
        ? { title: r.current_track.title, artist: r.current_track.artist, albumArt: r.current_track.albumArt }
        : null,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch radios." });
  }
});

// GET /radios/invite/:code — validate an invite and return minimal room info
router.get("/invite/:code", roomsLimiter, async (req, res) => {
  const code = validateCode(req.params.code);
  if (!code) return res.status(400).json({ error: "Invalid invite code format." });
  try {
    const radio = await db.getRadioByInviteCode(code);
    if (!radio || !radio.is_active) {
      return res.status(404).json({ error: "Invite not found or has expired." });
    }
    res.json({ id: radio.id, name: radio.name, hostName: radio.host_name });
  } catch (err) {
    res.status(500).json({ error: "Failed to look up invite." });
  }
});

module.exports = router;
