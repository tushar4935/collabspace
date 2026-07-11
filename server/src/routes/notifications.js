import { Router } from "express";
import Notification from "../models/Notification.js";
import { requireAuth } from "../middleware/auth.js";

// user-scoped, not team-scoped
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

// GET — current user's 50 newest, plus unread count
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

// PATCH /read-all — mark everything read
router.patch("/read-all", async (req, res) => {
  await Notification.updateMany(
    { userId: req.userId, read: false },
    { read: true }
  );
  res.json({ ok: true });
});

// PATCH /:id/read — mark one read (scoped to the caller's own)
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
