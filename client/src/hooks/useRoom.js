/**
 * useRoom.js — v3
 * Updated to use new socket events:
 *   create_radio, join_radio, delete_radio, get_my_radios, leave_radio
 * Room state is now fetched from the DB on join — so listeners sync
 * immediately even if the host is offline.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

export function useRoom() {
  const { socket } = useAuth();
  const [room, setRoom]               = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [listenerCount, setListenerCount] = useState(0);
  const [source, setSource]           = useState("youtube");
  const [error, setError]             = useState(null);
  const [myRadios, setMyRadios]         = useState([]);
  const [memberRadios, setMemberRadios] = useState([]);

  const playerRef    = useRef(null);
  const lastTrackId  = useRef(null);

  useEffect(() => {
    if (!socket) return;

    // New track from BullMQ poller → broadcast received here
    socket.on("track_change", (track) => {
      setCurrentTrack(track);
      setSource(track.youtubeId ? "youtube" : "soundcloud");
      lastTrackId.current = track.spotifyId;
    });

    // Drift correction tick — every 5s from BullMQ poller
    socket.on("position_update", ({ positionMs, isPlaying, serverTime }) => {
      const latency = Date.now() - serverTime;
      const corrected = positionMs + latency;
      setCurrentTrack((prev) => prev ? { ...prev, positionMs: corrected, isPlaying } : prev);

      // Correct YouTube player if drift > 3s
      if (playerRef.current && source === "youtube") {
        try {
          const ytPos = (playerRef.current.getCurrentTime?.() ?? 0) * 1000;
          if (Math.abs(ytPos - corrected) > 3000) {
            playerRef.current.seekTo?.(corrected / 1000, true);
          }
          if (isPlaying && playerRef.current.getPlayerState?.() !== 1) playerRef.current.playVideo?.();
          else if (!isPlaying && playerRef.current.getPlayerState?.() === 1) playerRef.current.pauseVideo?.();
        } catch {}
      }
    });

    // Host paused / stopped Spotify
    socket.on("host_paused", () => {
      setCurrentTrack(null);
    });

    socket.on("listener_count", (count) => setListenerCount(count));

    socket.on("room_closed", ({ reason }) => {
      setError(`Radio closed: ${reason}`);
      setRoom(null);
      setCurrentTrack(null);
    });

    return () => {
      socket.off("track_change");
      socket.off("position_update");
      socket.off("host_paused");
      socket.off("listener_count");
      socket.off("room_closed");
    };
  }, [socket, source]);

  const createRadio = useCallback((name, isPublic, expiresAt) => {
    return new Promise((resolve, reject) => {
      if (!socket) return reject("Not connected");
      socket.emit("create_radio", { name, isPublic,expiresAt: expiresAt || null }, (res) => {
        if (res.error) return reject(res.error);
        setRoom({ id: res.radioId, name, isHost: true, isPublic, inviteCode: res.inviteCode, inviteUrl: res.inviteUrl, expiresAt: res.expiresAt });
        setListenerCount(1);
        resolve(res);
      });
    });
  }, [socket]);

  const joinRadio = useCallback((radioId, inviteCode) => {
    return new Promise((resolve, reject) => {
      if (!socket) return reject("Not connected");
      socket.emit("join_radio", { radioId, inviteCode }, (res) => {
        if (res.error) return reject(res.error);
        setRoom({ ...res.radio, isHost: false });
        setCurrentTrack(res.radio.currentTrack);
        if (res.radio.currentTrack?.youtubeId) setSource("youtube");
        else if (res.radio.currentTrack?.soundcloudUrl) setSource("soundcloud");
        setListenerCount(res.radio.listenerCount);
        resolve(res);
      });
    });
  }, [socket]);

  const leaveRadio = useCallback(() => {
    if (!socket) return;
    socket.emit("leave_radio");
    setRoom(null);
    setCurrentTrack(null);
    setListenerCount(0);
  }, [socket]);

  const deleteRadio = useCallback((radioId) => {
    return new Promise((resolve, reject) => {
      if (!socket) return reject("Not connected");
      socket.emit("delete_radio", { radioId }, (res) => {
        if (res.error) return reject(res.error);
        resolve(res);
      });
    });
  }, [socket]);

  const fetchMyRadios = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!socket) return reject("Not connected");
      socket.emit("get_my_radios", (res) => {
 if (res.error) return reject(res.error);
  setMyRadios(res.radios);
  setMemberRadios(res.memberRadios || []);
  resolve(res.radios);
});
    });
  }, [socket]);

  const switchSource = useCallback((s) => setSource(s), []);

  return {
  room, currentTrack, listenerCount, source, error, myRadios, memberRadios,
  playerRef, createRadio, joinRadio, leaveRadio, deleteRadio,
  fetchMyRadios, switchSource, setError,
};
}
