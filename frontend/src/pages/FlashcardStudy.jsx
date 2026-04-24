import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ChevronLeft, ChevronRight, RotateCcw, CheckCircle2, XCircle, MinusCircle, Trophy, Loader2, Edit3 } from "lucide-react";

export default function FlashcardStudy() {
  const { id } = useParams();
  const [set, setSet] = useState(null);
  const [cards, setCards] = useState([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState({}); // cardIdx → 'know' | 'almost' | 'nope'
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchSet(); }, [id]);

  async function fetchSet() {
    const { data } = await supabase.from("flashcard_sets").select("*").eq("id", id).single();
    setSet(data);
    setCards(data?.cards ?? []);
    setLoading(false);
  }

  function handleResult(result) {
    setResults((p) => ({ ...p, [index]: result }));
    setFlipped(false);
    if (index + 1 >= cards.length) {
      setDone(true);
    } else {
      setTimeout(() => setIndex((i) => i + 1), 250);
    }
  }

  function restart(onlyMissed = false) {
    if (onlyMissed) {
      const missed = cards.filter((_, i) => results[i] === "nope");
      setCards(missed.length > 0 ? missed : cards);
    } else {
      setCards(set?.cards ?? []);
    }
    setIndex(0);
    setFlipped(false);
    setResults({});
    setDone(false);
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>;
  if (!set || cards.length === 0) return <p className="text-gray-500 dark:text-slate-400">Flashcard set not found or empty.</p>;

  const card = cards[index];
  const know  = Object.values(results).filter((r) => r === "know").length;
  const almost = Object.values(results).filter((r) => r === "almost").length;
  const nope  = Object.values(results).filter((r) => r === "nope").length;

  if (done) {
    return (
      <div className="space-y-6 animate-fade-in max-w-md mx-auto">
        <Link to="/student" className="inline-flex items-center gap-1 text-sm text-gray-400 dark:text-slate-500 hover:text-violet-600">
          <ChevronLeft className="w-4 h-4" /> Back
        </Link>
        <div className="card p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-violet-200">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Round complete!</h2>
            <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">{set.title}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-emerald-700">{know}</p>
              <p className="text-xs text-emerald-600 mt-0.5">Got it</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-amber-700">{almost}</p>
              <p className="text-xs text-amber-600 mt-0.5">Almost</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-red-700">{nope}</p>
              <p className="text-xs text-red-600 mt-0.5">Missed</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button onClick={() => restart(true)} className="btn-primary w-full">
              {nope > 0 ? `Study missed cards (${nope})` : "Retry Missed"}
            </button>
            <button onClick={() => restart(false)} className="btn-secondary w-full">
              <RotateCcw className="w-4 h-4" /> Restart all
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-xl mx-auto">
      <div className="flex items-center justify-between">
        <Link to="/student" className="inline-flex items-center gap-1 text-sm text-gray-400 dark:text-slate-500 hover:text-violet-600">
          <ChevronLeft className="w-4 h-4" /> Back
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-slate-400">{index + 1} / {cards.length}</span>
          <Link to={`/flashcards/${id}/edit`} className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500 hover:text-violet-600 transition-colors">
            <Edit3 className="w-3.5 h-3.5" /> Edit set
          </Link>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${((index) / cards.length) * 100}%` }}
        />
      </div>

      {/* Card */}
      <div
        className="relative cursor-pointer"
        style={{ perspective: "1000px" }}
        onClick={() => setFlipped((f) => !f)}
      >
        <div
          className="relative w-full transition-transform duration-500"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            minHeight: "260px",
          }}
        >
          {/* Front */}
          <div className="absolute inset-0 card p-8 flex flex-col items-center justify-center text-center"
            style={{ backfaceVisibility: "hidden" }}>
            <p className="text-xs font-semibold text-violet-400 uppercase tracking-wide mb-4">Question</p>
            <p className="text-lg font-medium text-gray-800 dark:text-slate-100 leading-relaxed">{card.front}</p>
            <p className="text-xs text-gray-300 dark:text-slate-600 mt-6">Tap to reveal answer</p>
          </div>

          {/* Back */}
          <div className="absolute inset-0 card p-8 flex flex-col items-center justify-center text-center bg-violet-50 border-violet-200"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            <p className="text-xs font-semibold text-violet-500 uppercase tracking-wide mb-4">Answer</p>
            <p className="text-xl font-bold text-violet-900 leading-relaxed">{card.back}</p>
            {card.explanation && (
              <p className="text-sm text-violet-600 mt-3 leading-relaxed">{card.explanation}</p>
            )}
            {card.source_page?.length > 0 && (
              <p className="text-xs text-violet-400 mt-3">p. {card.source_page.join(", ")}</p>
            )}
          </div>
        </div>
      </div>

      {/* Rate buttons — only show after flip */}
      {flipped && (
        <div className="grid grid-cols-3 gap-3 animate-slide-up">
          <button
            onClick={() => handleResult("nope")}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-red-200 bg-red-50 hover:bg-red-100 text-red-600 transition-all active:scale-95"
          >
            <XCircle className="w-6 h-6" />
            <span className="text-sm font-semibold">Missed</span>
          </button>
          <button
            onClick={() => handleResult("almost")}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-600 transition-all active:scale-95"
          >
            <MinusCircle className="w-6 h-6" />
            <span className="text-sm font-semibold">Almost</span>
          </button>
          <button
            onClick={() => handleResult("know")}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-all active:scale-95"
          >
            <CheckCircle2 className="w-6 h-6" />
            <span className="text-sm font-semibold">Got it!</span>
          </button>
        </div>
      )}

      {/* Skip */}
      {!flipped && (
        <div className="flex justify-center gap-4">
          {index > 0 && (
            <button onClick={() => { setIndex((i) => i - 1); setFlipped(false); }}
              className="text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:text-slate-300 flex items-center gap-1">
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
          )}
          <button onClick={() => setFlipped(true)} className="text-xs text-violet-500 hover:text-violet-700 font-medium">
            Reveal answer
          </button>
        </div>
      )}
    </div>
  );
}
