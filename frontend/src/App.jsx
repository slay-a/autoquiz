import { Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Register from "./pages/Register";
import InstructorDashboard from "./pages/instructor/Dashboard";
import ClassView from "./pages/instructor/ClassView";
import StudentDashboard from "./pages/student/Dashboard";
import Generate from "./pages/student/Generate";
import QuizStudy from "./pages/QuizStudy";
import FlashcardStudy from "./pages/FlashcardStudy";
import FlashcardEditor from "./pages/FlashcardEditor";
import Notes from "./pages/Notes";
import ClassNoteView from "./pages/ClassNoteView";

import { Sparkles, LogOut, BookOpen, PlusCircle, LayoutDashboard } from "lucide-react";

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

function AppInner() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {user && <Navbar />}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        <Routes>
          {/* Public */}
          <Route path="/login"    element={user ? <RoleRedirect /> : <Login />} />
          <Route path="/register" element={user ? <RoleRedirect /> : <Register />} />

          {/* Root redirect */}
          <Route path="/" element={user ? <RoleRedirect /> : <Navigate to="/login" replace />} />

          {/* Instructor */}
          <Route path="/instructor" element={
            <ProtectedRoute allowedRole="instructor"><InstructorDashboard /></ProtectedRoute>
          } />
          <Route path="/instructor/class/:id" element={
            <ProtectedRoute allowedRole="instructor"><ClassView /></ProtectedRoute>
          } />

          {/* Student */}
          <Route path="/student" element={
            <ProtectedRoute allowedRole="student"><StudentDashboard /></ProtectedRoute>
          } />
          <Route path="/student/generate" element={
            <ProtectedRoute allowedRole="student"><Generate /></ProtectedRoute>
          } />

          {/* Shared */}
          <Route path="/quiz/:id"            element={<ProtectedRoute allowedRole={["student", "instructor"]}><QuizStudy /></ProtectedRoute>} />
          <Route path="/flashcards/:id"      element={<ProtectedRoute><FlashcardStudy /></ProtectedRoute>} />
          <Route path="/flashcards/:id/edit" element={<ProtectedRoute><FlashcardEditor /></ProtectedRoute>} />
          <Route path="/notes"               element={<ProtectedRoute allowedRole="student"><Notes /></ProtectedRoute>} />
          <Route path="/class-note/:id"     element={<ProtectedRoute allowedRole="student"><ClassNoteView /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function RoleRedirect() {
  const { user, profile, loading } = useAuth();
  // Wait while loading OR while user is set but profile hasn't arrived yet
  if (loading || (user && !profile)) return null;
  if (!user || !profile) return <Navigate to="/login" replace />;
  return <Navigate to={profile.role === "instructor" ? "/instructor" : "/student"} replace />;
}

function Navbar() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const isInstructor = profile?.role === "instructor";

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-gray-100">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <NavLink to={isInstructor ? "/instructor" : "/student"} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900 tracking-tight">AutoQuiz</span>
        </NavLink>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {isInstructor ? (
            <>
              <NavItem to="/instructor" icon={<LayoutDashboard className="w-3.5 h-3.5" />} label="Dashboard" />
            </>
          ) : (
            <>
              <NavItem to="/student" icon={<LayoutDashboard className="w-3.5 h-3.5" />} label="Dashboard" />
              <NavItem to="/student/generate" icon={<PlusCircle className="w-3.5 h-3.5" />} label="Generate" />
              <NavItem to="/notes" icon={<BookOpen className="w-3.5 h-3.5" />} label="Notes" />
            </>
          )}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 hidden sm:block">
            {profile?.full_name} · <span className="text-violet-600 font-medium capitalize">{profile?.role}</span>
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
        ${isActive ? "bg-violet-50 text-violet-700" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`
      }
    >
      {icon}{label}
    </NavLink>
  );
}
