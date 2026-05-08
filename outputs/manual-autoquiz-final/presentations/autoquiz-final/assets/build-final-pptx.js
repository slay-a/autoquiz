import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pptxgen = require("pptxgenjs");

const OUT = "/Users/slaya/Documents/GitHub/autoquiz/AutoQuiz_Final_Project.pptx";
const ASSETS = "/Users/slaya/Documents/GitHub/autoquiz/outputs/manual-autoquiz-final/presentations/autoquiz-final/assets";
const DEMO_VIDEO = path.join(ASSETS, "AutoQuiz_Demo.mp4");
const DEMO_COVER = path.join(ASSETS, "demo-cover.png");
const DEMO_COVER_DATA = `data:image/png;base64,${fs.readFileSync(DEMO_COVER).toString("base64")}`;

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Srilaya Ponangi";
pptx.company = "CSUN - Agentic Project";
pptx.subject = "AutoQuiz final project presentation";
pptx.title = "AutoQuiz - AI-Powered Study Platform";
pptx.lang = "en-US";
pptx.theme = {
  headFontFace: "Aptos Display",
  bodyFontFace: "Aptos",
  lang: "en-US",
};

const W = 13.333;
const H = 7.5;
const C = {
  ink: "111827",
  muted: "64748B",
  pale: "F8FAFC",
  line: "DDE3EA",
  white: "FFFFFF",
  navy: "18223B",
  violet: "6D28D9",
  lavender: "EDE9FE",
  coral: "F9735B",
  amber: "F59E0B",
  amberPale: "FEF3C7",
  teal: "0F766E",
  tealPale: "CCFBF1",
  bluePale: "DBEAFE",
  slatePale: "EEF2F7",
};

const S = pptx.ShapeType;
const BODY = "Aptos";
const HEAD = "Aptos Display";
const MONO = "Aptos Mono";

function bg(slide, color = C.pale) {
  slide.background = { color };
}

function text(slide, value, x, y, w, h, opts = {}) {
  slide.addText(value, {
    x, y, w, h,
    margin: opts.margin ?? 0,
    fontFace: opts.fontFace ?? BODY,
    fontSize: opts.fontSize ?? 16,
    color: opts.color ?? C.ink,
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    align: opts.align ?? "left",
    valign: opts.valign ?? "top",
    fit: "shrink",
    breakLine: false,
    ...opts.extra,
  });
}

function rect(slide, x, y, w, h, fill, line = fill, opts = {}) {
  slide.addShape(S.rect, {
    x, y, w, h,
    fill: { color: fill, transparency: opts.transparency ?? 0 },
    line: { color: line, transparency: opts.lineTransparency ?? 0, width: opts.lineWidth ?? 0.8, dash: opts.dash },
    radius: opts.radius,
  });
}

function rule(slide, x, y, w, color = C.line, width = 1) {
  slide.addShape(S.line, {
    x, y, w, h: 0,
    line: { color, width },
  });
}

function header(slide, kicker, title, subtitle, n, dark = false) {
  const ink = dark ? C.white : C.ink;
  const muted = dark ? "CBD5E1" : C.muted;
  rect(slide, 0.58, 0.57, 0.1, 0.1, dark ? C.coral : C.violet, dark ? C.coral : C.violet);
  text(slide, kicker.toUpperCase(), 0.78, 0.48, 2.4, 0.28, {
    fontSize: 8.5,
    bold: true,
    color: muted,
    extra: { charSpacing: 1.4 },
  });
  text(slide, title, 0.58, 0.82, 11.0, 0.58, {
    fontFace: HEAD,
    fontSize: 23,
    bold: true,
    color: ink,
  });
  if (subtitle) {
    text(slide, subtitle, 0.6, 1.5, 10.9, 0.28, {
      fontSize: 11.5,
      color: muted,
    });
  }
  text(slide, String(n).padStart(2, "0"), 12.22, 0.58, 0.45, 0.2, {
    fontFace: MONO,
    fontSize: 8.5,
    color: muted,
    align: "right",
  });
}

