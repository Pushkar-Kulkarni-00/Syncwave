import React, { useEffect, useRef } from "react";

let ytApiLoaded = false;
let ytApiCallbacks = [];

function loadYouTubeAPI() {
  if (ytApiLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    ytApiCallbacks.push(resolve);
    if (ytApiCallbacks.length === 1) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
      window.onYouTubeIframeAPIReady = () => {
        ytApiLoaded = true;
        ytApiCallbacks.forEach((cb) => cb());
        ytApiCallbacks = [];
      };
    }
  });
}

export default function YouTubePlayer({ videoId, startPositionMs, isPlaying, playerRef }) {
  const containerRef = useRef(null);
  const internalPlayerRef = useRef(null);

  useEffect(() => {
    let player;
    loadYouTubeAPI().then(() => {
      if (!containerRef.current) return;
      player = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          start: Math.floor((startPositionMs || 0) / 1000),
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
        },
        events: {
          onReady: (e) => {
            internalPlayerRef.current = e.target;
            if (playerRef) playerRef.current = e.target;
            if (startPositionMs) e.target.seekTo(startPositionMs / 1000, true);
            if (isPlaying !== false) e.target.playVideo();
          },
        },
      });
    });

    return () => {
      if (player?.destroy) player.destroy();
      if (playerRef) playerRef.current = null;
    };
  }, [videoId]);

  // Sync position/play state changes
  useEffect(() => {
    const p = internalPlayerRef.current;
    if (!p) return;
    try {
      if (isPlaying) p.playVideo?.();
      else p.pauseVideo?.();
    } catch {}
  }, [isPlaying]);

  return (
    <div style={{ position: "relative", width: "100%", paddingTop: "56.25%" }}>
      <div
        ref={containerRef}
        style={{
          position: "absolute", top: 0, left: 0,
          width: "100%", height: "100%",
          borderRadius: "var(--radius)",
          overflow: "hidden",
        }}
      />
      <div
        style={{
          position: "absolute", top: 0, left: 0,
          width: "100%", height: "85%",
          zIndex: 2,
          cursor: "default",
        }}
      />
    </div>
  );
}
