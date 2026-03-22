import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRoom } from "../hooks/useRoom";
import ExpiryPicker from "../components/ExpiryPicker";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

function RoomCard({ radio, onJoin }) {
  return (
    <div onClick={() => onJoin(radio.id)} style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", padding: "16px", cursor: "pointer",
      transition: "border-color 0.2s",
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation",
    }}
    onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"}
    onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: radio.currentTrack ? 12 : 0 }}>
        {radio.hostAvatar
          ? <img src={radio.hostAvatar} alt="" style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0 }} />
          : <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🎙</div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{radio.name}</div>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>by {radio.hostName}</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>👥 {radio.listenerCount}</div>
      </div>
      {radio.currentTrack && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--surface2)", borderRadius: 8 }}>
          {radio.currentTrack.albumArt && <img src={radio.currentTrack.albumArt} alt="" style={{ width: 32, height: 32, borderRadius: 4, flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{radio.currentTrack.title}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{radio.currentTrack.artist}</div>
          </div>
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            {[0, 0.1, 0.2].map((d) => (
              <div key={d} style={{ width: 2, height: 12, background: "var(--accent)", borderRadius: 1, animation: `waveBar 0.8s ease ${d}s infinite` }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MyRadioRow({ radio, onJoin, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "120px" }}>{radio.name}</span>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 50, background: radio.is_active ? "rgba(29,185,84,0.15)" : "var(--surface2)", color: radio.is_active ? "var(--accent)" : "var(--muted)", border: `1px solid ${radio.is_active ? "rgba(29,185,84,0.3)" : "var(--border)"}`, flexShrink: 0 }}>
            {radio.is_active ? "active" : "inactive"}
          </span>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 50, background: "var(--surface2)", color: "var(--muted)", border: "1px solid var(--border)", flexShrink: 0 }}>
            {radio.is_public ? "🌐" : "🔒"}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontFamily: "var(--mono)" }}>ID: {radio.id}</div>
      </div>
      <button onClick={() => onJoin(radio.id)}
        style={{ padding: "8px 14px", background: "var(--accent)", color: "#000", fontWeight: 700, fontSize: 12, borderRadius: 8, border: "none", cursor: "pointer", flexShrink: 0, touchAction: "manipulation" }}>
        Open
      </button>
      <button onClick={async () => {
        if (!confirm("Delete this radio permanently?")) return;
        setDeleting(true);
        await onDelete(radio.id);
        setDeleting(false);
      }} disabled={deleting}
        style={{ padding: "8px 14px", background: "transparent", color: "var(--accent2)", fontWeight: 600, fontSize: 12, borderRadius: 8, border: "1px solid rgba(255,77,77,0.3)", cursor: "pointer", opacity: deleting ? 0.5 : 1, flexShrink: 0, touchAction: "manipulation" }}>
        {deleting ? "..." : "Delete"}
      </button>
    </div>
  );
}

