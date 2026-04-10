import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);
const PROFILE_KEY = "aq_profile";

function getCachedProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch { return null; }
}
function cacheProfile(p)    { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {} }
function clearProfileCache() { try { localStorage.removeItem(PROFILE_KEY); } catch {} }

// Read the Supabase session from localStorage synchronously (no network needed).
// Supabase v2 stores it under sb-<ref>-auth-token.
function getStoredUser() {
  try {
    const key = Object.keys(localStorage).find(
      k => k.startsWith("sb-") && k.endsWith("-auth-token")
    );
    if (!key) return null;
    const stored = JSON.parse(localStorage.getItem(key));
    // Only use if the access token has more than 60s of life left
    if (stored?.user && stored.expires_at > Date.now() / 1000 + 60) {
      return stored.user;
    }
    return null;
  } catch { return null; }
}

export function AuthProvider({ children }) {
  // Initialize synchronously from localStorage — no spinner flash for returning users
  const storedUser    = getStoredUser();
  const cachedProfile = getCachedProfile();
  const hasInstant    = !!(storedUser && cachedProfile?.id === storedUser.id);

  const [user, setUser]       = useState(storedUser);
  const [profile, setProfile] = useState(hasInstant ? cachedProfile : null);
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
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      clearProfileCache();
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    // Hard cap — never stuck longer than 4s
    const timeout = setTimeout(() => {
      setUser(null);
      setProfile(null);
      clearProfileCache();
      setLoading(false);
    }, 4000);

    supabase.auth.getSession()
      .then(async ({ data: { session }, error }) => {
        clearTimeout(timeout);

        if (error || !session) {
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
          setUser(null);
          setProfile(null);
          clearProfileCache();
          setLoading(false);
          return;
        }
        if (session?.user) {
          setUser(session.user);
          if (event === "SIGNED_IN") {
            await fetchProfile(session.user.id);
          }
        }
      }
    );

    return () => {
      clearTimeout(timeout);           // prevent stale timeout firing (Strict Mode)
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
