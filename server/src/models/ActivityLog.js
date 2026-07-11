import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // ready-to-display string, e.g. `created document "Spec"`
    action: { type: String, required: true },
  },
  { timestamps: true }
);

activityLogSchema.index({ teamId: 1, createdAt: -1 });

export default mongoose.model("ActivityLog", activityLogSchema);
