import React, { useState, useEffect } from "react";

function WaveBar({ delay }) {
  return (
    <div style={{
      width: 3,
      height: 16,
      background: "var(--accent)",
      borderRadius: 2,
      animation: `waveBar 0.8s ease-in-out ${delay}s infinite`,
      transformOrigin: "bottom",
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
      <div style={{
        height: 3,
        background: "rgba(255,255,255,0.1)",
        borderRadius: 2,
        marginBottom: 6,
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: "var(--accent)",
          borderRadius: 2,
          transition: "width 1s linear",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>{fmt(pos)}</span>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>{fmt(durationMs || 0)}</span>
      </div>
    </div>
  );
}

export default function NowPlaying({ track, listenerCount, room, source, onSwitchSource }) {
  if (!track) {
    return (
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "32px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📻</div>
        <div style={{ color: "var(--muted)", fontSize: 14 }}>
          {room?.isHost
            ? "Play something on Spotify — it'll appear here automatically"
            : "Waiting for the host to play something..."}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      overflow: "hidden",
      animation: "fadeIn 0.4s ease",
    }}>
      {/* Album art header */}
      <div style={{
        position: "relative",
        height: 200,
        background: track.albumArt
          ? `linear-gradient(to bottom, transparent 40%, var(--surface)), url(${track.albumArt}) center/cover`
          : "linear-gradient(135deg, #1a1a2e, #0d0d0d)",
        display: "flex",
        alignItems: "flex-end",
        padding: "20px",
      }}>
        {track.albumArt && (
          <img src={track.albumArt} alt="" style={{
            position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
            objectFit: "cover", opacity: 0.3, zIndex: 0,
          }} />
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

        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 16,
          paddingTop: 16,
          borderTop: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              👥 {listenerCount} listening
            </span>
          </div>

          {/* Source switcher */}
          <div style={{ display: "flex", gap: 6 }}>
            {track.youtubeId && (
              <button
                onClick={() => onSwitchSource("youtube")}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  background: source === "youtube" ? "#FF0000" : "var(--surface2)",
                  color: source === "youtube" ? "#fff" : "var(--muted)",
                  transition: "var(--transition)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                }}
              >
                YT
              </button>
            )}
            {track.soundcloudUrl && (
              <button
                onClick={() => onSwitchSource("soundcloud")}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  background: source === "soundcloud" ? "#FF5500" : "var(--surface2)",
                  color: source === "soundcloud" ? "#fff" : "var(--muted)",
                  transition: "var(--transition)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                }}
              >
                SC
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
