import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, allowedRole }) {
  const { user, profile, loading } = useAuth();

  // Wait while loading OR while user is set but profile hasn't arrived yet
  if (loading || (user && !profile)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not logged in
  if (!user || !profile) return <Navigate to="/login" replace />;

  // Wrong role
  const allowed = Array.isArray(allowedRole) ? allowedRole : allowedRole ? [allowedRole] : null;
  if (allowed && !allowed.includes(profile.role)) {
    if (profile.role === "admin")       return <Navigate to="/admin"      replace />;
    if (profile.role === "instructor")  return <Navigate to="/instructor" replace />;
    return <Navigate to="/student" replace />;
  }

  return children;
}
