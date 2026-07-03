import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Circle, Layer, Line, Rect, Stage } from "react-konva";
import { api } from "../api";
import Navbar from "../components/Navbar";

// The canvas has a FIXED logical size instead of stretching to the window.
// Coordinates saved by one user must mean the same thing on every other
// user's screen — critical once the board is real-time in Phase 5.
const BOARD_WIDTH = 1000;
const BOARD_HEIGHT = 600;

const TOOLS = ["pen", "rect", "circle", "eraser"];

export default function WhiteboardPage() {
  const { teamId, whiteboardId } = useParams();
  const [board, setBoard] = useState(null);
  const [elements, setElements] = useState([]);
  const [tool, setTool] = useState("pen");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // The in-progress shape lives in a ref, not state: a pen stroke updates on
  // every mousemove and we only need to re-render the layer, not the page.
  const drawingRef = useRef(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    api
      .get(`/teams/${teamId}/whiteboards/${whiteboardId}`)
      .then((res) => {
        setBoard(res.data.whiteboard);
        setElements(res.data.whiteboard.elements);
      })
      .catch((err) =>
        setError(err.response?.data?.message || "Could not load this whiteboard")
      );
  }, [teamId, whiteboardId]);

  function handleMouseDown(e) {
    const pos = e.target.getStage().getPointerPosition();
    if (tool === "eraser") {
      // The eraser removes WHOLE shapes by id (no pixel erasing): each shape
      // is one unit with one id, which is what last-write-wins needs later.
      if (e.target !== e.target.getStage()) {
        const id = e.target.attrs.shapeId;
        if (id) {
          setElements((prev) => prev.filter((el) => el.id !== id));
          setDirty(true);
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
    const shape = drawingRef.current;
    if (!shape) return;
    const pos = e.target.getStage().getPointerPosition();
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
      setElements((prev) => [...prev, shape]);
      setDirty(true);
    } else {
      forceRender((n) => n + 1);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await api.patch(`/teams/${teamId}/whiteboards/${whiteboardId}`, { elements });
      setDirty(false);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save the whiteboard");
    } finally {
      setSaving(false);
    }
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
            {dirty && <span className="text-xs text-yellow-400">Unsaved changes</span>}
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded px-4 py-2 text-sm font-medium"
            >
              {saving ? "Saving…" : "Save"}
            </button>
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
          </Stage>
        </div>
      </main>
    </div>
  );
}