function footer(slide, n, dark = false) {
  const color = dark ? "CBD5E1" : "94A3B8";
  rule(slide, 0.58, 7.02, 12.15, dark ? "334155" : C.line, 0.6);
  text(slide, "AutoQuiz final project - https://github.com/slay-a/autoquiz", 0.58, 7.12, 7.2, 0.18, {
    fontSize: 7.5,
    color,
  });
  text(slide, `${n}/10`, 12.2, 7.12, 0.5, 0.18, {
    fontSize: 7.5,
    color,
    align: "right",
  });
}

function pill(slide, label, x, y, color, fill, w = 1.25) {
  rect(slide, x, y, w, 0.34, fill, fill, { radius: 0.12 });
  text(slide, label, x, y + 0.075, w, 0.16, {
    fontSize: 8.5,
    bold: true,
    color,
    align: "center",
  });
}

function metric(slide, value, label, note, x, y, w, accent = C.violet, dark = false) {
  rect(slide, x, y, w, 0.95, dark ? "202B46" : C.white, dark ? "334155" : C.line, { radius: 0.08, lineWidth: 0.7 });
  text(slide, value, x + 0.18, y + 0.16, w - 0.36, 0.26, {
    fontSize: 23,
    bold: true,
    color: accent,
  });
  text(slide, label, x + 0.18, y + 0.48, w - 0.36, 0.16, {
    fontSize: 8.5,
    bold: true,
    color: dark ? C.white : C.ink,
  });
  text(slide, note, x + 0.18, y + 0.68, w - 0.36, 0.14, {
    fontSize: 7.2,
    color: dark ? "CBD5E1" : C.muted,
  });
}

function band(slide, x, y, w, h, color, title, body, opts = {}) {
  rect(slide, x, y, w, h, opts.fill ?? C.white, opts.line ?? C.line, { radius: 0.08, lineWidth: 0.8 });
  rect(slide, x, y, 0.08, h, color, color, { lineWidth: 0 });
  text(slide, title, x + 0.25, y + 0.22, w - 0.45, 0.24, {
    fontFace: HEAD,
    fontSize: opts.titleSize ?? 15,
    bold: true,
    color: opts.titleColor ?? C.ink,
  });
  text(slide, body, x + 0.25, y + 0.6, w - 0.45, Math.max(0.18, h - 0.78), {
    fontSize: opts.bodySize ?? 10.2,
    color: opts.bodyColor ?? C.muted,
    extra: { breakLine: false, fit: "shrink" },
  });
}

function bulletList(slide, items, x, y, w, h, color = C.ink, size = 10.5) {
  text(slide, items.map((item) => `- ${item}`).join("\n"), x, y, w, h, {
    fontSize: size,
    color,
    extra: { breakLine: false, fit: "shrink" },
  });
}

