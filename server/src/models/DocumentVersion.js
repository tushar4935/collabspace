import mongoose from "mongoose";

const documentVersionSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    // Optional human label ("before big rewrite"); falls back to the timestamp
    // in the UI when empty.
    label: { type: String, default: "", trim: true },
    // A full snapshot of the document content as ProseMirror JSON. We store the
    // rendered content (not the raw Yjs binary) because a version's job is to
    // be re-loaded into the editor on restore, and setContent() takes JSON.
    content: { type: mongoose.Schema.Types.Mixed, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  // createdAt is the snapshot time.
  { timestamps: true }
);

// Listing a document's versions, newest first.
documentVersionSchema.index({ documentId: 1, createdAt: -1 });

export default mongoose.model("DocumentVersion", documentVersionSchema);
