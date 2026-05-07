import { useState } from "react";
import { CheckCircle2, XCircle, Trophy, Layers, Send, ThumbsUp, ThumbsDown } from "lucide-react";

const TYPE_LABELS = { mcq: "Multiple Choice", true_false: "True / False", short_answer: "Short Answer" };
const DIFF_BADGE  = { easy: "bg-emerald-50 text-emerald-700", medium: "bg-amber-50 text-amber-700", hard: "bg-red-50 text-red-700" };

export default function QuizView({ quiz, onMakeFlashcards }) {
  // answers: { [question_id]: string }
  const [answers, setAnswers]         = useState({});
  // saAssess: { [question_id]: "right" | "wrong" | null }
  const [saAssess, setSaAssess]       = useState({});
  const [submitted, setSubmitted]     = useState(false);
  const [showScore, setShowScore]     = useState(false);

  const questions    = quiz.questions ?? [];
  const gradedQ      = questions.filter((q) => q.type === "mcq" || q.type === "true_false");
  const saQuestions  = questions.filter((q) => q.type === "short_answer");
  const hasSA        = saQuestions.length > 0;

  function selectChoice(qid, val) {
    if (submitted) return;
    setAnswers((p) => ({ ...p, [qid]: val }));
  }

  function handleSAInput(qid, val) {
    if (submitted) return;
    setAnswers((p) => ({ ...p, [qid]: val }));
  }

  function setAssess(qid, verdict) {
    if (!submitted) return;
    setSaAssess((p) => ({ ...p, [qid]: verdict }));
  }

  function submit() {
    setSubmitted(true);
    setShowScore(true);
  }

  const answeredCount = questions.filter((q) => {
    const a = answers[q.question_id];
    if (q.type === "short_answer") return a != null && String(a).trim() !== "";
    return a != null;
  }).length;

  // Scoring is MCQ + TF only
  const correct = gradedQ.filter(
    (q) => submitted && (answers[q.question_id] ?? "").toLowerCase().trim() === q.answer.toLowerCase().trim()
  ).length;

  // Wrong pool: MCQ/TF auto-wrong + SA self-marked wrong
  const mcqTfWrong = gradedQ.filter(
    (q) => submitted && (answers[q.question_id] ?? "").toLowerCase().trim() !== q.answer.toLowerCase().trim()
  );
  const saWrong = saQuestions.filter(
    (q) => submitted && saAssess[q.question_id] === "wrong"
  );
  const wrongQuestions = [...mcqTfWrong, ...saWrong];

  const totalGraded = gradedQ.length;

  // Score band copy
  const scoreMsg =
    correct === totalGraded   ? "Perfect!"
    : correct >= totalGraded * 0.8 ? "Great job!"
    : correct >= totalGraded * 0.5 ? "Keep studying!"
    : "Review and try again";

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Header */}
      <div className="card px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-slate-100">{quiz.topic}</h2>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
            {questions.length} questions
            {!submitted && ` · ${answeredCount}/${questions.length} answered`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge capitalize ${DIFF_BADGE[quiz.difficulty] ?? DIFF_BADGE.medium}`}>
            {quiz.difficulty}
          </span>
          {submitted && (
            <button onClick={() => setShowScore((p) => !p)}
              className="badge bg-violet-50 text-violet-700 cursor-pointer hover:bg-violet-100 transition-colors">
              <Trophy className="w-3 h-3" /> {correct}/{totalGraded}
            </button>
          )}
          {submitted && wrongQuestions.length > 0 && onMakeFlashcards && (
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
      {submitted && showScore && (
        <div className="card px-6 py-5 bg-gradient-to-r from-violet-500 to-indigo-600 text-white animate-slide-up">
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 opacity-90" />
            <div>
              <p className="font-bold text-lg">You scored {correct}/{totalGraded}</p>
              <p className="text-sm text-violet-100">{scoreMsg}</p>
            </div>
          </div>
          {hasSA && (
            <p className="mt-2 text-xs text-violet-200">
              Short-answer questions are for self-review and not counted in the score.
            </p>
          )}
          {wrongQuestions.length > 0 && onMakeFlashcards && (
            <button
              onClick={() => onMakeFlashcards(wrongQuestions, "wrong")}
              className="mt-3 flex items-center gap-2 bg-white/20 hover:bg-white/30 dark:bg-slate-900/30 dark:hover:bg-slate-900/40 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
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
          saAssessment={saAssess[q.question_id]}
          submitted={submitted}
          onSelect={(val) => selectChoice(q.question_id, val)}
          onSAInput={(val) => handleSAInput(q.question_id, val)}
          onAssess={(verdict) => setAssess(q.question_id, verdict)}
        />
      ))}

      {/* Submit */}
      {!submitted && questions.length > 0 && (
        <div className="card px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-500 dark:text-slate-400">
            {answeredCount < questions.length
              ? `${questions.length - answeredCount} question${questions.length - answeredCount === 1 ? "" : "s"} unanswered`
              : "All questions answered"}
          </p>
          <button
            onClick={submit}
            disabled={answeredCount === 0}
            className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" /> Submit Quiz
          </button>
        </div>
      )}
    </div>
  );
}

function QuestionCard({ q, index, chosen, saAssessment, submitted, onSelect, onSAInput, onAssess }) {
  const isGraded  = q.type === "mcq" || q.type === "true_false";
  const isCorrect = isGraded && submitted && (chosen ?? "").toLowerCase().trim() === q.answer.toLowerCase().trim();

  return (
    <div className={`card overflow-hidden transition-all duration-200
      ${submitted && isGraded ? (isCorrect ? "ring-1 ring-emerald-200" : "ring-1 ring-red-100") : ""}`}>
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-violet-100 text-violet-600 text-xs font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <div className="flex-1 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-gray-800 dark:text-slate-100 leading-relaxed">{q.question}</p>
              <span className="flex-shrink-0 text-xs font-medium text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                {TYPE_LABELS[q.type] ?? q.type}
              </span>
            </div>

            {/* MCQ */}
            {q.type === "mcq" && q.options && (
              <div className="space-y-2">
                {q.options.map((opt) => {
                  const isChosen = chosen === opt.label;
                  const isCorrectOpt = submitted && opt.label === q.answer;
                  return (
                    <button key={opt.label} onClick={() => onSelect(opt.label)} disabled={submitted}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm text-left transition-all
                        ${submitted
                          ? isCorrectOpt ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                          : isChosen ? "bg-red-50 border-red-200 text-red-700"
                          : "bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700 text-gray-400 dark:text-slate-500"
                          : isChosen ? "bg-violet-50 border-violet-300 text-violet-800"
                          : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-violet-200 hover:bg-violet-50/30"
                        }`}>
                      <span className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold
                        ${submitted ? isCorrectOpt ? "bg-emerald-200 text-emerald-800"
                          : isChosen ? "bg-red-200 text-red-700" : "bg-gray-200 text-gray-500 dark:text-slate-400"
                          : isChosen ? "bg-violet-200 text-violet-700" : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400"}`}>
                        {opt.label}
                      </span>
                      {opt.text}
                      {submitted && isCorrectOpt && <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto" />}
                      {submitted && isChosen && !isCorrectOpt && <XCircle className="w-4 h-4 text-red-400 ml-auto" />}
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
                  const isCorrectOpt = submitted && val === q.answer;
                  return (
                    <button key={val} onClick={() => onSelect(val)} disabled={submitted}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all
                        ${submitted ? isCorrectOpt ? "bg-emerald-50 border-emerald-300 text-emerald-700"
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

            {/* Short Answer */}
            {q.type === "short_answer" && (
              <div className="space-y-2">
                {!submitted ? (
                  <input
                    type="text"
                    placeholder="Type your answer…"
                    value={chosen ?? ""}
                    onChange={(e) => onSAInput(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-300"
                  />
                ) : (
                  /* Self-assess toggle */
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => onAssess("right")}
                      aria-label="I got this right"
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-semibold transition-all
                        ${saAssessment === "right"
                          ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                          : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-emerald-200"}`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" /> I got this right
                    </button>
                    <button
                      onClick={() => onAssess("wrong")}
                      aria-label="I got this wrong"
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-semibold transition-all
                        ${saAssessment === "wrong"
                          ? "bg-red-50 border-red-200 text-red-600"
                          : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-red-200"}`}
                    >
                      <ThumbsDown className="w-3.5 h-3.5" /> I got this wrong
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Post-submission reveal */}
      {submitted && (
        <div className={`mx-6 mb-5 rounded-xl px-4 py-3.5 space-y-1.5
          ${isGraded
            ? isCorrect ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"
            : "bg-blue-50 border border-blue-200"}`}>
          <div className="flex items-center gap-2">
            {isGraded
              ? isCorrect
                ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                : <XCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              : <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0" />}
            <p className={`text-sm font-semibold ${isGraded ? (isCorrect ? "text-emerald-800" : "text-amber-800") : "text-blue-800"}`}>
              Answer: {q.answer}
            </p>
          </div>
          <p className={`text-xs leading-relaxed pl-6 ${isGraded ? (isCorrect ? "text-emerald-700" : "text-amber-700") : "text-blue-700"}`}>
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