// Slide 1
{
  const s = pptx.addSlide();
  bg(s, C.navy);
  rect(s, 8.65, 0, 4.68, 7.5, "111827", "111827", { transparency: 0 });
  s.addImage({ path: DEMO_COVER, x: 8.9, y: 0.72, w: 3.95, h: 2.22 });
  rect(s, 8.9, 0.72, 3.95, 2.22, "000000", C.white, { transparency: 100, lineWidth: 0.8, lineTransparency: 68 });
  text(s, "AutoQuiz", 0.72, 1.25, 6.4, 0.85, { fontFace: HEAD, fontSize: 47, bold: true, color: C.white });
  text(s, "AI-powered study platform built with an agentic TDD workflow", 0.76, 2.13, 6.7, 0.32, { fontSize: 15, color: "CBD5E1" });
  text(s, "Upload course material, generate grounded quizzes and study notes, then share them into a class workflow students can actually use.", 0.76, 2.84, 6.8, 0.64, { fontSize: 14, color: C.white });
  pill(s, "FINAL PROJECT", 0.76, 3.82, C.white, C.violet, 1.45);
  pill(s, "SPRING 2026", 2.35, 3.82, C.ink, C.amberPale, 1.35);
  text(s, "GitHub repository", 0.76, 4.74, 2.0, 0.16, { fontSize: 8.5, color: "CBD5E1", bold: true });
  text(s, "github.com/slay-a/autoquiz", 0.76, 4.96, 4.8, 0.28, {
    fontFace: MONO,
    fontSize: 13,
    color: C.white,
    extra: { hyperlink: { url: "https://github.com/slay-a/autoquiz" } },
  });
  metric(s, "14", "verified feature groups", "requirements mapped to specs", 8.9, 3.48, 1.77, C.coral, true);
  metric(s, "55", "test files", "backend and frontend suites", 11.08, 3.48, 1.77, C.teal, true);
  metric(s, "600", "test declarations", "pytest + Vitest coverage signal", 8.9, 4.66, 1.77, C.amber, true);
  metric(s, "CI", "quality gates", "pytest, lint, tests, build", 11.08, 4.66, 1.77, C.lavender, true);
  text(s, "Srilaya Ponangi (Laya)", 0.76, 6.52, 3.4, 0.2, { fontSize: 9.5, color: "CBD5E1", bold: true });
  footer(s, 1, true);
}

// Slide 2
{
  const s = pptx.addSlide();
  bg(s);
  header(s, "rubric coverage", "Rubric items are covered; access is the final handoff check.", "The presentation now carries the required story, repo link, contribution scope, and embedded demo video.", 2);
  const rows = [
    ["Purpose of project", "Covered", "Problem, audience, and project thesis"],
    ["What the application does", "Covered", "Instructor and student workflows shown"],
    ["GitHub repository URL", "Covered", "github.com/slay-a/autoquiz"],
    ["Individual contributions", "Covered", "Names, modules, and scope by contributor"],
    ["Embedded demo video", "Covered", "15-second MP4 embedded in slide 8"],
    ["Architecture document", "Share/check", "Local source exists in docs/DESIGN.md; make sure Google Sheet is shared"],
    ["Source control / tests", "Covered", "Specs, tests, CI workflow, and commit history are in GitHub"],
  ];
  const y0 = 2.05;
  rows.forEach((r, i) => {
    const y = y0 + i * 0.57;
    const statusColor = r[1] === "Covered" ? C.teal : C.amber;
    rect(s, 0.72, y, 11.9, 0.47, i % 2 ? C.white : "F3F6FA", C.line, { radius: 0.05, lineWidth: 0.35 });
    text(s, r[0], 0.95, y + 0.14, 3.0, 0.16, { fontSize: 9.5, bold: true, color: C.ink });
    pill(s, r[1].toUpperCase(), 4.1, y + 0.07, statusColor === C.teal ? C.teal : "92400E", statusColor === C.teal ? C.tealPale : C.amberPale, 1.62);
    text(s, r[2], 6.0, y + 0.13, 6.0, 0.18, { fontSize: 9.1, color: C.muted });
  });
  band(s, 0.72, 6.15, 11.9, 0.58, C.coral, "Do before uploading", "Open the Google Sheet / Canvas submission in an incognito browser or different account and confirm the instructor has access.", { titleSize: 12, bodySize: 9.5, fill: C.white });
  footer(s, 2);
}

