import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Sparkles, GraduationCap, BookOpen, Loader2 } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "" });
  const [error, setError]   = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.role) { setError("Please choose a role."); return; }
    setLoading(true);
    setError(null);
    try {
      await register({ email: form.email, password: form.password, fullName: form.fullName, role: form.role });
      const targetPath = form.role === "instructor" ? "/instructor" : "/student";
      navigate(targetPath);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-3 shadow-lg shadow-violet-200">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Create account</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Join AutoQuiz</p>
        </div>

        <div className="card p-7 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          {/* Role selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">I am a…</label>
            <div className="grid grid-cols-2 gap-3">
              <RoleCard
                role="instructor"
                icon={<GraduationCap className="w-6 h-6" />}
                label="Instructor"
                desc="Create & share quizzes with your class"
                selected={form.role === "instructor"}
                onClick={() => setForm({ ...form, role: "instructor" })}
              />
              <RoleCard
                role="student"
                icon={<BookOpen className="w-6 h-6" />}
                label="Student"
                desc="Study, generate quizzes & flashcards"
                selected={form.role === "student"}
                onClick={() => setForm({ ...form, role: "student" })}
              />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Full Name</label>
              <input type="text" required value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Your name" className="input" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Email</label>
              <input type="email" required value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com" className="input" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Password</label>
              <input type="password" required minLength={6} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Min. 6 characters" className="input" />
            </div>

            <button type="submit" disabled={loading || !form.role} className="btn-primary w-full mt-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</> : "Create Account"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 dark:text-slate-400">
            Have an account?{" "}
            <Link to="/login" className="text-violet-600 font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function RoleCard({ icon, label, desc, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 text-center transition-all cursor-pointer
        ${selected
          ? "border-violet-500 bg-violet-50 text-violet-700"
          : "border-gray-200 dark:border-slate-700 hover:border-violet-300 text-gray-600 dark:text-slate-300 hover:bg-violet-50/30"
        }`}
    >
      <span className={selected ? "text-violet-600" : "text-gray-400 dark:text-slate-500"}>{icon}</span>
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs leading-tight opacity-70">{desc}</span>
    </button>
  );
}
