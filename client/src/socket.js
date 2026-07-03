import { io } from "socket.io-client";

// One shared socket instance for the whole app. autoConnect is off so we
// control exactly when the connection opens (only while logged in).
// The auth callback runs on every (re)connect, so it always reads the
// current token — sockets authenticate the same way HTTP requests do.
export const socket = io(import.meta.env.VITE_SERVER_URL, {
  autoConnect: false,
  auth: (cb) => cb({ token: localStorage.getItem("token") }),
});