// Slide 3
{
  const s = pptx.addSlide();
  bg(s, C.white);
  header(s, "purpose", "AutoQuiz turns course material into grounded practice.", "The goal is to reduce instructor prep time while giving students study material tied to their actual class.", 3);
  band(s, 0.75, 2.08, 5.75, 2.4, C.coral, "The pain point", "Manual quiz and notes creation is slow. Generic AI can produce plausible but ungrounded answers. Students need practice that follows the uploaded course material, not a random internet summary.", { titleSize: 17, bodySize: 12.2, fill: "FFF7F4", line: "FFD6CC" });
  band(s, 6.82, 2.08, 5.75, 2.4, C.teal, "The project answer", "AutoQuiz uses RAG over uploaded files, then generates quizzes, notes, and flashcard study flows that instructors can share with classes and students can use independently.", { titleSize: 17, bodySize: 12.2, fill: "F0FDFA", line: "BDEFE7" });
  const qs = [
    ["Grounded", "PDF, DOCX, PPTX source material drives retrieval"],
    ["Role aware", "Instructor publishing and student study views stay separate"],
    ["Study loop", "Quiz results can become flashcards and notes"],
  ];
  qs.forEach((q, i) => {
    const x = 0.75 + i * 4.05;
    metric(s, q[0], q[1], "", x, 5.18, 3.65, [C.violet, C.teal, C.amber][i]);
  });
  footer(s, 3);
}

// Slide 4
{
  const s = pptx.addSlide();
  bg(s);
  header(s, "product workflow", "The app supports the full instructor-to-student study path.", "The MVP is not just a generator; it includes class management, publishing controls, study sessions, notes, and flashcards.", 4);
  const steps = [
    ["1", "Instructor creates class", "Invite code, roster, class detail"],
    ["2", "Uploads material", "PDF / DOCX / PPTX file ingestion"],
    ["3", "Generates quiz or notes", "RAG context plus GPT generation"],
    ["4", "Shares with students", "Publish / unpublish controls"],
    ["5", "Student studies", "Quiz scoring, notes, flashcards"],
  ];
  steps.forEach((step, i) => {
    const x = 0.75 + i * 2.46;
    rect(s, x, 2.08, 2.08, 1.38, C.white, C.line, { radius: 0.08 });
    rect(s, x + 0.18, 2.26, 0.34, 0.34, i < 2 ? C.violet : i < 4 ? C.teal : C.amber, i < 2 ? C.violet : i < 4 ? C.teal : C.amber, { radius: 0.1 });
    text(s, step[0], x + 0.18, 2.34, 0.34, 0.08, { fontSize: 8, bold: true, color: C.white, align: "center" });
    text(s, step[1], x + 0.62, 2.21, 1.22, 0.28, { fontSize: 10.2, bold: true, color: C.ink });
    text(s, step[2], x + 0.2, 2.78, 1.72, 0.36, { fontSize: 8.2, color: C.muted });
    if (i < steps.length - 1) text(s, ">", x + 2.15, 2.62, 0.2, 0.2, { fontSize: 15, bold: true, color: C.muted, align: "center" });
  });
  s.addImage({ path: DEMO_COVER, x: 1.05, y: 4.0, w: 6.2, h: 3.0 });
  rect(s, 1.05, 4.0, 6.2, 3.0, "000000", C.line, { transparency: 100, lineWidth: 0.9 });
  band(s, 7.65, 4.0, 4.95, 1.28, C.violet, "Instructor scope", "Create classes, upload files, generate quizzes/notes, share quizzes, publish notes, manage members.", { bodySize: 9.8, titleSize: 12.5 });
  band(s, 7.65, 5.66, 4.95, 1.28, C.amber, "Student scope", "Join classes, take shared quizzes, read notes, generate personal quizzes, save flashcards.", { bodySize: 9.8, titleSize: 12.5 });
  footer(s, 4);
}

