/**
 * LyricsPlayer.jsx — Mobile optimised
 * - Height uses dvh (dynamic viewport height) to account for iOS Safari address bar
 * - Scroll is internal to the container only (no page scroll hijacking)
 * - Font sizes scale down on small screens
 */
import React, { useEffect, useRef, useState } from "react";

export default function LyricsPlayer({ lyrics, positionMs, isPlaying, track }) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const containerRef = useRef(null);
  const lineRefs     = useRef([]);
  const intervalRef  = useRef(null);
  const localPos     = useRef(positionMs || 0);

  useEffect(() => { localPos.current = positionMs || 0; }, [positionMs]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!lyrics?.length) return;

    intervalRef.current = setInterval(() => {
      if (isPlaying) localPos.current += 100;

      let idx = -1;
      for (let i = 0; i < lyrics.length; i++) {
        if (localPos.current >= lyrics[i].time + 1500) idx = i;
        else break;
      }
      setCurrentIndex(idx);
    }, 100);

    return () => clearInterval(intervalRef.current);
  }, [lyrics, isPlaying]);

  // Scroll only inside the container — never the page
  useEffect(() => {
    if (currentIndex < 0) return;
    const container = containerRef.current;
    const line = lineRefs.current[currentIndex];
    if (container && line) {
      const containerTop = container.getBoundingClientRect().top;
      const lineTop = line.getBoundingClientRect().top;
      const offset = lineTop - containerTop - (container.clientHeight / 2) + (line.clientHeight / 2);
      container.scrollTop += offset;
    }
  }, [currentIndex]);

  if (!lyrics || lyrics.length === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: 220,
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius)", color: "var(--muted)", fontSize: 14, gap: 10,
      }}>
        <span style={{ fontSize: 28 }}>🎵</span>
        <span>No lyrics found for this song</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        // Use min/max so it works on both big and small screens
        height: "min(420px, 50dvh)",
        overflowY: "auto",
        overflowX: "hidden",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "24px 16px",
        // Prevent this scroll container from propagating scroll to page on iOS
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      <style>{`.lyrics-scroll::-webkit-scrollbar { display: none; }`}</style>

      <div className="lyrics-scroll">
        {lyrics.map((line, i) => {
          const isActive = i === currentIndex;
          const isPast   = i < currentIndex;

          return (
            <div
              key={i}
              ref={(el) => (lineRefs.current[i] = el)}
              style={{
                padding: "5px 0",
                // Clamp font size — large on desktop, readable on mobile
                fontSize: isActive
                  ? "clamp(16px, 5vw, 22px)"
                  : "clamp(13px, 3.5vw, 16px)",
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
                letterSpacing: isActive ? "-0.3px" : "normal",
              }}
            >
              {line.text || "♪"}
            </div>
          );
        })}
        <div style={{ height: 120 }} />
      </div>
    </div>
  );
}