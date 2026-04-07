import { useState } from "react";
import TopicSearch from "../components/TopicSearch";
import QuizView from "../components/QuizView";

export default function StudentQuiz() {
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleGenerate({ topic, numQuestions, difficulty }) {
    setLoading(true);
    setError(null);
    setQuiz(null);
    try {
      const res = await fetch("/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          num_questions: numQuestions,
          difficulty,
          question_types: ["mcq", "true_false", "short_answer"],
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Quiz generation failed");
      }
      setQuiz(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Generate a Quiz</h1>
        <p className="text-gray-500 mt-1">Enter a topic and we'll generate questions from uploaded materials.</p>
      </div>

      <TopicSearch onGenerate={handleGenerate} loading={loading} />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {quiz && <QuizView quiz={quiz} />}
    </div>
  );
}
