import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRoom } from "../hooks/useRoom";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

function RoomCard({ radio, onJoin }) {
  return (
    <div
      onClick={() => onJoin(radio.id)}
      style={{
        background:"var(--surface)", border:"1px solid var(--border)",
        borderRadius:"var(--radius)", padding:"20px", cursor:"pointer",
        transition:"border-color 0.2s, transform 0.2s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor="rgba(255,255,255,0.2)"; e.currentTarget.style.transform="translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.transform="translateY(0)"; }}
    >
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
        {radio.hostAvatar
          ? <img src={radio.hostAvatar} alt="" style={{ width:36, height:36, borderRadius:"50%" }} />
          : <div style={{ width:36, height:36, borderRadius:"50%", background:"var(--surface2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>🎙</div>
        }
        <div>
          <div style={{ fontWeight:600, fontSize:15 }}>{radio.name}</div>
          <div style={{ color:"var(--muted)", fontSize:12 }}>by {radio.hostName}</div>
        </div>
        <div style={{ marginLeft:"auto", fontSize:12, color:"var(--muted)" }}>👥 {radio.listenerCount}</div>
      </div>
      {radio.currentTrack && (
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:"var(--surface2)", borderRadius:8 }}>
          {radio.currentTrack.albumArt && <img src={radio.currentTrack.albumArt} alt="" style={{ width:32, height:32, borderRadius:4 }} />}
          <div>
            <div style={{ fontSize:12, fontWeight:600, lineHeight:1.3 }}>{radio.currentTrack.title}</div>
            <div style={{ fontSize:11, color:"var(--muted)" }}>{radio.currentTrack.artist}</div>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:2 }}>
            {[0,0.1,0.2].map((d) => (
              <div key={d} style={{ width:2, height:12, background:"var(--accent)", borderRadius:1, animation:`waveBar 0.8s ease ${d}s infinite` }} />
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
    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius)" }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:600, fontSize:14, display:"flex", alignItems:"center", gap:8 }}>
          {radio.name}
          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:50, background: radio.is_active ? "rgba(29,185,84,0.15)" : "var(--surface2)", color: radio.is_active ? "var(--accent)" : "var(--muted)", border:`1px solid ${radio.is_active ? "rgba(29,185,84,0.3)" : "var(--border)"}` }}>
            {radio.is_active ? "active" : "inactive"}
          </span>
          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:50, background:"var(--surface2)", color:"var(--muted)", border:"1px solid var(--border)" }}>
            {radio.is_public ? "🌐 public" : "🔒 private"}
          </span>
        </div>
        <div style={{ fontSize:11, color:"var(--muted)", marginTop:2, fontFamily:"var(--mono)" }}>ID: {radio.id}</div>
      </div>
      <button
        onClick={() => onJoin(radio.id)}
        style={{ padding:"6px 14px", background:"var(--accent)", color:"#000", fontWeight:700, fontSize:12, borderRadius:8, border:"none", cursor:"pointer" }}
      >
        Open
      </button>
      <button
        onClick={async () => {
          if (!confirm("Delete this radio permanently?")) return;
          setDeleting(true);
          await onDelete(radio.id);
          setDeleting(false);
        }}
        disabled={deleting}
        style={{ padding:"6px 14px", background:"transparent", color:"var(--accent2)", fontWeight:600, fontSize:12, borderRadius:8, border:"1px solid rgba(255,77,77,0.3)", cursor:"pointer", opacity: deleting ? 0.5 : 1 }}
      >
        {deleting ? "..." : "Delete"}
      </button>
    </div>
  );
}

