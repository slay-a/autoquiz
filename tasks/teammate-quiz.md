# E3: Generate High-Quality Questions from Retrieved Context

## Stories Assigned

### Quiz Generation Backend (P0)
> As a learner, I want different question types and difficulty levels.

**Files to work in:**
- `backend/app/services/quiz_gen.py` (scaffolded)
- `backend/app/api/routes/quiz.py` (scaffolded)

**Your job:**
- Test GPT-4o structured output with all 3 question types: MCQ, True/False, Short Answer
- Test all 3 difficulty levels — verify prompt produces noticeably different question depth
- Add a Supabase `quizzes` table to store generated quizzes for history/review
- Handle edge case: GPT returns fewer questions than requested

---

### Quiz Frontend (P0)
> Student-facing quiz UI.

**Files to work in:**
- `frontend/src/components/QuizView.jsx` (scaffolded)
- `frontend/src/components/TopicSearch.jsx` (scaffolded)
- `frontend/src/pages/StudentQuiz.jsx` (scaffolded)

**Your job:**
- Add answer selection for MCQ (click an option, see if it's right)
- Add a score summary at the end ("You got 4/5 correct")
- Show source citation (page numbers) after revealing each answer
- Add shadcn/ui components for better polish:
  ```bash
  npx shadcn@latest init
  npx shadcn@latest add button card badge progress
  ```

---

## Setup Reminder
```bash
# Backend
cd backend && source venv/bin/activate
uvicorn main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```
