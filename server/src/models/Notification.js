import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // recipient
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["mention", "team_invite"], required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    // optional in-app path, e.g. "/teams/<id>/documents/<id>"
    link: { type: String, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
