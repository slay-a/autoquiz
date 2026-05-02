import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { genShareCode, copyToClipboard, shareUrl } from "../lib/sharing";
import {
  ChevronLeft, Plus, Trash2, Edit3, Check,
  Copy, Globe, Lock, Loader2, GripVertical, Save
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function FlashcardEditor() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [set, setSet]       = useState(null);
  const [cards, setCards]   = useState([]);
  const [title, setTitle]   = useState("");
  const [editingIdx, setEditingIdx] = useState(null);
  const [editCard, setEditCard]     = useState({ front: "", back: "", explanation: "" });
  const [newCard, setNewCard]       = useState({ front: "", back: "", explanation: "" });
  const [showNew, setShowNew]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [copied, setCopied]         = useState(false);
  const [loading, setLoading]       = useState(true);
  const [deleteError, setDeleteError] = useState(null);
  const [isOwner, setIsOwner]       = useState(null);

  useEffect(() => { fetchSet(); }, [id]);

  async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    };
  }

  async function fetchSet() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/flashcards/${id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSet(data);
        setCards(data.cards ?? []);
        setTitle(data.title);
        setIsOwner(data.created_by === user?.id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      await fetch(`${API_BASE}/flashcards/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ title, cards }),
      });
      navigate(`/flashcards/${id}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteSet() {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/flashcards/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        setDeleteError("Delete failed — please try again.");
        setDeleting(false);
      } else {
        navigate("/student");
      }
    } catch {
      setDeleteError("Delete failed — please try again.");
      setDeleting(false);
    }
  }

  function startEdit(idx) {
    setEditingIdx(idx);
    setEditCard({ ...cards[idx] });
  }

  function saveEdit(idx) {
    const updated = [...cards];
    updated[idx] = editCard;
    setCards(updated);
    setEditingIdx(null);
  }

  function deleteCard(idx) {
    setCards((c) => c.filter((_, i) => i !== idx));
  }

  function addCard() {
    if (!newCard.front.trim() || !newCard.back.trim()) return;
    setCards((c) => [...c, { ...newCard }]);
    setNewCard({ front: "", back: "", explanation: "" });
    setShowNew(false);
  }

  async function togglePublic() {
    const newVal = !set.is_public;
    let share_code = set.share_code;
    if (newVal && !share_code) share_code = genShareCode();

    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/flashcards/${id}/share`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ is_public: newVal, share_code }),
    });
    if (res.ok) {
      const data = await res.json();
      setSet((s) => ({ ...s, is_public: data.is_public, share_code: data.share_code }));
    }
  }

  async function copyShare() {
    const url = shareUrl("flashcards", id);
    await copyToClipboard(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>;
  if (!set) return <p className="text-gray-500 dark:text-slate-400">Set not found.</p>;
  if (!loading && set && isOwner === false) {
    return <div className="p-8 text-center text-red-500">You don't have permission to edit this set.</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <Link to={`/flashcards/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-400 dark:text-slate-500 hover:text-violet-600 mb-3">
          <ChevronLeft className="w-4 h-4" /> Back to study
        </Link>
        <div className="flex items-center gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-xl font-bold text-gray-900 dark:text-slate-100 bg-transparent border-b-2 border-transparent hover:border-violet-200 focus:border-violet-400 outline-none flex-1 pb-1"
          />
          <button onClick={save} disabled={saving} className="btn-primary text-xs">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>

      {/* Share bar */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm text-gray-500 dark:text-slate-400">{cards.length} cards</span>
        <div className="flex-1" />
        <button onClick={copyShare} className="btn-secondary text-xs">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied!" : "Copy link"}
        </button>
        <button
          onClick={togglePublic}
          className={`btn-secondary text-xs ${set.is_public ? "text-violet-600 border-violet-300 bg-violet-50" : ""}`}
        >
          {set.is_public ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          {set.is_public ? "Public" : "Make public"}
        </button>
        {set.share_code && (
          <span className="badge bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 font-mono">{set.share_code}</span>
        )}
      </div>

      {/* Cards list */}
      <div className="space-y-3">
        {cards.map((card, idx) => (
          <div key={idx} className="card p-4">
            {editingIdx === idx ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1 block">Front</label>
                    <textarea
                      value={editCard.front}
                      onChange={(e) => setEditCard({ ...editCard, front: e.target.value })}
                      rows={2}
                      className="input resize-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1 block">Back (Answer)</label>
                    <textarea
                      value={editCard.back}
                      onChange={(e) => setEditCard({ ...editCard, back: e.target.value })}
                      rows={2}
                      className="input resize-none text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1 block">Explanation (optional)</label>
                  <textarea
                    value={editCard.explanation ?? ""}
                    onChange={(e) => setEditCard({ ...editCard, explanation: e.target.value })}
                    rows={1}
                    className="input resize-none text-sm"
                    placeholder="Add context or explanation..."
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(idx)} className="btn-primary text-xs">
                    <Check className="w-3.5 h-3.5" /> Save
                  </button>
                  <button onClick={() => setEditingIdx(null)} className="btn-secondary text-xs">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <GripVertical className="w-4 h-4 text-gray-200 mt-1 flex-shrink-0" />
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 mb-1">Front</p>
                    <p className="text-sm text-gray-800 dark:text-slate-100">{card.front}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 mb-1">Back</p>
                    <p className="text-sm text-gray-800 dark:text-slate-100">{card.back}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(idx)} className="p-1.5 text-gray-300 dark:text-slate-600 hover:text-violet-500 transition-colors">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteCard(idx)} className="p-1.5 text-gray-300 dark:text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add new card */}
        {showNew ? (
          <div className="card p-4 border-violet-200 space-y-3 animate-slide-up">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200">New Card</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1 block">Front</label>
                <textarea
                  autoFocus
                  value={newCard.front}
                  onChange={(e) => setNewCard({ ...newCard, front: e.target.value })}
                  rows={2}
                  className="input resize-none text-sm"
                  placeholder="Question or term..."
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1 block">Back</label>
                <textarea
                  value={newCard.back}
                  onChange={(e) => setNewCard({ ...newCard, back: e.target.value })}
                  rows={2}
                  className="input resize-none text-sm"
                  placeholder="Answer or definition..."
                />
              </div>
            </div>
            <input
              value={newCard.explanation}
              onChange={(e) => setNewCard({ ...newCard, explanation: e.target.value })}
              className="input text-sm"
              placeholder="Explanation (optional)..."
            />
            <div className="flex gap-2">
              <button onClick={addCard} disabled={!newCard.front.trim() || !newCard.back.trim()}
                className="btn-primary text-xs">
                <Plus className="w-3.5 h-3.5" /> Add Card
              </button>
              <button onClick={() => setShowNew(false)} className="btn-secondary text-xs">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowNew(true)}
            className="w-full card p-4 border-dashed text-gray-400 dark:text-slate-500 hover:text-violet-600 hover:border-violet-300 transition-all flex items-center justify-center gap-2 text-sm font-medium">
            <Plus className="w-4 h-4" /> Add a card
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pb-8">
        <div className="flex flex-col items-start gap-1">
          <button
            onClick={deleteSet}
            disabled={deleting}
            className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {deleting ? "Deleting…" : "Delete set"}
          </button>
          {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate(`/flashcards/${id}`)} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save & close
          </button>
        </div>
      </div>
    </div>
  );
}
