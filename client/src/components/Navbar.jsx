import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
      <Link to="/" className="text-lg font-bold text-white">
        CollabSpace
      </Link>
      <div className="flex items-center gap-4">
        <NotificationBell />
        <span className="text-sm text-gray-400">{user?.name}</span>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded"
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
