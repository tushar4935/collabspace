import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { socket } from "../socket";

export default function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // load the saved list once, then receive new ones over the socket
  useEffect(() => {
    api
      .get("/notifications")
      .then((res) => {
        setItems(res.data.notifications);
        setUnread(res.data.unread);
      })
      .catch(() => {});

    function onNotification(n) {
      setItems((prev) => [n, ...prev]);
      setUnread((u) => u + 1);
    }
    socket.on("notification", onNotification);
    return () => socket.off("notification", onNotification);
  }, []);

  // close the dropdown on outside click
  useEffect(() => {
    function onClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await api.patch("/notifications/read-all");
    } catch {}
  }

  async function handleClick(n) {
    setOpen(false);
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      try {
        await api.patch(`/notifications/${n.id}/read`);
      } catch {}
    }
    if (n.link) navigate(n.link);
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 w-9 h-9 rounded flex items-center justify-center"
        aria-label="Notifications"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-5 h-5 px-1 flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-20 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
            <span className="text-white text-sm font-semibold">Notifications</span>
            {items.some((n) => !n.read) && (
              <button
                onClick={markAllRead}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-auto divide-y divide-gray-800">
            {items.length === 0 ? (
              <li className="px-3 py-4 text-gray-500 text-sm text-center">
                No notifications yet.
              </li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-3 py-2 hover:bg-gray-800 ${
                      n.read ? "" : "bg-gray-800/50"
                    }`}
                  >
                    <p className="text-sm text-gray-200 flex items-start gap-2">
                      {!n.read && (
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                      )}
                      <span>{n.message}</span>
                    </p>
                    <span className="text-xs text-gray-500">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
