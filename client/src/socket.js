import { io } from "socket.io-client";

// One shared socket instance for the whole app. autoConnect is off so we
// control exactly when the connection opens (later: only after login).
export const socket = io(import.meta.env.VITE_SERVER_URL, {
  autoConnect: false,
});
