/**
 * ExpiryCountdown.jsx
 * Shows a live countdown of how long the radio has left.
 * Only shown to the host inside the room.
 */
import React, { useState, useEffect } from "react";

export default function ExpiryCountdown({ expiresAt }) {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!expiresAt) return;

    function calc() {
      const diff = new Date(expiresAt) - Date.now();
      if (diff <= 0) return setTimeLeft("Expired");

      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);

      if (d > 0) setTimeLeft(`${d}d ${h}h ${m}m`);
      else if (h > 0) setTimeLeft(`${h}h ${m}m ${s}s`);
      else setTimeLeft(`${m}m ${s}s`);
    }

    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  if (!expiresAt || !timeLeft) return null;

  const isUrgent = new Date(expiresAt) - Date.now() < 10 * 60 * 1000; // < 10 min

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 12px",
      background: isUrgent ? "rgba(255,77,77,0.08)" : "rgba(29,185,84,0.06)",
      border: `1px solid ${isUrgent ? "rgba(255,77,77,0.25)" : "rgba(29,185,84,0.15)"}`,
      borderRadius: 8,
      fontSize: 12,
      color: isUrgent ? "var(--accent2)" : "var(--muted)",
    }}>
      <span>{isUrgent ? "⚠️" : "⏱"}</span>
      <span>Radio expires in <strong>{timeLeft}</strong></span>
    </div>
  );
}