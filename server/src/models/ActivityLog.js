import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // A ready-to-display sentence fragment, e.g. `created document "Spec"`.
    // Human-readable strings keep the feed dead simple; this project never
    // needs to filter or localize log entries.
    action: { type: String, required: true },
  },
  // createdAt doubles as the log timestamp.
  { timestamps: true }
);

// The feed reads a team's newest entries.
activityLogSchema.index({ teamId: 1, createdAt: -1 });

export default mongoose.model("ActivityLog", activityLogSchema);
