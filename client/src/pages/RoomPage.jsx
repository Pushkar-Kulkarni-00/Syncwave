import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRoom } from "../hooks/useRoom";
import { useAuth } from "../context/AuthContext";
import NowPlaying from "../components/NowPlaying";
import YouTubePlayer from "../components/YouTubePlayer";
import LyricsPlayer from "../components/LyricsPlayer";
import ExpiryCountdown from "../components/ExpiryCountdown";

// ── Tap-friendly button base style ───────────────────────────────────────────
const tapBtn = (extra = {}) => ({
  WebkitTapHighlightColor: "transparent",
  touchAction: "manipulation",
  cursor: "pointer",
  ...extra,
});

function MembersPanel({ radioId, getRadioMembers, removeRadioMember, hostUserId }) {
  const [members, setMembers]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [removing, setRemoving]           = useState(null);
  const [refreshCooldown, setRefreshCooldown] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const m = await getRadioMembers(radioId); setMembers(m); } catch {}
    setLoading(false);
  }, [radioId, getRadioMembers]);

  useEffect(() => { load(); }, [load]);

  function handleRefresh() {
    if (refreshCooldown) return;
    load();
    setRefreshCooldown(true);
    setTimeout(() => setRefreshCooldown(false), 3000);
  }

  async function handleRemove(memberId, name) {
    if (!confirm(`Remove ${name} from this radio?`)) return;
    setRemoving(memberId);
    try {
      await removeRadioMember(radioId, memberId);
      setMembers((prev) => prev.filter((m) => (m.dbUserId ?? m.id) !== memberId));
    } catch (e) { alert(String(e)); }
    setRemoving(null);
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>👥 Listeners</div>
        <button onClick={handleRefresh} disabled={refreshCooldown}
          style={tapBtn({ background: "none", border: "none", color: refreshCooldown ? "var(--border)" : "var(--muted)", fontSize: 12, padding: "4px 8px", minHeight: 32 })}>
          ↻ {refreshCooldown ? "..." : "Refresh"}
        </button>
      </div>
      {loading ? (
        <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Loading...</div>
      ) : members.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No one else is listening right now.</div>
      ) : (
        <div>
          {members.map((member) => {
            const memberId = member.dbUserId ?? member.id;
            return (
              <div key={memberId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                {(member.avatar_url || member.avatar)
                  ? <img src={member.avatar_url || member.avatar} alt="" style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0 }} />
                  : <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>👤</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{member.display_name || member.displayName}</div>
                </div>
                {removeRadioMember && String(memberId) !== String(hostUserId) && (
                  <button onClick={() => handleRemove(memberId, member.display_name || member.displayName)}
                    disabled={removing === memberId}
                    style={tapBtn({ padding: "6px 12px", background: "transparent", color: "var(--accent2)", fontWeight: 600, fontSize: 11, borderRadius: 6, border: "1px solid rgba(255,77,77,0.3)", opacity: removing === memberId ? 0.5 : 1, minHeight: 32, flexShrink: 0 })}>
                    {removing === memberId ? "..." : "Remove"}
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
  const { user, connected } = useAuth();
  const {
    room, currentTrack, listenerCount, source, error,
    playerRef, joinRadio, leaveRadio, deleteRadio,
    getRadioMembers, removeRadioMember, getListeners,
    switchSource, setError,
  } = useRoom();
  const [joining, setJoining]         = useState(true);
  const [copied, setCopied]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  // Mobile: collapse nav buttons into a menu on small screens
  const [showNavMenu, setShowNavMenu] = useState(false);

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
    try { await deleteRadio(radioId); navigate("/"); }
    catch (e) { setError(String(e)); setDeleting(false); }
  }

  if (joining) return (
    <div style={{ minHeight: "100vh", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 36, height: 36, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: "var(--muted)", fontSize: 14 }}>Joining radio...</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, padding: 24 }}>
      <div style={{ fontSize: 32 }}>📻</div>
      <div style={{ fontWeight: 700, fontSize: 18 }}>Oops</div>
      <div style={{ color: "var(--muted)", fontSize: 14, textAlign: "center" }}>{error}</div>
      <button onClick={() => navigate("/")} style={tapBtn({ padding: "12px 24px", background: "var(--accent)", color: "#000", fontWeight: 700, fontSize: 14, borderRadius: 50, border: "none" })}>Back to Home</button>
    </div>
  );

  const isHost    = String(room?.host_id) === String(user?.dbUserId) || room?.isHost;
  const isPrivate = room?.isPublic == false || room?.is_public == false;

  return (
    <div style={{ minHeight: "100vh", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {/* Nav — compact, wraps gracefully on mobile */}
      <nav style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <button onClick={() => { leaveRadio(); navigate("/"); }}
          style={tapBtn({ background: "transparent", border: "none", color: "var(--muted)", fontSize: 20, padding: "4px 8px 4px 0", minHeight: 36 })}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{room?.name || "Radio"}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>{isHost ? "You're the host" : `Hosted by ${room?.hostName || room?.host_name}`}</div>
        </div>
        {/* Action buttons — wrap on narrow screens */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          {(room?.inviteCode || room?.invite_code) && (
            <button onClick={copyInvite}
              style={tapBtn({ padding: "8px 14px", background: copied ? "var(--accent)" : "var(--surface)", color: copied ? "#000" : "var(--text)", fontWeight: 600, fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", minHeight: 36 })}>
              {copied ? "✓" : "🔗"}
            </button>
          )}
          <button onClick={() => setShowMembers((v) => !v)}
            style={tapBtn({ padding: "8px 14px", background: showMembers ? "rgba(29,185,84,0.15)" : "var(--surface)", color: showMembers ? "var(--accent)" : "var(--text)", fontWeight: 600, fontSize: 12, borderRadius: 8, border: `1px solid ${showMembers ? "rgba(29,185,84,0.3)" : "var(--border)"}`, minHeight: 36 })}>
            👥
          </button>
          {isHost && (
            <button onClick={handleDelete} disabled={deleting}
              style={tapBtn({ padding: "8px 14px", background: "transparent", color: "var(--accent2)", fontWeight: 600, fontSize: 12, borderRadius: 8, border: "1px solid rgba(255,77,77,0.3)", opacity: deleting ? 0.5 : 1, minHeight: 36 })}>
              🗑
            </button>
          )}
        </div>
      </nav>

      <div style={{ flex: 1, padding: "16px", maxWidth: 800, margin: "0 auto", width: "100%", overflowX: "hidden" }}>
        {/* Host banner */}
        {isHost && (
          <div style={{ background: "rgba(29,185,84,0.08)", border: "1px solid rgba(29,185,84,0.2)", borderRadius: "var(--radius)", padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "var(--accent)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span>🎙</span>
              <span>You're live — play anything on Spotify. Your radio keeps broadcasting even if you close this tab.</span>
            </div>
            {isPrivate && (room?.inviteCode || room?.invite_code) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>🔒 Invite:</span>
                <code style={{ fontSize: 10, background: "var(--surface2)", padding: "3px 8px", borderRadius: 6, color: "var(--text)", fontFamily: "var(--mono)", wordBreak: "break-all", flex: 1, minWidth: 0 }}>
                  {`${window.location.origin}/join/${room?.inviteCode || room?.invite_code}`}
                </code>
                <button onClick={copyInvite}
                  style={tapBtn({ padding: "5px 10px", background: copied ? "var(--accent)" : "var(--surface2)", color: copied ? "#000" : "var(--muted)", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "1px solid var(--border)", whiteSpace: "nowrap", flexShrink: 0, minHeight: 32 })}>
                  {copied ? "✓" : "Copy"}
                </button>
              </div>
            )}
            <ExpiryCountdown expiresAt={room?.expiresAt || room?.expires_at} />
          </div>
        )}

        {/* Members panel */}
        {showMembers && (
          <MembersPanel
            radioId={radioId}
            getRadioMembers={getListeners}
            removeRadioMember={isHost && isPrivate ? removeRadioMember : null}
            hostUserId={user?.dbUserId}
          />
        )}

        {/* Now playing */}
        <div style={{ marginBottom: 16 }}>
          <NowPlaying track={currentTrack} listenerCount={listenerCount} room={room} source={source} onSwitchSource={switchSource} />
        </div>

        {/* Lyrics + hidden audio */}
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