import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { logEvent } from "../utils/logEvent.js";

const AuthContext = createContext(null);
const PROFILE_KEY = "aq_profile";

function getCachedProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch { return null; }
}
function cacheProfile(p)     { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {} }
function clearProfileCache() { try { localStorage.removeItem(PROFILE_KEY); } catch {} }

// Read the Supabase session from localStorage synchronously (no network).
// Supabase v2 stores it under sb-<projectRef>-auth-token.
function getStoredUser() {
  try {
    const key = Object.keys(localStorage).find(
      k => k.startsWith("sb-") && k.endsWith("-auth-token")
    );
    if (!key) return null;
    const stored = JSON.parse(localStorage.getItem(key));
    // Only trust it if the access token has >60 s left
    if (stored?.user && stored.expires_at > Date.now() / 1000 + 60) {
      return stored.user;
    }
    return null;
  } catch { return null; }
}

export function AuthProvider({ children }) {
  const storedUser    = getStoredUser();
  const cachedProfile = getCachedProfile();
  const hasInstant    = !!(storedUser && cachedProfile?.id === storedUser.id);

  const [user, setUser]       = useState(storedUser);
  const [profile, setProfile] = useState(hasInstant ? cachedProfile : null);
  // loading = false immediately when we can reconstruct state from localStorage
  const [loading, setLoading] = useState(!hasInstant);

  async function fetchProfile(userId, { background = false } = {}) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error || !data) {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        clearProfileCache();
      } else {
        setProfile(data);
        cacheProfile(data);
      }
    } catch {
      // network error — keep existing state, don't sign out
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      // Absolute fallback — never stuck longer than 4 s
      setLoading(false);
    }, 4000);

    supabase.auth.getSession()
      .then(async ({ data: { session }, error }) => {
        clearTimeout(timeout);

        if (error) {
          // Network / service error — don't wipe optimistic state, just unblock
          setLoading(false);
          return;
        }

        if (!session) {
          // Confirmed: no active session
          setUser(null);
          setProfile(null);
          clearProfileCache();
          setLoading(false);
          return;
        }

        setUser(session.user);

        const cached = getCachedProfile();
        if (cached?.id === session.user.id) {
          setProfile(cached);
          setLoading(false);
          fetchProfile(session.user.id, { background: true });
        } else {
          fetchProfile(session.user.id);
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_OUT") {
          logEvent("auth.session.ended", {});
          setUser(null);
          setProfile(null);
          clearProfileCache();
          setLoading(false);
          return;
        }

        if (event === "SIGNED_IN" && session?.user) {
          // Supabase fires SIGNED_IN on every tab focus / token refresh,
          // not just on real sign-in. If the user hasn't actually changed,
          // skip — otherwise we'd hand downstream consumers a new `user`
          // object reference on every focus, re-triggering their effects
          // (e.g. StudentDashboard refetch) and potentially hanging the UI.
          setUser((prev) => {
            if (prev?.id !== session.user.id) {
              // Genuinely new sign-in — emit auth lifecycle event (§14.3, no PII)
              logEvent("auth.session.started", {});
            }
            return prev?.id === session.user.id ? prev : session.user;
          });

          // Only flip loading + refetch profile if this is a genuinely new user.
          setProfile((prevProfile) => {
            if (prevProfile?.id === session.user.id) return prevProfile;
            setLoading(true);
            fetchProfile(session.user.id);
            return prevProfile;
          });
        }
      }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  async function register({ email, password, fullName, role }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    });
    if (error) throw error;
    if (data.user) {
      await supabase.from("profiles").upsert(
        { id: data.user.id, email, full_name: fullName, role },
        { onConflict: "id" }
      );
    }
    return data;
  }

  async function login({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
