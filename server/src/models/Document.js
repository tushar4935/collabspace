import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    // serialized yjs state; the CRUD routes never touch it
    yjsState: { type: Buffer, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

documentSchema.index({ teamId: 1 });

export default mongoose.model("Document", documentSchema);
