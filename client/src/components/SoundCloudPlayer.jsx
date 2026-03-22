import React, { useEffect, useRef } from "react";

export default function SoundCloudPlayer({ trackUrl, startPositionMs, isPlaying, playerRef }) {
  const iframeRef = useRef(null);
  const widgetRef = useRef(null);

  useEffect(() => {
    if (!iframeRef.current) return;

    // Load SoundCloud Widget API
    const script = document.createElement("script");
    script.src = "https://w.soundcloud.com/player/api.js";
    script.onload = () => {
      const widget = window.SC.Widget(iframeRef.current);
      widgetRef.current = widget;
      if (playerRef) playerRef.current = widget;

      widget.bind(window.SC.Widget.Events.READY, () => {
        widget.seekTo(startPositionMs || 0);
        if (isPlaying !== false) widget.play();
      });
    };
    document.head.appendChild(script);

    return () => {
      if (playerRef) playerRef.current = null;
    };
  }, [trackUrl]);

  useEffect(() => {
    if (!widgetRef.current) return;
    try {
      if (isPlaying) widgetRef.current.play();
      else widgetRef.current.pause();
    } catch {}
  }, [isPlaying]);

  const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&color=%231DB954&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false`;

  return (
    <div style={{ borderRadius: "var(--radius)", overflow: "hidden" }}>
      <iframe
        ref={iframeRef}
        src={embedUrl}
        width="100%"
        height="166"
        frameBorder="0"
        allow="autoplay"
        style={{ display: "block" }}
      />
    </div>
  );
}
