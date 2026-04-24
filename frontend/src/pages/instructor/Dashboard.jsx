import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { Plus, Users, BookOpen, Copy, Check, ChevronRight, GraduationCap, Loader2 } from "lucide-react";

const API_BASE = "http://localhost:8000";

export default function InstructorDashboard() {
  const { user, profile } = useAuth();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newClass, setNewClass] = useState({ name: "", description: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchClasses();
  }, [user]);

  async function fetchClasses() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${API_BASE}/classes`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setClasses(data ?? []);
      } else {
        console.error("Failed to fetch classes:", await res.text());
        setClasses([]);
      }
    } catch (error) {
      console.error("Error fetching classes:", error);
      setClasses([]);
    } finally {
      setLoading(false);
    }
  }

  async function createClass() {
    if (!newClass.name.trim()) return;
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${API_BASE}/classes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newClass.name.trim(),
          description: newClass.description.trim() || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Fetch classes again to get member_count (which will be 0 for new class)
        await fetchClasses();
        setShowNew(false);
        setNewClass({ name: "", description: "" });
      } else {
        console.error("Failed to create class:", await res.text());
      }
    } catch (error) {
      console.error("Error creating class:", error);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
            Hey, {profile?.full_name?.split(" ")[0]} 👋
          </h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm">Manage your classes and quizzes.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> New Class
        </button>
      </div>

      {/* New class form */}
      {showNew && (
        <div className="card p-6 space-y-4 animate-slide-up border-violet-200">
          <h2 className="font-semibold text-gray-800 dark:text-slate-100">Create a new class</h2>
          <input
            autoFocus
            type="text"
            placeholder="Class name (e.g. CS 301 – Software Engineering)"
            value={newClass.name}
            onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
            className="input"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newClass.description}
            onChange={(e) => setNewClass({ ...newClass, description: e.target.value })}
            className="input"
          />
          <div className="flex gap-3">
            <button onClick={createClass} disabled={creating || !newClass.name.trim()} className="btn-primary">
              {creating ? <><Loader2 className="w-4 h-4 animate-spin" />Creating…</> : "Create Class"}
            </button>
            <button onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Classes" value={classes.length} color="violet" />
        <StatCard
          label="Total Students"
          value={classes.reduce((s, c) => s + (c.member_count ?? 0), 0)}
          color="indigo"
        />
        <StatCard label="Active" value={classes.length} color="emerald" />
      </div>

      {/* Classes grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
        </div>
      ) : classes.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto">
            <GraduationCap className="w-7 h-7 text-violet-400" />
          </div>
          <p className="font-medium text-gray-700 dark:text-slate-200">No classes yet</p>
          <p className="text-sm text-gray-400 dark:text-slate-500">Create your first class to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {classes.map((c) => (
            <ClassCard key={c.id} cls={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  const c = {
    violet:  "from-violet-50 to-violet-100/50 text-violet-700 border-violet-100",
    indigo:  "from-indigo-50 to-indigo-100/50 text-indigo-700 border-indigo-100",
    emerald: "from-emerald-50 to-emerald-100/50 text-emerald-700 border-emerald-100",
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 ${c[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-70 mt-0.5">{label}</p>
    </div>
  );
}

function ClassCard({ cls }) {
  const [copied, setCopied] = useState(false);
  const memberCount = cls.member_count ?? 0;

  function copyCode() {
    navigator.clipboard.writeText(cls.class_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Link to={`/instructor/class/${cls.id}`}
      className="card p-5 hover:border-violet-200 hover:shadow-md transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-violet-600" />
        </div>
        <button
          onClick={(e) => { e.preventDefault(); copyCode(); }}
          className="flex items-center gap-1.5 bg-gray-100 dark:bg-slate-700 hover:bg-violet-100 px-2.5 py-1 rounded-lg text-xs font-mono font-bold text-gray-600 dark:text-slate-300 hover:text-violet-700 transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          {cls.class_code}
        </button>
      </div>
      <h3 className="font-semibold text-gray-900 dark:text-slate-100 group-hover:text-violet-700 transition-colors">{cls.name}</h3>
      {cls.description && <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 line-clamp-1">{cls.description}</p>}
      <div className="flex items-center justify-between mt-4">
        <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
          <Users className="w-3.5 h-3.5" /> {memberCount} student{memberCount !== 1 ? "s" : ""}
        </span>
        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600 group-hover:text-violet-400 transition-colors" />
      </div>
    </Link>
  );
}
