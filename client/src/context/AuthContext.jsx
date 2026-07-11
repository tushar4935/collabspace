import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api";
import { socket } from "../socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // true while restoring a session from a stored token on page load
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

  // socket stays connected only while logged in
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
