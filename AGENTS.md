# AGENTS.md

This file provides guidance to Hermes Agent when working with code in this repository.

## Project Overview

灵犀伴学 (AI Growth Companion) — an AI-driven educational companion app for children aged 3-6. It provides personalized learning paths, interactive content, AI chat, and parent controls. The project name is "lingxi" (灵犀).

**Language:** The app UI and content are entirely in Chinese. Code comments and variable names are in English.

## Development Commands

### Backend (NestJS)
```bash
cd src/backend
npm install
cp .env.example .env          # PORT=3001, DB_PATH=lingxi.db, JWT_SECRET
npm run start:dev              # Dev server with hot reload on :3001
npm run build                  # Production build
npm run test                   # Jest unit tests
npm run test:cov               # Coverage report
npm run test -- --testPathPattern=auth  # Run single test file
npm run lint                   # ESLint + Prettier
```

### Frontend Web (React/Vite)
```bash
cd src/frontend-web
npm install
npm run dev                    # Vite dev server on :5173
npm run build                  # TypeScript check + Vite production build
npm run lint                   # ESLint
npm run typecheck              # tsc --noEmit
```

### Flutter Frontend (mobile)
```bash
cd src/frontend
flutter pub get
flutter run                    # Requires Flutter SDK + emulator/device
```

### Quick Start (Windows)
`start.bat` installs deps, resets DB, starts both backend and frontend, opens browser. `stop.bat` kills the processes.

**Test account:** `13800000001` / `password123`

## Architecture

Three separate applications under `src/` with no monorepo tooling — each has its own `package.json`/`pubspec.yaml` and is run independently.

### Backend — `src/backend/` (NestJS + TypeORM + SQLite)

- **Database:** SQLite via `better-sqlite3`, stored as `lingxi.db`. TypeORM entities in `src/database/entities/` (13 entities). Auto-seeds on first run.
- **Modules** in `src/modules/`: auth (JWT), users, contents, learning, abilities, achievements, ai, parent, recommend, report, game, voice, emergency, assignment, notification, sse
- **AI module** has a full agent framework (`agent/`) with tools, prompts, and conversation management. Supports AI chat, quiz generation, course pack creation, video generation, and learning recommendations.
- **Learning module** includes video generation pipeline (Remotion), scene-based rendering, course generation agents, and lesson content management.
- **Config:** `src/config/` — TypeORM, Swagger, and module configuration. `ConfigModule` loads `.env`.
- **Swagger docs** at `/api/docs` when running.

### Flutter Frontend — `src/frontend/` (Flutter + Provider/Riverpod)

- **State management:** Provider + Riverpod, with dedicated providers under `lib/providers/`.
- **Services:** `api_service.dart` (Dio-based HTTP client), `tts_service.dart` (Edge TTS via backend), `storage_service.dart` (Hive local storage), `ai_service.dart`.
- **Screens:** `lib/screens/` organized by role — `child/`, `parent/`, `learning/`, `games/`, `auth/`, `achievement/`.
- **Components:** Shared UI under `lib/components/` — `EmptyState`, `ShimmerLoading`, `SpeechInputWidget`, `NotificationPanel`, `AppCard`, `SectionHeader`.
- **Theme:** `lib/theme/` with `PageTransitions` (custom route animations), `AnimationUtils`, and `AppTheme`.
- **Flutter Web build:** Output at `src/frontend/build/web/`. Deploy by copying to `src/backend/public/`: `cd src/frontend && flutter build web && cp -r build/web/* ../backend/public/`

### Frontend Web — `src/frontend-web/` (React 19 + Vite 6 + Tailwind CSS v4)

- **Routing:** No router library. `App.tsx` manages views via `useState` with states: `login`, `register`, `selection`, `parent`, `student`, `content-detail`.
- **Auth:** `AuthContext` provides JWT token management. Token stored in localStorage.
- **API layer:** `src/services/api.ts` — single `ApiService` class with all endpoints. Base URL `http://localhost:3001/api`.
- **Styling:** Tailwind CSS v4 with custom theme (playful, child-friendly design). Framer Motion for animations.
- **Key views:** StudentDashboard (child learning), ParentDashboard (parent monitoring), AIChat (floating chat widget), ContentDetail (content viewer).

### Learning Content — `src/content/`

JSON curriculum files organized by age group: `3-4-years/` (18 topics) and `5-6-years/` (20 topics). Topics span language, math, science, art, and social skills.

## Key Patterns

- **Age groups** are `3-4` and `5-6` throughout the system — content, AI responses, and recommendations adapt to these groups.
- **JWT auth** with 7-day expiry, bcrypt hashing. All protected endpoints use `@UseGuards(JwtAuthGuard)`.
- **Database resets:** Delete `lingxi.db` and restart backend to reset. The seeder runs automatically when the DB is empty.
- **API prefix:** All backend routes are under `/api/`.
- **Video generation:** Uses Remotion (Node.js video rendering framework). Chrome/Chromium auto-discovery. Scene components are modular (NumberScene, etc.). Generated assets cached in `public/.generated/`.
- **Flutter Web deploy:** Build output goes to `src/frontend/build/web/`, then copied to `src/backend/public/` where NestJS serves it as static files.
- **Agent tools:** AI agent tools are in `src/backend/src/modules/ai/agent/tools/` — each tool is a standalone module with Zod schemas for parameter validation.

## Task Closure

- When a task changes files, finish by checking `git status`, then stage and commit the work with a concise conventional message.
- Do not commit if the user explicitly asks to keep the changes local or wants a review first.

## Deployment

- **Production URL:** https://lingxi.chataifree.eu.org/
- **Infrastructure:** Cloudflare Tunnel (HTTP2) → OpenClaw Gateway (port 18789) → NestJS backend (port 3001)
- **Health check:** `curl -s -o /dev/null -w "%{http_code}" https://lingxi.chataifree.eu.org/` (expect 200). If external URL unreachable, fallback to `http://localhost:3001/`.
- **Cloudflare tunnel:** `systemctl --user status lingxi-tunnel.service` — uses `--protocol http2`, QUIC is broken
- **Before deploy:** Stash local changes (`git stash`), then `git pull`
- **Flutter Web deploy:** `cd src/frontend && flutter build web && cp -r build/web/* ../backend/public/`
