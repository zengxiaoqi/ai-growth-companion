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
flutter build web              # Web build → build/web/ (served by nginx directly)
```

### Quick Start (Windows)
`start.bat` installs deps, resets DB, starts both backend and frontend, opens browser. `stop.bat` kills the processes.

**Test account:** `13800000001` / `password123`

## Architecture

Three separate applications under `src/` with no monorepo tooling — each has its own `package.json`/`pubspec.yaml` and is run independently.

### Backend — `src/backend/` (NestJS + TypeORM + SQLite)

- **Database:** SQLite via `better-sqlite3`, stored as `lingxi.db`. TypeORM entities in `src/database/entities/` (20 entities, incl. poem, video-download, fruit, poem-annotation). Auto-seeds on first run. A separate read-only `poetry.db` (370K+ classical Chinese poems) is used by the poetry module via a secondary TypeORM connection.
- **Modules** in `src/modules/`: auth (JWT), users, contents, learning, abilities, achievements, ai, parent, recommend, report, game, voice, emergency, assignment, notification, sse, reward (积分奖惩), poetry (古诗词), video-download (视频下载), public-api (公共API代理+水果数据)
- **AI module** has a full agent framework (`agent/`) with tools, prompts, and conversation management. Supports AI chat, quiz generation, course pack creation, video generation, and learning recommendations.
- **Agent Framework** in `src/agent-framework/`: includes `llm/` (pi-ai multi-provider client), `agents/` (Executor, Orchestrator, Base Agent), `tools/` (tool system), `prompts/` (age-aware templates). The LLM client uses `@earendil-works/pi-ai` (ESM-only, dynamic import) for multi-provider switching, automatic fallback, and token/cost tracking — see `.env` for `LLM_PROVIDER`/`LLM_FALLBACK_*` config.
- **Learning module** includes video generation pipeline (Remotion), scene-based rendering, course generation agents, and lesson content management.
- **Config:** `src/config/` — TypeORM, Swagger, and module configuration. `ConfigModule` loads `.env`.
- **Swagger docs** at `/api/docs` when running.

### Flutter Frontend — `src/frontend/` (Flutter + Provider/Riverpod)

- **State management:** Provider + Riverpod, with dedicated providers under `lib/providers/`.
- **Services:** `api_service.dart` (Dio-based HTTP client), `tts_service.dart` (Edge TTS via backend), `storage_service.dart` (Hive local storage), `ai_service.dart`.
- **Screens:** `lib/screens/` organized by role — `child/`, `parent/`, `learning/`, `games/`, `auth/`, `achievement/`.
- **Components:** Shared UI under `lib/components/` — `EmptyState`, `ShimmerLoading`, `SpeechInputWidget`, `NotificationPanel`, `AppCard`, `SectionHeader`.
- **Theme:** `lib/theme/` with `PageTransitions` (custom route animations), `AnimationUtils`, and `AppTheme`.
- **Flutter Web build:** Output at `src/frontend/build/web/`. nginx serves this directory directly — no rsync to `backend/public/` needed. Just run `cd src/frontend && flutter build web` and the files are live. After rebuild, rename `main.dart.js` to a versioned name (e.g. `main.dart.v1.js`), update `flutter_bootstrap.js` to reference it, and delete old `main.dart.v*.js` files for cache-busting.

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
- **Flutter Web deploy:** Build output stays at `src/frontend/build/web/` and is served directly by nginx. No rsync to `backend/public/` — that directory is stale and unused. After rebuild, rename `main.dart.js` → `main.dart.vN.js`, update `flutter_bootstrap.js` reference, delete old versioned JS.
- **Agent tools:** AI agent tools are in `src/backend/src/modules/ai/agent/tools/` — each tool is a standalone module with Zod schemas for parameter validation.

## Task Closure

- When a task changes files, finish by checking `git status`, then stage and commit the work with a concise conventional message.
- Do not commit if the user explicitly asks to keep the changes local or wants a review first.

## Deployment

- **Production URLs:**
  - Flutter Web: https://lingxi.chataifree.eu.org/
  - React Web: https://lingxi-web.chataifree.eu.org/
  - API: Accessed via nginx reverse proxy at `/api/` on either domain (not a separate hostname)
- **Infrastructure:** Cloudflare Tunnel (HTTP2) → nginx (ports 80/8081) → static files + reverse proxy to NestJS backend (port 3001). nginx config at `/etc/nginx/sites-available/lingxi`.
  - `lingxi.chataifree.eu.org` → nginx :80 → root `src/frontend/build/web/` (Flutter Web)
  - `lingxi-web.chataifree.eu.org` → nginx :8081 → root `src/frontend-web/dist/` (React Web)
  - Both nginx servers proxy `/api/` and `/uploads/` to `localhost:3001` (backend)
  - Note: `lingxi-api.chataifree.eu.org` in cloudflared config points to :3000 but is unused — API is served via nginx `/api/` path
- **OpenClaw Gateway** on port 18789 is for bot channels (Telegram/Feishu) only — NOT in the API routing path.
- **Health check:** `curl -s -o /dev/null -w "%{http_code}" https://lingxi.chataifree.eu.org/` (expect 200). If external URL unreachable, fallback to `http://localhost:80/` (nginx) or `http://localhost:3001/` (backend direct).
- **Cloudflare tunnel:** `systemctl --user status lingxi-tunnel.service` — uses `--protocol http2`, QUIC is broken. Config at `~/.cloudflared/config.yml`.
- **Before deploy:** Stash local changes (`git stash`), then `git pull`
- **Flutter Web deploy:** `cd src/frontend && flutter build web && bash post-build-web.sh` — files served directly from `build/web/` by nginx. No rsync needed. The post-build script (1) adds `useLocalCanvasKit: true` to avoid gstatic.com CDN (China blocking), (2) version-caches `main.dart.js` → `main.dart.vN.js`, (3) cleans old versioned files, (4) updates `flutter_bootstrap.js` references.
- **React Web deploy:** `cd src/frontend-web && npm run build` — output at `dist/` served directly by nginx on :8081.
- **Backend deploy:** Backend is managed by systemd user service `lingxi-backend.service` (config at `~/.config/systemd/user/lingxi-backend.service`). Currently uses nvm node v22 (`/home/zxq/.nvm/versions/node/v22.22.0/bin/node dist/main`). After code changes: `cd src/backend && npm run build`, then `systemctl --user restart lingxi-backend.service`. Port is 3001 (check `.env` — multiple agents may篡改 PORT causing 502). **CRITICAL**: better-sqlite3 native addon must match the running node binary's MODULE_VERSION — see lingxi-evolution skill pitfall #52. If the backend falls back to sql.js (check logs for "Falling back to sql.js"), registered users can't login and all API-created data is invisible.
- **nginx /uploads/ proxy:** Must use `location ^~ /uploads/` (with `^~` prefix) to override the file-extension regex match, otherwise image uploads return 404.
