import { Router } from "express";
import Document from "../models/Document.js";
import DocumentVersion from "../models/DocumentVersion.js";
import { requireAuth } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";
import { logActivity } from "../utils/activity.js";

// Mounted at /api/teams/:teamId/documents/:documentId/versions.
const router = Router({ mergeParams: true });

router.use(requireAuth, requireMembership());

// Every version route is scoped to a document that must belong to the team in
// the URL — the same (id, teamId) guard used everywhere else.
router.use(async (req, res, next) => {
  const doc = await Document.findOne({
    _id: req.params.documentId,
    teamId: req.params.teamId,
  }).select("title");
  if (!doc) {
    return res.status(404).json({ message: "Document not found" });
  }
  req.document = doc;
  next();
});

function versionSummary(v) {
  return {
    id: v._id,
    label: v.label,
    createdBy: v.createdBy?.name
      ? { id: v.createdBy._id, name: v.createdBy.name }
      : { id: v.createdBy, name: "Removed user" },
    createdAt: v.createdAt,
  };
}

// POST — save a snapshot. The client sends the current editor content as
// ProseMirror JSON. Any member can save a version (it's part of editing).
// This same endpoint is what "snapshot before restore" calls first.
router.post("/", async (req, res) => {
  const { label, content } = req.body;
  if (typeof content !== "object" || content === null) {
    return res.status(400).json({ message: "Version content is required" });
  }
  const version = await DocumentVersion.create({
    documentId: req.params.documentId,
    label: typeof label === "string" ? label.trim() : "",
    content,
    createdBy: req.userId,
  });
  await version.populate("createdBy", "name");
  await logActivity(
    req.params.teamId,
    req.userId,
    `saved a version of document "${req.document.title}"`
  );
  res.status(201).json({ version: versionSummary(version) });
});

// GET — list versions (metadata only; snapshots can be large).
router.get("/", async (req, res) => {
  const versions = await DocumentVersion.find({
    documentId: req.params.documentId,
  })
    .sort({ createdAt: -1 })
    .populate("createdBy", "name");
  res.json({ versions: versions.map(versionSummary) });
});

// GET /:versionId — one version WITH its content, for preview/restore.
router.get("/:versionId", async (req, res) => {
  const version = await DocumentVersion.findOne({
    _id: req.params.versionId,
    documentId: req.params.documentId,
  }).populate("createdBy", "name");
  if (!version) {
    return res.status(404).json({ message: "Version not found" });
  }
  res.json({
    version: { ...versionSummary(version), content: version.content },
  });
});

export default router;
