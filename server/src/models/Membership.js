import mongoose from "mongoose";

// The role lives HERE, on the user–team pair, not on the User document.
// One person can be the owner of team A and a plain member of team B at the
// same time; a single role field on User could not express that.
const membershipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    role: { type: String, enum: ["owner", "member"], required: true },
  },
  { timestamps: true }
);

// A user can belong to a team only once.
membershipSchema.index({ userId: 1, teamId: 1 }, { unique: true });

export default mongoose.model("Membership", membershipSchema);
