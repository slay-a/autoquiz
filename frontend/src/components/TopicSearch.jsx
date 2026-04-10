import { useState } from "react";
import { Search, Loader2, Globe, Minus, Plus } from "lucide-react";

const SUGGESTIONS = [
  "Software Requirements", "Data Structures", "Machine Learning",
  "Operating Systems", "Computer Networks", "Database Design",
];

export default function TopicSearch({ onGenerate, loading }) {
  const [topic, setTopic]             = useState("");
  const [numQuestions, setNumQ]       = useState(5);
  const [difficulty, setDifficulty]   = useState("medium");
  const [outsideSources, setOutside]  = useState(false);

  function submit(e) {
    e?.preventDefault();
    if (topic.trim() && !loading)
      onGenerate({ topic: topic.trim(), numQuestions, difficulty, outsideSources });
  }

  const diffColors = {
    easy:   "text-emerald-600 bg-emerald-50 border-emerald-200",
    medium: "text-amber-600 bg-amber-50 border-amber-200",
    hard:   "text-red-600 bg-red-50 border-red-200",
  };

  return (
    <form onSubmit={submit} className="card p-6 space-y-5">
      {/* Topic */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Topic</label>
        <div className="relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
          <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Software Requirements" className="input pl-10" />
        </div>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setTopic(s)}
              className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-violet-100 hover:text-violet-700 text-gray-600 transition-colors font-medium">
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Options row */}
      <div className="flex gap-4 flex-wrap">
        {/* Num questions */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Questions</label>
          <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
            <button type="button" onClick={() => setNumQ((n) => Math.max(1, n - 1))}
              className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-gray-500 hover:text-violet-600 shadow-sm transition-colors">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-8 text-center text-sm font-bold text-gray-800">{numQuestions}</span>
            <button type="button" onClick={() => setNumQ((n) => n + 1)}
              className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-gray-500 hover:text-violet-600 shadow-sm transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Difficulty */}
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Difficulty</label>
          <div className="flex gap-2">
            {["easy", "medium", "hard"].map((d) => (
              <button key={d} type="button" onClick={() => setDifficulty(d)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border capitalize transition-all
                  ${difficulty === d ? diffColors[d] + " border-current" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Outside sources toggle */}
      <div
        onClick={() => setOutside((v) => !v)}
        className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all
          ${outsideSources ? "border-violet-300 bg-violet-50" : "border-gray-200 hover:border-violet-200"}`}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors
          ${outsideSources ? "bg-violet-200 text-violet-700" : "bg-gray-100 text-gray-400"}`}>
          <Globe className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <p className={`text-sm font-semibold ${outsideSources ? "text-violet-800" : "text-gray-700"}`}>
            Include outside sources
          </p>
          <p className="text-xs text-gray-400">GPT draws on broader knowledge beyond your uploaded file</p>
        </div>
        <div className={`w-9 h-5 rounded-full transition-colors relative ${outsideSources ? "bg-violet-500" : "bg-gray-300"}`}>
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all
            ${outsideSources ? "left-4" : "left-0.5"}`} />
        </div>
      </div>

      {/* Submit */}
      <button type="submit" disabled={!topic.trim() || loading} className="btn-primary w-full">
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
          : <>Generate {numQuestions} Question{numQuestions !== 1 ? "s" : ""}</>
        }
      </button>
    </form>
  );
}
