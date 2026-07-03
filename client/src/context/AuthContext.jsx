import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api";
import { socket } from "../socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // true while we check a stored token on page load, so ProtectedRoute
  // doesn't bounce a logged-in user to /login before the check finishes.
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      setRestoring(false);
      return;
    }
    api
      .get("/auth/me")
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setRestoring(false));
  }, []);

  // Keep the socket connected only while someone is logged in.
  useEffect(() => {
    if (!user) return;
    socket.connect();
    return () => socket.disconnect();
  }, [user]);

  async function login(email, password) {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
  }

  async function register(name, email, password) {
    const res = await api.post("/auth/register", { name, email, password });
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
  }

  function logout() {
    // JWTs are stateless: logging out is client-side. Drop the token and the
    // server rejects every request that no longer carries it.
    localStorage.removeItem("token");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, restoring, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
