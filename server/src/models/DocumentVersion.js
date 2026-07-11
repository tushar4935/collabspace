import mongoose from "mongoose";

const documentVersionSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    // optional label; the UI falls back to the timestamp
    label: { type: String, default: "", trim: true },
    // full snapshot as prosemirror json (restore feeds it to setContent)
    content: { type: mongoose.Schema.Types.Mixed, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

documentVersionSchema.index({ documentId: 1, createdAt: -1 });

export default mongoose.model("DocumentVersion", documentVersionSchema);
