import { Router } from "express";
import Comment from "../models/Comment.js";
import Document from "../models/Document.js";
import Whiteboard from "../models/Whiteboard.js";
import Membership from "../models/Membership.js";
import { requireAuth } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";
import { logActivity } from "../utils/activity.js";
import { notify } from "../utils/notify.js";

// mounted at /api/teams/:teamId/comments
const router = Router({ mergeParams: true });

router.use(requireAuth, requireMembership());

// the target must belong to the team in the url
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

// POST — comment on a document or whiteboard
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

  // replies stay one level deep: a reply to a reply attaches to the top-level parent
  let resolvedParentId = null;
  if (parentId) {
    const parent = await Comment.findOne({ _id: parentId, targetType, targetId });
    if (!parent) {
      return res.status(404).json({ message: "Parent comment not found" });
    }
    resolvedParentId = parent.parentId ?? parent._id;
  }

  // only keep mentions that are actually members of this team
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

  // notify mentioned members (not yourself)
  const authorName = comment.authorId.name;
  const link = `/teams/${req.params.teamId}/${targetType}s/${targetId}`;
  for (const mentionedId of validMentions) {
    if (mentionedId.equals(req.userId)) continue;
    await notify(mentionedId, {
      type: "mention",
      message: `${authorName} mentioned you in a comment on ${targetType} "${target.title}"`,
      link,
    });
  }

  res.status(201).json({ comment: publicComment(comment) });
});

// GET ?targetType=...&targetId=... — comments on one target, oldest first
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

// DELETE /:commentId — author or team owner only
router.delete("/:commentId", async (req, res) => {
  const comment = await Comment.findById(req.params.commentId);
  // comments have no teamId, so team scoping goes through the target
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
  // deleting a top-level comment also deletes its replies
  await Comment.deleteMany({ $or: [{ _id: comment._id }, { parentId: comment._id }] });
  res.json({ ok: true });
});

export default router;
