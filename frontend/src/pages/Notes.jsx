import { useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import Upload from "../components/Upload";
import {
  BookOpen, Lightbulb, Target, AlertTriangle,
  ChevronLeft, Loader2, Search, Save, Check
} from "lucide-react";

export default function Notes() {
  const { user } = useAuth();
  const location = useLocation();
  const prefill = location.state ?? {};

  const [uploadedFile, setUploadedFile] = useState(null);
  const [previousFiles, setPreviousFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(prefill.file_id ?? null);
  const [topic, setTopic]       = useState(prefill.topic ?? "");
  const [notes, setNotes]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState(null);

  useEffect(() => {
    async function fetchPreviousFiles() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${import.meta.env.VITE_API_URL}/upload/files`, {
          headers: { "Authorization": `Bearer ${session?.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setPreviousFiles(data);
        }
      } catch (e) {
        console.error("Failed to fetch previous files:", e);
      }
    }
    fetchPreviousFiles();
  }, []);

  async function handleUpload(file) {
    const { data: { session } } = await supabase.auth.getSession();
    const form = new FormData();
    form.append("file", file);
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
    setUploadedFile({ ...data, filename: file.name });
    setSelectedFileId(null);
  }

  function handleFileSelect(e) {
    const fileId = e.target.value;
    if (fileId) {
      setSelectedFileId(fileId);
      setUploadedFile(null);
    } else {
      setSelectedFileId(null);
    }
  }

  async function generate() {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setNotes(null);
    setSaved(false);
    try {
      const session = await supabase.auth.getSession();
      const token = session?.data?.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_API_URL}/notes/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ topic: topic.trim(), file_id: selectedFileId || uploadedFile?.file_id || null, outside_sources: !(selectedFileId || uploadedFile?.file_id) }),
      });
      if (!res.ok) throw new Error("Failed to generate notes");
      setNotes(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveNotes() {
    if (!notes) return;
    try {
      const session = await supabase.auth.getSession();
      const token = session?.data?.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_API_URL}/notes/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          topic: topic.trim(),
          file_id: selectedFileId || uploadedFile?.file_id || null,
          content: notes,
        }),
      });
      if (!res.ok) throw new Error("Failed to save notes");
      setSaved(true);
    } catch (e) {
      console.error("Error saving notes:", e.message);
    }
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <Link to="/student" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-violet-600 mb-3">
          <ChevronLeft className="w-4 h-4" /> Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Study Notes</h1>
        <p className="text-gray-500 mt-1 text-sm">AI-generated notes that map out everything you need to know about a topic.</p>
      </div>

      {/* Upload and File Selection */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Source Material <span className="text-gray-400 font-normal">(optional)</span></h2>
          {(uploadedFile || selectedFileId) && (
            <span className="badge bg-emerald-50 text-emerald-600">
              ✓ {uploadedFile?.filename || previousFiles.find(f => f.file_id === selectedFileId)?.filename}
            </span>
          )}
        </div>

        {/* Previously uploaded files */}
        {previousFiles.length > 0 && !uploadedFile && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Select from previous uploads
            </label>
            <select
              value={selectedFileId || ""}
              onChange={handleFileSelect}
              className="input text-sm"
            >
              <option value="">Choose a file...</option>
              {previousFiles.map((file) => (
                <option key={file.file_id} value={file.file_id}>
                  {file.filename} — {new Date(file.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Upload new file */}
        {!uploadedFile && !selectedFileId ? (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              {previousFiles.length > 0 ? "Or upload a new file" : "Upload a file"}
            </label>
            <Upload onUpload={handleUpload} />
          </div>
        ) : uploadedFile ? (
          <button onClick={() => setUploadedFile(null)} className="text-xs text-gray-400 hover:text-red-400 transition-colors">
            Remove file
          </button>
        ) : (
          <button onClick={() => setSelectedFileId(null)} className="text-xs text-gray-400 hover:text-red-400 transition-colors">
            Clear selection
          </button>
        )}
      </div>

      {/* Input */}
      <div className="card p-5 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="Enter a topic (e.g. Python Exceptions)"
            className="input pl-10"
          />
        </div>
        <button onClick={generate} disabled={loading || !topic.trim()} className="btn-primary">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate Notes"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-2xl px-5 py-4">{error}</div>
      )}

      {notes && <NotesView notes={notes} saved={saved} onSave={saveNotes} />}
    </div>
  );
}

function NotesView({ notes, saved, onSave }) {
  const scope = notes.scope ?? {};

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Scope badge */}
      <div className="card p-5 bg-gradient-to-br from-violet-50 to-indigo-50 border-violet-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
            <Target className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <p className="font-semibold text-violet-900">Topic Scope</p>
            <p className="text-xs text-violet-500">{notes.topic}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/70 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-violet-700">{scope.main_concepts_count ?? "?"}</p>
            <p className="text-xs text-violet-500 mt-0.5">Key Concepts</p>
          </div>
          <div className="bg-white/70 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-indigo-700">
              {scope.estimated_questions ? `${scope.estimated_questions.min}–${scope.estimated_questions.max}` : "?"}
            </p>
            <p className="text-xs text-indigo-500 mt-0.5">Possible Questions</p>
          </div>
          <div className="bg-white/70 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-violet-700">{scope.subtopics?.length ?? "?"}</p>
            <p className="text-xs text-violet-500 mt-0.5">Subtopics</p>
          </div>
        </div>
        {scope.subtopics?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {scope.subtopics.map((s, i) => (
              <span key={i} className="badge bg-white/80 text-violet-700 border border-violet-200">{s}</span>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-800">Summary</h2>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">{notes.summary}</p>
      </div>

      {/* Key concepts */}
      {notes.key_concepts?.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <h2 className="font-semibold text-gray-800">Key Concepts</h2>
            <span className="badge bg-amber-50 text-amber-600">{notes.key_concepts.length}</span>
          </div>
          <div className="space-y-3">
            {notes.key_concepts.map((c, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-4 hover:border-violet-200 transition-colors">
                <p className="font-semibold text-gray-800 text-sm">{c.term}</p>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{c.definition}</p>
                {c.example && (
                  <p className="text-xs text-violet-600 mt-1.5 italic bg-violet-50 rounded-lg px-3 py-1.5">
                    e.g. {c.example}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Important details */}
      {notes.important_details?.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-800 mb-3">Important Details</h2>
          <ul className="space-y-2">
            {notes.important_details.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Misconceptions */}
      {notes.common_misconceptions?.length > 0 && (
        <div className="card p-5 border-amber-100 bg-amber-50/30">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-gray-800">Common Misconceptions</h2>
          </div>
          <ul className="space-y-2">
            {notes.common_misconceptions.map((m, i) => (
              <li key={i} className="text-sm text-amber-800 flex items-start gap-2">
                <span className="mt-0.5 text-amber-400">⚠</span> {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Study tips */}
      {notes.study_tips?.length > 0 && (
        <div className="card p-5 border-emerald-100 bg-emerald-50/30">
          <h2 className="font-semibold text-gray-800 mb-3">Study Tips</h2>
          <ul className="space-y-2">
            {notes.study_tips.map((t, i) => (
              <li key={i} className="text-sm text-emerald-800 flex items-start gap-2">
                <span className="text-emerald-400">✓</span> {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.source_pages?.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          Generated from pages {notes.source_pages.join(", ")} of your uploaded material
        </p>
      )}

      {!saved ? (
        <div className="card p-4 flex items-center justify-center">
          <button onClick={onSave} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />
            Save Notes
          </button>
        </div>
      ) : (
        <div className="card p-4 flex items-center justify-center gap-2 bg-emerald-50 border-emerald-200">
          <Check className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-medium text-emerald-700">Saved</span>
        </div>
      )}
    </div>
  );
}
