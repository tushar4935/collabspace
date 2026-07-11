import { Router } from "express";
import Whiteboard from "../models/Whiteboard.js";
import Comment from "../models/Comment.js";
import { requireAuth } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";
import { logActivity } from "../utils/activity.js";

// mounted at /api/teams/:teamId/whiteboards
const router = Router({ mergeParams: true });

router.use(requireAuth, requireMembership());

// list responses skip `elements` — the full array only travels for one board
function boardSummary(board) {
  return {
    id: board._id,
    title: board.title,
    teamId: board.teamId,
    createdBy: board.createdBy,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
}

// POST — create a board (any member)
router.post("/", async (req, res) => {
  const { title } = req.body;
  if (!title?.trim()) {
    return res.status(400).json({ message: "Whiteboard title is required" });
  }
  const board = await Whiteboard.create({
    title: title.trim(),
    teamId: req.params.teamId,
    createdBy: req.userId,
  });
  await logActivity(req.params.teamId, req.userId, `created whiteboard "${board.title}"`);
  res.status(201).json({ whiteboard: boardSummary(board) });
});

// GET — list the team's boards (no elements)
router.get("/", async (req, res) => {
  const boards = await Whiteboard.find({ teamId: req.params.teamId })
    .select("-elements")
    .sort({ updatedAt: -1 });
  res.json({ whiteboards: boards.map(boardSummary) });
});

// GET /:whiteboardId — one board with elements, scoped to its own team
router.get("/:whiteboardId", async (req, res) => {
  const board = await Whiteboard.findOne({
    _id: req.params.whiteboardId,
    teamId: req.params.teamId,
  });
  if (!board) {
    return res.status(404).json({ message: "Whiteboard not found" });
  }
  res.json({ whiteboard: { ...boardSummary(board), elements: board.elements } });
});

// PATCH /:whiteboardId — rename and/or save the canvas (any member)
router.patch("/:whiteboardId", async (req, res) => {
  const { title, elements } = req.body;
  const update = {};
  if (title !== undefined) {
    if (!title?.trim()) {
      return res.status(400).json({ message: "Whiteboard title is required" });
    }
    update.title = title.trim();
  }
  if (elements !== undefined) {
    if (!Array.isArray(elements)) {
      return res.status(400).json({ message: "elements must be an array" });
    }
    update.elements = elements;
  }
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ message: "Nothing to update" });
  }
  const board = await Whiteboard.findOneAndUpdate(
    { _id: req.params.whiteboardId, teamId: req.params.teamId },
    update,
    { new: true }
  );
  if (!board) {
    return res.status(404).json({ message: "Whiteboard not found" });
  }
  res.json({ whiteboard: boardSummary(board) });
});

// DELETE /:whiteboardId — creator or team owner only
router.delete("/:whiteboardId", async (req, res) => {
  const board = await Whiteboard.findOne({
    _id: req.params.whiteboardId,
    teamId: req.params.teamId,
  });
  if (!board) {
    return res.status(404).json({ message: "Whiteboard not found" });
  }
  const isCreator = board.createdBy.equals(req.userId);
  const isOwner = req.membership.role === "owner";
  if (!isCreator && !isOwner) {
    return res.status(403).json({
      message: "Only the whiteboard's creator or the team owner can delete it",
    });
  }
  await board.deleteOne();
  // drop its comments too
  await Comment.deleteMany({ targetType: "whiteboard", targetId: board._id });
  await logActivity(req.params.teamId, req.userId, `deleted whiteboard "${board.title}"`);
  res.json({ ok: true });
});

export default router;
