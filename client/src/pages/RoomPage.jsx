import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRoom } from "../hooks/useRoom";
import { useAuth } from "../context/AuthContext";
import NowPlaying from "../components/NowPlaying";
import YouTubePlayer from "../components/YouTubePlayer";
import SoundCloudPlayer from "../components/SoundCloudPlayer";
import LyricsPlayer from "../components/LyricsPlayer";
import ExpiryCountdown from "../components/ExpiryCountdown";

// ── PATCH for the MembersPanel component inside RoomPage.jsx ──────────────────
//
// Replace the entire MembersPanel function with this hardened version.
// Changes:
//   [A04] Refresh button is debounced — cannot be spammed (3s cooldown)
//   [A03] handleRemove uses dbUserId consistently (not mixed id/dbUserId)

function MembersPanel({ radioId, getRadioMembers, removeRadioMember, hostUserId }) {
  const [members, setMembers]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [removing, setRemoving]     = useState(null);
  // [A04] Debounce state — prevents refresh button spam
  const [refreshCooldown, setRefreshCooldown] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await getRadioMembers(radioId);
      setMembers(m);
    } catch {}
    setLoading(false);
  }, [radioId, getRadioMembers]);

  useEffect(() => { load(); }, [load]);

  // [A04] Debounced refresh — 3 second cooldown after each click
  function handleRefresh() {
    if (refreshCooldown) return;
    load();
    setRefreshCooldown(true);
    setTimeout(() => setRefreshCooldown(false), 3000);
  }

  async function handleRemove(memberId, name) {
    if (!confirm(`Remove ${name} from this radio? They will lose access.`)) return;
    setRemoving(memberId);
    try {
      await removeRadioMember(radioId, memberId);
      // [A03] Filter by dbUserId consistently
      setMembers((prev) => prev.filter((m) => (m.dbUserId ?? m.id) !== memberId));
    } catch (e) {
      alert(String(e));
    }
    setRemoving(null);
  }

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", overflow: "hidden",
      marginBottom: 20, animation: "fadeIn 0.3s ease",
    }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>👥 Listeners</div>
        <button onClick={handleRefresh} disabled={refreshCooldown}
          style={{ background: "none", border: "none", color: refreshCooldown ? "var(--border)" : "var(--muted)", fontSize: 12, cursor: refreshCooldown ? "not-allowed" : "pointer", padding: "2px 8px" }}>
          ↻ {refreshCooldown ? "..." : "Refresh"}
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Loading...</div>
      ) : members.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No one else is listening right now.</div>
      ) : (
        <div>
          {members.map((member) => {
            // [A03] Use dbUserId as the canonical identifier, fall back to id
            const memberId = member.dbUserId ?? member.id;
            return (
              <div key={memberId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
                {(member.avatar_url || member.avatar)
                  ? <img src={member.avatar_url || member.avatar} alt="" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
                  : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>👤</div>
                }
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{member.display_name || member.displayName}</div>
                  {member.joined_at && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                      Joined {new Date(member.joined_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
                {removeRadioMember && String(memberId) !== String(hostUserId) && (
                  <button onClick={() => handleRemove(memberId, member.display_name || member.displayName)}
                    disabled={removing === memberId}
                    style={{ padding: "5px 12px", background: "transparent", color: "var(--accent2)", fontWeight: 600, fontSize: 11, borderRadius: 6, border: "1px solid rgba(255,77,77,0.3)", cursor: removing === memberId ? "not-allowed" : "pointer", opacity: removing === memberId ? 0.5 : 1, whiteSpace: "nowrap" }}>
                    {removing === memberId ? "Removing..." : "Remove"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RoomPage() {
  const { radioId } = useParams();
  const navigate    = useNavigate();
  const { user,connected }    = useAuth();
  const {
  room, currentTrack, listenerCount, source, error,
  playerRef, joinRadio, leaveRadio, deleteRadio,
  getRadioMembers, removeRadioMember, getListeners,
  switchSource, setError,
} = useRoom();
  const [joining, setJoining]       = useState(true);
  const [copied, setCopied]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [showMembers, setShowMembers] = useState(true);

useEffect(() => {
  if (!radioId || !connected) return;
  joinRadio(radioId).catch((e) => setError(String(e))).finally(() => setJoining(false));
  return () => leaveRadio();
}, [radioId, connected]);

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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 36, height: 36, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: "var(--muted)", fontSize: 14 }}>Joining radio...</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, padding: 24 }}>
      <div style={{ fontSize: 32 }}>📻</div>
      <div style={{ fontWeight: 700, fontSize: 18 }}>Oops</div>
      <div style={{ color: "var(--muted)", fontSize: 14, textAlign: "center" }}>{error}</div>
      <button onClick={() => navigate("/")} style={{ padding: "10px 24px", background: "var(--accent)", color: "#000", fontWeight: 700, fontSize: 14, borderRadius: 50, border: "none", cursor: "pointer" }}>Back to Home</button>
    </div>
  );

  const isHost    = String(room?.host_id) === String(user?.dbUserId) || room?.isHost;
const isPrivate = room?.isPublic == false || room?.is_public == false;
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <nav style={{ padding: "14px 24px", display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid var(--border)" }}>
        <button onClick={() => { leaveRadio(); navigate("/"); }} style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{room?.name || "Radio"}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{isHost ? "You're the host" : `Hosted by ${room?.hostName || room?.host_name}`}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(room?.inviteCode || room?.invite_code) && (
            <button onClick={copyInvite} style={{ padding: "8px 16px", background: copied ? "var(--accent)" : "var(--surface)", color: copied ? "#000" : "var(--text)", fontWeight: 600, fontSize: 13, borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", transition: "var(--transition)" }}>
              {copied ? "✓ Copied!" : "🔗 Invite"}
            </button>
          )}
          {/* Members button — only for host of private radio */}
          {(
            <button
              onClick={() => setShowMembers((v) => !v)}
              style={{ padding: "8px 16px", background: showMembers ? "rgba(29,185,84,0.15)" : "var(--surface)", color: showMembers ? "var(--accent)" : "var(--text)", fontWeight: 600, fontSize: 13, borderRadius: 8, border: `1px solid ${showMembers ? "rgba(29,185,84,0.3)" : "var(--border)"}`, cursor: "pointer" }}
            >
              👥 Members
            </button>
          )}
          {isHost && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ padding: "8px 16px", background: "transparent", color: "var(--accent2)", fontWeight: 600, fontSize: 13, borderRadius: 8, border: "1px solid rgba(255,77,77,0.3)", cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.5 : 1 }}
            >
              {deleting ? "Deleting..." : "🗑 Delete Radio"}
            </button>
          )}
        </div>
      </nav>

      <div style={{ flex: 1, padding: "24px", maxWidth: 800, margin: "0 auto", width: "100%" }}>
        {/* Host banner */}
        {isHost && (
          <div style={{ background: "rgba(29,185,84,0.08)", border: "1px solid rgba(29,185,84,0.2)", borderRadius: "var(--radius)", padding: "14px 18px", marginBottom: 20, fontSize: 14, color: "var(--accent)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span>🎙</span>
              <span>You're live — play anything on Spotify. Your radio keeps broadcasting even if you close this tab.</span>
            </div>
            {isPrivate && (room?.inviteCode || room?.invite_code) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>🔒 Private — invite link:</span>
                <code style={{ fontSize: 11, background: "var(--surface2)", padding: "3px 8px", borderRadius: 6, color: "var(--text)", fontFamily: "var(--mono)", wordBreak: "break-all", flex: 1 }}>
                  {`${window.location.origin}/join/${room?.inviteCode || room?.invite_code}`}
                </code>
                <button onClick={copyInvite} style={{ padding: "4px 10px", background: copied ? "var(--accent)" : "var(--surface2)", color: copied ? "#000" : "var(--muted)", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer", whiteSpace: "nowrap" }}>
                  {copied ? "✓ Copied!" : "Copy Link"}
                </button>
              </div>
            )}
            <ExpiryCountdown expiresAt={room?.expiresAt || room?.expires_at} />
          </div>
        )}

        {/* Members panel — toggled by host */}
        {showMembers && (
  <MembersPanel
    radioId={radioId}
    getRadioMembers={getListeners}
    removeRadioMember={isHost && isPrivate ? removeRadioMember : null}
    hostUserId={user?.dbUserId}
  />
)}

        {/* Now playing */}
        <div style={{ marginBottom: 20 }}>
          <NowPlaying track={currentTrack} listenerCount={listenerCount} room={room} source={source} onSwitchSource={switchSource} />
        </div>

        {/* Lyrics + hidden YouTube audio */}
        {currentTrack && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <LyricsPlayer
              lyrics={currentTrack.lyrics}
              positionMs={currentTrack.positionMs}
              isPlaying={currentTrack.isPlaying}
              track={currentTrack}
            />
            {currentTrack.youtubeId && (
              <div style={{ position: "fixed", bottom: -9999, left: -9999, width: 1, height: 1, overflow: "hidden", pointerEvents: "none" }}>
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