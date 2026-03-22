/**
 * LyricsPlayer.jsx
 * Displays synced lyrics received from the server (via LRCLIB).
 * Highlights the current line based on positionMs and auto-scrolls to it.
 * Falls back to a "No lyrics found" message if lyrics is null.
 */
import React, { useEffect, useRef, useState } from "react";

export default function LyricsPlayer({ lyrics, positionMs, isPlaying, track }) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const containerRef  = useRef(null);
  const lineRefs      = useRef([]);
  const intervalRef   = useRef(null);
  // Local position that interpolates between server ticks
  const localPos      = useRef(positionMs || 0);

  // Sync local position when server sends an update
  useEffect(() => {
    localPos.current = positionMs || 0;
  }, [positionMs]);

  // Advance local position every 100ms for smooth highlighting
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!lyrics?.length) return;

    intervalRef.current = setInterval(() => {
      if (isPlaying) localPos.current += 100;

      // Find which line we're on
      let idx = -1;
      for (let i = 0; i < lyrics.length; i++) {
        if (localPos.current >= lyrics[i].time+1500) idx = i;
        else break;
      }
      setCurrentIndex(idx);
    }, 100);

    return () => clearInterval(intervalRef.current);
  }, [lyrics, isPlaying]);

  // Auto-scroll to current line
  useEffect(() => {
    if (currentIndex < 0 || !lineRefs.current[currentIndex]) return;
    lineRefs.current[currentIndex].scrollIntoView({
      behavior: "smooth",
      block:    "center",
    });
  }, [currentIndex]);

  // No lyrics available
  if (!lyrics || lyrics.length === 0) {
    return (
      <div style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        minHeight:      320,
        background:     "var(--surface)",
        border:         "1px solid var(--border)",
        borderRadius:   "var(--radius)",
        color:          "var(--muted)",
        fontSize:       14,
        gap:            12,
      }}>
        <span style={{ fontSize: 32 }}>🎵</span>
        <span>No lyrics found for this song</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        height:       420,
        overflowY:    "auto",
        background:   "var(--surface)",
        border:       "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding:      "32px 24px",
        scrollbarWidth: "none", // Firefox
      }}
    >
      <style>{`
        .lyrics-container::-webkit-scrollbar { display: none; }
      `}</style>

      <div className="lyrics-container">
        {lyrics.map((line, i) => {
          const isActive  = i === currentIndex;
          const isPast    = i < currentIndex;
          const isFuture  = i > currentIndex;

          return (
            <div
              key={i}
              ref={(el) => (lineRefs.current[i] = el)}
              style={{
                padding:       "6px 0",
                fontSize:      isActive ? 22 : 16,
                fontWeight:    isActive ? 800 : 400,
                lineHeight:    1.5,
                textAlign:     "center",
                color:         isActive
                  ? "var(--text)"
                  : isPast
                  ? "rgba(240,240,240,0.3)"
                  : "rgba(240,240,240,0.45)",
                transition:    "all 0.3s ease",
                transform:     isActive ? "scale(1.02)" : "scale(1)",
                cursor:        "default",
                letterSpacing: isActive ? "-0.3px" : "normal",
              }}
            >
              {line.text || "♪"}
            </div>
          );
        })}
        {/* Bottom padding so last line can scroll to center */}
        <div style={{ height: 180 }} />
      </div>
    </div>
  );
}