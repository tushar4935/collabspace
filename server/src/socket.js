import { Server } from "socket.io";

export function setupSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_ORIGIN },
  });

  io.on("connection", (socket) => {
    console.log("user connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("user disconnected:", socket.id);
    });
  });

  return io;
}
