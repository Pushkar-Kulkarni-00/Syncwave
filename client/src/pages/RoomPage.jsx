import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRoom } from "../hooks/useRoom";
import { useAuth } from "../context/AuthContext";
import NowPlaying from "../components/NowPlaying";
import YouTubePlayer from "../components/YouTubePlayer";
import SoundCloudPlayer from "../components/SoundCloudPlayer";
import LyricsPlayer from "../components/LyricsPlayer";
import ExpiryCountdown from "../components/ExpiryCountdown";

export default function RoomPage() {
  const { radioId } = useParams();
  const navigate    = useNavigate();
  const { user }    = useAuth();
  const {
    room, currentTrack, listenerCount, source, error,
    playerRef, joinRadio, leaveRadio, deleteRadio, switchSource, setError
  } = useRoom();
  const [joining, setJoining]   = useState(true);
  const [copied, setCopied]     = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!radioId) return;
    joinRadio(radioId).catch((e) => setError(String(e))).finally(() => setJoining(false));
    return () => leaveRadio();
  }, [radioId]);

  function copyInvite() {
    const url = `${window.location.origin}/join/${room?.inviteCode || room?.invite_code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDelete() {
    if (!confirm("Delete this radio permanently? All listeners will be disconnected.")) return;
    setDeleting(true);
    try {
      await deleteRadio(radioId);
      navigate("/");
    } catch (e) {
      setError(String(e));
      setDeleting(false);
    }
  }

  if (joining) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ width:36, height:36, border:"3px solid var(--border)", borderTopColor:"var(--accent)", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <div style={{ color:"var(--muted)", fontSize:14 }}>Joining radio...</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16, padding:24 }}>
      <div style={{ fontSize:32 }}>📻</div>
      <div style={{ fontWeight:700, fontSize:18 }}>Oops</div>
      <div style={{ color:"var(--muted)", fontSize:14, textAlign:"center" }}>{error}</div>
      <button onClick={() => navigate("/")} style={{ padding:"10px 24px", background:"var(--accent)", color:"#000", fontWeight:700, fontSize:14, borderRadius:50, border:"none", cursor:"pointer" }}>Back to Home</button>
    </div>
  );

const isHost = String(room?.host_id) === String(user?.dbUserId) || room?.isHost;
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column" }}>
      <nav style={{ padding:"14px 24px", display:"flex", alignItems:"center", gap:16, borderBottom:"1px solid var(--border)" }}>
        <button onClick={() => { leaveRadio(); navigate("/"); }} style={{ background:"transparent", border:"none", color:"var(--muted)", fontSize:20, cursor:"pointer", padding:0 }}>←</button>
        <div>
          <div style={{ fontWeight:700, fontSize:16 }}>{room?.name || "Radio"}</div>
          <div style={{ fontSize:12, color:"var(--muted)" }}>{isHost ? "You're the host" : `Hosted by ${room?.hostName || room?.host_name}`}</div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:10 }}>
          {(room?.inviteCode || room?.invite_code) && (
            <button onClick={copyInvite} style={{ padding:"8px 16px", background: copied ? "var(--accent)" : "var(--surface)", color: copied ? "#000" : "var(--text)", fontWeight:600, fontSize:13, borderRadius:8, border:"1px solid var(--border)", cursor:"pointer", transition:"var(--transition)" }}>
              {copied ? "✓ Copied!" : "🔗 Invite"}
            </button>
          )}
          {isHost && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ padding:"8px 16px", background:"transparent", color:"var(--accent2)", fontWeight:600, fontSize:13, borderRadius:8, border:"1px solid rgba(255,77,77,0.3)", cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.5 : 1 }}
            >
              {deleting ? "Deleting..." : "🗑 Delete Radio"}
            </button>
          )}
        </div>
      </nav>

      <div style={{ flex:1, padding:"24px", maxWidth:800, margin:"0 auto", width:"100%" }}>
        {isHost && (
  <div style={{ background:"rgba(29,185,84,0.08)", border:"1px solid rgba(29,185,84,0.2)", borderRadius:"var(--radius)", padding:"14px 18px", marginBottom:20, fontSize:14, color:"var(--accent)", display:"flex", flexDirection:"column", gap:8 }}>
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
  <span>🎙</span>
  <span>You're live — play anything on Spotify. Your radio keeps broadcasting even if you close this tab.</span>
</div>
<ExpiryCountdown expiresAt={room?.expiresAt || room?.expires_at} />
    {!room?.isPublic && (room?.inviteCode || room?.invite_code) && (
      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
        <span style={{ fontSize:12, color:"var(--muted)" }}>🔒 Private — invite link:</span>
        <code style={{ fontSize:11, background:"var(--surface2)", padding:"3px 8px", borderRadius:6, color:"var(--text)", fontFamily:"var(--mono)", wordBreak:"break-all", flex:1 }}>
          {`${window.location.origin}/join/${room?.inviteCode || room?.invite_code}`}
        </code>
        <button onClick={copyInvite} style={{ padding:"4px 10px", background: copied ? "var(--accent)" : "var(--surface2)", color: copied ? "#000" : "var(--muted)", fontSize:11, fontWeight:600, borderRadius:6, border:"1px solid var(--border)", cursor:"pointer", whiteSpace:"nowrap" }}>
          {copied ? "✓ Copied!" : "Copy Link"}
        </button>
      </div>
    )}
  </div>
)}

        <div style={{ marginBottom:20 }}>
          <NowPlaying track={currentTrack} listenerCount={listenerCount} room={room} source={source} onSwitchSource={switchSource} />
        </div>

        {currentTrack && (
  <div style={{ animation:"fadeIn 0.4s ease" }}>
    <LyricsPlayer
      lyrics={currentTrack.lyrics}
      positionMs={currentTrack.positionMs}
      isPlaying={currentTrack.isPlaying}
      track={currentTrack}
    />
    {/* YouTube plays audio in background — hidden but active */}
    {currentTrack.youtubeId && (
      <div style={{ position:"fixed", bottom:-9999, left:-9999, width:1, height:1, overflow:"hidden", pointerEvents:"none" }}>
        <YouTubePlayer
          key={currentTrack.youtubeId}
          videoId={currentTrack.youtubeId}
          startPositionMs={currentTrack.positionMs}
          isPlaying={currentTrack.isPlaying}
          playerRef={playerRef}
        />
      </div>
    )}
  </div>
)}
      </div>
    </div>
  );
}