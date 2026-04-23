import { useState } from "react";
import TopicSearch from "../components/TopicSearch";
import QuizView from "../components/QuizView";
import { Brain } from "lucide-react";

// Demo quiz for local testing without a backend
const DEMO_QUIZ = {
  quiz_id: "demo-001",
  topic: "Software Requirements",
  difficulty: "medium",
  questions: [
    {
      question_id: "q1",
      type: "mcq",
      question: "Which type of requirement describes what the system should do, as opposed to how it should do it?",
      options: [
        { label: "A", text: "Non-functional requirement" },
        { label: "B", text: "Functional requirement" },
        { label: "C", text: "Design constraint" },
        { label: "D", text: "System requirement" },
      ],
      answer: "B",
      explanation: "Functional requirements specify the behavior or functions of a system — what the system should do in response to particular inputs.",
      source_chunk_ids: ["chunk-001"],
      page_numbers: [3, 4],
    },
    {
      question_id: "q2",
      type: "true_false",
      question: "Non-functional requirements are always less important than functional requirements.",
      options: null,
      answer: "False",
      explanation: "Non-functional requirements (like performance, security, scalability) are equally critical — a system that meets all functional requirements but is too slow or insecure is still unacceptable.",
      source_chunk_ids: ["chunk-002"],
      page_numbers: [7],
    },
    {
      question_id: "q3",
      type: "mcq",
      question: "What is the primary purpose of a Software Requirements Specification (SRS) document?",
      options: [
        { label: "A", text: "To describe the system architecture" },
        { label: "B", text: "To serve as a contract between client and developer" },
        { label: "C", text: "To outline the testing strategy" },
        { label: "D", text: "To document the project timeline" },
      ],
      answer: "B",
      explanation: "An SRS serves as a contract-like document that clearly defines what the system must do, enabling both the client and development team to agree on scope and expectations.",
      source_chunk_ids: ["chunk-003"],
      page_numbers: [12],
    },
    {
      question_id: "q4",
      type: "short_answer",
      question: "What does the acronym SMART stand for in the context of writing good requirements?",
      options: null,
      answer: "Specific, Measurable, Achievable, Relevant, Time-bound",
      explanation: "SMART criteria help ensure requirements are precise and verifiable rather than vague or ambiguous.",
      source_chunk_ids: ["chunk-004"],
      page_numbers: [15, 16],
    },
    {
      question_id: "q5",
      type: "mcq",
      question: "Which requirements elicitation technique involves observing users in their actual work environment?",
      options: [
        { label: "A", text: "Survey" },
        { label: "B", text: "Prototyping" },
        { label: "C", text: "Ethnography" },
        { label: "D", text: "Brainstorming" },
      ],
      answer: "C",
      explanation: "Ethnography involves the analyst spending time observing and studying how end users actually work, uncovering implicit requirements that users may not think to mention in interviews.",
      source_chunk_ids: ["chunk-005"],
      page_numbers: [22],
    },
  ],
};

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
        // If backend is not ready, fall back to demo data
        console.warn("Backend unavailable — loading demo quiz");
        await new Promise((r) => setTimeout(r, 1200)); // simulate loading
        setQuiz({ ...DEMO_QUIZ, topic, difficulty });
        return;
      }

      setQuiz(await res.json());
    } catch {
      // Network error — show demo
      await new Promise((r) => setTimeout(r, 1200));
      setQuiz({ ...DEMO_QUIZ, topic, difficulty });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Generate a Quiz</h1>
        <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm">
          Enter any topic and get AI-generated questions grounded in your uploaded materials.
        </p>
      </div>

      <TopicSearch onGenerate={handleGenerate} loading={loading} />

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-100 text-red-700 rounded-2xl px-5 py-4 text-sm animate-slide-up">
          <span className="mt-0.5">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {!quiz && !loading && (
        <div className="text-center py-16 text-gray-400 dark:text-slate-500">
          <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Your quiz will appear here</p>
        </div>
      )}

      {quiz && <QuizView quiz={quiz} />}
    </div>
  );
}
