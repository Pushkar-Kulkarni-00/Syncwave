import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("sw_user");
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (!parsed?.spotifyId || !parsed?.accessToken || !parsed?.dbUserId) {
        localStorage.removeItem("sw_user");
        return null;
      }
      return parsed;
    } catch {
      localStorage.removeItem("sw_user");
      return null;
    }
  });

  const [socket, setSocket]       = useState(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    const s = io(SERVER_URL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socketRef.current = s;
    setSocket(s);

    s.on("connect", () => {
      s.emit("identify", {
        spotifyId:    user.spotifyId,
        dbUserId:     user.dbUserId,
        displayName:  user.displayName,
        avatar:       user.avatar,
        accessToken:  user.accessToken,
        refreshToken: user.refreshToken,
      });
    });

    s.on("identified", ({ ok }) => {
      if (ok) setConnected(true);
    });

    s.on("disconnect", () => setConnected(false));

    s.on("connect_error", (err) => {
      console.error("[SyncWave] Socket error:", err.message);
      setConnected(false);
    });

    return () => { s.disconnect(); socketRef.current = null; };
  }, [user?.spotifyId]);

  function login(userData) {
    const safe = {
      spotifyId:    userData.spotifyId,
      dbUserId:     userData.dbUserId,
      displayName:  userData.displayName,
      avatar:       userData.avatar,
      accessToken:  userData.accessToken,
      refreshToken: userData.refreshToken,
    };
    localStorage.setItem("sw_user", JSON.stringify(safe));
    setUser(safe);
  }

  function logout() {
    localStorage.removeItem("sw_user");
    setUser(null);
  }

  async function initiateSpotifyLogin() {
    try {
      const res = await fetch(`${SERVER_URL}/auth/spotify/init`);
      if (!res.ok) throw new Error("Failed to init login");
      const { authUrl } = await res.json();
      if (!authUrl?.startsWith("https://accounts.spotify.com/authorize")) {
        throw new Error("Invalid auth URL");
      }
      window.location.href = authUrl;
    } catch (err) {
      console.error("[SyncWave] Login init failed:", err.message);
      throw err;
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, initiateSpotifyLogin, socket, connected }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);