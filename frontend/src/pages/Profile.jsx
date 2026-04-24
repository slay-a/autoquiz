import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { User, Save, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";

// A handful of preset avatars. DiceBear is a free avatar service — each seed
// produces a unique cartoon face, no signup or API key needed.
const AVATAR_STYLE = "avataaars";
const AVATAR_SEEDS = [
  "violet", "mint", "coral", "sunny",
  "ocean", "forest", "cherry", "storm",
];

function avatarUrl(seed) {
  return `https://api.dicebear.com/7.x/${AVATAR_STYLE}/svg?seed=${encodeURIComponent(seed)}`;
}

export default function Profile() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [avatar, setAvatar]     = useState(profile?.avatar_url || avatarUrl(AVATAR_SEEDS[0]));
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    if (!user?.id) return;

    setSaving(true);
    setError(null);
    setSaved(false);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), avatar_url: avatar })
      .eq("id", user.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // Refresh cached profile so the navbar picks up the new name/avatar
    // on the next render. Easiest way: reload — it's a one-off action.
    setSaved(true);
    setTimeout(() => window.location.reload(), 600);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Your Profile</h1>
            <p className="text-sm text-gray-500">Pick an avatar and update your display name.</p>
          </div>
        </div>

        {/* Current avatar preview */}
        <div className="flex items-center gap-4 mb-8 p-4 bg-slate-50 rounded-xl">
          <img
            src={avatar}
            alt="Selected avatar"
            className="w-20 h-20 rounded-full bg-white border border-gray-200"
          />
          <div>
            <div className="font-semibold text-gray-900">{fullName || "Your name"}</div>
            <div className="text-xs text-gray-500">{profile?.email}</div>
            <div className="text-xs text-violet-600 font-medium capitalize mt-0.5">
              {profile?.role}
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Avatar picker */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Choose an avatar
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
              {AVATAR_SEEDS.map((seed) => {
                const url = avatarUrl(seed);
                const selected = avatar === url;
                return (
                  <button
                    key={seed}
                    type="button"
                    onClick={() => setAvatar(url)}
                    className={`aspect-square rounded-full border-2 transition-all bg-white
                      ${selected
                        ? "border-violet-500 ring-2 ring-violet-200"
                        : "border-gray-200 hover:border-gray-300"}`}
                  >
                    <img src={url} alt={seed} className="w-full h-full rounded-full" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Display name */}
          <div>
            <label htmlFor="fullName" className="block text-sm font-semibold text-gray-900 mb-2">
              Display name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
              placeholder="How should we call you?"
              required
              minLength={1}
              maxLength={80}
            />
          </div>

          {/* Feedback */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {saved && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-4 h-4" /> Saved! Refreshing…
            </div>
          )}

          {/* Save button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !fullName.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
