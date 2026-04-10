import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import Upload from "../../components/Upload";
import TopicSearch from "../../components/TopicSearch";
import QuizView from "../../components/QuizView";
import { Loader2, Save, RefreshCw, Layers, ChevronLeft, Copy, Check, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { genShareCode, copyToClipboard, shareUrl } from "../../lib/sharing";

export default function Generate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [uploadedFile, setUploadedFile] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [lastParams, setLastParams] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  async function generate(params) {
    setLoading(true);
    setError(null);
    setQuiz(null);
    setSavedId(null);
    setLastParams(params);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/quiz/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: params.topic,
          num_questions: params.numQuestions,
          difficulty: params.difficulty,
          question_types: ["mcq", "true_false", "short_answer"],
          outside_sources: params.outsideSources,
          file_id: uploadedFile?.file_id || null,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Generation failed");
      }
      const data = await res.json();
      setQuiz({ ...data, topic: params.topic, difficulty: params.difficulty });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveQuiz() {
    if (!quiz) return;
    setSaving(true);
    const { data, error } = await supabase.from("saved_quizzes").insert({
      title: `${quiz.topic} — ${quiz.difficulty}`,
      topic: quiz.topic,
      difficulty: quiz.difficulty,
      file_id: uploadedFile?.file_id || null,
      created_by: user.id,
      is_shared: false,
      outside_sources: lastParams?.outsideSources ?? false,
      questions: quiz.questions,
    }).select().single();

    setSaving(false);
    if (!error) setSavedId(data.id);
  }

  async function copyShare() {
    if (!savedId) return;
    await copyToClipboard(shareUrl("quiz", savedId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function makeFlashcards(questionsToUse, setType = "custom") {
    if (!quiz) return;
    const cards = questionsToUse.map((q) => ({
      front: q.question,
      back: q.answer,
      explanation: q.explanation,
      source_page: q.page_numbers,
    }));

    const setTitle = setType === "all"
      ? `${quiz.topic} — All Cards`
      : setType === "wrong"
      ? `${quiz.topic} — Missed Cards`
      : `${quiz.topic} Flashcards`;

    // Dedup: delete existing set of same type for same quiz if it exists
    if (savedId && (setType === "all" || setType === "wrong")) {
      await supabase.from("flashcard_sets")
        .delete()
        .eq("quiz_id", savedId)
        .eq("set_type", setType)
        .eq("created_by", user.id);
    }

    const { data } = await supabase.from("flashcard_sets").insert({
      title: setTitle,
      quiz_id: savedId || null,
      created_by: user.id,
      is_shared: false,
      set_type: setType,
      cards,
    }).select().single();

    if (data) navigate(`/flashcards/${data.id}`);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <Link to="/student" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-violet-600 mb-3">
          <ChevronLeft className="w-4 h-4" /> Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Generate a Quiz</h1>
        <p className="text-gray-500 mt-1 text-sm">Upload a file (optional), enter a topic, and get AI-generated questions.</p>
      </div>

      {/* Upload */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Source Material <span className="text-gray-400 font-normal">(optional)</span></h2>
          {uploadedFile && (
            <span className="badge bg-emerald-50 text-emerald-600">
              ✓ {uploadedFile.filename}
            </span>
          )}
        </div>
        {!uploadedFile
          ? <Upload onSuccess={(f) => setUploadedFile(f)} />
          : <button onClick={() => setUploadedFile(null)} className="text-xs text-gray-400 hover:text-red-400 transition-colors">Remove file</button>
        }
      </div>

      {/* Generate form */}
      <TopicSearch onGenerate={generate} loading={loading} />

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-4 text-sm text-red-600 animate-slide-up">
          {error}
        </div>
      )}

      {/* Quiz result */}
      {quiz && (
        <div className="space-y-4 animate-slide-up">
          {/* Action bar */}
          <div className="card p-4 flex flex-wrap items-center gap-3">
            {/* Save */}
            {savedId ? (
              <span className="badge bg-emerald-50 text-emerald-600">✓ Saved</span>
            ) : (
              <button onClick={saveQuiz} disabled={saving} className="btn-secondary text-xs">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Quiz
              </button>
            )}

            {/* Regenerate */}
            <button onClick={() => generate(lastParams)} disabled={loading} className="btn-secondary text-xs">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Regenerate
            </button>

            {/* Flashcards */}
            <button onClick={() => makeFlashcards(quiz.questions, "all")} className="btn-secondary text-xs">
              <Layers className="w-3.5 h-3.5" /> All → Flashcards
            </button>

            {/* Share */}
            {savedId && (
              <button onClick={copyShare} className="btn-secondary text-xs">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Share link"}
              </button>
            )}

            {/* Notes */}
            <Link
              to="/notes"
              state={{ topic: quiz.topic, file_id: uploadedFile?.file_id }}
              className="btn-secondary text-xs"
            >
              <FileText className="w-3.5 h-3.5" /> Study Notes
            </Link>
          </div>

          <QuizView
            quiz={quiz}
            onMakeFlashcards={makeFlashcards}
          />
        </div>
      )}
    </div>
  );
}
