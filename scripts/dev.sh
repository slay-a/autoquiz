#!/usr/bin/env bash
# scripts/dev.sh — start every AutoQuiz dev process in one terminal.
#
# Brings up:
#   1. Redis (via docker-compose)
#   2. FastAPI backend (uvicorn --reload, port 8000)
#   3. Celery worker (consumes ingest jobs)
#   4. Vite dev server (port 5173)
#
# Logs from each process are interleaved with a colored prefix.
# Hit Ctrl-C once and every child is shut down cleanly.
#
# Requirements:
#   - docker (or docker-compose) on PATH
#   - backend/venv created and dependencies installed
#   - frontend/node_modules installed (npm install)
#   - backend/.env and frontend/.env.local present
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ── Colors ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[0;33m'
BLU='\033[0;34m'; MAG='\033[0;35m'; NC='\033[0m'

prefix() {
  local color="$1"; local label="$2"
  while IFS= read -r line; do
    printf "${color}[%s]${NC} %s\n" "$label" "$line"
  done
}

# ── Pre-flight ────────────────────────────────────────────────────────
[ -d backend/venv ] || { printf "${RED}Missing backend/venv. Run: cd backend && python -m venv venv && pip install -r requirements.txt${NC}\n"; exit 1; }
[ -d frontend/node_modules ] || { printf "${RED}Missing frontend/node_modules. Run: cd frontend && npm install${NC}\n"; exit 1; }
[ -f backend/.env ] || { printf "${YLW}WARN: backend/.env missing — backend will start with defaults.${NC}\n"; }
[ -f frontend/.env.local ] || { printf "${YLW}WARN: frontend/.env.local missing — Vite will use defaults.${NC}\n"; }

# ── 1. Redis (docker-compose) ─────────────────────────────────────────
printf "${MAG}[dev]${NC} starting redis via docker-compose…\n"
docker compose up -d redis 2>&1 | prefix "$MAG" "redis" || {
  printf "${RED}Failed to start redis. Is docker running?${NC}\n"; exit 1;
}

PIDS=()

cleanup() {
  printf "\n${MAG}[dev]${NC} shutting down…\n"
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
  docker compose stop redis >/dev/null 2>&1 || true
  printf "${MAG}[dev]${NC} bye\n"
}
trap cleanup EXIT INT TERM

# ── 2. Backend uvicorn ────────────────────────────────────────────────
(
  cd backend
  ./venv/bin/uvicorn main:app --reload --port 8000 2>&1
) | prefix "$GRN" "api" &
PIDS+=($!)

# ── 3. Celery worker ──────────────────────────────────────────────────
(
  cd backend
  ./venv/bin/celery -A celery_worker worker --loglevel=info 2>&1
) | prefix "$YLW" "celery" &
PIDS+=($!)

# ── 4. Vite ───────────────────────────────────────────────────────────
(
  cd frontend
  npm run dev 2>&1
) | prefix "$BLU" "web" &
PIDS+=($!)

printf "${MAG}[dev]${NC} all services launching — http://localhost:5173 (web)  ·  http://localhost:8000 (api)  ·  redis on :6379\n"
printf "${MAG}[dev]${NC} press Ctrl-C to stop everything.\n"

wait
