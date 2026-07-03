import mongoose from "mongoose";

const whiteboardSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    // Shapes vary by type (a pen stroke has points[], a rect has x/y/width/
    // height, a circle has a radius), so the array is schema-less. Every
    // element carries a client-generated unique `id` — that id is what makes
    // last-write-wins conflict handling possible in the real-time phase.
    elements: { type: [mongoose.Schema.Types.Mixed], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

whiteboardSchema.index({ teamId: 1 });

export default mongoose.model("Whiteboard", whiteboardSchema);
