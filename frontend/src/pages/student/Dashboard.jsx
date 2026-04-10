import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import {
  BookOpen, Layers, PlusCircle, Users, FileText,
  Loader2, LogIn, Globe, Lock
} from "lucide-react";

export default function StudentDashboard() {
  const { user, profile } = useAuth();
  const [tab, setTab]               = useState("quizzes");
  const [myQuizzes, setMyQuizzes]   = useState([]);
  const [classQuizzes, setClassQuizzes] = useState([]);
  const [flashcardSets, setFlashcardSets] = useState([]);
  const [classes, setClasses]       = useState([]);
  const [classNotes, setClassNotes] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [joinCode, setJoinCode]     = useState("");
  const [joining, setJoining]       = useState(false);
  const [joinError, setJoinError]   = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    fetchAll();
  }, [user]);

  async function fetchAll() {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [
        { data: myQ },
        { data: fsets },
        { data: memberships },
      ] = await Promise.all([
        supabase.from("saved_quizzes").select("*").eq("created_by", user.id).order("created_at", { ascending: false }),
        supabase.from("flashcard_sets").select("*").eq("created_by", user.id).order("created_at", { ascending: false }),
        supabase.from("class_members")
          .select("class_id, classes(id, name, class_code, saved_quizzes(*), class_notes(*))")
          .eq("student_id", user.id),
      ]);

      setMyQuizzes(myQ ?? []);
      setFlashcardSets(fsets ?? []);

      const joinedClasses = (memberships ?? [])
        .map((m) => m.classes)
        .filter(Boolean);
      setClasses(joinedClasses);

      // Only show quizzes explicitly shared by instructor
      const sharedQs = joinedClasses.flatMap((c) =>
        (c.saved_quizzes ?? [])
          .filter((q) => q.is_shared)
          .map((q) => ({ ...q, className: c.name }))
      );
      setClassQuizzes(sharedQs);

      // Only show published notes
      const publishedNotes = joinedClasses.flatMap((c) =>
        (c.class_notes ?? [])
          .filter((n) => n.is_published)
          .map((n) => ({ ...n, className: c.name }))
      );
      setClassNotes(publishedNotes);
    } finally {
      setLoading(false);
    }
  }

  async function joinClass() {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      const { data: cls, error } = await supabase
        .from("classes")
        .select("id, name")
        .eq("class_code", joinCode.trim().toUpperCase())
        .single();

      if (error || !cls) { setJoinError("Class not found. Check the code and try again."); return; }

      const { data: existing } = await supabase
        .from("class_members")
        .select("class_id")
        .eq("class_id", cls.id)
        .eq("student_id", user.id)
        .single();

      if (existing) { setJoinError("You're already in this class."); return; }

      await supabase.from("class_members").insert({ class_id: cls.id, student_id: user.id });
      setJoinCode("");
      fetchAll();
    } finally {
      setJoining(false);
    }
  }

  const tabs = [
    { key: "quizzes",    label: "My Quizzes",    count: myQuizzes.length },
    { key: "class",      label: "Class Quizzes",  count: classQuizzes.length },
    { key: "notes",      label: "Class Notes",    count: classNotes.length },
    { key: "flashcards", label: "Flashcards",     count: flashcardSets.length },
    { key: "classes",    label: "My Classes",     count: classes.length },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Hey, {profile?.full_name?.split(" ")[0]} 👋
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Your study hub — quizzes, flashcards, notes.</p>
        </div>
        <Link to="/student/generate" className="btn-primary">
          <PlusCircle className="w-4 h-4" /> Generate Quiz
        </Link>
      </div>

      {/* Join class */}
      <div className="card p-4 flex items-center gap-3">
        <LogIn className="w-5 h-5 text-violet-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Enter class code to join (e.g. AB3X9Y)"
          value={joinCode}
          onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(null); }}
          className="input flex-1"
          onKeyDown={(e) => e.key === "Enter" && joinClass()}
        />
        <button onClick={joinClass} disabled={joining || !joinCode.trim()} className="btn-primary whitespace-nowrap">
          {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : "Join"}
        </button>
        {joinError && <p className="text-xs text-red-500">{joinError}</p>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5
              ${tab === t.key ? "bg-white text-violet-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold
                ${tab === t.key ? "bg-violet-100 text-violet-600" : "bg-gray-200 text-gray-500"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
      ) : (
        <>
          {tab === "quizzes"    && <QuizList quizzes={myQuizzes} emptyMsg="You haven't generated any quizzes yet." />}
          {tab === "class"      && <QuizList quizzes={classQuizzes} emptyMsg="No quizzes shared by instructors yet." showClass />}
          {tab === "notes"      && <NotesList notes={classNotes} />}
          {tab === "flashcards" && <FlashcardList sets={flashcardSets} />}
          {tab === "classes"    && <ClassList classes={classes} />}
        </>
      )}
    </div>
  );
}

