import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import Upload from "../../components/Upload";
import TopicSearch from "../../components/TopicSearch";
import { Copy, Check, Users, FileText, BookOpen, Share2, ChevronLeft, Loader2, Plus, Trash2 } from "lucide-react";

export default function ClassView() {
  const { id } = useParams();
  const { user } = useAuth();
  const [cls, setCls] = useState(null);
  const [members, setMembers] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("quizzes"); // quizzes | upload | generate | members
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatedQuiz, setGeneratedQuiz] = useState(null);
  const [files, setFiles] = useState([]);

  useEffect(() => { fetchAll(); }, [id]);

  async function fetchAll() {
    setLoading(true);
    const [{ data: classData }, { data: memberData }, { data: quizData }] = await Promise.all([
      supabase.from("classes").select("*").eq("id", id).single(),
      supabase.from("class_members").select("student_id, profiles(full_name, email)").eq("class_id", id),
      supabase.from("saved_quizzes").select("*").eq("class_id", id).order("created_at", { ascending: false }),
    ]);
    setCls(classData);
    setMembers(memberData ?? []);
    setQuizzes(quizData ?? []);
    setLoading(false);
  }

  function copyCode() {
    navigator.clipboard.writeText(cls?.class_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function generateAndShare({ topic, numQuestions, difficulty, outsideSources, fileId }) {
    setGenerating(true);
    setGeneratedQuiz(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/quiz/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          num_questions: numQuestions,
          difficulty,
          question_types: ["mcq", "true_false", "short_answer"],
          outside_sources: outsideSources,
          file_id: fileId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Generation failed");

      // Save to Supabase and share with class
      const { data: saved } = await supabase.from("saved_quizzes").insert({
        title: `${topic} — ${difficulty}`,
        topic,
        difficulty,
        file_id: fileId || null,
        created_by: user.id,
        class_id: id,
        is_shared: true,
        outside_sources: outsideSources,
        questions: data.questions,
      }).select().single();

      setGeneratedQuiz(saved);
      setQuizzes((p) => [saved, ...p]);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  async function deleteQuiz(quizId) {
    await supabase.from("saved_quizzes").delete().eq("id", quizId);
    setQuizzes((p) => p.filter((q) => q.id !== quizId));
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>;
  if (!cls) return <p className="text-gray-500">Class not found.</p>;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <Link to="/instructor" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-violet-600 mb-3">
          <ChevronLeft className="w-4 h-4" /> Back
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{cls.name}</h1>
            {cls.description && <p className="text-gray-400 text-sm mt-0.5">{cls.description}</p>}
          </div>
          <button
            onClick={copyCode}
            className="flex items-center gap-2 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-4 py-2 rounded-xl text-sm font-bold font-mono text-violet-700 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            {cls.class_code}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-xl font-bold text-violet-700">{members.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Students</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xl font-bold text-indigo-700">{quizzes.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Shared Quizzes</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xl font-bold text-emerald-700">{files.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Files</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: "quizzes",  label: "Quizzes" },
          { key: "generate", label: "Generate Quiz" },
          { key: "upload",   label: "Upload Material" },
          { key: "members",  label: "Members" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all
              ${tab === t.key ? "bg-white text-violet-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "quizzes" && (
        <div className="space-y-3">
          {quizzes.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No quizzes shared yet. Use the Generate tab to create one.</p>
            </div>
          ) : (
            quizzes.map((q) => (
              <div key={q.id} className="card p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{q.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {q.questions?.length} questions · {q.difficulty} · {new Date(q.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link to={`/quiz/${q.id}`} className="btn-secondary text-xs py-1.5">Study</Link>
                  <button onClick={() => deleteQuiz(q.id)} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "generate" && (
        <div className="space-y-4">
          <TopicSearch onGenerate={generateAndShare} loading={generating} showFileUpload={false} />
          {generatedQuiz && (
            <div className="card p-4 flex items-center justify-between bg-emerald-50 border-emerald-200">
              <div>
                <p className="font-medium text-emerald-800">Quiz created and shared with class!</p>
                <p className="text-xs text-emerald-600">{generatedQuiz.title}</p>
              </div>
              <Link to={`/quiz/${generatedQuiz.id}`} className="btn-primary text-xs">Preview</Link>
            </div>
          )}
        </div>
      )}

      {tab === "upload" && (
        <div className="card p-6">
          <Upload onSuccess={(f) => setFiles((p) => [f, ...p])} />
        </div>
      )}

      {tab === "members" && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Class Members</h3>
            <span className="badge bg-violet-50 text-violet-600">{members.length}</span>
          </div>
          {members.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              Share class code <strong className="font-mono text-gray-600">{cls.class_code}</strong> with students to let them join.
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {members.map((m) => (
                <li key={m.student_id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 text-xs font-bold">
                    {m.profiles?.full_name?.[0] ?? "?"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{m.profiles?.full_name}</p>
                    <p className="text-xs text-gray-400">{m.profiles?.email}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
