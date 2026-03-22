import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRoom } from "../hooks/useRoom";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

export default function JoinPage() {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const { joinRadio } = useRoom();
  const [radioInfo, setRadioInfo] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [joining, setJoining]     = useState(false);
  const [error, setError]         = useState(null);

  useEffect(() => {
    fetch(`${SERVER_URL}/radios/invite/${inviteCode}`)
      .then((r) => { if (!r.ok) throw new Error("Invalid invite link"); return r.json(); })
      .then(setRadioInfo)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [inviteCode]);

  async function handleJoin() {
    setJoining(true);
    try {
      await joinRadio(null, inviteCode);
      navigate(`/room/${radioInfo.id}`);
    } catch (e) { setError(String(e)); setJoining(false); }
  }

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ width:36, height:36, border:"3px solid var(--border)", borderTopColor:"var(--accent)", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <div style={{ color:"var(--muted)", fontSize:14 }}>Checking invite...</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16, padding:24 }}>
      <div style={{ fontSize:40 }}>🚫</div>
      <div style={{ fontWeight:700, fontSize:18 }}>Invalid Invite</div>
      <div style={{ color:"var(--muted)", fontSize:14, textAlign:"center" }}>{error}</div>
      <button onClick={() => navigate("/")} style={{ padding:"10px 24px", background:"var(--accent)", color:"#000", fontWeight:700, fontSize:14, borderRadius:50, border:"none", cursor:"pointer" }}>Go Home</button>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:24, background:"radial-gradient(ellipse at 50% 0%, rgba(29,185,84,0.06) 0%, transparent 60%), var(--bg)" }}>
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:20, padding:"40px 48px", maxWidth:400, width:"100%", textAlign:"center", animation:"fadeIn 0.4s ease" }}>
        <div style={{ fontSize:48, marginBottom:16 }}>📻</div>
        <div style={{ fontSize:13, color:"var(--muted)", marginBottom:6, letterSpacing:"0.05em" }}>YOU'VE BEEN INVITED TO</div>
        <h2 style={{ fontSize:24, fontWeight:800, marginBottom:6 }}>{radioInfo.name}</h2>
        <div style={{ color:"var(--muted)", fontSize:14, marginBottom:32 }}>Hosted by {radioInfo.hostName}</div>
        <button onClick={handleJoin} disabled={joining} style={{ width:"100%", padding:"14px 24px", background:"var(--accent)", color:"#000", fontWeight:700, fontSize:15, borderRadius:50, border:"none", cursor: joining?"not-allowed":"pointer", opacity: joining?0.6:1, transition:"opacity 0.2s, transform 0.2s" }}
          onMouseEnter={(e) => { if (!joining) e.currentTarget.style.transform="scale(1.02)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform="scale(1)"; }}>
          {joining ? "Joining..." : "Join Radio 🎵"}
        </button>
        <button onClick={() => navigate("/")} style={{ marginTop:12, background:"none", border:"none", color:"var(--muted)", fontSize:13, cursor:"pointer" }}>Go to home instead</button>
      </div>
    </div>
  );
}
