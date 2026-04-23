import { useState } from "react";
import { CheckCircle2, XCircle, BookOpen, Trophy, Layers } from "lucide-react";

const TYPE_LABELS = { mcq: "Multiple Choice", true_false: "True / False", short_answer: "Short Answer" };
const DIFF_BADGE  = { easy: "bg-emerald-50 text-emerald-700", medium: "bg-amber-50 text-amber-700", hard: "bg-red-50 text-red-700" };

export default function QuizView({ quiz, onMakeFlashcards }) {
  const [answers, setAnswers]   = useState({});
  const [revealed, setRevealed] = useState({});
  const [showScore, setShowScore] = useState(false);

  const questions = quiz.questions ?? [];

  function select(qid, val) {
    if (revealed[qid]) return;
    setAnswers((p) => ({ ...p, [qid]: val }));
  }

  function reveal(qid) {
    setRevealed((p) => ({ ...p, [qid]: true }));
  }

  const totalRevealed = Object.keys(revealed).length;
  const correct = questions.filter((q) =>
    revealed[q.question_id] &&
    (answers[q.question_id] ?? "").toLowerCase().trim() === q.answer.toLowerCase().trim()
  ).length;

  const wrongQuestions = questions.filter((q) =>
    revealed[q.question_id] &&
    (answers[q.question_id] ?? "").toLowerCase().trim() !== q.answer.toLowerCase().trim()
  );

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Header */}
      <div className="card px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-slate-100">{quiz.topic}</h2>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{questions.length} questions</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge capitalize ${DIFF_BADGE[quiz.difficulty] ?? DIFF_BADGE.medium}`}>
            {quiz.difficulty}
          </span>
          {totalRevealed > 0 && (
            <button onClick={() => setShowScore((p) => !p)}
              className="badge bg-violet-50 text-violet-700 cursor-pointer hover:bg-violet-100 transition-colors">
              <Trophy className="w-3 h-3" /> {correct}/{totalRevealed}
            </button>
          )}
          {wrongQuestions.length > 0 && onMakeFlashcards && (
            <button
              onClick={() => onMakeFlashcards(wrongQuestions, "wrong")}
              className="badge bg-indigo-50 text-indigo-700 cursor-pointer hover:bg-indigo-100 transition-colors"
            >
              <Layers className="w-3 h-3" /> Wrong → Flashcards
            </button>
          )}
        </div>
      </div>

      {/* Score banner */}
      {showScore && totalRevealed === questions.length && (
        <div className="card px-6 py-5 bg-gradient-to-r from-violet-500 to-indigo-600 text-white animate-slide-up">
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 opacity-90" />
            <div>
              <p className="font-bold text-lg">You scored {correct}/{questions.length}</p>
              <p className="text-sm text-violet-100">
                {correct === questions.length ? "Perfect! 🎉"
                  : correct >= questions.length * 0.8 ? "Great job! 🌟"
                  : correct >= questions.length * 0.5 ? "Keep studying! 📚"
                  : "Review and try again 💪"}
              </p>
            </div>
          </div>
          {wrongQuestions.length > 0 && onMakeFlashcards && (
            <button
              onClick={() => onMakeFlashcards(wrongQuestions, "wrong")}
              className="mt-3 flex items-center gap-2 bg-white dark:bg-slate-800/20 hover:bg-white dark:bg-slate-800/30 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            >
              <Layers className="w-4 h-4" /> Convert {wrongQuestions.length} wrong answers to flashcards
            </button>
          )}
        </div>
      )}

      {/* Questions */}
      {questions.map((q, i) => (
        <QuestionCard
          key={q.question_id}
          q={q}
          index={i}
          chosen={answers[q.question_id]}
          isRevealed={!!revealed[q.question_id]}
          onSelect={(val) => select(q.question_id, val)}
          onReveal={() => reveal(q.question_id)}
        />
      ))}
    </div>
  );
}

function QuestionCard({ q, index, chosen, isRevealed, onSelect, onReveal }) {
  const isCorrect = isRevealed && chosen?.toLowerCase().trim() === q.answer.toLowerCase().trim();

  return (
    <div className={`card overflow-hidden transition-all duration-200
      ${isRevealed ? (isCorrect ? "ring-1 ring-emerald-200" : "ring-1 ring-red-100") : ""}`}>
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-violet-100 text-violet-600 text-xs font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <div className="flex-1 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-gray-800 dark:text-slate-100 leading-relaxed">{q.question}</p>
              <span className="flex-shrink-0 text-xs font-medium text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                {TYPE_LABELS[q.type]}
              </span>
            </div>

            {/* MCQ */}
            {q.type === "mcq" && q.options && (
              <div className="space-y-2">
                {q.options.map((opt) => {
                  const isChosen = chosen === opt.label;
                  const isCorrectOpt = isRevealed && opt.label === q.answer;
                  return (
                    <button key={opt.label} onClick={() => onSelect(opt.label)} disabled={isRevealed}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm text-left transition-all
                        ${isRevealed
                          ? isCorrectOpt ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                          : isChosen ? "bg-red-50 border-red-200 text-red-700"
                          : "bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700 text-gray-400 dark:text-slate-500"
                          : isChosen ? "bg-violet-50 border-violet-300 text-violet-800"
                          : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-violet-200 hover:bg-violet-50/30"
                        }`}>
                      <span className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold
                        ${isRevealed ? isCorrectOpt ? "bg-emerald-200 text-emerald-800"
                          : isChosen ? "bg-red-200 text-red-700" : "bg-gray-200 text-gray-500 dark:text-slate-400"
                          : isChosen ? "bg-violet-200 text-violet-700" : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400"}`}>
                        {opt.label}
                      </span>
                      {opt.text}
                      {isRevealed && isCorrectOpt && <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto" />}
                      {isRevealed && isChosen && !isCorrectOpt && <XCircle className="w-4 h-4 text-red-400 ml-auto" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* True/False */}
            {q.type === "true_false" && (
              <div className="flex gap-2">
                {["True", "False"].map((val) => {
                  const isChosen = chosen === val;
                  const isCorrectOpt = isRevealed && val === q.answer;
                  return (
                    <button key={val} onClick={() => onSelect(val)} disabled={isRevealed}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all
                        ${isRevealed ? isCorrectOpt ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                          : isChosen ? "bg-red-50 border-red-200 text-red-600"
                          : "bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700 text-gray-400 dark:text-slate-500"
                          : isChosen ? "bg-violet-50 border-violet-300 text-violet-700"
                          : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-violet-200"}`}>
                      {val}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Short answer */}
            {q.type === "short_answer" && !isRevealed && (
              <input type="text" placeholder="Type your answer…"
                value={chosen ?? ""} onChange={(e) => onSelect(e.target.value)} className="input" />
            )}
          </div>
        </div>
      </div>

      {!isRevealed && (
        <div className="px-6 pb-5">
          <button onClick={onReveal} className="btn-secondary text-xs w-full">
            <BookOpen className="w-3.5 h-3.5" /> Reveal Answer
          </button>
        </div>
      )}

      {isRevealed && (
        <div className={`mx-6 mb-5 rounded-xl px-4 py-3.5 space-y-1.5
          ${isCorrect ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}`}>
          <div className="flex items-center gap-2">
            {isCorrect
              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              : <XCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
            <p className={`text-sm font-semibold ${isCorrect ? "text-emerald-800" : "text-amber-800"}`}>
              Answer: {q.answer}
            </p>
          </div>
          <p className={`text-xs leading-relaxed pl-6 ${isCorrect ? "text-emerald-700" : "text-amber-700"}`}>
            {q.explanation}
          </p>
          {q.page_numbers?.length > 0 && (
            <p className="text-xs text-gray-400 dark:text-slate-500 pl-6">Source: p. {q.page_numbers.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
