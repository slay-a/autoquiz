import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire("/Users/slaya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/");
const { chromium } = require("playwright");

const APP_URL = "http://127.0.0.1:5173";
const OUT_DIR = "/Users/slaya/Documents/GitHub/autoquiz/outputs/manual-autoquiz-final/presentations/autoquiz-final/assets";
const VIDEO_DIR = path.join(OUT_DIR, "recordings");

const now = new Date("2026-05-08T09:00:00Z").toISOString();

const sampleQuiz = {
  id: "quiz-1",
  title: "CS 301 Midterm Review - medium",
  topic: "CS 301 Midterm Review",
  difficulty: "medium",
  class_id: "class-1",
  file_id: "file-1",
  outside_sources: false,
  created_at: now,
  is_shared: true,
  className: "CS 301 - Software Engineering",
  questions: [
    {
      question_id: "q1",
      type: "mcq",
      question: "Which practice keeps AutoQuiz changes aligned with the architecture document?",
      options: [
        { label: "A", text: "Implementing features before writing tests" },
        { label: "B", text: "Running a multi-agent TDD loop with review gates" },
        { label: "C", text: "Letting components call Supabase tables directly" },
        { label: "D", text: "Skipping acceptance criteria once the UI works" },
      ],
      answer: "B",
      explanation: "The project uses test creation, code development, architecture review, and DevOps checks before accepting feature work.",
      page_numbers: [3],
    },
    {
      question_id: "q2",
      type: "true_false",
      question: "Student-facing quizzes only show when an instructor marks them shared.",
      answer: "True",
      explanation: "The student dashboard filters class quizzes by the shared/published state returned by the API.",
      page_numbers: [7],
    },
  ],
};

const notes = [
  {
    id: "note-1",
    title: "Layered Architecture Review",
    topic: "Architecture",
    is_published: true,
    created_at: now,
    className: "CS 301 - Software Engineering",
    content: {
      summary: "Routes validate and delegate; services own orchestration; infrastructure initializes clients; Supabase stores data.",
      key_concepts: [
        { term: "Layer boundary", definition: "A rule that prevents API handlers from owning business logic." },
      ],
    },
  },
];

const classDetail = {
  id: "class-1",
  name: "CS 301 - Software Engineering",
  description: "Course material, instructor-generated quizzes, and published study notes.",
  class_code: "AQ2026",
  instructor_id: "instructor-1",
  created_at: now,
  members: [
    { student_id: "student-1", full_name: "Maya Student", email: "maya@example.edu", joined_at: now },
    { student_id: "student-2", full_name: "Dev Patel", email: "dev@example.edu", joined_at: now },
  ],
};

const files = [
  { file_id: "file-1", filename: "CS301_Midterm_Review.pdf", created_at: now, class_id: "class-1" },
  { file_id: "file-2", filename: "Architecture_Guidelines.pptx", created_at: now, class_id: "class-1" },
];

function json(data, status = 200) {
  return {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    body: JSON.stringify(data),
  };
}

async function routeApi(route) {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname;

  if (url.hostname.includes("supabase.co")) {
    if (pathname.includes("/rest/v1/profiles")) {
      const auth = request.headers().authorization || "";
      const isStudent = auth.includes("student") || request.url().includes("student-1");
      return route.fulfill(json({
        id: isStudent ? "student-1" : "instructor-1",
        full_name: isStudent ? "Maya Student" : "Srilaya Ponangi",
        role: isStudent ? "student" : "instructor",
        email: isStudent ? "maya@example.edu" : "srilaya@example.edu",
      }));
    }
    return route.fulfill(json({}));
  }

  if (url.port !== "8000") {
    return route.continue();
  }

  if (pathname === "/classes" && request.method() === "GET") {
    return route.fulfill(json([
      { id: "class-1", name: "CS 301 - Software Engineering", description: "AI-assisted study workflow", class_code: "AQ2026", member_count: 2, created_at: now },
      { id: "class-2", name: "COMP 482 - AI", description: "Retrieval and generation practice", class_code: "RAG482", member_count: 4, created_at: now },
    ]));
  }

  if (pathname === "/classes/class-1") return route.fulfill(json(classDetail));
  if (pathname === "/classes/class-1/quizzes") return route.fulfill(json([sampleQuiz]));
  if (pathname === "/classes/class-1/files") return route.fulfill(json(files));
  if (pathname === "/classes/class-1/notes") return route.fulfill(json(notes));
  if (pathname === "/classes/student/classes") return route.fulfill(json([
    { id: "class-1", name: "CS 301 - Software Engineering", description: "AI-assisted study workflow", class_code: "AQ2026", member_count: 2 },
  ]));
  if (pathname === "/classes/student/content") return route.fulfill(json({ quizzes: [sampleQuiz], notes }));
  if (pathname === "/quiz/my") return route.fulfill(json([sampleQuiz]));
  if (pathname === "/quiz/quiz-1") return route.fulfill(json(sampleQuiz));
  if (pathname === "/notes/my") return route.fulfill(json(notes));
  if (pathname === "/flashcards/my") return route.fulfill(json([
    { id: "cards-1", title: "CS 301 - Missed Cards", cards: [{ front: "What is RAG?", back: "Retrieval augmented generation." }] },
  ]));
  if (pathname === "/upload/files") return route.fulfill(json(files));
  if (pathname === "/health") return route.fulfill(json({ status: "ok" }));

  return route.fulfill(json({}));
}

