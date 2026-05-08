import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import {
  Users, BookOpen, Layers, School, Trash2, ChevronDown,
  Loader2, FileText, File, BarChart2
} from "lucide-react";

const API = "http://localhost:8000";

async function authHeaders() {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

const TABS = [
  { key: "users",      label: "Users" },
  { key: "classes",    label: "Classes" },
  { key: "quizzes",    label: "Quizzes" },
  { key: "notes",      label: "Notes" },
  { key: "flashcards", label: "Flashcards" },
];

export default function AdminDashboard() {
  const [tab, setTab] = useState("users");
  const [stats, setStats] = useState(null);
  const [data, setData] = useState({ users: [], classes: [], quizzes: [], notes: [], flashcards: [] });
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const h = await authHeaders();
    const [statsRes, usersRes, classesRes, quizzesRes, notesRes, flashcardsRes] = await Promise.all([
      fetch(`${API}/admin/stats`,      { headers: h }),
      fetch(`${API}/admin/users`,      { headers: h }),
      fetch(`${API}/admin/classes`,    { headers: h }),
      fetch(`${API}/admin/quizzes`,    { headers: h }),
      fetch(`${API}/admin/notes`,      { headers: h }),
      fetch(`${API}/admin/flashcards`, { headers: h }),
    ]);
    if (statsRes.ok)      setStats(await statsRes.json());
    setData({
      users:      usersRes.ok      ? await usersRes.json()      : [],
      classes:    classesRes.ok    ? await classesRes.json()    : [],
      quizzes:    quizzesRes.ok    ? await quizzesRes.json()    : [],
      notes:      notesRes.ok      ? await notesRes.json()      : [],
      flashcards: flashcardsRes.ok ? await flashcardsRes.json() : [],
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function del(resource, id) {
    const h = await authHeaders();
    await fetch(`${API}/admin/${resource}/${id}`, { method: "DELETE", headers: h });
    fetchAll();
  }

  async function changeRole(userId, role) {
    const h = await authHeaders();
    await fetch(`${API}/admin/users/${userId}/role`, {
      method: "PATCH", headers: h, body: JSON.stringify({ role }),
    });
    fetchAll();
  }

  const statCards = stats ? [
    { label: "Total Users",   value: stats.total_users,      icon: Users,    color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-900/20" },
    { label: "Students",      value: stats.students,         icon: BookOpen, color: "text-green-500",  bg: "bg-green-50 dark:bg-green-900/20" },
    { label: "Instructors",   value: stats.instructors,      icon: School,   color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-900/20" },
    { label: "Classes",       value: stats.total_classes,    icon: School,   color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-900/20" },
    { label: "Quizzes",       value: stats.total_quizzes,    icon: BookOpen, color: "text-pink-500",   bg: "bg-pink-50 dark:bg-pink-900/20" },
    { label: "Notes",         value: stats.total_notes,      icon: FileText, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-900/20" },
    { label: "Flashcard Sets",value: stats.total_flashcards, icon: Layers,   color: "text-cyan-500",   bg: "bg-cyan-50 dark:bg-cyan-900/20" },
    { label: "Files",         value: stats.total_files,      icon: File,     color: "text-gray-500",   bg: "bg-gray-50 dark:bg-slate-700" },
  ] : [];

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Admin Panel</h1>
        <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm">Full platform oversight — users, classes, quizzes, notes, flashcards.</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statCards.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="card p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{value}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all
              ${tab === t.key ? "bg-white dark:bg-slate-800 text-violet-700 shadow-sm" : "text-gray-500 dark:text-slate-400 hover:text-gray-800"}`}>
            {t.label}
            {data[t.key]?.length > 0 && (
              <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-400 font-bold">
                {data[t.key].length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
      ) : (
        <>
          {tab === "users" && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-700/50 text-left">
                  <tr>
                    {["Name", "Email", "Role", "Joined", ""].map(h => (
                      <th key={h} className="px-4 py-3 font-medium text-gray-500 dark:text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {data.users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800 dark:text-slate-100">{u.full_name || "—"}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs">{u.email}</td>
                      <td className="px-4 py-3">
                        <div className="relative inline-block">
                          <select value={u.role || "student"} onChange={(e) => changeRole(u.id, e.target.value)}
                            className="appearance-none bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg px-3 py-1 pr-7 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-400">
                            <option value="student">student</option>
                            <option value="instructor">instructor</option>
                            <option value="admin">admin</option>
                          </select>
                          <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 dark:text-slate-500 text-xs">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { if(confirm(`Delete ${u.full_name || u.email}?`)) del("users", u.id); }}
                          className="p-1.5 text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.users.length && <Empty />}
            </div>
          )}

          {tab === "classes" && (
            <ResourceList items={data.classes} onDelete={(id) => { if(confirm("Delete this class?")) del("classes", id); }}
              renderItem={(c) => ({
                title: c.name,
                sub: `${c.instructor_name || c.instructor_email || "Unknown"} · ${c.class_code}`,
                icon: <School className="w-5 h-5 text-orange-500" />,
                iconBg: "bg-orange-50 dark:bg-orange-900/20",
              })} />
          )}

          {tab === "quizzes" && (
            <ResourceList items={data.quizzes} onDelete={(id) => { if(confirm("Delete this quiz?")) del("quizzes", id); }}
              renderItem={(q) => ({
                title: q.title,
                sub: `${q.owner_name || q.owner_email || "Unknown"} · ${q.difficulty} · ${q.topic}`,
                icon: <BookOpen className="w-5 h-5 text-pink-500" />,
                iconBg: "bg-pink-50 dark:bg-pink-900/20",
              })} />
          )}

          {tab === "notes" && (
            <ResourceList items={data.notes} onDelete={(id) => { if(confirm("Delete this note?")) del("notes", id); }}
              renderItem={(n) => ({
                title: n.title,
                sub: `${n.class_name || "No class"} · ${n.is_published ? "Published" : "Draft"}`,
                icon: <FileText className="w-5 h-5 text-indigo-500" />,
                iconBg: "bg-indigo-50 dark:bg-indigo-900/20",
              })} />
          )}

          {tab === "flashcards" && (
            <ResourceList items={data.flashcards} onDelete={(id) => { if(confirm("Delete this flashcard set?")) del("flashcards", id); }}
              renderItem={(f) => ({
                title: f.title,
                sub: `${f.owner_name || f.owner_email || "Unknown"} · ${f.set_type || "custom"}`,
                icon: <Layers className="w-5 h-5 text-cyan-500" />,
                iconBg: "bg-cyan-50 dark:bg-cyan-900/20",
              })} />
          )}
        </>
      )}
    </div>
  );
}

function ResourceList({ items, renderItem, onDelete }) {
  if (!items.length) return <Empty />;
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const { title, sub, icon, iconBg } = renderItem(item);
        return (
          <div key={item.id} className="card p-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 dark:text-slate-100 truncate">{title}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{sub}</p>
            </div>
            <button onClick={() => onDelete(item.id)} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Empty() {
  return <p className="text-center text-gray-400 dark:text-slate-500 py-10 text-sm">Nothing here.</p>;
}
