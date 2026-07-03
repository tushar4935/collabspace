import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, restoring } = useAuth();
  if (restoring) {
    return <div className="min-h-screen bg-gray-950" />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
