import "dotenv/config";
import http from "http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { setupSocket } from "./socket.js";

// Express and Socket.io share ONE http server. Later, y-websocket will ride on
// this same server too: Render's free tier exposes a single port per service,
// so everything that needs a persistent connection must listen on this one port.
const server = http.createServer(app);
setupSocket(server);

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
});