// Slide 5
{
  const s = pptx.addSlide();
  bg(s, C.white);
  header(s, "architecture", "A layered FastAPI backend keeps AI work out of routes.", "The architecture document is the source of truth for layer boundaries, API envelopes, security, naming, and event logging.", 5);
  const layers = [
    ["React 18 + Vite", "Pages own fetching; components render"],
    ["FastAPI routes", "Validate input and shape responses"],
    ["Services", "RAG, generation, notes, class logic"],
    ["Infrastructure", "Supabase, OpenAI, config, parsers"],
    ["Data + async", "Postgres, pgvector, Storage, Celery, Redis"],
  ];
  layers.forEach((l, i) => {
    const x = 0.7 + i * 2.48;
    rect(s, x, 2.1, 2.05, 1.45, i % 2 ? "F8FAFC" : C.lavender, i % 2 ? C.line : "D7CAFE", { radius: 0.08 });
    text(s, l[0], x + 0.18, 2.34, 1.7, 0.24, { fontSize: 11.5, bold: true, color: i === 0 ? C.violet : C.ink, align: "center" });
    text(s, l[1], x + 0.18, 2.78, 1.7, 0.34, { fontSize: 8.3, color: C.muted, align: "center" });
    if (i < layers.length - 1) rule(s, x + 2.05, 2.82, 0.34, C.coral, 1.2);
  });
  band(s, 0.72, 4.22, 3.72, 1.45, C.coral, "Critical convention", "Routes do not call OpenAI or Supabase tables directly. Service functions own business logic and generation orchestration.", { titleSize: 13, bodySize: 9.8, fill: "FFF7F4", line: "FFD6CC" });
  band(s, 4.8, 4.22, 3.72, 1.45, C.teal, "RAG path", "Parse -> chunk -> embed -> hybrid retrieval -> prompt generation. LlamaIndex handles document parsing and splitting.", { titleSize: 13, bodySize: 9.8, fill: "F0FDFA", line: "BDEFE7" });
  band(s, 8.88, 4.22, 3.72, 1.45, C.violet, "Security path", "Supabase Auth, role-gated pages, JWT verification, RLS-oriented profile/class ownership, standard error envelopes.", { titleSize: 13, bodySize: 9.8, fill: "F7F3FF", line: "D7CAFE" });
  text(s, "Design source: docs/DESIGN.md", 0.75, 6.22, 4.2, 0.2, { fontFace: MONO, fontSize: 9.5, color: C.muted });
  footer(s, 5);
}

// Slide 6
{
  const s = pptx.addSlide();
  bg(s);
  header(s, "agentic tdd", "Each feature moved through a four-agent quality loop.", "The workflow mirrors the course requirement: tests/specification first, implementation second, then architecture and DevOps gates.", 6);
  const agents = [
    ["Test Creation Agent", "Writes failing tests and acceptance criteria traces before implementation."],
    ["Code Developer Agent", "Implements backend services, routes, frontend pages, and Supabase schema changes."],
    ["Architecture Review Agent", "Checks DESIGN.md boundaries, error envelopes, RLS assumptions, and event catalog coverage."],
    ["DevOps Agent", "Keeps CI, local dev scripts, env examples, logging, and rate limits aligned."],
  ];
  agents.forEach((a, i) => {
    const x = 0.74 + i * 3.08;
    rect(s, x, 2.08, 2.58, 3.35, C.white, C.line, { radius: 0.08 });
    rect(s, x, 2.08, 2.58, 0.12, [C.violet, C.coral, C.teal, C.amber][i], [C.violet, C.coral, C.teal, C.amber][i], { lineWidth: 0 });
    text(s, `0${i + 1}`, x + 0.22, 2.52, 0.48, 0.32, { fontFace: MONO, fontSize: 14, bold: true, color: [C.violet, C.coral, C.teal, C.amber][i] });
    text(s, a[0], x + 0.22, 3.06, 2.05, 0.48, { fontFace: HEAD, fontSize: 16, bold: true, color: C.ink });
    text(s, a[1], x + 0.22, 3.88, 2.02, 0.86, { fontSize: 9.6, color: C.muted });
  });
  rect(s, 1.25, 6.05, 10.8, 0.46, C.navy, C.navy, { radius: 0.08 });
  text(s, "Feature spec -> failing tests -> implementation -> architecture review -> CI / local verification -> commit", 1.44, 6.2, 10.4, 0.16, { fontSize: 10, bold: true, color: C.white, align: "center" });
  footer(s, 6);
}

