import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { ShieldCheck, Loader2, Eye, EyeOff } from "lucide-react";

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET;

export default function AdminLogin() {
  const { login, profile } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", secret: "" });
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (form.secret !== ADMIN_SECRET) {
      setError("Incorrect admin passphrase.");
      return;
    }

    setLoading(true);
    try {
      await login({ email: form.email, password: form.password });
      // wait for profile to resolve via polling
      let attempts = 0;
      const check = setInterval(async () => {
        attempts++;
        const stored = JSON.parse(localStorage.getItem(
          Object.keys(localStorage).find(k => k.startsWith("sb-") && k.endsWith("-auth-token")) || ""
        ) || "null");
        if (stored?.user || attempts > 20) {
          clearInterval(check);
          navigate("/admin");
        }
      }, 150);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center mb-3 shadow-lg shadow-red-900/40">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Admin Access</h1>
          <p className="text-sm text-slate-400 mt-1">Restricted — authorized personnel only</p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-7 space-y-5 shadow-xl">
          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@my.csun.edu"
                className="w-full bg-slate-700 border border-slate-600 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Password</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                className="w-full bg-slate-700 border border-slate-600 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Admin Passphrase</label>
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  required
                  value={form.secret}
                  onChange={(e) => setForm({ ...form, secret: e.target.value })}
                  placeholder="Enter admin passphrase"
                  className="w-full bg-slate-700 border border-slate-600 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : "Sign In as Admin"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
