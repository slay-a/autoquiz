import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { ChevronLeft, Loader2, BookOpen, Lightbulb, AlertCircle, Target } from "lucide-react";

export default function ClassNoteView() {
  const { id } = useParams();
  const { profile } = useAuth();
  const [note, setNote]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("class_notes").select("*").eq("id", id).single()
      .then(({ data }) => { setNote(data); setLoading(false); });
  }, [id]);

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
    </div>
  );
  if (!note) return <p className="text-gray-500">Note not found.</p>;

  // Security: students cannot view unpublished notes
  if (profile?.role === 'student' && !note.is_published) {
    return <p className="text-gray-500">This note is not available.</p>;
  }

  const c = note.content ?? {};

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <Link to="/student" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-violet-600 mb-3">
          <ChevronLeft className="w-4 h-4" /> Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{note.title}</h1>
        <p className="text-sm text-gray-400 mt-1">{new Date(note.created_at).toLocaleDateString()}</p>
      </div>

      {/* Summary */}
      {c.summary && (
        <div className="card p-5 border-violet-100 bg-violet-50/30">
          <h2 className="text-xs font-semibold text-violet-500 uppercase tracking-wide mb-2">Overview</h2>
          <p className="text-gray-700 leading-relaxed">{c.summary}</p>
        </div>
      )}

      {/* Key Concepts */}
      {c.key_concepts?.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-violet-500" /> Key Concepts
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {c.key_concepts.map((kc, i) => (
              <div key={i} className="card p-4 space-y-1.5">
                <p className="font-semibold text-gray-900 text-sm">{kc.term}</p>
                <p className="text-sm text-gray-600 leading-relaxed">{kc.definition}</p>
                {kc.example && (
                  <p className="text-xs text-gray-400 italic">e.g. {kc.example}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Important Details */}
      {c.important_details?.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Target className="w-4 h-4 text-indigo-500" /> Important Details
          </h2>
          <div className="card p-5">
            <ul className="space-y-2">
              {c.important_details.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Common Misconceptions */}
      {c.common_misconceptions?.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" /> Common Misconceptions
          </h2>
          <div className="card p-5 border-amber-100 bg-amber-50/20">
            <ul className="space-y-2">
              {c.common_misconceptions.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Study Tips */}
      {c.study_tips?.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-emerald-500" /> Study Tips
          </h2>
          <div className="card p-5 border-emerald-100 bg-emerald-50/20">
            <ul className="space-y-2">
              {c.study_tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Source pages */}
      {c.source_pages?.length > 0 && (
        <p className="text-xs text-gray-400 pb-8">
          Source pages: {c.source_pages.join(", ")}
        </p>
      )}
    </div>
  );
}
