import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import QuizView from "../components/QuizView";
import { Loader2, ChevronLeft, RefreshCw, Layers, Save } from "lucide-react";

export default function QuizStudy() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchQuiz(); }, [id]);

  async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session?.access_token}`,
    };
  }

  async function fetchQuiz() {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/quiz/${id}`, { headers });
      if (!res.ok) { setQuiz(null); return; }
      setQuiz(await res.json());
    } catch {
      setQuiz(null);
    } finally {
      setLoading(false);
    }
  }

  async function regenerate() {
    if (!quiz) return;
    setRegenerating(true);
    try {
      const headers = await getAuthHeaders();

      const genRes = await fetch(`${import.meta.env.VITE_API_URL || ""}/quiz/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          topic: quiz.topic,
          num_questions: quiz.questions.length,
          difficulty: quiz.difficulty,
          question_types: [...new Set(quiz.questions.map(q => q.type))],
          outside_sources: quiz.outside_sources,
          file_id: quiz.file_id || null,
        }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.detail || "Regeneration failed");

      const saveRes = await fetch(`${import.meta.env.VITE_API_URL || ""}/quiz/save`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: `${quiz.topic} — ${quiz.difficulty} (v2)`,
          topic: quiz.topic,
          difficulty: quiz.difficulty,
          file_id: quiz.file_id || null,
          class_id: quiz.class_id || null,
          outside_sources: quiz.outside_sources,
          questions: genData.questions,
        }),
      });
      const saved = await saveRes.json();
      if (!saveRes.ok) throw new Error(saved.detail || "Save failed");

      navigate(`/quiz/${saved.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setRegenerating(false);
    }
  }

  async function makeFlashcards(questionsToUse) {
    const cards = questionsToUse.map((q) => ({
      front: q.question,
      back: q.answer,
      explanation: q.explanation,
      source_page: q.page_numbers,
    }));

    const headers = await getAuthHeaders();
    const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/flashcards/`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: `${quiz.topic} Flashcards`,
        quiz_id: quiz.id,
        class_id: quiz.class_id || null,
        is_shared: false,
        cards,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      navigate(`/flashcards/${data.id}`);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>;
  if (!quiz) return <p className="text-gray-500 dark:text-slate-400">Quiz not found.</p>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link to="/student" className="inline-flex items-center gap-1 text-sm text-gray-400 dark:text-slate-500 hover:text-violet-600 mb-3">
          <ChevronLeft className="w-4 h-4" /> Back
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">{quiz.title}</h1>
          <div className="flex items-center gap-2">
            <button onClick={regenerate} disabled={regenerating} className="btn-secondary text-xs">
              <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} />
              {regenerating ? "Regenerating…" : "Regenerate"}
            </button>
            <button onClick={() => makeFlashcards(quiz.questions)} className="btn-secondary text-xs">
              <Layers className="w-3.5 h-3.5" /> All → Flashcards
            </button>
          </div>
        </div>
      </div>

      <QuizView quiz={quiz} onMakeFlashcards={makeFlashcards} />
    </div>
  );
}
