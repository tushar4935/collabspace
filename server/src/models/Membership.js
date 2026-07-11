import mongoose from "mongoose";

// role lives on the user–team pair, so one user can have different roles in different teams
const membershipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    role: { type: String, enum: ["owner", "member"], required: true },
  },
  { timestamps: true }
);

// one membership per user per team
membershipSchema.index({ userId: 1, teamId: 1 }, { unique: true });

export default mongoose.model("Membership", membershipSchema);
