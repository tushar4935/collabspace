import "dotenv/config";
import http from "http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { setupSocket } from "./socket.js";
import { setupYjs } from "./yjs.js";

// express, socket.io and y-websocket share one http server (single port);
// websocket upgrades are routed by path (/socket.io vs /yjs)
const server = http.createServer(app);
setupSocket(server);
setupYjs(server);

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
});
