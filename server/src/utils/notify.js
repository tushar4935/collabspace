import Notification from "../models/Notification.js";
import { emitToUser } from "../socket.js";

// save to mongo, then push over socket.io if the user is online. best-effort.
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
