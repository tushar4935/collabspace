import { Router } from "express";
import ActivityLog from "../models/ActivityLog.js";
import { requireAuth } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";

// Mounted at /api/teams/:teamId/activity.
const router = Router({ mergeParams: true });

router.use(requireAuth, requireMembership());

// GET /api/teams/:teamId/activity — the team's 50 newest events.
router.get("/", async (req, res) => {
  const logs = await ActivityLog.find({ teamId: req.params.teamId })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("userId", "name");
  res.json({
    activity: logs.map((log) => ({
      id: log._id,
      user: log.userId?.name ?? "Removed user",
      action: log.action,
      timestamp: log.createdAt,
    })),
  });
});

export default router;
