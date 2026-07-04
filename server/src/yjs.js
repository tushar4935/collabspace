import { WebSocketServer } from "ws";
import { setupWSConnection, setPersistence } from "y-websocket/bin/utils";
import * as Y from "yjs";
import jwt from "jsonwebtoken";
import Document from "./models/Document.js";
import Membership from "./models/Membership.js";

// ---------------------------------------------------------------------------
// The collaborative editor's real-time transport. This is y-websocket, and it
// rides on the SAME http server as Express and Socket.io — Render's free tier
// gives one port per service, so everything shares it. WebSocket upgrades are
// routed by path: "/yjs/*" comes here, "/socket.io/*" stays with Socket.io.
//
// Why a whole separate system from the whiteboard's Socket.io? Because text is
// the hard case. Two people typing into the same paragraph produce inserts at
// the same position; naive "last write wins" would drop one person's
// characters. Yjs is a CRDT: it assigns every character a unique, ordered
// identity so concurrent inserts MERGE instead of overwriting. The whiteboard
// could use last-write-wins because shapes are independent objects; a
// sentence is not.
// ---------------------------------------------------------------------------

const SAVE_DEBOUNCE_MS = 2000;

// Persistence: we store the Yjs document as a single encoded update in the
// existing Document.yjsState Buffer. We chose this over y-mongodb-provider
// because the data model already has the field, it needs no second Mongo
// connection or extra collections, and it makes the "serialize on save,
// reload on open" story explicit and easy to explain.
function installPersistence() {
  setPersistence({
    provider: null,
    // Runs once when a document is first opened by anyone: load its saved
    // state into the in-memory Yjs doc, then keep saving as edits arrive.
    bindState: async (docName, ydoc) => {
      const stored = await Document.findById(docName).select("yjsState");
      if (stored?.yjsState) {
        // Apply the saved CRDT state; the editor then shows the last content.
        Y.applyUpdate(ydoc, new Uint8Array(stored.yjsState));
      }
      // Debounced save: typing fires an update per keystroke, but MongoDB only
      // needs the state every couple of seconds — the live Yjs doc in memory
      // is what other editors actually sync against.
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
    // Runs when the last editor disconnects: a final flush so nothing typed in
    // the last debounce window is lost.
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

  // noServer: we own the upgrade handshake so we can authenticate first.
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    // Only handle our path. Anything else (e.g. /socket.io/) is left for
    // Socket.io's own upgrade listener — the two coexist on one server.
    if (!url.pathname.startsWith("/yjs/")) return;

    // The document id is the "room" name; the JWT comes as a query param
    // because browsers can't set headers on a WebSocket handshake.
    const docName = url.pathname.slice("/yjs/".length);
    const token = url.searchParams.get("token");

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      // Same authorization as the REST API: the document must exist and the
      // user must be a member of its team. Without this, anyone could open a
      // socket to any document by guessing its id.
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
      // docName is passed explicitly so y-websocket uses the clean id, not the
      // raw URL (which still carries the ?token=... query string).
      setupWSConnection(ws, req, { docName, gc: true });
    });
  });

  return wss;
}
