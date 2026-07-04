import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "./models/User.js";
import Membership from "./models/Membership.js";
import Whiteboard from "./models/Whiteboard.js";

// ---------------------------------------------------------------------------
// Live whiteboard state, kept in server memory while a board has users.
//
// Why in memory: the board someone joins must reflect UNSAVED strokes made
// seconds ago by others. Reading MongoDB on every event would be slow and
// racy; instead the server holds the authoritative copy and MongoDB is the
// durable snapshot behind it.
//
// elements is a Map keyed by shape id — that is the whole conflict strategy.
// Two users acting at once either touch DIFFERENT ids (both survive — nothing
// is lost) or the SAME id (the later event wins). Last-write-wins per shape
// is enough for drawings because shapes are independent objects; text is the
// thing that needs a CRDT, and that's Yjs in the editor phase, not here.
// ---------------------------------------------------------------------------
const liveBoards = new Map(); // boardId -> { elements: Map, users: Map, saveTimer, dirty }

const SAVE_DEBOUNCE_MS = 3000;

async function getLiveBoard(boardId) {
  let live = liveBoards.get(boardId);
  if (!live) {
    const board = await Whiteboard.findById(boardId);
    if (!board) return null;
    live = {
      teamId: board.teamId,
      elements: new Map(board.elements.map((el) => [el.id, el])),
      users: new Map(), // socketId -> { userId, name }
      saveTimer: null,
      dirty: false,
    };
    liveBoards.set(boardId, live);
  }
  return live;
}

async function persistBoard(boardId) {
  const live = liveBoards.get(boardId);
  if (!live || !live.dirty) return;
  live.dirty = false;
  await Whiteboard.updateOne(
    { _id: boardId },
    { elements: [...live.elements.values()] }
  );
}

// Persistence is debounced instead of per-event: a pen drawing session fires
// hundreds of events, and MongoDB only needs the state every few seconds —
// the in-memory copy is what live users actually read.
function scheduleSave(boardId) {
  const live = liveBoards.get(boardId);
  if (!live) return;
  live.dirty = true;
  if (live.saveTimer) return;
  live.saveTimer = setTimeout(async () => {
    live.saveTimer = null;
    try {
      await persistBoard(boardId);
    } catch (err) {
      console.error("board save failed:", err.message);
      live.dirty = true; // try again on the next event or on room-empty
    }
  }, SAVE_DEBOUNCE_MS);
}

export function setupSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_ORIGIN },
    // We share this http server with y-websocket (see yjs.js). By default
    // Socket.io destroys any upgrade whose path isn't "/socket.io/" — which
    // would kill the "/yjs/" handshakes. Turn that off so the two coexist;
    // each side's upgrade handler simply ignores paths that aren't its own.
    destroyUpgrade: false,
  });

  // Sockets authenticate exactly like HTTP requests do: the client sends its
  // JWT in the handshake, and an invalid token never gets a connection at
  // all. Without this, anyone could open a socket and join any board room.
  io.use(async (socket, next) => {
    try {
      const payload = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET);
      const user = await User.findById(payload.userId);
      if (!user) return next(new Error("Not authenticated"));
      socket.data.userId = user._id;
      socket.data.name = user.name;
      next();
    } catch {
      next(new Error("Not authenticated"));
    }
  });

  io.on("connection", (socket) => {
    console.log("user connected:", socket.id, socket.data.name);

    const roomOf = (boardId) => `board:${boardId}`;

    async function leaveBoard() {
      const boardId = socket.data.boardId;
      if (!boardId) return;
      socket.data.boardId = null;
      socket.leave(roomOf(boardId));
      const live = liveBoards.get(boardId);
      if (!live) return;
      live.users.delete(socket.id);
      socket.to(roomOf(boardId)).emit("user-left", { socketId: socket.id });
      if (live.users.size === 0) {
        // Last one out: flush to MongoDB and drop the in-memory copy, so an
        // idle server holds no board state and a later join reloads fresh.
        if (live.saveTimer) clearTimeout(live.saveTimer);
        try {
          await persistBoard(boardId);
        } catch (err) {
          console.error("final board save failed:", err.message);
          return; // keep the live copy so the strokes aren't lost
        }
        liveBoards.delete(boardId);
      }
    }

    // The ack callback carries the ONE snapshot a late joiner gets. Replaying
    // the event history instead would mean storing every event forever and
    // re-running erases/clears on join — the current state is all that
    // matters, and the snapshot IS the current state.
    socket.on("join-board", async ({ boardId }, ack) => {
      try {
        const live = await getLiveBoard(boardId);
        // Board membership is checked HERE, once, at join — every later
        // event only needs the cheap "did you join this room?" check below.
        const membership = live
          ? await Membership.findOne({
              userId: socket.data.userId,
              teamId: live.teamId,
            })
          : null;
        if (!membership) {
          return ack?.({ ok: false, message: "You do not have access to this board" });
        }
        await leaveBoard(); // a socket views one board at a time
        socket.data.boardId = boardId;
        socket.join(roomOf(boardId));
        const user = { socketId: socket.id, userId: socket.data.userId, name: socket.data.name };
        live.users.set(socket.id, { userId: socket.data.userId, name: socket.data.name });
        socket.to(roomOf(boardId)).emit("user-joined", user);
        ack?.({
          ok: true,
          elements: [...live.elements.values()],
          users: [...live.users.entries()].map(([socketId, u]) => ({
            socketId,
            userId: u.userId,
            name: u.name,
          })),
        });
      } catch (err) {
        console.error("join-board failed:", err.message);
        ack?.({ ok: false, message: "Could not join the board" });
      }
    });

    socket.on("leave-board", leaveBoard);

    // Events below trust the join-time membership check: if this socket is
    // not in the board it claims to draw on, the event is dropped.
    function liveBoardFor(boardId) {
      if (socket.data.boardId !== boardId) return null;
      return liveBoards.get(boardId) ?? null;
    }

    // Upsert by shape id = last write wins for that shape.
    socket.on("draw", ({ boardId, element }) => {
      const live = liveBoardFor(boardId);
      if (!live || !element?.id) return;
      live.elements.set(element.id, element);
      scheduleSave(boardId);
      socket.to(roomOf(boardId)).emit("draw", { element });
    });

    socket.on("delete", ({ boardId, elementId }) => {
      const live = liveBoardFor(boardId);
      if (!live) return;
      live.elements.delete(elementId);
      scheduleSave(boardId);
      socket.to(roomOf(boardId)).emit("delete", { elementId });
    });

    socket.on("clear", ({ boardId }) => {
      const live = liveBoardFor(boardId);
      if (!live) return;
      live.elements.clear();
      scheduleSave(boardId);
      socket.to(roomOf(boardId)).emit("clear");
    });

    // volatile: a dropped cursor position is instantly replaced by the next
    // one, so it's never worth buffering or retransmitting.
    socket.on("cursor-move", ({ boardId, x, y }) => {
      if (socket.data.boardId !== boardId) return;
      socket.to(roomOf(boardId)).volatile.emit("cursor-move", {
        socketId: socket.id,
        name: socket.data.name,
        x,
        y,
      });
    });

    socket.on("disconnect", () => {
      console.log("user disconnected:", socket.id);
      leaveBoard();
    });
  });

  return io;
}