// Slide 7
{
  const s = pptx.addSlide();
  bg(s, C.white);
  header(s, "implementation proof", "The repo shows specs, tests, implementation, and CI gates.", "This slide is meant to make the source-control review easy: where the grader can find evidence, not just claims.", 7);
  const bars = [
    ["User stories", 14, "specs/IMPLEMENTED_USER_STORIES.md"],
    ["Backend test files", 21, "backend/tests/"],
    ["Frontend test files", 34, "frontend/src/__tests__/"],
    ["Test declarations", 600, "pytest + Vitest search count"],
  ];
  const max = 600;
  bars.forEach((b, i) => {
    const y = 2.08 + i * 0.74;
    text(s, b[0], 0.85, y + 0.1, 2.0, 0.2, { fontSize: 10.2, bold: true });
    rect(s, 3.0, y + 0.11, 6.4, 0.22, C.slatePale, C.slatePale, { radius: 0.05 });
    rect(s, 3.0, y + 0.11, Math.max(0.35, 6.4 * b[1] / max), 0.22, [C.violet, C.teal, C.coral, C.amber][i], [C.violet, C.teal, C.coral, C.amber][i], { radius: 0.05 });
    text(s, String(b[1]), 9.62, y + 0.06, 0.7, 0.2, { fontSize: 12, bold: true, color: [C.violet, C.teal, C.coral, C.amber][i], align: "right" });
    text(s, b[2], 10.55, y + 0.1, 2.0, 0.2, { fontFace: MONO, fontSize: 7.8, color: C.muted });
  });
  const featureGroups = [
    "Auth", "Classes", "Membership", "Ingestion", "Upload", "Quiz gen", "Quiz study",
    "Sharing", "Student notes", "Instructor notes", "Flashcards", "Theme", "Profile", "Event catalog",
  ];
  featureGroups.forEach((f, i) => {
    const col = i % 7;
    const row = Math.floor(i / 7);
    pill(s, f, 0.85 + col * 1.7, 5.68 + row * 0.44, [C.violet, C.teal, C.coral, C.amber][i % 4], [C.lavender, C.tealPale, "FFE4DE", C.amberPale][i % 4], 1.34);
  });
  band(s, 0.85, 4.75, 11.6, 0.58, C.teal, "CI workflow", ".github/workflows/ci.yml runs backend pytest and frontend lint, Vitest, and build on push / pull request.", { titleSize: 12, bodySize: 9.6, fill: C.white });
  footer(s, 7);
}

// Slide 8
{
  const s = pptx.addSlide();
  bg(s, C.navy);
  header(s, "demo", "Embedded walkthrough video", "Instructor class management, quiz/notes publishing, student study dashboard, and quiz scoring are shown in the embedded recording.", 8, true);
  rect(s, 0.92, 2.02, 11.5, 4.2, "000000", "94A3B8", { transparency: 0, lineWidth: 0.8, radius: 0.08 });
  s.addMedia({ type: "video", path: DEMO_VIDEO, cover: DEMO_COVER_DATA, x: 0.92, y: 2.02, w: 11.5, h: 4.2 });
  rect(s, 0.92, 6.43, 11.5, 0.36, "202B46", "334155", { radius: 0.06, lineWidth: 0.6 });
  text(s, "Demo file embedded as MP4 in the PPTX package; no external link is required for playback.", 1.12, 6.54, 10.9, 0.13, { fontSize: 8.4, color: "CBD5E1", align: "center" });
  footer(s, 8, true);
}