export default function HomePage() {
  const { user, logout, socket, connected } = useAuth();
  const navigate = useNavigate();
  const { createRadio, joinRadio, deleteRadio, fetchMyRadios, myRadios, memberRadios } = useRoom();
  const [publicRadios, setPublicRadios] = useState([]);
  const [showCreate, setShowCreate]     = useState(false);
  const [activeTab, setActiveTab]       = useState("discover");
  const [radioName, setRadioName]       = useState(`${user?.displayName}'s Radio`);
  const [isPublic, setIsPublic]         = useState(true);
  const [creating, setCreating]         = useState(false);
  const [error, setError]               = useState(null);
  const [expiresAt, setExpiresAt]       = useState(null);

  useEffect(() => {
    const load = () => fetch(`${SERVER_URL}/radios`).then((r) => r.json()).then(setPublicRadios).catch(() => {});
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (activeTab === "myradios" && connected) fetchMyRadios().catch(() => {});
  }, [activeTab, connected]);

  async function handleCreate() {
    setCreating(true); setError(null);
    try {
      const res = await createRadio(radioName, isPublic, expiresAt);
      navigate(`/room/${res.radioId}`);
    } catch (e) { setError(String(e)); setCreating(false); }
  }

  async function handleJoin(radioId) {
    try { await joinRadio(radioId); navigate(`/room/${radioId}`); }
    catch (e) { setError(String(e)); }
  }

  async function handleDelete(radioId) {
    try { await deleteRadio(radioId); fetchMyRadios().catch(() => {}); }
    catch (e) { setError(String(e)); }
  }

  return (
    <div style={{ minHeight: "100vh", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {/* Nav — compact on mobile */}
      <nav style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", gap: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.5px", flexShrink: 0 }}>SyncWave</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: socket ? "var(--accent)" : "var(--accent2)", boxShadow: socket ? "0 0 8px var(--accent)" : "none", flexShrink: 0 }} />
          {user?.avatar && <img src={user.avatar} alt="" style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }} />}
          <span style={{ fontSize: 13, color: "var(--muted)", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.displayName}</span>
          <button onClick={logout} style={{ padding: "6px 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--muted)", fontSize: 12, cursor: "pointer", flexShrink: 0, touchAction: "manipulation" }}>
            Logout
          </button>
        </div>
      </nav>

      <div style={{ flex: 1, padding: "20px 16px", maxWidth: 720, margin: "0 auto", width: "100%" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "var(--surface)", padding: 4, borderRadius: 10, border: "1px solid var(--border)" }}>
          {[["discover", "🔍 Discover"], ["myradios", "📻 My Radios"]].map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, padding: "10px 8px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: activeTab === tab ? "var(--accent)" : "transparent",
              color: activeTab === tab ? "#000" : "var(--muted)",
              border: "none", cursor: "pointer", touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}>{label}</button>
          ))}
        </div>

        {error && <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.2)", borderRadius: 8, color: "var(--accent2)", fontSize: 13 }}>{error}</div>}

        {activeTab === "discover" && (
          <>
            {!showCreate ? (
              <div style={{ background: "linear-gradient(135deg,rgba(29,185,84,0.1),transparent)", border: "1px solid rgba(29,185,84,0.2)", borderRadius: 16, padding: "20px 16px", marginBottom: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>Start your own radio</div>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>Play music on Spotify — your friends sync automatically, even if you close the tab</div>
                </div>
                <button onClick={() => setShowCreate(true)} style={{ padding: "12px 24px", background: "var(--accent)", color: "#000", fontWeight: 700, fontSize: 14, borderRadius: 50, border: "none", cursor: "pointer", touchAction: "manipulation", alignSelf: "flex-start" }}>
                  + Create Radio
                </button>
              </div>
            ) : (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 16px", marginBottom: 24, animation: "fadeIn 0.3s ease" }}>
                <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 16 }}>Create a Radio</div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>RADIO NAME</label>
                  <input value={radioName} onChange={(e) => setRadioName(e.target.value)}
                    style={{ width: "100%", padding: "12px 14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 16 }} />
                </div>
                <ExpiryPicker value={expiresAt} onChange={setExpiresAt} />
                <div style={{ marginBottom: 20, display: "flex", gap: 10 }}>
                  {[true, false].map((pub) => (
                    <button key={String(pub)} onClick={() => setIsPublic(pub)} style={{ flex: 1, padding: "10px 8px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: isPublic === pub ? "var(--accent)" : "var(--surface2)", color: isPublic === pub ? "#000" : "var(--muted)", border: "1px solid var(--border)", cursor: "pointer", touchAction: "manipulation" }}>
                      {pub ? "🌐 Public" : "🔒 Invite Only"}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={handleCreate} disabled={creating}
                    style={{ flex: 1, padding: "12px 24px", background: "var(--accent)", color: "#000", fontWeight: 700, fontSize: 14, borderRadius: 50, border: "none", cursor: creating ? "not-allowed" : "pointer", opacity: creating ? 0.6 : 1, touchAction: "manipulation" }}>
                    {creating ? "Creating..." : "Create"}
                  </button>
                  <button onClick={() => setShowCreate(false)}
                    style={{ flex: 1, padding: "12px 24px", background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", fontWeight: 600, fontSize: 14, borderRadius: 50, cursor: "pointer", touchAction: "manipulation" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Live Radios</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{publicRadios.length} active</div>
            </div>
            {publicRadios.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)", fontSize: 14, border: "1px dashed var(--border)", borderRadius: "var(--radius)" }}>
                No live radios right now. Be the first to start one!
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {publicRadios.map((r) => <RoomCard key={r.id} radio={r} onJoin={handleJoin} />)}
              </div>
            )}
          </>
        )}

        {activeTab === "myradios" && (
          <>
            <div style={{ marginBottom: 14, padding: "12px 16px", background: "rgba(29,185,84,0.06)", border: "1px solid rgba(29,185,84,0.15)", borderRadius: 10, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
              💡 Your radios keep broadcasting even when you close this tab.
            </div>
            {myRadios.length === 0 && memberRadios.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)", fontSize: 14, border: "1px dashed var(--border)", borderRadius: "var(--radius)" }}>
                You haven't created any radios yet. Switch to Discover to create one!
              </div>
            ) : (
              <>
                {myRadios.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 8, letterSpacing: "0.05em" }}>YOUR RADIOS</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                      {myRadios.map((r) => <MyRadioRow key={r.id} radio={r} onJoin={handleJoin} onDelete={handleDelete} />)}
                    </div>
                  </>
                )}
                {memberRadios.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 8, letterSpacing: "0.05em" }}>INVITED RADIOS</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {memberRadios.map((r) => (
                        <div key={r.id} onClick={() => handleJoin(r.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
                          onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"}
                          onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>by {r.host_name}</div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); handleJoin(r.id); }} style={{ padding: "8px 14px", background: "var(--surface2)", color: "var(--text)", fontWeight: 600, fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", flexShrink: 0, touchAction: "manipulation" }}>
                            Join
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}