import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function isValidToken(t) {
  return typeof t === "string" && t.length >= 50 && t.length <= 512 && /^[A-Za-z0-9\-_=.]+$/.test(t);
}
function isValidSpotifyId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9]{10,32}$/.test(id);
}

export default function AuthCallbackPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) { setError("Spotify login was cancelled or failed. Please try again."); return; }

    const accessToken  = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const spotifyId    = params.get("spotify_id");
    const displayName  = (params.get("display_name") ?? "Unknown").slice(0, 100);
    const avatar       = params.get("avatar") ?? "";
    const dbUserId     = parseInt(params.get("db_user_id") ?? "0", 10);

    if (!isValidToken(accessToken) || !isValidToken(refreshToken)) { setError("Invalid session data. Please log in again."); return; }
    if (!isValidSpotifyId(spotifyId)) { setError("Invalid account data. Please log in again."); return; }
    if (!dbUserId || dbUserId <= 0) { setError("Invalid user record. Please log in again."); return; }

    // Clear tokens from URL immediately
    window.history.replaceState({}, document.title, window.location.pathname);
    login({ accessToken, refreshToken, spotifyId, displayName, avatar, dbUserId });
    navigate("/", { replace: true });
  }, []);

  if (error) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16, padding:24 }}>
      <div style={{ fontSize:32 }}>⚠️</div>
      <div style={{ fontWeight:700, fontSize:18 }}>Login failed</div>
      <div style={{ color:"var(--muted)", fontSize:14, textAlign:"center", maxWidth:360 }}>{error}</div>
      <button onClick={() => navigate("/login", { replace:true })} style={{ padding:"10px 24px", background:"var(--accent)", color:"#000", fontWeight:700, fontSize:14, borderRadius:50, border:"none", cursor:"pointer" }}>
        Back to Login
      </button>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ width:36, height:36, border:"3px solid var(--border)", borderTopColor:"var(--accent)", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <div style={{ color:"var(--muted)", fontSize:14 }}>Connecting to Spotify...</div>
    </div>
  );
}
