import axios from "axios";

export const api = axios.create({
  baseURL: `${import.meta.env.VITE_SERVER_URL}/api`,
});

// Attach the JWT to every request. Reading localStorage here (not once at
// startup) means login/logout take effect immediately without a reload.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