// Slide 9
{
  const s = pptx.addSlide();
  bg(s);
  header(s, "contributions", "Individual contributions are traceable by module and scope.", "The repo history also shows commits under each contributor's GitHub identity.", 9);
  const rows = [
    ["Srilaya Ponangi (Laya)\n@slay-a", "Architecture source of truth; full-stack scaffold and repo hygiene; FEAT-001 auth pipeline; TopBar/profile entry point; Pydantic v2 config hardening; CI/dev scripts; logging/rate-limit/readiness cleanup."],
    ["Justin Reyes\n@justinreyes145", "LlamaIndex ingestion; file upload/storage; GPT-4o + RAG quiz generation; quiz study/saving; sharing; student notes; flashcards; test-suite stabilization."],
    ["Shima / Shabnam Jabbari\n@ShimaJabbari", "Instructor class management; student membership; theme preferences; user profile/avatar/RLS; event catalog completion; JWT verification; error envelope and layer-boundary fixes."],
  ];
  rows.forEach((r, i) => {
    const y = 2.05 + i * 1.45;
    rect(s, 0.78, y, 11.78, 1.15, C.white, C.line, { radius: 0.08, lineWidth: 0.7 });
    rect(s, 0.78, y, 0.08, 1.15, [C.violet, C.coral, C.teal][i], [C.violet, C.coral, C.teal][i], { lineWidth: 0 });
    text(s, r[0], 1.05, y + 0.26, 2.25, 0.52, { fontSize: 10.5, bold: true, color: C.ink });
    text(s, r[1], 3.58, y + 0.22, 8.55, 0.66, { fontSize: 9.4, color: C.muted });
  });
  band(s, 0.78, 6.16, 11.78, 0.42, C.amber, "Commit identity note", "Recent commits use Srilaya Ponangi / slay-a identity; earlier shortlog entries include Laya/slay-a variants.", { titleSize: 10.8, bodySize: 8.5, fill: C.white });
  footer(s, 9);
}

// Slide 10
{
  const s = pptx.addSlide();
  bg(s, C.white);
  header(s, "submission map", "Everything the grader needs has a clear location.", "Use this as the final pre-upload checklist on Friday, May 8, 2026.", 10);
  const items = [
    ["Canvas", "AutoQuiz_Final_Project.pptx", "Upload this improved PPTX with embedded demo video."],
    ["Google Sheets", "Architecture document", "Paste/share DESIGN.md-derived architecture content and grant instructor access."],
    ["GitHub", "https://github.com/slay-a/autoquiz", "Repo contains specs, tests, implementation, CI workflow, and source history."],
    ["Specs", "specs/*.md", "Feature stories and acceptance criteria live beside implementation."],
    ["Tests", "backend/tests and frontend/src/__tests__", "Backend and frontend test suites are indexed and CI-gated."],
  ];
  items.forEach((it, i) => {
    const y = 2.02 + i * 0.78;
    rect(s, 0.82, y, 2.0, 0.5, [C.violet, C.amber, C.teal, C.coral, C.navy][i], [C.violet, C.amber, C.teal, C.coral, C.navy][i], { radius: 0.06 });
    text(s, it[0], 0.97, y + 0.17, 1.7, 0.12, { fontSize: 9.3, bold: true, color: C.white, align: "center" });
    text(s, it[1], 3.1, y + 0.08, 3.35, 0.2, { fontFace: it[0] === "GitHub" ? MONO : BODY, fontSize: 10.4, bold: true, color: C.ink });
    text(s, it[2], 6.52, y + 0.09, 5.55, 0.22, { fontSize: 8.9, color: C.muted });
  });
  rect(s, 0.82, 6.22, 11.78, 0.7, C.navy, C.navy, { radius: 0.08 });
  text(s, "Final readiness: deck improved, demo embedded, repo URL visible. Last manual step: confirm Canvas/Google Sheet/GitHub access from the instructor side.", 1.05, 6.46, 11.25, 0.2, { fontSize: 10.2, bold: true, color: C.white, align: "center" });
  footer(s, 10);
}

pptx.writeFile({ fileName: OUT }).then((fileName) => {
  console.log(`Wrote ${fileName}`);
});
