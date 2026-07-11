import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select: false so the hash never leaks into responses by accident
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
