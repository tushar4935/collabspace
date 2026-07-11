import { io } from "socket.io-client";

// one shared socket for the app; connected only while logged in.
// the auth callback runs on every (re)connect so it reads the current token.
export const socket = io(import.meta.env.VITE_SERVER_URL, {
  autoConnect: false,
  auth: (cb) => cb({ token: localStorage.getItem("token") }),
});
