import ActivityLog from "../models/ActivityLog.js";

// best-effort: a logging failure shouldn't break the request
export async function logActivity(teamId, userId, action) {
  try {
    await ActivityLog.create({ teamId, userId, action });
  } catch (err) {
    console.error("activity log failed:", err.message);
  }
}
