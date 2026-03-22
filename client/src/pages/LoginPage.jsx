import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

const SpotifyIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

// Steps shown to first-time visitors explaining how it works
const HOW_IT_WORKS = [
  { icon: "🎵", title: "Connect Spotify", desc: "Link your Spotify account — this is your login, no password needed." },
  { icon: "📻", title: "Create a radio", desc: "Start a radio room. It stays live even when you close the tab." },
  { icon: "🔗", title: "Invite friends", desc: "Share a link. Friends join and hear exactly what you're playing." },
  { icon: "⚡", title: "Always in sync", desc: "Same song, same position — via YouTube or SoundCloud, for free." },
];

export default function LoginPage() {
  const { initiateSpotifyLogin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  // Toggle between the compact card and the "how it works" explainer
  const [showHow, setShowHow] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    try {
      await initiateSpotifyLogin();
    } catch {
      setError("Could not reach Spotify. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 24px 48px",
      background: "radial-gradient(ellipse at 50% 0%, rgba(29,185,84,0.08) 0%, transparent 60%), var(--bg)",
    }}>

      {/* ── Wordmark ── */}
      <div style={{ marginBottom: 40, textAlign: "center" }}>
        <div style={{
          fontSize: 48, fontWeight: 800, letterSpacing: "-2px",
          background: "linear-gradient(135deg, #fff 40%, var(--accent))",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          marginBottom: 8,
        }}>
          SyncWave
        </div>
        <div style={{ color: "var(--muted)", fontSize: 15, letterSpacing: "0.02em" }}>
          Listen together. Always in sync.
        </div>
      </div>

      {/* ── Main card ── */}
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 20,
        padding: "36px 40px",
        maxWidth: 420,
        width: "100%",
        textAlign: "center",
        animation: "fadeIn 0.5s ease",
      }}>

        {/* New vs returning toggle — subtle tab row */}
        <div style={{
          display: "flex", gap: 4, marginBottom: 28,
          background: "var(--surface2)", padding: 4,
          borderRadius: 10, border: "1px solid var(--border)",
        }}>
          {[["login", "Sign in"], ["signup", "New here?"]].map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setShowHow(tab === "signup")}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8,
                fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                transition: "background 0.2s, color 0.2s",
                background: (tab === "signup") === showHow ? "var(--accent)" : "transparent",
                color:      (tab === "signup") === showHow ? "#000" : "var(--muted)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {!showHow ? (
          /* ── Returning user / default view ── */
          <>
            <div style={{ fontSize: 36, marginBottom: 16 }}>👋</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Welcome back</h2>
            <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
              Sign in with the Spotify account you used before to pick up right where you left off.
            </p>

            {error && (
              <div style={{ color: "var(--accent2)", fontSize: 13, marginBottom: 14, padding: "8px 12px", background: "rgba(255,77,77,0.08)", borderRadius: 8, border: "1px solid rgba(255,77,77,0.2)" }}>
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              style={{
                width: "100%", padding: "13px 24px",
                background: "var(--accent)", color: "#000",
                fontWeight: 700, fontSize: 15, borderRadius: 50, border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                opacity: loading ? 0.7 : 1,
                transition: "opacity 0.2s, transform 0.15s",
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.transform = "scale(1.02)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              <SpotifyIcon />
              {loading ? "Connecting..." : "Continue with Spotify"}
            </button>

            <p style={{ marginTop: 16, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              We only read what you're currently playing.{" "}
              <span
                onClick={() => setShowHow(true)}
                style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}
              >
                First time? See how it works →
              </span>
            </p>
          </>
        ) : (
          /* ── New user / explainer view ── */
          <>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Create your account</h2>
            <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5, marginBottom: 24 }}>
              No username or password — your Spotify account <em>is</em> your SyncWave account.
              Takes about 10 seconds.
            </p>

            {/* How it works steps */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28, textAlign: "left" }}>
              {HOW_IT_WORKS.map(({ icon, title, desc }, i) => (
                <div key={title} style={{
                  display: "flex", gap: 14, alignItems: "flex-start",
                  padding: "12px 14px",
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  animation: `fadeIn 0.3s ease ${i * 0.07}s both`,
                }}>
                  <div style={{
                    fontSize: 18, lineHeight: 1,
                    width: 36, height: 36, flexShrink: 0,
                    background: "rgba(29,185,84,0.1)",
                    border: "1px solid rgba(29,185,84,0.2)",
                    borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{title}</div>
                    <div style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* What we access notice */}
            <div style={{
              padding: "10px 14px", marginBottom: 20,
              background: "rgba(29,185,84,0.05)",
              border: "1px solid rgba(29,185,84,0.15)",
              borderRadius: 8, fontSize: 12,
              color: "var(--muted)", lineHeight: 1.6, textAlign: "left",
            }}>
              <strong style={{ color: "var(--text)" }}>What we access from Spotify:</strong>
              <br />✅ Your display name and profile picture
              <br />✅ What song is currently playing (read-only)
              <br />🚫 We never control playback or see your playlists
            </div>

            {error && (
              <div style={{ color: "var(--accent2)", fontSize: 13, marginBottom: 14, padding: "8px 12px", background: "rgba(255,77,77,0.08)", borderRadius: 8 }}>
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              style={{
                width: "100%", padding: "13px 24px",
                background: "var(--accent)", color: "#000",
                fontWeight: 700, fontSize: 15, borderRadius: 50, border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                opacity: loading ? 0.7 : 1,
                transition: "opacity 0.2s, transform 0.15s",
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.transform = "scale(1.02)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              <SpotifyIcon />
              {loading ? "Connecting..." : "Sign up with Spotify — it's free"}
            </button>

            <p style={{ marginTop: 14, fontSize: 12, color: "var(--muted)" }}>
              Already have an account?{" "}
              <span
                onClick={() => setShowHow(false)}
                style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}
              >
                Sign in instead
              </span>
            </p>
          </>
        )}
      </div>

      {/* ── Bottom feature pills ── */}
      <div style={{
        display: "flex", gap: 16, marginTop: 36,
        flexWrap: "wrap", justifyContent: "center",
      }}>
        {[
          { icon: "📡", label: "Persistent radios" },
          { icon: "🔗", label: "Shareable invite links" },
          { icon: "🎬", label: "YouTube & SoundCloud" },
          { icon: "⚡", label: "Real-time sync" },
        ].map(({ icon, label }) => (
          <div key={label} style={{
            display: "flex", alignItems: "center", gap: 6,
            color: "var(--muted)", fontSize: 12,
            padding: "5px 12px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 50,
          }}>
            <span>{icon}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
