import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);
const PROFILE_KEY = "aq_profile";

function getCachedProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch { return null; }
}
function cacheProfile(p)  { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {} }
function clearProfileCache() { try { localStorage.removeItem(PROFILE_KEY); } catch {} }

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(getCachedProfile);  // instant from cache
  const [loading, setLoading] = useState(true);

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
    const timeout = setTimeout(async () => {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      clearProfileCache();
      setLoading(false);
    }, 5000);

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      clearTimeout(timeout);

      if (error || !session) {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        clearProfileCache();
        setLoading(false);
        return;
      }

      setUser(session.user);

      const cached = getCachedProfile();
      if (cached && cached.id === session.user.id) {
        // Show cached profile immediately — refresh silently in background
        setProfile(cached);
        setLoading(false);
        fetchProfile(session.user.id, { background: true });
      } else {
        // No valid cache — wait for fresh profile
        fetchProfile(session.user.id);
      }
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

    return () => subscription.unsubscribe();
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
