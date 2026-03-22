/**
 * ExpiryPicker.jsx — Hardened
 * [A03] Custom input now rejects negative/zero/non-integer values client-side.
 * [A04] Total duration capped at 30 days on the client (mirrors server cap).
 */
import React, { useState } from "react";

const PRESETS = [
  { label: "1 hour",  ms: 1  * 60 * 60 * 1000 },
  { label: "2 hours", ms: 2  * 60 * 60 * 1000 },
  { label: "8 hours", ms: 8  * 60 * 60 * 1000 },
  { label: "1 day",   ms: 24 * 60 * 60 * 1000 },
  { label: "2 days",  ms: 48 * 60 * 60 * 1000 },
];

// [A04] 30-day cap mirrors the server-side MAX_EXPIRY_MS constant
const MAX_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

export default function ExpiryPicker({ value, onChange }) {
  const [showPicker, setShowPicker] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customDays,  setCustomDays]  = useState(0);
  const [customHours, setCustomHours] = useState(0);
  const [customMins,  setCustomMins]  = useState(0);
  const [customError, setCustomError] = useState(null);

  function selectPreset(ms) {
    onChange(Date.now() + ms);
    setShowPicker(false);
    setCustomMode(false);
  }

  function applyCustom() {
    setCustomError(null);
    // [A03] Ensure all values are non-negative integers
    const d = Math.max(0, Math.floor(customDays));
    const h = Math.max(0, Math.floor(customHours));
    const m = Math.max(0, Math.floor(customMins));
    const ms = ((d * 24 + h) * 60 + m) * 60 * 1000;

    if (ms <= 0) {
      setCustomError("Please enter a duration greater than 0.");
      return;
    }
    // [A04] Enforce 30-day cap client-side
    if (ms > MAX_EXPIRY_MS) {
      setCustomError("Maximum allowed duration is 30 days.");
      return;
    }
    onChange(Date.now() + ms);
    setShowPicker(false);
    setCustomMode(false);
  }

  // [A03] Safe number input handler — rejects negatives and non-integers
  function safeInt(val, max) {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 0) return 0;
    return Math.min(n, max);
  }

  function clear() {
    onChange(null);
    setShowPicker(false);
    setCustomMode(false);
    setCustomError(null);
  }

  function formatExpiry(ts) {
    const diff = ts - Date.now();
    if (diff <= 0) return "Expired";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 8 }}>
        RADIO TIMEOUT
      </label>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{
          padding: "8px 14px", background: "var(--surface2)",
          border: "1px solid var(--border)", borderRadius: 8, fontSize: 13,
          color: value ? "var(--accent)" : "var(--muted)",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          {value ? `⏱ Expires in ${formatExpiry(value)}` : "♾ Lifetime (no expiry)"}
        </div>

        <button type="button" onClick={() => { setShowPicker(!showPicker); setCustomMode(false); setCustomError(null); }}
          style={{ padding: "8px 14px", background: showPicker ? "var(--accent)" : "var(--surface2)", color: showPicker ? "#000" : "var(--muted)", fontWeight: 600, fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" }}>
          {value ? "Change" : "+ Add Timeout"}
        </button>

        {value && (
          <button type="button" onClick={clear}
            style={{ padding: "8px 14px", background: "transparent", color: "var(--accent2)", fontWeight: 600, fontSize: 12, borderRadius: 8, border: "1px solid rgba(255,77,77,0.3)", cursor: "pointer" }}>
            Remove
          </button>
        )}
      </div>

      {showPicker && !customMode && (
        <div style={{ marginTop: 10, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "flex", flexWrap: "wrap", gap: 8, animation: "fadeIn 0.2s ease" }}>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => selectPreset(p.ms)}
              style={{ padding: "7px 14px", background: "var(--surface)", color: "var(--text)", fontWeight: 600, fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}>
              {p.label}
            </button>
          ))}
          <button type="button" onClick={() => setCustomMode(true)}
            style={{ padding: "7px 14px", background: "var(--surface)", color: "var(--accent)", fontWeight: 600, fontSize: 12, borderRadius: 8, border: "1px solid rgba(29,185,84,0.3)", cursor: "pointer" }}>
            ✏ Custom
          </button>
        </div>
      )}

      {customMode && (
        <div style={{ marginTop: 10, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", animation: "fadeIn 0.2s ease" }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
            Custom duration <span style={{ color: "var(--border)" }}>(max 30 days)</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {[
              { label: "Days",  val: customDays,  set: (v) => setCustomDays(safeInt(v, 30)),  max: 30  },
              { label: "Hours", val: customHours, set: (v) => setCustomHours(safeInt(v, 23)), max: 23  },
              { label: "Mins",  val: customMins,  set: (v) => setCustomMins(safeInt(v, 59)),  max: 59  },
            ].map(({ label, val, set }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <input type="number" min={0} max={label === "Days" ? 30 : 59} value={val}
                  onChange={(e) => set(e.target.value)}
                  style={{ width: 64, padding: "6px 10px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 16, textAlign: "center" }} />
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{label}</span>
              </div>
            ))}
            <button type="button" onClick={applyCustom}
              style={{ padding: "8px 18px", marginTop: 14, background: "var(--accent)", color: "#000", fontWeight: 700, fontSize: 13, borderRadius: 8, border: "none", cursor: "pointer" }}>
              Set
            </button>
            <button type="button" onClick={() => { setCustomMode(false); setCustomError(null); }}
              style={{ padding: "8px 14px", marginTop: 14, background: "transparent", color: "var(--muted)", fontWeight: 600, fontSize: 13, borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" }}>
              Back
            </button>
          </div>
          {/* [A03] Show validation error inline */}
          {customError && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--accent2)" }}>{customError}</div>
          )}
        </div>
      )}
    </div>
  );
}