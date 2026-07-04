import "dotenv/config";
import http from "http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { setupSocket } from "./socket.js";
import { setupYjs } from "./yjs.js";

// Express, Socket.io, and y-websocket all share ONE http server. Render's free
// tier exposes a single port per service, so everything that needs a
// persistent connection listens on this one port. WebSocket upgrades are
// routed by path: Socket.io claims "/socket.io/*", y-websocket claims "/yjs/*".
const server = http.createServer(app);
setupSocket(server);
setupYjs(server);

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
});
