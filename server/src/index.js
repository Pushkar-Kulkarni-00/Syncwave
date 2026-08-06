/**
 * src/index.js — SyncWave Server v3 (Persistent)
 *
 * What's different from v2:
 *   - PostgreSQL (Neon) stores all users and radios permanently
 *   - Tokens are AES-256-GCM encrypted before DB storage
 *   - BullMQ + Upstash Redis manages polling jobs — survive server restarts
 *   - Radios broadcast even when the host has no browser tab open
 *   - On startup, all previously active radios resume polling automatically
 */
"use strict";

require("dotenv").config();

// ── Fail fast on missing env vars ─────────────────────────────────────────────
const REQUIRED = [
  "DATABASE_URL", "REDIS_URL",
  "SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REDIRECT_URI",
  "YOUTUBE_API_KEY", "SOUNDCLOUD_CLIENT_ID",
  "TOKEN_ENCRYPTION_KEY", "CLIENT_URL",
];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[FATAL] Missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}



const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const cors       = require("cors");
const helmet     = require("helmet");
const rateLimit  = require("express-rate-limit");

const authRoutes   = require("./routes/auth");
const radioRoutes  = require("./routes/radios");
const { registerHandlers } = require("./socket/handler");
const poller       = require("./queues/radioPoller");
const logger       = require("./lib/logger");

const TRUSTED_ORIGIN = process.env.CLIENT_URL;
const TRUSTED_ORIGIN_MOBILE = process.env.CLIENT_URL_MOBILE;
const app    = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// ── Security middleware ────────────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin === TRUSTED_ORIGIN || origin === TRUSTED_ORIGIN_MOBILE) return cb(null, true);
    cb(new Error("CORS: origin not allowed"));
  },
  credentials: true,
  methods: ["GET"],
  allowedHeaders: ["Content-Type"],
}));

app.use(express.json({ limit: "10kb" }));

// Global rate limiter: 300 req / 15 min per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: "Too many requests." }),
}));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/auth",   authRoutes);
app.use("/radios", radioRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found." }));
app.use((err, req, res, _next) => {
  logger.error("Unhandled Express error", err);
  res.status(500).json({ error: "Internal server error." });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: [TRUSTED_ORIGIN, TRUSTED_ORIGIN_MOBILE].filter(Boolean), methods: ["GET", "POST"], credentials: true },
  maxHttpBufferSize: 16 * 1024,
  pingTimeout: 20_000,
  pingInterval: 25_000,
});

// Share io with REST routes (for listener count lookups)
app.locals.io = io;

// Share io with the BullMQ worker (for broadcasting track changes)
poller.setIO(io);

// Register all Socket.io event handlers
registerHandlers(io);

// ── Start server + resume all active radios ───────────────────────────────────
const PORT = process.env.PORT ?? 3001;
server.listen(PORT, async () => {
  logger.info("SyncWave server started", { port: PORT, origin: TRUSTED_ORIGIN });
  // Re-register BullMQ jobs for all active radios in the DB.
  // This means every radio that was running before a restart continues automatically.
  await poller.resumeAllRadios();
  poller.startExpiryChecker();
});
