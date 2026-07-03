import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Circle, Layer, Line, Rect, Stage, Text } from "react-konva";
import { api } from "../api";
import CommentsSection from "../components/CommentsSection";
import Navbar from "../components/Navbar";
import { socket } from "../socket";

// The canvas has a FIXED logical size instead of stretching to the window:
// every user must agree on what (x, y) means for shared drawing to work.
const BOARD_WIDTH = 1000;
const BOARD_HEIGHT = 600;

const TOOLS = ["pen", "rect", "circle", "eraser"];

// Cursor positions update up to ~20×/second; sending every mousemove
// (hundreds/second) would flood the connection for no visible gain.
const CURSOR_THROTTLE_MS = 50;

// Deterministic color per socket id, so every client shows the same person
// in the same color without any coordination.
const CURSOR_COLORS = ["#f87171", "#fbbf24", "#34d399", "#60a5fa", "#c084fc", "#f472b6"];
function colorFor(socketId) {
  let hash = 0;
  for (const ch of socketId) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

export default function WhiteboardPage() {
  const { teamId, whiteboardId } = useParams();
  const [board, setBoard] = useState(null);
  const [elements, setElements] = useState([]);
  const [tool, setTool] = useState("pen");
  const [error, setError] = useState("");
  const [presence, setPresence] = useState([]); // [{ socketId, name }]
  const [cursors, setCursors] = useState({}); // socketId -> { x, y, name }
  // The in-progress shape lives in a ref, not state: a pen stroke updates on
  // every mousemove and we only need to re-render the layer, not the page.
  const drawingRef = useRef(null);
  const lastCursorSentRef = useRef(0);
  const [, forceRender] = useState(0);

  useEffect(() => {
    api
      .get(`/teams/${teamId}/whiteboards/${whiteboardId}`)
      .then((res) => setBoard(res.data.whiteboard))
      .catch((err) =>
        setError(err.response?.data?.message || "Could not load this whiteboard")
      );
  }, [teamId, whiteboardId]);

  // Real-time wiring: join the board's room, take the one-time snapshot from
  // the ack, then apply live events as they arrive.
  useEffect(() => {
    function join() {
      socket.emit("join-board", { boardId: whiteboardId }, (res) => {
        if (!res.ok) {
          setError(res.message);
          return;
        }
        setElements(res.elements);
        setPresence(res.users);
        setCursors({});
      });
    }

    // Upsert by id mirrors the server's last-write-wins rule.
    function onDraw({ element }) {
      setElements((prev) => {
        const idx = prev.findIndex((el) => el.id === element.id);
        if (idx === -1) return [...prev, element];
        const next = [...prev];
        next[idx] = element;
        return next;
      });
    }
    function onDelete({ elementId }) {
      setElements((prev) => prev.filter((el) => el.id !== elementId));
    }
    function onClear() {
      setElements([]);
    }
    function onUserJoined(user) {
      setPresence((prev) =>
        prev.some((u) => u.socketId === user.socketId) ? prev : [...prev, user]
      );
    }
    function onUserLeft({ socketId }) {
      setPresence((prev) => prev.filter((u) => u.socketId !== socketId));
      setCursors((prev) => {
        const { [socketId]: _gone, ...rest } = prev;
        return rest;
      });
    }
    function onCursorMove({ socketId, name, x, y }) {
      setCursors((prev) => ({ ...prev, [socketId]: { x, y, name } }));
    }

    if (socket.connected) join();
    // Re-join after any (re)connect — the server forgot us while we were gone.
    socket.on("connect", join);
    socket.on("draw", onDraw);
    socket.on("delete", onDelete);
    socket.on("clear", onClear);
    socket.on("user-joined", onUserJoined);
    socket.on("user-left", onUserLeft);
    socket.on("cursor-move", onCursorMove);

    return () => {
      socket.emit("leave-board");
      socket.off("connect", join);
      socket.off("draw", onDraw);
      socket.off("delete", onDelete);
      socket.off("clear", onClear);
      socket.off("user-joined", onUserJoined);
      socket.off("user-left", onUserLeft);
      socket.off("cursor-move", onCursorMove);
    };
  }, [whiteboardId]);

  function commitElement(element) {
    setElements((prev) => [...prev, element]);
    socket.emit("draw", { boardId: whiteboardId, element });
  }

  function handleMouseDown(e) {
    const pos = e.target.getStage().getPointerPosition();
    if (tool === "eraser") {
      // The eraser removes WHOLE shapes by id (no pixel erasing): each shape
      // is one unit with one id, which is what last-write-wins needs.
      if (e.target !== e.target.getStage()) {
        const id = e.target.attrs.shapeId;
        if (id) {
          setElements((prev) => prev.filter((el) => el.id !== id));
          socket.emit("delete", { boardId: whiteboardId, elementId: id });
        }
      }
      return;
    }
    // Every shape gets a unique id at creation time (see eraser note above).
    const id = crypto.randomUUID();
    if (tool === "pen") {
      drawingRef.current = { id, type: "pen", points: [pos.x, pos.y] };
    } else if (tool === "rect") {
      drawingRef.current = { id, type: "rect", x: pos.x, y: pos.y, width: 0, height: 0 };
    } else if (tool === "circle") {
      drawingRef.current = { id, type: "circle", x: pos.x, y: pos.y, radius: 0 };
    }
    forceRender((n) => n + 1);
  }

  function handleMouseMove(e) {
    const pos = e.target.getStage().getPointerPosition();

    // Share the cursor position whether or not we're drawing (throttled).
    const now = Date.now();
    if (pos && now - lastCursorSentRef.current >= CURSOR_THROTTLE_MS) {
      lastCursorSentRef.current = now;
      socket.emit("cursor-move", { boardId: whiteboardId, x: pos.x, y: pos.y });
    }

    const shape = drawingRef.current;
    if (!shape || !pos) return;
    if (shape.type === "pen") {
      shape.points.push(pos.x, pos.y);
    } else if (shape.type === "rect") {
      shape.width = pos.x - shape.x;
      shape.height = pos.y - shape.y;
    } else if (shape.type === "circle") {
      shape.radius = Math.hypot(pos.x - shape.x, pos.y - shape.y);
    }
    forceRender((n) => n + 1);
  }

  function handleMouseUp() {
    const shape = drawingRef.current;
    if (!shape) return;
    drawingRef.current = null;
    // Discard accidental clicks that never became a visible shape.
    const isVisible =
      (shape.type === "pen" && shape.points.length > 2) ||
      (shape.type === "rect" && shape.width !== 0 && shape.height !== 0) ||
      (shape.type === "circle" && shape.radius > 1);
    if (isVisible) {
      // Finished shapes are broadcast on mouse-up, not per mousemove — one
      // event per shape keeps the wire quiet, and the live cursor already
      // shows others that someone is drawing.
      commitElement(shape);
    } else {
      forceRender((n) => n + 1);
    }
  }

  function handleClear() {
    if (!window.confirm("Clear the whole board for everyone?")) return;
    setElements([]);
    socket.emit("clear", { boardId: whiteboardId });
  }

  function renderShape(shape) {
    // shapeId (not Konva's reserved `id`) so the eraser can read it back
    // off the clicked Konva node via e.target.attrs.shapeId.
    const common = { shapeId: shape.id, stroke: "#e5e7eb", strokeWidth: 2 };
    if (shape.type === "pen") {
      return (
        <Line
          key={shape.id}
          {...common}
          points={shape.points}
          lineCap="round"
          lineJoin="round"
          // Widen the clickable area so the eraser can hit thin strokes.
          hitStrokeWidth={12}
        />
      );
    }
    if (shape.type === "rect") {
      return (
        <Rect
          key={shape.id}
          {...common}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
        />
      );
    }
    if (shape.type === "circle") {
      return (
        <Circle key={shape.id} {...common} x={shape.x} y={shape.y} radius={shape.radius} />
      );
    }
    return null;
  }

  const others = presence.filter((u) => u.socketId !== socket.id);

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Link
              to={`/teams/${teamId}`}
              className="text-indigo-400 text-sm hover:underline"
            >
              ← Back to team
            </Link>
            <h1 className="text-xl font-bold text-white mt-1">
              {board ? board.title : "Loading…"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-green-400">● Live — changes save automatically</span>
            {others.map((u) => (
              <span
                key={u.socketId}
                className="text-xs px-2 py-0.5 rounded-full text-gray-900 font-medium"
                style={{ backgroundColor: colorFor(u.socketId) }}
                title={u.name}
              >
                {u.name}
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          {TOOLS.map((t) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className={`px-3 py-1.5 rounded text-sm capitalize ${
                tool === t
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {t}
            </button>
          ))}
          <button
            onClick={handleClear}
            className="px-3 py-1.5 rounded text-sm bg-gray-800 text-red-300 hover:bg-gray-700 ml-auto"
          >
            Clear board
          </button>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="overflow-auto rounded-lg border border-gray-800">
          <Stage
            width={BOARD_WIDTH}
            height={BOARD_HEIGHT}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="bg-gray-900"
            style={{ cursor: tool === "eraser" ? "pointer" : "crosshair" }}
          >
            <Layer>
              {elements.map(renderShape)}
              {drawingRef.current && renderShape(drawingRef.current)}
            </Layer>
            {/* Other users' cursors sit on their own layer, above the art
                and outside its hit-testing (listening=false). */}
            <Layer listening={false}>
              {Object.entries(cursors).map(([socketId, c]) => (
                <Circle key={socketId} x={c.x} y={c.y} radius={4} fill={colorFor(socketId)} />
              ))}
              {Object.entries(cursors).map(([socketId, c]) => (
                <Text
                  key={`${socketId}-label`}
                  x={c.x + 8}
                  y={c.y - 4}
                  text={c.name}
                  fontSize={11}
                  fill={colorFor(socketId)}
                />
              ))}
            </Layer>
          </Stage>
        </div>

        <CommentsSection
          teamId={teamId}
          targetType="whiteboard"
          targetId={whiteboardId}
        />
      </main>
    </div>
  );
}
