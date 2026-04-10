import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import Upload from "../../components/Upload";
import TopicSearch from "../../components/TopicSearch";
import {
  Copy, Check, Users, FileText, BookOpen, ChevronLeft,
  Loader2, Plus, Trash2, ChevronDown, FolderOpen, ChevronRight,
} from "lucide-react";

export default function ClassView() {
  const { id } = useParams();
  const { user } = useAuth();
  const [cls, setCls]         = useState(null);
  const [members, setMembers] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [files, setFiles]     = useState([]);
  const [copied, setCopied]   = useState(false);
  const [tab, setTab]         = useState("quizzes");
  const [loading, setLoading] = useState(true);

  // Generate tab
  const [generating, setGenerating]       = useState(false);
  const [generatedQuiz, setGeneratedQuiz] = useState(null);
  const [genError, setGenError]           = useState(null);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [showInlineUpload, setShowInlineUpload] = useState(false);

  // Files tab
  const [deletingFileId, setDeletingFileId] = useState(null);
  const [showAddFile, setShowAddFile]       = useState(false);

  useEffect(() => { fetchAll(); }, [id]);

  async function fetchAll() {
    setLoading(true);
    const [
      { data: classData },
      { data: memberData },
      { data: quizData },
      { data: fileData },
    ] = await Promise.all([
      supabase.from("classes").select("*").eq("id", id).single(),
      supabase.from("class_members").select("student_id, profiles(full_name, email)").eq("class_id", id),
      supabase.from("saved_quizzes").select("*").eq("class_id", id).order("created_at", { ascending: false }),
      supabase.from("uploaded_files").select("*").eq("class_id", id).order("created_at", { ascending: false }),
    ]);
    setCls(classData);
    setMembers(memberData ?? []);
    setQuizzes(quizData ?? []);
    setFiles(fileData ?? []);
    setLoading(false);
  }

  function copyCode() {
    navigator.clipboard.writeText(cls?.class_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Called when an upload finishes — save the record to the DB and auto-select it
  async function handleFileUploaded(f) {
    const { data, error } = await supabase.from("uploaded_files").insert({
      file_id:     f.file_id,
      filename:    f.filename,
      uploaded_by: user.id,
      class_id:    id,
    }).select().single();

    if (!error && data) {
      setFiles(prev => [data, ...prev]);
      setSelectedFileId(data.file_id);
      setShowInlineUpload(false);
      setShowAddFile(false);
    }
  }

  async function deleteFile(file) {
    if (!confirm(`Remove "${file.filename}" from this class? This will delete the file and all its indexed content.`)) return;
    setDeletingFileId(file.file_id);
    try {
      // Remove from Storage, chunks, processing jobs, and file record in parallel
      await Promise.all([
        supabase.storage.from("uploads").remove([`${file.file_id}/${file.filename}`]),
        supabase.from("chunks").delete().eq("file_id", file.file_id),
        supabase.from("processing_jobs").delete().eq("file_id", file.file_id),
        supabase.from("uploaded_files").delete().eq("file_id", file.file_id),
      ]);
      setFiles(prev => prev.filter(f => f.file_id !== file.file_id));
      if (selectedFileId === file.file_id) setSelectedFileId("");
    } finally {
      setDeletingFileId(null);
    }
  }

  async function generateAndShare(params) {
    setGenerating(true);
    setGeneratedQuiz(null);
    setGenError(null);
    try {
      const fileId = selectedFileId && selectedFileId !== "__new__" ? selectedFileId : null;
      const res = await fetch(`${import.meta.env.VITE_API_URL}/quiz/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic:          params.topic,
          num_questions:  params.numQuestions,
          difficulty:     params.difficulty,
          question_types: ["mcq", "true_false", "short_answer"],
          outside_sources: params.outsideSources,
          file_id:        fileId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Generation failed");

      const { data: saved } = await supabase.from("saved_quizzes").insert({
        title:           `${params.topic} — ${params.difficulty}`,
        topic:           params.topic,
        difficulty:      params.difficulty,
        file_id:         fileId,
        created_by:      user.id,
        class_id:        id,
        is_shared:       true,
        outside_sources: params.outsideSources,
        questions:       data.questions,
      }).select().single();

      setGeneratedQuiz(saved);
      setQuizzes(prev => [saved, ...prev]);
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function deleteQuiz(quizId) {
    await supabase.from("saved_quizzes").delete().eq("id", quizId);
    setQuizzes(prev => prev.filter(q => q.id !== quizId));
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
    </div>
  );
  if (!cls) return <p className="text-gray-500">Class not found.</p>;

  const selectedFile = files.find(f => f.file_id === selectedFileId);

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
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {[
          { key: "quizzes",  label: "Quizzes" },
          { key: "generate", label: "Generate Quiz" },
          { key: "files",    label: "Files" },
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

      {/* ── Quizzes ───────────────────────────────────────────────── */}
      {tab === "quizzes" && (
        <div className="space-y-3">
          {quizzes.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No quizzes shared yet. Use the Generate Quiz tab to create one.</p>
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

      {/* ── Generate Quiz ─────────────────────────────────────────── */}
      {tab === "generate" && (
        <div className="space-y-5">
          {/* File picker */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Source Material</h2>
              {selectedFile && (
                <span className="badge bg-emerald-50 text-emerald-600">
                  ✓ {selectedFile.filename}
                </span>
              )}
            </div>

            {files.length > 0 ? (
              <div className="space-y-3">
                {/* Dropdown */}
                <div className="relative">
                  <select
                    value={selectedFileId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedFileId(val);
                      setShowInlineUpload(val === "__new__");
                    }}
                    className="w-full appearance-none input pr-10 cursor-pointer bg-white"
                  >
                    <option value="">No file — use general knowledge</option>
                    <optgroup label="Class files">
                      {files.map(f => (
                        <option key={f.file_id} value={f.file_id}>{f.filename}</option>
                      ))}
                    </optgroup>
                    <option value="__new__">+ Upload a new file…</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                {/* Inline upload when "+ Upload a new file" is selected */}
                {showInlineUpload && (
                  <div className="animate-slide-up">
                    <Upload onSuccess={handleFileUploaded} />
                  </div>
                )}
              </div>
            ) : (
              /* No files yet — show upload directly */
              <div className="space-y-2">
                <p className="text-xs text-gray-400">No files in this class yet. Upload one to generate grounded quizzes.</p>
                <Upload onSuccess={handleFileUploaded} />
              </div>
            )}
          </div>

          {/* Quiz config */}
          <TopicSearch onGenerate={generateAndShare} loading={generating} />

          {genError && (
            <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-3 text-sm text-red-600">
              {genError}
            </div>
          )}

          {generatedQuiz && (
            <div className="card p-4 flex items-center justify-between bg-emerald-50 border-emerald-200 animate-slide-up">
              <div>
                <p className="font-medium text-emerald-800">Quiz created and shared with class!</p>
                <p className="text-xs text-emerald-600 mt-0.5">{generatedQuiz.title}</p>
              </div>
              <Link to={`/quiz/${generatedQuiz.id}`} className="btn-primary text-xs">Preview</Link>
            </div>
          )}
        </div>
      )}

      {/* ── Files ─────────────────────────────────────────────────── */}
      {tab === "files" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {files.length} file{files.length !== 1 ? "s" : ""} in this class
            </p>
            <button
              onClick={() => setShowAddFile(v => !v)}
              className="btn-primary text-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Add File
            </button>
          </div>

          {showAddFile && (
            <div className="card p-5 animate-slide-up">
              <Upload onSuccess={handleFileUploaded} />
            </div>
          )}

          {files.length === 0 && !showAddFile ? (
            <div className="card p-10 text-center text-gray-400">
              <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No files yet. Click "Add File" to upload course material.</p>
            </div>
          ) : files.length > 0 && (
            <div className="card overflow-hidden">
              <ul className="divide-y divide-gray-50">
                {files.map((f) => (
                  <li key={f.file_id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-violet-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{f.filename}</p>
                      <p className="text-xs text-gray-400">
                        Uploaded {new Date(f.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteFile(f)}
                      disabled={deletingFileId === f.file_id}
                      className="p-1.5 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      {deletingFileId === f.file_id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />
                      }
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Members ───────────────────────────────────────────────── */}
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
