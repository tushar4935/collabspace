import { Router } from "express";
import Whiteboard from "../models/Whiteboard.js";
import { requireAuth } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";

// Mounted at /api/teams/:teamId/whiteboards — same shape as documents.js.
const router = Router({ mergeParams: true });

router.use(requireAuth, requireMembership());

// List items skip `elements` (boards can hold hundreds of shapes); the full
// element array only travels when a single board is opened or saved.
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

// POST /api/teams/:teamId/whiteboards — any member can create a board.
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
  res.status(201).json({ whiteboard: boardSummary(board) });
});

// GET /api/teams/:teamId/whiteboards — list the team's boards (no elements).
router.get("/", async (req, res) => {
  const boards = await Whiteboard.find({ teamId: req.params.teamId })
    .select("-elements")
    .sort({ updatedAt: -1 });
  res.json({ whiteboards: boards.map(boardSummary) });
});

// GET /api/teams/:teamId/whiteboards/:whiteboardId — one board WITH elements.
// Matching on both ids keeps boards reachable only through their own team.
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

// PATCH /api/teams/:teamId/whiteboards/:whiteboardId — rename and/or save
// the canvas. Any member: drawing together is the point of the board.
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

// DELETE /api/teams/:teamId/whiteboards/:whiteboardId — creator or team owner.
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
  res.json({ ok: true });
});

export default router;
