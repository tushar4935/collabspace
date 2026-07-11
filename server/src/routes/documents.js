import { Router } from "express";
import Document from "../models/Document.js";
import Comment from "../models/Comment.js";
import { requireAuth } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";
import { logActivity } from "../utils/activity.js";

// mounted at /api/teams/:teamId/documents; mergeParams exposes :teamId here
const router = Router({ mergeParams: true });

router.use(requireAuth, requireMembership());

// yjsState is binary editor state — it never goes over the REST api
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

// POST — create a document (any member)
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
  await logActivity(req.params.teamId, req.userId, `created document "${doc.title}"`);
  res.status(201).json({ document: publicDocument(doc) });
});

// GET — list the team's documents
router.get("/", async (req, res) => {
  const docs = await Document.find({ teamId: req.params.teamId }).sort({
    updatedAt: -1,
  });
  res.json({ documents: docs.map(publicDocument) });
});

// GET /:documentId — matching both ids keeps docs scoped to their own team
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

// PATCH /:documentId — rename (any member)
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

// DELETE /:documentId — creator or team owner only
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
  // drop its comments too
  await Comment.deleteMany({ targetType: "document", targetId: doc._id });
  await logActivity(req.params.teamId, req.userId, `deleted document "${doc.title}"`);
  res.json({ ok: true });
});

export default router;
