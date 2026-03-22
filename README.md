# 🎵 SyncWave 

> Currently depreciated thanks to Spotify's new Developer API rules , Deployed link: https://syncwave-amber.vercel.app/

> (Spotify API rules allow only 5 users to connect their accounts)
> Working on an updated version without spotify.

> Radios keep broadcasting even when the host closes their browser.
> Host plays Spotify on any device → server detects it → listeners sync via YouTube or SoundCloud.

## Services you need (all free tier)

| Service | What for | Free tier |
|---|---|---|
| [Neon](https://neon.tech) | PostgreSQL database | 10 GB, never pauses |
| [Upstash](https://console.upstash.com) | Redis for BullMQ | 10k commands/day |
| [Spotify Developer](https://developer.spotify.com/dashboard) | OAuth + currently playing | Free |
| [Google Cloud](https://console.cloud.google.com) | YouTube Data API v3 | 10k units/day |
| [SoundCloud Developer](https://developers.soundcloud.com) | Track search | Free |

---

## Setup

### 1. Create a Neon database
1. Go to https://neon.tech → sign up → New Project
2. Name it `syncwave`
3. Copy the **Connection string** (looks like `postgresql://user:pass@ep-xxx.neon.tech/syncwave?sslmode=require`)

### 2. Create an Upstash Redis database
1. Go to https://console.upstash.com → New Database → Redis
2. Pick a region close to your server
3. Copy the **ioredis** connection string (starts with `rediss://`)

### 3. Configure the server

```bash
cd server
cp .env.example .env
```

Fill in `.env`:
```env
DATABASE_URL=postgresql://...your neon connection string...
REDIS_URL=rediss://...your upstash connection string...

SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3001/auth/spotify/callback

YOUTUBE_API_KEY=your_youtube_key
SOUNDCLOUD_CLIENT_ID=your_soundcloud_id

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
TOKEN_ENCRYPTION_KEY=<64 hex chars>

CLIENT_URL=http://localhost:5173
PORT=3001
```

### 4. Run the DB migration (once)
```bash
cd server
npm install
npm run db:migrate
```
This creates the `users` and `radios` tables in Neon.

### 5. Start the server
```bash
npm run dev
```

### 6. Configure and start the client
```bash
cd client
cp .env.example .env
# Set VITE_SERVER_URL=http://localhost:3001
npm install
npm run dev
```

Open http://localhost:5173

---

## Deploying to production

### Server → Railway
1. Push `server/` to GitHub
2. New project on https://railway.app → deploy from GitHub
3. Add all env vars from `.env.example` in Railway's Variables tab
4. Railway auto-runs `npm start` → server is live

### Client → Vercel
1. Push `client/` to GitHub
2. Import to https://vercel.com
3. Set `VITE_SERVER_URL` to your Railway server URL
4. Deploy

### After deploying
- Update `SPOTIFY_REDIRECT_URI` in your `.env` and Spotify dashboard to your Railway URL
- Update `CLIENT_URL` in your `.env` to your Vercel URL
- Re-run `npm run db:migrate` pointed at your production `DATABASE_URL`

---

## Architecture

```
Any device (phone, desktop, TV)
  └─ Host plays song on Spotify app
           │
           │  (Spotify cloud knows what's playing)
           │
     ┌─────▼──────────────────────────────────┐
     │         BullMQ Worker (Node.js)         │
     │  ┌─────────────────────────────────┐   │
     │  │  Repeating job per radio (5s)   │   │
     │  │  1. Fetch host tokens from DB   │   │
     │  │  2. Poll Spotify API            │   │
     │  │  3. Refresh token if expired    │   │
     │  │  4. Search YouTube + SoundCloud │   │
     │  │  5. Update DB current_track     │   │
     │  │  6. Broadcast via Socket.io     │   │
     │  └─────────────────────────────────┘   │
     └────────────────────────────────────────┘
           │                    │
     Upstash Redis          Neon Postgres
     (job queue)            (users + radios)
           │
     Socket.io broadcast
           │
     ┌─────┴──────┬────────────┐
     ▼            ▼            ▼
  Listener 1   Listener 2   Listener 3
  YT Player    SC Player    YT Player
  (synced)     (synced)     (synced)

  Host closes browser → BullMQ job keeps running → radio stays live
```

---

## How radio persistence works

When a host creates a radio:
1. A row is inserted into `radios` table in Neon with `is_active = true`
2. A BullMQ repeating job is added to Upstash Redis with id `radio:{radioId}`
3. The job fires every 5 seconds regardless of whether anyone is connected
4. If the server restarts, `resumeAllRadios()` re-registers jobs for all `is_active` radios

When a listener joins:
1. The server fetches the radio from the DB (including `current_track` JSONB)
2. The listener's player immediately loads the current song at the correct position
3. Subsequent drift-correction ticks keep them in sync

When the host closes their browser:
- Their socket disconnects → `listener_count` updates
- The BullMQ job is **not affected** — it keeps polling Spotify using the stored (encrypted) refresh token
- Listeners continue hearing the host's music in sync

---

## Token encryption

Spotify refresh tokens are stored AES-256-GCM encrypted in Postgres.
The encryption key lives only in `TOKEN_ENCRYPTION_KEY` env var.
Even if someone dumps the database, tokens are useless without the key.

Generate a key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Known limitations

- Spotify poll interval is 5s — ~5s delay before listeners hear a new song
- YouTube/SoundCloud may not find the exact version of every song
- YouTube API free tier: 10,000 units/day (~5,000 searches)
- BullMQ jobs use Upstash free tier: 10,000 commands/day (~1,000 poll cycles across all radios)
- For scale beyond ~50 concurrent radios, upgrade Upstash or add command batching
