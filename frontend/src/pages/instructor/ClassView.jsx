import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import Upload from "../../components/Upload";
import TopicSearch from "../../components/TopicSearch";
import {
  Copy, Check, Users, FileText, BookOpen, ChevronLeft,
  Loader2, Plus, Trash2, ChevronDown, FolderOpen,
  Globe, Lock, Edit3, X, Save, AlertTriangle,
} from "lucide-react";

const API_BASE = "http://localhost:8000";

// ── NoteEditor (inline component) ────────────────────────────
function NoteEditor({ note, onSave, onCancel, saving }) {
  const [title, setTitle]     = useState(note.title);
  const [content, setContent] = useState(note.content ?? {});

  function updateSummary(v) {
    setContent(c => ({ ...c, summary: v }));
  }
  function updateConcept(i, field, v) {
    setContent(c => {
      const kc = [...(c.key_concepts ?? [])];
      kc[i] = { ...kc[i], [field]: v };
      return { ...c, key_concepts: kc };
    });
  }
  function addConcept() {
    setContent(c => ({ ...c, key_concepts: [...(c.key_concepts ?? []), { term: "", definition: "", example: "" }] }));
  }
  function removeConcept(i) {
    setContent(c => ({ ...c, key_concepts: (c.key_concepts ?? []).filter((_, idx) => idx !== i) }));
  }
  function updateListItem(field, i, v) {
    setContent(c => {
      const arr = [...(c[field] ?? [])];
      arr[i] = v;
      return { ...c, [field]: arr };
    });
  }
  function addListItem(field) {
    setContent(c => ({ ...c, [field]: [...(c[field] ?? []), ""] }));
  }
  function removeListItem(field, i) {
    setContent(c => ({ ...c, [field]: (c[field] ?? []).filter((_, idx) => idx !== i) }));
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Editor header */}
      <div className="flex items-center gap-3">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Note title..."
          className="input flex-1 font-semibold"
        />
        <button onClick={onCancel} className="btn-secondary text-xs">
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        <button onClick={() => onSave({ title, content })} disabled={saving} className="btn-primary text-xs">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </div>

      {/* Summary */}
      <div className="card p-5 space-y-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Summary</h3>
        <textarea
          value={content.summary ?? ""}
          onChange={e => updateSummary(e.target.value)}
          rows={3}
          className="input resize-none text-sm"
          placeholder="Overview of the topic..."
        />
      </div>

      {/* Key Concepts */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Key Concepts</h3>
          <button onClick={addConcept} className="btn-secondary text-xs">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        {(content.key_concepts ?? []).length === 0 && (
          <p className="text-xs text-gray-400">No concepts yet.</p>
        )}
        {(content.key_concepts ?? []).map((kc, i) => (
          <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-2 relative">
            <button onClick={() => removeConcept(i)} className="absolute top-2 right-2 text-gray-300 hover:text-red-400 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
            <input
              value={kc.term ?? ""}
              onChange={e => updateConcept(i, "term", e.target.value)}
              placeholder="Term..."
              className="input text-sm font-medium"
            />
            <textarea
              value={kc.definition ?? ""}
              onChange={e => updateConcept(i, "definition", e.target.value)}
              placeholder="Definition..."
              rows={2}
              className="input resize-none text-sm"
            />
            <input
              value={kc.example ?? ""}
              onChange={e => updateConcept(i, "example", e.target.value)}
              placeholder="Example (optional)..."
              className="input text-sm text-gray-500"
            />
          </div>
        ))}
      </div>

      {/* Simple list sections */}
      {[
        { field: "important_details",     label: "Important Details" },
        { field: "common_misconceptions", label: "Common Misconceptions" },
        { field: "study_tips",            label: "Study Tips" },
      ].map(({ field, label }) => (
        <div key={field} className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</h3>
            <button onClick={() => addListItem(field)} className="btn-secondary text-xs">
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          {(content[field] ?? []).length === 0 && (
            <p className="text-xs text-gray-400">No items yet.</p>
          )}
          {(content[field] ?? []).map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <textarea
                value={item}
                onChange={e => updateListItem(field, i, e.target.value)}
                rows={2}
                className="input resize-none text-sm flex-1"
              />
              <button onClick={() => removeListItem(field, i)} className="text-gray-300 hover:text-red-400 mt-2 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Main ClassView ────────────────────────────────────────────
export default function ClassView() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [cls, setCls]         = useState(null);
  const [members, setMembers] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [files, setFiles]     = useState([]);
  const [notes, setNotes]     = useState([]);
  const [copied, setCopied]   = useState(false);
  const [tab, setTab]         = useState("quizzes");
  const [loading, setLoading] = useState(true);

  // Generate Quiz tab
  const [generating, setGenerating]             = useState(false);
  const [generatedQuiz, setGeneratedQuiz]       = useState(null);
  const [genError, setGenError]                 = useState(null);
  const [selectedFileId, setSelectedFileId]     = useState("");
  const [showInlineUpload, setShowInlineUpload] = useState(false);

  // Files tab
  const [deletingFileId, setDeletingFileId] = useState(null);
  const [showAddFile, setShowAddFile]       = useState(false);

  // Notes tab
  const [noteView, setNoteView]               = useState("list"); // "list" | "generate" | "edit"
  const [noteGenTopic, setNoteGenTopic]       = useState("");
  const [noteGenFileId, setNoteGenFileId]     = useState("");
  const [noteGenShowUpload, setNoteGenShowUpload] = useState(false);
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [notesGenError, setNotesGenError]     = useState(null);
  const [editingNote, setEditingNote]         = useState(null);
  const [savingNote, setSavingNote]           = useState(false);
  const [deletingNoteId, setDeletingNoteId]   = useState(null);
  const [publishingNoteId, setPublishingNoteId] = useState(null);

  // Members tab
  const [removingMemberId, setRemovingMemberId] = useState(null);
  const [deletingClass, setDeletingClass]       = useState(false);

  useEffect(() => { fetchAll(); }, [id]);

  async function fetchAll() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      // Fetch class detail from FastAPI (includes class info and members)
      const classRes = await fetch(`${API_BASE}/classes/${id}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (classRes.ok) {
        const classDetail = await classRes.json();
        setCls({
          id: classDetail.id,
          name: classDetail.name,
          description: classDetail.description,
          class_code: classDetail.class_code,
          instructor_id: classDetail.instructor_id,
          created_at: classDetail.created_at,
        });

        // Transform members to match the old structure (profiles nested)
        const transformedMembers = classDetail.members.map(m => ({
          student_id: m.student_id,
          joined_at: m.joined_at,
          profiles: {
            full_name: m.full_name,
            email: m.email,
          },
        }));
        setMembers(transformedMembers);
      } else {
        console.error("Failed to fetch class:", await classRes.text());
      }

      // Keep fetching quizzes, files, and notes from Supabase directly
      // (these don't have FastAPI routes yet per the spec)
      const [
        { data: quizData },
        { data: fileData },
        { data: noteData },
        { data: successJobData },
      ] = await Promise.all([
        supabase.from("saved_quizzes").select("*").eq("class_id", id).order("created_at", { ascending: false }),
        supabase.from("uploaded_files").select("*").eq("class_id", id).order("created_at", { ascending: false }),
        supabase.from("class_notes").select("*").eq("class_id", id).order("created_at", { ascending: false }),
        supabase.from("processing_jobs").select("file_id").eq("status", "success"),
      ]);

      const successFileIds = new Set((successJobData ?? []).map(j => j.file_id));
      setQuizzes(quizData ?? []);
      setFiles((fileData ?? []).filter(f => successFileIds.has(f.file_id)));
      setNotes(noteData ?? []);
    } catch (error) {
      console.error("Error fetching class data:", error);
    } finally {
      setLoading(false);
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(cls?.class_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleUpload(file) {
    const { data: { session } } = await supabase.auth.getSession();
    const form = new FormData();
    form.append("file", file);
    form.append("class_id", id);
    const res = await fetch(`${import.meta.env.VITE_API_URL}/upload/`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${session?.access_token}` },
      body: form,
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.detail || "Upload failed");
    }
    const data = await res.json();
    const fileEntry = { file_id: data.file_id, filename: file.name, uploaded_by: user.id, class_id: id, created_at: new Date().toISOString() };
    setFiles(prev => [fileEntry, ...prev]);
    setSelectedFileId(data.file_id);
    setShowInlineUpload(false);
    setShowAddFile(false);
    setNoteGenFileId(data.file_id);
    setNoteGenShowUpload(false);
  }

  async function deleteFile(file) {
    if (!confirm(`Remove "${file.filename}"? This deletes the file and all its indexed content.`)) return;
    setDeletingFileId(file.file_id);
    try {
      await Promise.all([
        supabase.storage.from("uploads").remove([`${file.file_id}/${file.filename}`]),
        supabase.from("chunks").delete().eq("file_id", file.file_id),
        supabase.from("processing_jobs").delete().eq("file_id", file.file_id),
        supabase.from("uploaded_files").delete().eq("file_id", file.file_id),
      ]);
      setFiles(prev => prev.filter(f => f.file_id !== file.file_id));
      if (selectedFileId === file.file_id) setSelectedFileId("");
      if (noteGenFileId === file.file_id) setNoteGenFileId("");
    } finally {
      setDeletingFileId(null);
    }
  }

  // ── Quiz actions ──────────────────────────────────────────────
  async function generateAndShare(params) {
    setGenerating(true);
    setGeneratedQuiz(null);
    setGenError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fileId = selectedFileId && selectedFileId !== "__new__" ? selectedFileId : null;
      const res = await fetch(`${import.meta.env.VITE_API_URL}/quiz/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          topic:           params.topic,
          num_questions:   params.numQuestions,
          difficulty:      params.difficulty,
          question_types:  ["mcq", "true_false", "short_answer"],
          outside_sources: params.outsideSources,
          file_id:         fileId,
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
        is_shared:       false,
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
    if (!confirm("Delete this quiz?")) return;
    await supabase.from("saved_quizzes").delete().eq("id", quizId);
    setQuizzes(prev => prev.filter(q => q.id !== quizId));
  }

  async function toggleQuizShare(quiz) {
    const { data } = await supabase.from("saved_quizzes")
      .update({ is_shared: !quiz.is_shared })
      .eq("id", quiz.id)
      .select().single();
    if (data) setQuizzes(prev => prev.map(q => q.id === quiz.id ? data : q));
  }

  // ── Notes actions ─────────────────────────────────────────────
  async function generateNotes() {
    if (!noteGenTopic.trim()) return;
    setGeneratingNotes(true);
    setNotesGenError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fileId = noteGenFileId && noteGenFileId !== "__new__" ? noteGenFileId : null;
      const res = await fetch(`${import.meta.env.VITE_API_URL}/notes/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          topic:           noteGenTopic,
          file_id:         fileId,
          outside_sources: !fileId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Generation failed");

      const { data: saved } = await supabase.from("class_notes").insert({
        class_id:     id,
        created_by:   user.id,
        title:        noteGenTopic,
        topic:        noteGenTopic,
        file_id:      fileId,
        content:      data,
        is_published: false,
      }).select().single();

      if (saved) setNotes(prev => [saved, ...prev]);
      setNoteGenTopic("");
      setNoteGenFileId("");
      setNoteView("list");
    } catch (err) {
      setNotesGenError(err.message);
    } finally {
      setGeneratingNotes(false);
    }
  }

  async function saveNote(noteId, { title, content }) {
    setSavingNote(true);
    const { data } = await supabase.from("class_notes")
      .update({ title, content })
      .eq("id", noteId)
      .select().single();
    if (data) setNotes(prev => prev.map(n => n.id === noteId ? data : n));
    setSavingNote(false);
    setNoteView("list");
    setEditingNote(null);
  }

  async function toggleNotePublish(note) {
    setPublishingNoteId(note.id);
    const { data } = await supabase.from("class_notes")
      .update({ is_published: !note.is_published })
      .eq("id", note.id)
      .select().single();
    if (data) setNotes(prev => prev.map(n => n.id === note.id ? data : n));
    setPublishingNoteId(null);
  }

  async function deleteNote(noteId) {
    if (!confirm("Delete this note? This cannot be undone.")) return;
    setDeletingNoteId(noteId);
    await supabase.from("class_notes").delete().eq("id", noteId);
    setNotes(prev => prev.filter(n => n.id !== noteId));
    setDeletingNoteId(null);
  }

  // ── Member actions ────────────────────────────────────────────
  async function removeMember(studentId) {
    if (!confirm("Remove this student from the class?")) return;
    setRemovingMemberId(studentId);
    await supabase.from("class_members").delete().eq("class_id", id).eq("student_id", studentId);
    setMembers(prev => prev.filter(m => m.student_id !== studentId));
    setRemovingMemberId(null);
  }

  async function deleteClass() {
    if (!confirm(`Delete class "${cls?.name}"? All quizzes, notes, and files in this class will be deleted. This cannot be undone.`)) return;
    setDeletingClass(true);
    await supabase.from("classes").delete().eq("id", id);
    navigate("/instructor");
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
    </div>
  );
  if (!cls) return <p className="text-gray-500">Class not found.</p>;

  const selectedFile    = files.find(f => f.file_id === selectedFileId);
  const noteGenFile     = files.find(f => f.file_id === noteGenFileId);
  const publishedNotes  = notes.filter(n => n.is_published).length;
  const sharedQuizzes   = quizzes.filter(q => q.is_shared).length;

  // Show editor full-screen within the notes tab
  if (tab === "notes" && noteView === "edit" && editingNote) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <button
            onClick={() => { setNoteView("list"); setEditingNote(null); }}
            className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-violet-600 mb-3"
          >
            <ChevronLeft className="w-4 h-4" /> Back to notes
          </button>
          <h2 className="text-lg font-bold text-gray-800">Edit Note</h2>
        </div>
        <NoteEditor
          note={editingNote}
          saving={savingNote}
          onCancel={() => { setNoteView("list"); setEditingNote(null); }}
          onSave={(updates) => saveNote(editingNote.id, updates)}
        />
      </div>
    );
  }

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
      <div className="grid grid-cols-4 gap-3">
        <div className="card p-4 text-center">
          <p className="text-xl font-bold text-violet-700">{members.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Students</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xl font-bold text-indigo-700">{sharedQuizzes}</p>
          <p className="text-xs text-gray-400 mt-0.5">Shared Quizzes</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xl font-bold text-emerald-700">{publishedNotes}</p>
          <p className="text-xs text-gray-400 mt-0.5">Published Notes</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xl font-bold text-amber-600">{files.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Files</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {[
          { key: "quizzes",  label: "Quizzes" },
          { key: "notes",    label: "Notes" },
          { key: "generate", label: "Generate Quiz" },
          { key: "files",    label: "Files" },
          { key: "members",  label: "Members" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); if (t.key === "notes") setNoteView("list"); }}
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
              <p className="text-sm">No quizzes yet. Use the Generate Quiz tab to create one.</p>
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
                  <button
                    onClick={() => toggleQuizShare(q)}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all font-medium
                      ${q.is_shared
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"}`}
                  >
                    {q.is_shared ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    {q.is_shared ? "Shared" : "Share"}
                  </button>
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

      {/* ── Notes ─────────────────────────────────────────────────── */}
      {tab === "notes" && noteView === "list" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {notes.length} note{notes.length !== 1 ? "s" : ""} · {publishedNotes} published
            </p>
            <button onClick={() => setNoteView("generate")} className="btn-primary text-xs">
              <Plus className="w-3.5 h-3.5" /> Generate Note
            </button>
          </div>

          {notes.length === 0 ? (
            <div className="card p-10 text-center text-gray-400 space-y-2">
              <FileText className="w-8 h-8 mx-auto opacity-40" />
              <p className="text-sm">No notes yet. Generate one for your students.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="card p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium text-gray-800 truncate">{note.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${note.is_published ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {note.is_published ? "Published" : "Draft"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{new Date(note.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleNotePublish(note)}
                      disabled={publishingNoteId === note.id}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all font-medium
                        ${note.is_published
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                          : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"}`}
                    >
                      {publishingNoteId === note.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : note.is_published ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />
                      }
                      {note.is_published ? "Published" : "Publish"}
                    </button>
                    <button
                      onClick={() => { setEditingNote(note); setNoteView("edit"); }}
                      className="p-1.5 text-gray-300 hover:text-violet-500 transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteNote(note.id)}
                      disabled={deletingNoteId === note.id}
                      className="p-1.5 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      {deletingNoteId === note.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />
                      }
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Notes Generate Form ───────────────────────────────────── */}
      {tab === "notes" && noteView === "generate" && (
        <div className="space-y-5 animate-slide-up">
          <div className="flex items-center gap-3">
            <button onClick={() => setNoteView("list")} className="text-sm text-gray-400 hover:text-violet-600 flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <h2 className="text-base font-semibold text-gray-800">Generate Study Notes</h2>
          </div>

          <div className="card p-5 space-y-4">
            {/* File picker */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block">Source Material (optional)</label>
              {files.length > 0 ? (
                <div className="space-y-2">
                  <div className="relative">
                    <select
                      value={noteGenFileId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNoteGenFileId(val);
                        setNoteGenShowUpload(val === "__new__");
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
                  {noteGenShowUpload && (
                    <div className="animate-slide-up">
                      <Upload onUpload={handleUpload} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">No files yet. Upload one to generate grounded notes.</p>
                  <Upload onUpload={handleUpload} />
                </div>
              )}
            </div>

            {/* Topic */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block">Topic / Chapter</label>
              <input
                value={noteGenTopic}
                onChange={e => setNoteGenTopic(e.target.value)}
                placeholder="e.g. Photosynthesis, Chapter 3: Civil War, Derivatives..."
                className="input"
                onKeyDown={e => e.key === "Enter" && generateNotes()}
              />
            </div>

            {notesGenError && (
              <p className="text-sm text-red-500">{notesGenError}</p>
            )}

            <button
              onClick={generateNotes}
              disabled={generatingNotes || !noteGenTopic.trim()}
              className="btn-primary w-full"
            >
              {generatingNotes ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              ) : (
                <><Plus className="w-4 h-4" /> Generate Notes</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Generate Quiz ─────────────────────────────────────────── */}
      {tab === "generate" && (
        <div className="space-y-5">
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Source Material</h2>
              {selectedFile && (
                <span className="badge bg-emerald-50 text-emerald-600">✓ {selectedFile.filename}</span>
              )}
            </div>

            {files.length > 0 ? (
              <div className="space-y-3">
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
                {showInlineUpload && (
                  <div className="animate-slide-up">
                    <Upload onUpload={handleUpload} />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-400">No files yet. Upload one to generate grounded quizzes.</p>
                <Upload onUpload={handleUpload} />
              </div>
            )}
          </div>

          <TopicSearch onGenerate={generateAndShare} loading={generating} />

          {genError && (
            <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-3 text-sm text-red-600">
              {genError}
            </div>
          )}

          {generatedQuiz && (
            <div className="card p-4 flex items-center justify-between bg-emerald-50 border-emerald-200 animate-slide-up">
              <div>
                <p className="font-medium text-emerald-800">Quiz created! Share it from the Quizzes tab.</p>
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
            <p className="text-sm text-gray-500">{files.length} file{files.length !== 1 ? "s" : ""}</p>
            <button onClick={() => setShowAddFile(v => !v)} className="btn-primary text-xs">
              <Plus className="w-3.5 h-3.5" /> Add File
            </button>
          </div>

          {showAddFile && (
            <div className="card p-5 animate-slide-up">
              <Upload onUpload={handleUpload} />
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
                      <p className="text-xs text-gray-400">Uploaded {new Date(f.created_at).toLocaleDateString()}</p>
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
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Class Members</h3>
              <span className="badge bg-violet-50 text-violet-600">{members.length}</span>
            </div>
            {members.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                Share code <strong className="font-mono text-gray-600">{cls.class_code}</strong> with students to let them join.
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {members.map((m) => (
                  <li key={m.student_id} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 text-xs font-bold flex-shrink-0">
                      {m.profiles?.full_name?.[0] ?? "?"}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{m.profiles?.full_name}</p>
                      <p className="text-xs text-gray-400">{m.profiles?.email}</p>
                    </div>
                    <button
                      onClick={() => removeMember(m.student_id)}
                      disabled={removingMemberId === m.student_id}
                      className="text-xs text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      {removingMemberId === m.student_id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <X className="w-3.5 h-3.5" />
                      }
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Danger zone */}
          <div className="card p-5 border-red-100 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-semibold text-red-600">Danger Zone</h3>
            </div>
            <p className="text-xs text-gray-500">
              Deleting this class will permanently remove all quizzes, notes, and files associated with it.
            </p>
            <button
              onClick={deleteClass}
              disabled={deletingClass}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-50"
            >
              {deletingClass ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {deletingClass ? "Deleting…" : "Delete this class"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
