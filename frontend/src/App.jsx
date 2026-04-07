import { Routes, Route, NavLink } from "react-router-dom";
import InstructorDashboard from "./pages/InstructorDashboard";
import StudentQuiz from "./pages/StudentQuiz";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
        <span className="text-brand-600 font-bold text-lg">AutoQuiz</span>
        <NavLink
          to="/"
          className={({ isActive }) =>
            isActive ? "text-brand-600 font-medium" : "text-gray-600 hover:text-gray-900"
          }
        >
          Instructor
        </NavLink>
        <NavLink
          to="/quiz"
          className={({ isActive }) =>
            isActive ? "text-brand-600 font-medium" : "text-gray-600 hover:text-gray-900"
          }
        >
          Student
        </NavLink>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<InstructorDashboard />} />
          <Route path="/quiz" element={<StudentQuiz />} />
        </Routes>
      </main>
    </div>
  );
}
