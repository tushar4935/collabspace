import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "./models/User.js";
import Membership from "./models/Membership.js";
import Whiteboard from "./models/Whiteboard.js";

// live board state while a board has users; mongo holds the saved snapshot
const liveBoards = new Map(); // boardId -> { elements: Map, users: Map, saveTimer, dirty }

const SAVE_DEBOUNCE_MS = 3000;

let ioRef = null;

// push an event to every open tab/device of one user
export function emitToUser(userId, event, payload) {
  if (!ioRef) return;
  ioRef.to(`user:${userId}`).emit(event, payload);
}

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

// debounced: drawing fires lots of events, no need to hit mongo on each one
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
      live.dirty = true; // retry on next event or on room-empty
    }
  }, SAVE_DEBOUNCE_MS);
}

export function setupSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_ORIGIN },
    // /yjs shares this http server — don't destroy its upgrade requests
    destroyUpgrade: false,
  });

  // jwt auth on the handshake
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

  ioRef = io;

  io.on("connection", (socket) => {
    console.log("user connected:", socket.id, socket.data.name);

    // personal room for notifications
    socket.join(`user:${socket.data.userId}`);

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
        // last user out: flush and drop the in-memory copy
        if (live.saveTimer) clearTimeout(live.saveTimer);
        try {
          await persistBoard(boardId);
        } catch (err) {
          console.error("final board save failed:", err.message);
          return; // keep it in memory so nothing is lost
        }
        liveBoards.delete(boardId);
      }
    }

    // membership is checked once here; later events only check the room
    socket.on("join-board", async ({ boardId }, ack) => {
      try {
        const live = await getLiveBoard(boardId);
        const membership = live
          ? await Membership.findOne({
              userId: socket.data.userId,
              teamId: live.teamId,
            })
          : null;
        if (!membership) {
          return ack?.({ ok: false, message: "You do not have access to this board" });
        }
        await leaveBoard(); // one board per socket
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

    function liveBoardFor(boardId) {
      if (socket.data.boardId !== boardId) return null;
      return liveBoards.get(boardId) ?? null;
    }

    // upsert by shape id — last write wins per shape
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

    // volatile: a stale cursor position isn't worth retransmitting
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
