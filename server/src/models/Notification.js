import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // The recipient. Notifications belong to a user across all their teams,
    // so this collection is queried by userId, not by team.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["mention", "team_invite"], required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    // Where clicking the notification should take the user. Not in the base
    // spec model, but a notification you can't act on isn't much use — it's an
    // optional in-app path like "/teams/<id>/documents/<id>".
    link: { type: String, default: null },
  },
  // createdAt is the notification timestamp.
  { timestamps: true }
);

// The bell reads a user's newest notifications.
notificationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
