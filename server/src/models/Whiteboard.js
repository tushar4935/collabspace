import mongoose from "mongoose";

const whiteboardSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    // schema-less: shape fields vary by type. each element has a unique client-generated id.
    elements: { type: [mongoose.Schema.Types.Mixed], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

whiteboardSchema.index({ teamId: 1 });

export default mongoose.model("Whiteboard", whiteboardSchema);
