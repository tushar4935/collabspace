import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    content: { type: String, required: true, trim: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // attaches to a document or whiteboard by (type, id)
    targetType: { type: String, enum: ["document", "whiteboard"], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // null = top-level; otherwise the top-level comment this replies to
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Comment", default: null },
    // mentioned user ids (sent explicitly by the client, not parsed from text)
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

commentSchema.index({ targetId: 1, createdAt: 1 });

export default mongoose.model("Comment", commentSchema);
