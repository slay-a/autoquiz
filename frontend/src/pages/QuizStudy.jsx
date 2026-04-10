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

  async function fetchQuiz() {
    setLoading(true);
    const { data } = await supabase.from("saved_quizzes").select("*").eq("id", id).single();
    setQuiz(data);
    setLoading(false);
  }

  async function regenerate() {
    if (!quiz) return;
    setRegenerating(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/quiz/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: quiz.topic,
          num_questions: quiz.questions.length,
          difficulty: quiz.difficulty,
          question_types: ["mcq", "true_false", "short_answer"],
          outside_sources: quiz.outside_sources,
          file_id: quiz.file_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Regeneration failed");

      // Save as a new version
      const { data: saved } = await supabase.from("saved_quizzes").insert({
        title: `${quiz.topic} — ${quiz.difficulty} (v2)`,
        topic: quiz.topic,
        difficulty: quiz.difficulty,
        file_id: quiz.file_id,
        created_by: user.id,
        class_id: quiz.class_id,
        is_shared: quiz.is_shared,
        outside_sources: quiz.outside_sources,
        questions: data.questions,
      }).select().single();

      if (saved) navigate(`/quiz/${saved.id}`);
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

    const { data } = await supabase.from("flashcard_sets").insert({
      title: `${quiz.topic} Flashcards`,
      quiz_id: quiz.id,
      created_by: user.id,
      class_id: quiz.class_id || null,
      is_shared: false,
      cards,
    }).select().single();

    if (data) navigate(`/flashcards/${data.id}`);
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>;
  if (!quiz) return <p className="text-gray-500">Quiz not found.</p>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link to="/student" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-violet-600 mb-3">
          <ChevronLeft className="w-4 h-4" /> Back
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">{quiz.title}</h1>
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
