import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginPage        from "./pages/LoginPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import HomePage         from "./pages/HomePage";
import RoomPage         from "./pages/RoomPage";
import JoinPage         from "./pages/JoinPage";

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login"          element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/auth/callback"  element={<AuthCallbackPage />} />
      <Route path="/"               element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
      <Route path="/room/:radioId"  element={<ProtectedRoute><RoomPage /></ProtectedRoute>} />
      <Route path="/join/:inviteCode" element={<ProtectedRoute><JoinPage /></ProtectedRoute>} />
      <Route path="*"               element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
