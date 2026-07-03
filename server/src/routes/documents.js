import { Router } from "express";
import Document from "../models/Document.js";
import { requireAuth } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";

// Mounted at /api/teams/:teamId/documents. mergeParams lets this router (and
// the membership middleware) read :teamId from the mount path.
const router = Router({ mergeParams: true });

// Every document route requires a logged-in member of the team in the URL.
router.use(requireAuth, requireMembership());

// What the client sees. yjsState is binary editor state — never sent over
// the REST API (the editor will sync it over its own WebSocket later).
function publicDocument(doc) {
  return {
    id: doc._id,
    title: doc.title,
    teamId: doc.teamId,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// POST /api/teams/:teamId/documents — any member can create a document.
router.post("/", async (req, res) => {
  const { title } = req.body;
  if (!title?.trim()) {
    return res.status(400).json({ message: "Document title is required" });
  }
  const doc = await Document.create({
    title: title.trim(),
    teamId: req.params.teamId,
    createdBy: req.userId,
  });
  res.status(201).json({ document: publicDocument(doc) });
});

// GET /api/teams/:teamId/documents — list the team's documents.
router.get("/", async (req, res) => {
  const docs = await Document.find({ teamId: req.params.teamId }).sort({
    updatedAt: -1,
  });
  res.json({ documents: docs.map(publicDocument) });
});

// GET /api/teams/:teamId/documents/:documentId — one document.
// Querying by BOTH ids means a document can only be reached through its own
// team — you can't read another team's document by guessing its id.
router.get("/:documentId", async (req, res) => {
  const doc = await Document.findOne({
    _id: req.params.documentId,
    teamId: req.params.teamId,
  });
  if (!doc) {
    return res.status(404).json({ message: "Document not found" });
  }
  res.json({ document: publicDocument(doc) });
});

// PATCH /api/teams/:teamId/documents/:documentId — rename (any member).
// Renaming is ordinary collaboration; only deletion is restricted.
router.patch("/:documentId", async (req, res) => {
  const { title } = req.body;
  if (!title?.trim()) {
    return res.status(400).json({ message: "Document title is required" });
  }
  const doc = await Document.findOneAndUpdate(
    { _id: req.params.documentId, teamId: req.params.teamId },
    { title: title.trim() },
    { new: true }
  );
  if (!doc) {
    return res.status(404).json({ message: "Document not found" });
  }
  res.json({ document: publicDocument(doc) });
});

// DELETE /api/teams/:teamId/documents/:documentId — creator or team owner.
router.delete("/:documentId", async (req, res) => {
  const doc = await Document.findOne({
    _id: req.params.documentId,
    teamId: req.params.teamId,
  });
  if (!doc) {
    return res.status(404).json({ message: "Document not found" });
  }
  const isCreator = doc.createdBy.equals(req.userId);
  const isOwner = req.membership.role === "owner";
  if (!isCreator && !isOwner) {
    return res
      .status(403)
      .json({ message: "Only the document's creator or the team owner can delete it" });
  }
  await doc.deleteOne();
  res.json({ ok: true });
});

export default router;
