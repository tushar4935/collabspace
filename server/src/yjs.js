import { WebSocketServer } from "ws";
import { setupWSConnection, setPersistence } from "y-websocket/bin/utils";
import * as Y from "yjs";
import jwt from "jsonwebtoken";
import Document from "./models/Document.js";
import Membership from "./models/Membership.js";

const SAVE_DEBOUNCE_MS = 2000;

// Yjs doc state is stored as one encoded update in Document.yjsState.
function installPersistence() {
  setPersistence({
    provider: null,
    // called when a doc is first opened: load saved state, then debounce
    // writes back to mongo as edits come in
    bindState: async (docName, ydoc) => {
      const stored = await Document.findById(docName).select("yjsState");
      if (stored?.yjsState) {
        Y.applyUpdate(ydoc, new Uint8Array(stored.yjsState));
      }
      let timer = null;
      ydoc.on("update", () => {
        if (timer) return;
        timer = setTimeout(async () => {
          timer = null;
          try {
            const state = Y.encodeStateAsUpdate(ydoc);
            await Document.updateOne(
              { _id: docName },
              { yjsState: Buffer.from(state) }
            );
          } catch (err) {
            console.error("yjs persist failed:", err.message);
          }
        }, SAVE_DEBOUNCE_MS);
      });
    },
    // final flush when the last editor disconnects
    writeState: async (docName, ydoc) => {
      try {
        const state = Y.encodeStateAsUpdate(ydoc);
        await Document.updateOne(
          { _id: docName },
          { yjsState: Buffer.from(state) }
        );
      } catch (err) {
        console.error("yjs final save failed:", err.message);
      }
    },
  });
}

function reject(socket, code, message) {
  socket.write(`HTTP/1.1 ${code} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export function setupYjs(httpServer) {
  installPersistence();

  // noServer: handle the upgrade ourselves so we can auth first
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    // other paths (/socket.io) have their own upgrade handlers
    if (!url.pathname.startsWith("/yjs/")) return;

    // token rides as a query param since ws handshakes can't set headers
    const docName = url.pathname.slice("/yjs/".length);
    const token = url.searchParams.get("token");

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const doc = await Document.findById(docName).select("teamId");
      if (!doc) return reject(socket, 404, "Not Found");
      const membership = await Membership.findOne({
        userId: payload.userId,
        teamId: doc.teamId,
      });
      if (!membership) return reject(socket, 403, "Forbidden");
    } catch {
      return reject(socket, 401, "Unauthorized");
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      // pass docName explicitly so the ?token query isn't part of the room name
      setupWSConnection(ws, req, { docName, gc: true });
    });
  });

  return wss;
}