function QuizList({ quizzes, emptyMsg, showClass }) {
  if (!quizzes.length) return (
    <div className="card p-10 text-center text-gray-400 space-y-2">
      <BookOpen className="w-8 h-8 mx-auto opacity-40" />
      <p className="text-sm">{emptyMsg}</p>
    </div>
  );
  return (
    <div className="space-y-3">
      {quizzes.map((q) => (
        <div key={q.id} className="card p-4 flex items-center gap-4 hover:border-violet-200 transition-all">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 text-violet-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-800 truncate">{q.title}</p>
            <p className="text-xs text-gray-400">
              {q.questions?.length} questions · {q.difficulty}
              {showClass && q.className && ` · ${q.className}`}
            </p>
          </div>
          <Link to={`/quiz/${q.id}`} className="btn-primary text-xs py-1.5">Study</Link>
        </div>
      ))}
    </div>
  );
}

function NotesList({ notes }) {
  if (!notes.length) return (
    <div className="card p-10 text-center text-gray-400 space-y-2">
      <FileText className="w-8 h-8 mx-auto opacity-40" />
      <p className="text-sm">No published notes from your classes yet.</p>
    </div>
  );
  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <div key={note.id} className="card p-4 flex items-center gap-4 hover:border-violet-200 transition-all">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-800 truncate">{note.title}</p>
            <p className="text-xs text-gray-400">
              {note.className} · {new Date(note.created_at).toLocaleDateString()}
            </p>
          </div>
          <Link to={`/class-note/${note.id}`} className="btn-primary text-xs py-1.5">Read</Link>
        </div>
      ))}
    </div>
  );
}

function FlashcardList({ sets }) {
  if (!sets.length) return (
    <div className="card p-10 text-center text-gray-400 space-y-2">
      <Layers className="w-8 h-8 mx-auto opacity-40" />
      <p className="text-sm">No flashcard sets yet. Create them from any quiz result.</p>
    </div>
  );
  return (
    <div className="space-y-3">
      {sets.map((s) => (
        <div key={s.id} className="card p-4 flex items-center gap-4 hover:border-violet-200 transition-all">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Layers className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-800 truncate">{s.title}</p>
            <p className="text-xs text-gray-400">{s.cards?.length} cards</p>
          </div>
          <Link to={`/flashcards/${s.id}`} className="btn-primary text-xs py-1.5">Study</Link>
        </div>
      ))}
    </div>
  );
}

function ClassList({ classes }) {
  if (!classes.length) return (
    <div className="card p-10 text-center text-gray-400 space-y-2">
      <Users className="w-8 h-8 mx-auto opacity-40" />
      <p className="text-sm">Enter a class code above to join.</p>
    </div>
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {classes.map((c) => (
        <div key={c.id} className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800">{c.name}</h3>
            <span className="badge bg-gray-100 text-gray-500 font-mono">{c.class_code}</span>
          </div>
          <p className="text-xs text-gray-400">
            {(c.saved_quizzes ?? []).filter(q => q.is_shared).length} shared quizzes ·{" "}
            {(c.class_notes ?? []).filter(n => n.is_published).length} published notes
          </p>
        </div>
      ))}
    </div>
  );
}
