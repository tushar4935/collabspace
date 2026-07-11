import axios from "axios";

export const api = axios.create({
  baseURL: `${import.meta.env.VITE_SERVER_URL}/api`,
});

// attach the jwt to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
