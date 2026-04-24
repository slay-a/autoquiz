import { NavLink, useNavigate } from "react-router-dom";
import {
  Sparkles,
  LogOut,
  BookOpen,
  PlusCircle,
  LayoutDashboard,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import ThemeToggle from "./ThemeToggle";

/**
 * FEAT-012: shared top navigation bar.
 *
 * Always renders the AutoQuiz logo and a <ThemeToggle /> (AC-12.1.1).
 * When the user is authenticated, renders the role-based primary nav
 * links, profile label, and logout action. When unauthenticated (login /
 * register pages), renders the minimal logo + toggle so the theme
 * control is still reachable (resolves Open Question 3).
 *
 * Accepts `children` as a page-local action slot (e.g. extra buttons a
 * page wants to surface in the header).
 */
export default function TopBar({ children }) {
  const { user, profile, logout } = useAuth() || {};
  const navigate = useNavigate();
  const authed = Boolean(user && profile);
  const isInstructor = profile?.role === "instructor";

  async function handleLogout() {
    try {
      await logout?.();
    } finally {
      navigate("/login");
    }
  }

  return (
    <header
      className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-gray-100
                 dark:bg-slate-900/80 dark:border-slate-700"
    >
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <NavLink
          to={authed ? (isInstructor ? "/instructor" : "/student") : "/login"}
          className="flex items-center gap-2 shrink-0"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900 dark:text-slate-100 tracking-tight">
            AutoQuiz
          </span>
        </NavLink>

        {/* Primary nav (authenticated only) */}
        {authed && (
          <nav className="flex items-center gap-1">
            {isInstructor ? (
              <NavItem
                to="/instructor"
                icon={<LayoutDashboard className="w-3.5 h-3.5" />}
                label="Dashboard"
              />
            ) : (
              <>
                <NavItem
                  to="/student"
                  icon={<LayoutDashboard className="w-3.5 h-3.5" />}
                  label="Dashboard"
                />
                <NavItem
                  to="/student/generate"
                  icon={<PlusCircle className="w-3.5 h-3.5" />}
                  label="Generate"
                />
                <NavItem
                  to="/notes"
                  icon={<BookOpen className="w-3.5 h-3.5" />}
                  label="Notes"
                />
              </>
            )}
          </nav>
        )}

        {/* Right side: page actions, profile, logout, theme toggle */}
        <div className="flex items-center gap-3">
          {children}
          {authed && (
            <>
              <span className="text-xs text-gray-500 dark:text-slate-400 hidden sm:block">
                {profile?.full_name} ·{" "}
                <span className="text-violet-600 dark:text-violet-400 font-medium capitalize">
                  {profile?.role}
                </span>
              </span>
              <button
                onClick={handleLogout}
                aria-label="Log out"
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500
                           dark:text-slate-400 dark:hover:text-red-400 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
          isActive
            ? "bg-violet-50 text-violet-700 dark:bg-slate-800 dark:text-violet-300"
            : "text-gray-500 hover:text-gray-800 hover:bg-gray-50 " +
              "dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
