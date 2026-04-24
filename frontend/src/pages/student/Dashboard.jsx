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
  const [myNotes, setMyNotes]       = useState([]);
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
      const session = await supabase.auth.getSession();
      const token = session?.data?.session?.access_token;

      if (!token) {
        console.error("No auth token available");
        setLoading(false);
        return;
      }

      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      };

      const [
        { data: myQ },
        { data: fsets },
        classesRes,
        contentRes,
        myNotesRes,
      ] = await Promise.all([
        supabase.from("saved_quizzes").select("*").eq("created_by", user.id).order("created_at", { ascending: false }),
        supabase.from("flashcard_sets").select("*").eq("created_by", user.id).order("created_at", { ascending: false }),
        fetch("http://localhost:8000/classes/student/classes", { headers }),
        fetch("http://localhost:8000/classes/student/content", { headers }),
        fetch("http://localhost:8000/notes/my", { headers }),
      ]);

      setMyQuizzes(myQ ?? []);
      setFlashcardSets(fsets ?? []);

      // Handle classes response
      if (classesRes.ok) {
        const classesData = await classesRes.json();
        setClasses(classesData);
      } else {
        console.error("Failed to fetch classes:", await classesRes.text());
        setClasses([]);
      }

      // Handle content response
      if (contentRes.ok) {
        const contentData = await contentRes.json();
        setClassQuizzes(contentData.quizzes ?? []);
        setClassNotes(contentData.notes ?? []);
      } else {
        console.error("Failed to fetch content:", await contentRes.text());
        setClassQuizzes([]);
        setClassNotes([]);
      }

      // Handle my notes response
      if (myNotesRes.ok) {
        const notesData = await myNotesRes.json();
        setMyNotes(notesData ?? []);
      } else {
        console.error("Failed to fetch my notes:", await myNotesRes.text());
        setMyNotes([]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function joinClass() {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      const session = await supabase.auth.getSession();
      const token = session?.data?.session?.access_token;

      if (!token) {
        setJoinError("Authentication required. Please log in again.");
        return;
      }

      const response = await fetch("http://localhost:8000/classes/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ class_code: joinCode.trim() }),
      });

      if (response.status === 404) {
        setJoinError("Class not found. Check the code and try again.");
        return;
      }

      if (response.status === 409) {
        setJoinError("You're already a member of this class.");
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setJoinError(errorData.detail || "Failed to join class. Please try again.");
        return;
      }

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
    { key: "mynotes",    label: "My Notes",       count: myNotes.length },
    { key: "flashcards", label: "Flashcards",     count: flashcardSets.length },
    { key: "classes",    label: "My Classes",     count: classes.length },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
            Hey, {profile?.full_name?.split(" ")[0]} 👋
          </h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm">Your study hub — quizzes, flashcards, notes.</p>
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
      <div className="flex gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl w-fit flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5
              ${tab === t.key ? "bg-white dark:bg-slate-800 text-violet-700 shadow-sm" : "text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:text-slate-100"}`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold
                ${tab === t.key ? "bg-violet-100 text-violet-600" : "bg-gray-200 text-gray-500 dark:text-slate-400"}`}>
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
          {tab === "mynotes"    && <MyNotesList notes={myNotes} />}
          {tab === "flashcards" && <FlashcardList sets={flashcardSets} />}
          {tab === "classes"    && <ClassList classes={classes} />}
        </>
      )}
    </div>
  );
}

function QuizList({ quizzes, emptyMsg, showClass }) {
  if (!quizzes.length) return (
    <div className="card p-10 text-center text-gray-400 dark:text-slate-500 space-y-2">
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
            <p className="font-medium text-gray-800 dark:text-slate-100 truncate">{q.title}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">
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
    <div className="card p-10 text-center text-gray-400 dark:text-slate-500 space-y-2">
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
            <p className="font-medium text-gray-800 dark:text-slate-100 truncate">{note.title}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">
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
    <div className="card p-10 text-center text-gray-400 dark:text-slate-500 space-y-2">
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
            <p className="font-medium text-gray-800 dark:text-slate-100 truncate">{s.title}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">{s.cards?.length} cards</p>
          </div>
          <Link to={`/flashcards/${s.id}`} className="btn-primary text-xs py-1.5">Study</Link>
        </div>
      ))}
    </div>
  );
}

function ClassList({ classes }) {
  if (!classes.length) return (
    <div className="card p-10 text-center text-gray-400 dark:text-slate-500 space-y-2">
      <Users className="w-8 h-8 mx-auto opacity-40" />
      <p className="text-sm">Enter a class code above to join.</p>
    </div>
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {classes.map((c) => (
        <div key={c.id} className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800 dark:text-slate-100">{c.name}</h3>
            <span className="badge bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 font-mono">{c.class_code}</span>
          </div>
          <p className="text-xs text-gray-400 dark:text-slate-500">
            {c.description || "No description"}
          </p>
        </div>
      ))}
    </div>
  );
}

function MyNotesList({ notes }) {
  if (!notes.length) return (
    <div className="card p-10 text-center text-gray-400 dark:text-slate-500 space-y-2">
      <FileText className="w-8 h-8 mx-auto opacity-40" />
      <p className="text-sm">No saved notes yet.</p>
    </div>
  );
  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <div key={note.id} className="card p-4 flex items-center gap-4 hover:border-violet-200 transition-all">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-violet-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-800 dark:text-slate-100 truncate">{note.title}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">
              {new Date(note.created_at).toLocaleDateString()}
            </p>
          </div>
          <Link to={`/notes/${note.id}`} className="btn-primary text-xs py-1.5">View</Link>
        </div>
      ))}
    </div>
  );
}
