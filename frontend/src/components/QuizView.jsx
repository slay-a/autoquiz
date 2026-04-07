import { useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";

export default function QuizView({ quiz }) {
  const [revealed, setRevealed] = useState({});

  function toggle(id) {
    setRevealed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          {quiz.questions.length} Questions — {quiz.topic}
        </h2>
        <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded-full capitalize">
          {quiz.difficulty}
        </span>
      </div>

      {quiz.questions.map((q, i) => (
        <div key={q.question_id} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <p className="text-sm font-medium text-gray-800">
            <span className="text-brand-600 mr-2">Q{i + 1}.</span>
            {q.question}
          </p>

          {/* MCQ options */}
          {q.type === "mcq" && q.options && (
            <ul className="space-y-1">
              {q.options.map((opt) => (
                <li key={opt.label} className="text-sm text-gray-700">
                  <span className="font-medium text-gray-500 mr-2">{opt.label}.</span>
                  {opt.text}
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={() => toggle(q.question_id)}
            className="text-xs text-brand-600 hover:underline font-medium"
          >
            {revealed[q.question_id] ? "Hide answer" : "Show answer"}
          </button>

          {revealed[q.question_id] && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-green-800">Answer: {q.answer}</p>
              <p className="text-xs text-green-700">{q.explanation}</p>
              <p className="text-xs text-gray-400 mt-1">
                Source: p.{q.page_numbers.join(", ")}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
