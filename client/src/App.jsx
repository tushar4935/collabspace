import { useEffect, useState } from "react";
import { socket } from "./socket";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [socketId, setSocketId] = useState(null);

  useEffect(() => {
    function onConnect() {
      console.log("connected to server, socket id:", socket.id);
      setConnected(true);
      setSocketId(socket.id);
    }
    function onDisconnect() {
      console.log("disconnected from server");
      setConnected(false);
      setSocketId(null);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold">CollabSpace</h1>
        <p className="text-gray-400">Phase 0 — setup check</p>
        <p>
          Socket:{" "}
          {connected ? (
            <span className="text-green-400">connected ({socketId})</span>
          ) : (
            <span className="text-red-400">disconnected</span>
          )}
        </p>
      </div>
    </div>
  );
}
