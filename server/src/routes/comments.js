import { Router } from "express";
import Comment from "../models/Comment.js";
import Document from "../models/Document.js";
import Whiteboard from "../models/Whiteboard.js";
import Membership from "../models/Membership.js";
import { requireAuth } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";
import { logActivity } from "../utils/activity.js";

// Mounted at /api/teams/:teamId/comments.
const router = Router({ mergeParams: true });

router.use(requireAuth, requireMembership());

// A comment target must belong to the team in the URL — this is the same
// (id, teamId) scoping rule the document/whiteboard routes use.
async function loadTarget(teamId, targetType, targetId) {
  const Model = targetType === "document" ? Document : Whiteboard;
  return Model.findOne({ _id: targetId, teamId });
}

function publicComment(comment) {
  return {
    id: comment._id,
    content: comment.content,
    author: comment.authorId?.name
      ? { id: comment.authorId._id, name: comment.authorId.name }
      : { id: comment.authorId, name: "Removed user" },
    targetType: comment.targetType,
    targetId: comment.targetId,
    parentId: comment.parentId,
    mentions: comment.mentions,
    createdAt: comment.createdAt,
  };
}

// POST /api/teams/:teamId/comments — comment on a document or whiteboard.
router.post("/", async (req, res) => {
  const { content, targetType, targetId, parentId, mentions } = req.body;
  if (!content?.trim()) {
    return res.status(400).json({ message: "Comment text is required" });
  }
  if (!["document", "whiteboard"].includes(targetType)) {
    return res.status(400).json({ message: "targetType must be document or whiteboard" });
  }
  const target = await loadTarget(req.params.teamId, targetType, targetId);
  if (!target) {
    return res.status(404).json({ message: "Comment target not found in this team" });
  }

  // Replies stay one level deep: replying to a reply attaches to that
  // reply's top-level parent, so threads can't nest indefinitely.
  let resolvedParentId = null;
  if (parentId) {
    const parent = await Comment.findOne({ _id: parentId, targetType, targetId });
    if (!parent) {
      return res.status(404).json({ message: "Parent comment not found" });
    }
    resolvedParentId = parent.parentId ?? parent._id;
  }

  // Keep only mentions that are actually members of this team — the client
  // sends ids, but the server decides what counts.
  let validMentions = [];
  if (Array.isArray(mentions) && mentions.length > 0) {
    const memberships = await Membership.find({
      teamId: req.params.teamId,
      userId: { $in: mentions },
    });
    validMentions = memberships.map((m) => m.userId);
  }

  const comment = await Comment.create({
    content: content.trim(),
    authorId: req.userId,
    targetType,
    targetId,
    parentId: resolvedParentId,
    mentions: validMentions,
  });
  await comment.populate("authorId", "name");
  await logActivity(
    req.params.teamId,
    req.userId,
    `commented on ${targetType} "${target.title}"`
  );
  res.status(201).json({ comment: publicComment(comment) });
});

// GET /api/teams/:teamId/comments?targetType=...&targetId=... — all comments
// on one target, oldest first (the client groups replies under parents).
router.get("/", async (req, res) => {
  const { targetType, targetId } = req.query;
  if (!["document", "whiteboard"].includes(targetType)) {
    return res.status(400).json({ message: "targetType must be document or whiteboard" });
  }
  const target = await loadTarget(req.params.teamId, targetType, targetId);
  if (!target) {
    return res.status(404).json({ message: "Comment target not found in this team" });
  }
  const comments = await Comment.find({ targetType, targetId })
    .sort({ createdAt: 1 })
    .populate("authorId", "name");
  res.json({ comments: comments.map(publicComment), yourRole: req.membership.role });
});

// DELETE /api/teams/:teamId/comments/:commentId — author or team owner.
router.delete("/:commentId", async (req, res) => {
  const comment = await Comment.findById(req.params.commentId);
  // The comment itself has no teamId, so team scoping goes through its
  // target: no target in this team means this comment isn't ours to touch.
  const target = comment
    ? await loadTarget(req.params.teamId, comment.targetType, comment.targetId)
    : null;
  if (!comment || !target) {
    return res.status(404).json({ message: "Comment not found" });
  }
  const isAuthor = comment.authorId.equals(req.userId);
  const isOwner = req.membership.role === "owner";
  if (!isAuthor && !isOwner) {
    return res
      .status(403)
      .json({ message: "Only the comment's author or the team owner can delete it" });
  }
  // Deleting a top-level comment takes its replies with it — orphaned
  // replies would render parentless and be undeletable through the UI.
  await Comment.deleteMany({ $or: [{ _id: comment._id }, { parentId: comment._id }] });
  res.json({ ok: true });
});

export default router;
