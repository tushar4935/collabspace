import ActivityLog from "../models/ActivityLog.js";

// Record a team event. Logging must never break the request that triggered
// it, so failures are swallowed (they only cost a missing feed entry).
export async function logActivity(teamId, userId, action) {
  try {
    await ActivityLog.create({ teamId, userId, action });
  } catch (err) {
    console.error("activity log failed:", err.message);
  }
}
