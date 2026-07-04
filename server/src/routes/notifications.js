import { Router } from "express";
import Notification from "../models/Notification.js";
import { requireAuth } from "../middleware/auth.js";

// Mounted at /api/notifications. These are user-scoped, not team-scoped: a
// person's notifications span every team they belong to.
const router = Router();

router.use(requireAuth);

function publicNotification(n) {
  return {
    id: n._id,
    type: n.type,
    message: n.message,
    link: n.link,
    read: n.read,
    createdAt: n.createdAt,
  };
}

// GET /api/notifications — the current user's 50 newest, plus unread count.
router.get("/", async (req, res) => {
  const notifications = await Notification.find({ userId: req.userId })
    .sort({ createdAt: -1 })
    .limit(50);
  const unread = await Notification.countDocuments({
    userId: req.userId,
    read: false,
  });
  res.json({ notifications: notifications.map(publicNotification), unread });
});

// PATCH /api/notifications/read-all — mark every notification read.
router.patch("/read-all", async (req, res) => {
  await Notification.updateMany(
    { userId: req.userId, read: false },
    { read: true }
  );
  res.json({ ok: true });
});

// PATCH /api/notifications/:id/read — mark one read. Scoped to the caller's
// own notifications, so you can't touch someone else's by guessing an id.
router.patch("/:id/read", async (req, res) => {
  const n = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { read: true },
    { new: true }
  );
  if (!n) {
    return res.status(404).json({ message: "Notification not found" });
  }
  res.json({ notification: publicNotification(n) });
});

export default router;
