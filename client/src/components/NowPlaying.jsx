import React, { useState, useEffect } from "react";

function WaveBar({ delay }) {
  return (
    <div style={{
      width: 3, height: 16, background: "var(--accent)", borderRadius: 2,
      animation: `waveBar 0.8s ease-in-out ${delay}s infinite`, transformOrigin: "bottom",
    }} />
  );
}

function ProgressBar({ positionMs, durationMs }) {
  const [pos, setPos] = useState(positionMs || 0);

  useEffect(() => {
    setPos(positionMs || 0);
    const interval = setInterval(() => setPos((p) => Math.min(p + 1000, durationMs || 0)), 1000);
    return () => clearInterval(interval);
  }, [positionMs]);

  const pct = durationMs ? Math.min((pos / durationMs) * 100, 100) : 0;
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, marginBottom: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", borderRadius: 2, transition: "width 1s linear" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>{fmt(pos)}</span>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>{fmt(durationMs || 0)}</span>
      </div>
    </div>
  );
}

const YTIcon = () => (
  <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor">
    <path d="M15.68 1.72A2 2 0 0 0 14.27.3C13.02 0 8 0 8 0S2.98 0 1.73.3A2 2 0 0 0 .32 1.72 20.87 20.87 0 0 0 0 5.5c0 1.3.1 2.6.32 3.78A2 2 0 0 0 1.73 10.7C2.98 11 8 11 8 11s5.02 0 6.27-.3a2 2 0 0 0 1.41-1.42A20.87 20.87 0 0 0 16 5.5a20.87 20.87 0 0 0-.32-3.78zM6.4 7.86V3.14L10.55 5.5 6.4 7.86z" />
  </svg>
);

export default function NowPlaying({ track, listenerCount, room, source, onSwitchSource }) {
  if (!track) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "32px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📻</div>
        <div style={{ color: "var(--muted)", fontSize: 14 }}>
          {room?.isHost ? "Play something on Spotify — it'll appear here automatically" : "Waiting for the host to play something..."}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", animation: "fadeIn 0.4s ease" }}>

      {/* Album art header */}
      <div style={{
        position: "relative", height: 200,
        background: track.albumArt ? `linear-gradient(to bottom, transparent 40%, var(--surface)), url(${track.albumArt}) center/cover` : "linear-gradient(135deg, #1a1a2e, #0d0d0d)",
        display: "flex", alignItems: "flex-end", padding: "20px",
      }}>
        {track.albumArt && (
          <img src={track.albumArt} alt="" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.3, zIndex: 0 }} />
        )}
        <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 12, alignItems: "center" }}>
          {track.albumArt && (
            <img src={track.albumArt} alt="" style={{ width: 56, height: 56, borderRadius: 8, flexShrink: 0 }} />
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>{track.title}</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 3 }}>{track.artist}</div>
          </div>
          {track.isPlaying && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 3, alignItems: "flex-end", height: 20 }}>
              <WaveBar delay={0} />
              <WaveBar delay={0.15} />
              <WaveBar delay={0.3} />
              <WaveBar delay={0.45} />
            </div>
          )}
        </div>
      </div>

      {/* Progress + meta */}
      <div style={{ padding: "16px 20px 20px" }}>
        <ProgressBar positionMs={track.positionMs} durationMs={track.durationMs} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>

          {/* Listener count */}
          <span style={{ fontSize: 13, color: "var(--muted)" }}>👥 {listenerCount} listening</span>

          {/* Attribution */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {track.youtubeId && (
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span>Audio by</span>
                <a href={"https://www.youtube.com/watch?v=" + track.youtubeId} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 3, color: "#FF0000", textDecoration: "none", fontWeight: 600 }}>
                  <YTIcon />
                  YouTube
                </a>
              </span>
            )}
            {track.youtubeId && track.lyrics && (
              <span style={{ color: "var(--border)" }}>·</span>
            )}
            {track.lyrics && (
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span>Lyrics by</span>
                <a href="https://lrclib.net" target="_blank" rel="noopener noreferrer"
                  style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
                  LRCLIB
                </a>
              </span>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}