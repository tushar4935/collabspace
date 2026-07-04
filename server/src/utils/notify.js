import Notification from "../models/Notification.js";
import { emitToUser } from "../socket.js";

// Create a notification in MongoDB and, if the recipient is online, push it
// over Socket.io immediately. MongoDB is the durable record (loaded by the
// bell on next visit); the socket push is the live update. Failures are
// swallowed so a notification problem never breaks the action that caused it.
export async function notify(userId, { type, message, link = null }) {
  try {
    const n = await Notification.create({ userId, type, message, link });
    emitToUser(userId, "notification", {
      id: n._id,
      type: n.type,
      message: n.message,
      link: n.link,
      read: n.read,
      createdAt: n.createdAt,
    });
    return n;
  } catch (err) {
    console.error("notify failed:", err.message);
  }
}