export default function HomePage() {
  const { user, logout ,socket,connected} = useAuth();
  const navigate = useNavigate();
  const { createRadio, joinRadio, deleteRadio, fetchMyRadios, myRadios} = useRoom();
  const [publicRadios, setPublicRadios]   = useState([]);
  const [showCreate, setShowCreate]       = useState(false);
  const [activeTab, setActiveTab]         = useState("discover"); // "discover" | "myradios"
  const [radioName, setRadioName]         = useState(`${user?.displayName}'s Radio`);
  const [isPublic, setIsPublic]           = useState(true);
  const [creating, setCreating]           = useState(false);
  const [error, setError]                 = useState(null);

  // Load public radios
  useEffect(() => {
    const load = () => fetch(`${SERVER_URL}/radios`).then((r) => r.json()).then(setPublicRadios).catch(() => {});
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  // Load my radios when tab selected
  useEffect(() => {
    if (activeTab === "myradios" && connected) fetchMyRadios().catch(() => {});
  }, [activeTab, connected]);

  async function handleCreate() {
    setCreating(true); setError(null);
    try {
      const res = await createRadio(radioName, isPublic);
      navigate(`/room/${res.radioId}`);
    } catch (e) { setError(String(e)); setCreating(false); }
  }

  async function handleJoin(radioId) {
    try {
      await joinRadio(radioId);
      navigate(`/room/${radioId}`);
    } catch (e) { setError(String(e)); }
  }

  async function handleDelete(radioId) {
    try {
      await deleteRadio(radioId);
      fetchMyRadios().catch(() => {});
    } catch (e) { setError(String(e)); }
  }

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column" }}>
      {/* Nav */}
      <nav style={{ padding:"16px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid var(--border)" }}>
        <div style={{ fontWeight:800, fontSize:20, letterSpacing:"-0.5px" }}>SyncWave</div>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background: socket ? "var(--accent)" : "var(--accent2)", boxShadow: socket ? "0 0 8px var(--accent)" : "none" }} />
          {user?.avatar && <img src={user.avatar} alt="" style={{ width:30, height:30, borderRadius:"50%" }} />}
          <span style={{ fontSize:14, color:"var(--muted)" }}>{user?.displayName}</span>
          <button onClick={logout} style={{ padding:"6px 14px", background:"transparent", border:"1px solid var(--border)", borderRadius:8, color:"var(--muted)", fontSize:13, cursor:"pointer" }}>
            Logout
          </button>
        </div>
      </nav>

      <div style={{ flex:1, padding:"32px 24px", maxWidth:720, margin:"0 auto", width:"100%" }}>
        {/* Tabs */}
        <div style={{ display:"flex", gap:4, marginBottom:28, background:"var(--surface)", padding:4, borderRadius:10, border:"1px solid var(--border)", width:"fit-content" }}>
          {[["discover","🔍 Discover"],["myradios","📻 My Radios"]].map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding:"8px 18px", borderRadius:8, fontSize:13, fontWeight:600,
              background: activeTab === tab ? "var(--accent)" : "transparent",
              color: activeTab === tab ? "#000" : "var(--muted)",
              border:"none", cursor:"pointer", transition:"var(--transition)",
            }}>{label}</button>
          ))}
        </div>

        {error && <div style={{ marginBottom:16, padding:"10px 14px", background:"rgba(255,77,77,0.08)", border:"1px solid rgba(255,77,77,0.2)", borderRadius:8, color:"var(--accent2)", fontSize:13 }}>{error}</div>}

        {activeTab === "discover" && (
          <>
            {/* Create radio CTA */}
            {!showCreate ? (
              <div style={{ background:"linear-gradient(135deg,rgba(29,185,84,0.1),transparent)", border:"1px solid rgba(29,185,84,0.2)", borderRadius:16, padding:"28px 32px", marginBottom:28, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:18, marginBottom:6 }}>Start your own radio</div>
                  <div style={{ color:"var(--muted)", fontSize:14 }}>Play music on Spotify — your friends sync automatically, even if you close the tab</div>
                </div>
                <button onClick={() => setShowCreate(true)} style={{ padding:"12px 24px", background:"var(--accent)", color:"#000", fontWeight:700, fontSize:14, borderRadius:50, border:"none", cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
                  + Create Radio
                </button>
              </div>
            ) : (
              <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:16, padding:"28px 32px", marginBottom:28, animation:"fadeIn 0.3s ease" }}>
                <div style={{ fontWeight:700, fontSize:18, marginBottom:20 }}>Create a Radio</div>
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:12, color:"var(--muted)", display:"block", marginBottom:6 }}>RADIO NAME</label>
                  <input value={radioName} onChange={(e) => setRadioName(e.target.value)} style={{ width:"100%", padding:"10px 14px", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:15 }} />
                </div>
                <div style={{ marginBottom:24, display:"flex", gap:12 }}>
                  {[true, false].map((pub) => (
                    <button key={String(pub)} onClick={() => setIsPublic(pub)} style={{ padding:"8px 16px", borderRadius:8, fontSize:13, fontWeight:600, background: isPublic===pub ? "var(--accent)" : "var(--surface2)", color: isPublic===pub ? "#000" : "var(--muted)", border:"1px solid var(--border)", cursor:"pointer" }}>
                      {pub ? "🌐 Public" : "🔒 Invite Only"}
                    </button>
                  ))}
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={handleCreate} disabled={creating} style={{ padding:"10px 24px", background:"var(--accent)", color:"#000", fontWeight:700, fontSize:14, borderRadius:50, border:"none", cursor: creating?"not-allowed":"pointer", opacity: creating?0.6:1 }}>
                    {creating ? "Creating..." : "Create"}
                  </button>
                  <button onClick={() => setShowCreate(false)} style={{ padding:"10px 24px", background:"transparent", border:"1px solid var(--border)", color:"var(--muted)", fontWeight:600, fontSize:14, borderRadius:50, cursor:"pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Public radios */}
            <div style={{ marginBottom:12, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontWeight:700, fontSize:16 }}>Live Radios</div>
              <div style={{ fontSize:12, color:"var(--muted)" }}>{publicRadios.length} active</div>
            </div>
            {publicRadios.length === 0 ? (
              <div style={{ textAlign:"center", padding:"48px 24px", color:"var(--muted)", fontSize:14, border:"1px dashed var(--border)", borderRadius:"var(--radius)" }}>
                No live radios right now. Be the first to start one!
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {publicRadios.map((r) => <RoomCard key={r.id} radio={r} onJoin={handleJoin} />)}
              </div>
            )}
          </>
        )}

        {activeTab === "myradios" && (
          <>
            <div style={{ marginBottom:16, padding:"14px 18px", background:"rgba(29,185,84,0.06)", border:"1px solid rgba(29,185,84,0.15)", borderRadius:10, fontSize:13, color:"var(--muted)", lineHeight:1.6 }}>
              💡 Your radios keep broadcasting even when you close this tab. Listeners will stay synced as long as you're playing music on Spotify.
            </div>
            {myRadios.length === 0 ? (
              <div style={{ textAlign:"center", padding:"48px 24px", color:"var(--muted)", fontSize:14, border:"1px dashed var(--border)", borderRadius:"var(--radius)" }}>
                You haven't created any radios yet. Switch to Discover to create one!
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {myRadios.map((r) => (
                  <MyRadioRow key={r.id} radio={r} onJoin={handleJoin} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
