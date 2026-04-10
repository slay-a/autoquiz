import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, allowedRole }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not logged in OR profile missing (auth context already signed them out)
  if (!user || !profile) return <Navigate to="/login" replace />;

  // Wrong role
  if (allowedRole && profile.role !== allowedRole) {
    return <Navigate to={profile.role === "instructor" ? "/instructor" : "/student"} replace />;
  }

  return children;
}