async function seedAuth(page, role) {
  const isInstructor = role === "instructor";
  const userId = isInstructor ? "instructor-1" : "student-1";
  const fullName = isInstructor ? "Srilaya Ponangi" : "Maya Student";
  const email = isInstructor ? "srilaya@example.edu" : "maya@example.edu";
  const session = {
    access_token: "demo-token",
    refresh_token: "demo-refresh",
    token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: userId, email, aud: "authenticated", role: "authenticated" },
  };
  const profile = { id: userId, email, full_name: fullName, role };
  await page.evaluate(({ session, profile }) => {
    sessionStorage.setItem("aq-demo-role-overridden", "1");
    localStorage.setItem("sb-wftlkspotuiicwgpqjzx-auth-token", JSON.stringify(session));
    localStorage.setItem("aq_profile", JSON.stringify(profile));
  }, { session, profile });
}

function authPayload(role) {
  const isInstructor = role === "instructor";
  const userId = isInstructor ? "instructor-1" : "student-1";
  const fullName = isInstructor ? "Srilaya Ponangi" : "Maya Student";
  const email = isInstructor ? "srilaya@example.edu" : "maya@example.edu";
  return {
    session: {
      access_token: "demo-token",
      refresh_token: "demo-refresh",
      token_type: "bearer",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      user: { id: userId, email, aud: "authenticated", role: "authenticated" },
    },
    profile: { id: userId, email, full_name: fullName, role },
  };
}

async function pause(ms = 1000) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 720 } },
});
await context.route("**/*", routeApi);
const page = await context.newPage();

await page.addInitScript(({ session, profile }) => {
  if (sessionStorage.getItem("aq-demo-role-overridden")) return;
  localStorage.setItem("sb-wftlkspotuiicwgpqjzx-auth-token", JSON.stringify(session));
  localStorage.setItem("aq_profile", JSON.stringify(profile));
}, authPayload("instructor"));
await page.goto(`${APP_URL}/instructor`, { waitUntil: "networkidle" });
await page.getByText("CS 301 - Software Engineering").waitFor({ timeout: 5000 });
await pause(1600);

await page.goto(`${APP_URL}/instructor/class/class-1`, { waitUntil: "networkidle" });
await page.getByText("AQ2026").waitFor({ timeout: 5000 });
await pause(1200);
await page.getByRole("button", { name: "Generate Quiz" }).click();
await pause(1200);
await page.getByRole("button", { name: "Notes" }).click();
await pause(1200);
await page.screenshot({ path: path.join(OUT_DIR, "demo-cover.png") });

await seedAuth(page, "student");
await page.goto(`${APP_URL}/student`, { waitUntil: "networkidle" });
await page.getByText("Class Quizzes").waitFor({ timeout: 5000 });
await pause(1200);
await page.getByRole("button", { name: /Class Quizzes/ }).click();
await pause(1200);

await page.getByRole("link", { name: "Study" }).first().click();
await page.getByText("CS 301 Midterm Review").waitFor({ timeout: 5000 });
await pause(1000);
await page.getByRole("button", { name: /B/ }).first().click();
await page.getByRole("button", { name: "True" }).click();
await pause(900);
await page.getByRole("button", { name: /Submit Quiz/ }).click();
await pause(1800);

const video = page.video();
await context.close();
await browser.close();

const videoPath = await video.path();
console.log(JSON.stringify({ videoPath, cover: path.join(OUT_DIR, "demo-cover.png") }, null, 2));
