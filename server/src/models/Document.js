import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    // Serialized Yjs document state. Stays null until the real-time editor
    // phase; the CRUD routes never touch it.
    yjsState: { type: Buffer, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Listing a team's documents is the hot query.
documentSchema.index({ teamId: 1 });

export default mongoose.model("Document", documentSchema);
