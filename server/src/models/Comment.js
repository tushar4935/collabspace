import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    content: { type: String, required: true, trim: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // A comment attaches to a document or a whiteboard by (type, id) pair —
    // one collection serves both instead of two near-identical ones.
    targetType: { type: String, enum: ["document", "whiteboard"], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // null = top-level comment; otherwise the id of the top-level comment
    // this is a reply to (threading is kept one level deep).
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Comment", default: null },
    // User ids mentioned in the content. The client sends these explicitly
    // when a mention is picked — the server never re-parses names out of the
    // text, because display names are ambiguous ("@Sam" could be two people).
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

// Comments are always fetched per target, oldest first.
commentSchema.index({ targetId: 1, createdAt: 1 });

export default mongoose.model("Comment", commentSchema);
