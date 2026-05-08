import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import TopBar from "./components/TopBar";

import Login from "./pages/Login";
import Register from "./pages/Register";
import InstructorDashboard from "./pages/instructor/Dashboard";
import ClassView from "./pages/instructor/ClassView";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminLogin from "./pages/admin/Login";
import StudentDashboard from "./pages/student/Dashboard";
import Generate from "./pages/student/Generate";
import QuizStudy from "./pages/QuizStudy";
import FlashcardStudy from "./pages/FlashcardStudy";
import FlashcardEditor from "./pages/FlashcardEditor";
import Notes from "./pages/Notes";
import ClassNoteView from "./pages/ClassNoteView";
import Profile from "./pages/Profile";

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

function AppInner() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900">
      <TopBar />
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        <Routes>
          {/* Public */}
          <Route path="/login"        element={user ? <RoleRedirect /> : <Login />} />
          <Route path="/register"     element={user ? <RoleRedirect /> : <Register />} />
          <Route path="/admin/login"  element={user ? <RoleRedirect /> : <AdminLogin />} />

          {/* Root redirect */}
          <Route path="/" element={user ? <RoleRedirect /> : <Navigate to="/login" replace />} />

          {/* Admin */}
          <Route path="/admin" element={
            <ProtectedRoute allowedRole="admin"><AdminDashboard /></ProtectedRoute>
          } />

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
          <Route path="/class-note/:id"      element={<ProtectedRoute allowedRole="student"><ClassNoteView /></ProtectedRoute>} />
          <Route path="/profile"             element={<ProtectedRoute allowedRole={["student", "instructor"]}><Profile /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function RoleRedirect() {
  const { user, profile, loading } = useAuth();
  if (loading || (user && !profile)) return null;
  if (!user || !profile) return <Navigate to="/login" replace />;
  if (profile.role === "admin")      return <Navigate to="/admin"      replace />;
  if (profile.role === "instructor") return <Navigate to="/instructor" replace />;
  return <Navigate to="/student" replace />;
}

