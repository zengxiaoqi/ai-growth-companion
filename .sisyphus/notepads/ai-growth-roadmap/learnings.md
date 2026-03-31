# Learnings - AI Module Improvements

## 2026-03-30: AI Age-Adaptive Dialogue, Story Generation, Content Safety

### Architecture
- NestJS module dependency injection: `UsersModule` must be imported into `AiModule` to inject `UsersService`
- `ContentSafetyService` registered as provider in `AiModule` - no need for a separate module since it's a pure utility service
- Age resolution chain: explicit age param > context.age > user DB lookup (via UsersService.findById)

### Code Patterns
- Existing `generateStory` method signature changed (was `topic, age` → now takes params object) - created `generateStoryLegacy` for backward compatibility with existing `POST /ai/generate-story` endpoint
- Age group classification: `classifyAge()` returns `'3-4' | '5-6' | 'unknown'` - handles null/undefined gracefully
- Safety filter applied to ALL response paths: chat, story, evaluation, suggestion

### Content Safety Design
- Prohibited words blacklist: violence, fear, inappropriate content, PII patterns
- PII regex patterns for phone numbers, ID numbers, passwords
- Filter replaces prohibited content with `***` or `[已隐藏]`
- Adds positive encouragement suffix when content is filtered

### Testing
- All 12 existing unit tests pass without modification
- E2e test failure (`Cannot find module '../src/app.module'`) is pre-existing - path resolution issue in test config
- No AI-specific unit tests existed before or after changes

### Gotchas
- Git stash/restore cycle caused file write conflicts - had to use Edit tool instead of Write tool for existing files
- `common/guards/` directory already existed with `jwt-auth.guard.ts`; created new `common/services/` directory for safety service

## 2026-03-30: Frontend Recommendations + Voice Playback UI

### Architecture
- Components live in `src/components/` not `src/pages/`
- App routing is state-based (not react-router) — `View` type union + `AnimatePresence` for transitions
- `StudentDashboard` accepts `onOpenContent` callback → sets `selectedContentId` state in `App.tsx` → renders `ContentDetail`
- `ContentDetail` is a full-screen overlay (`fixed inset-0 z-50`) with spring animation entrance

### Code Patterns
- All components use `useAuth()` hook for user context
- API calls wrapped in try/catch with `console.log('X API unavailable')` fallback pattern
- `cn()` utility from `../lib/utils` for class merging (clsx + tailwind-merge)
- Domain icon/color mappings are duplicated across StudentDashboard and ContentDetail — extracted to `getIconComponent`/`getDomainColor` helpers
- `motion/react` (not `framer-motion`) for animations — staggered `initial/animate` with `delay: idx * 0.08`
- `tactile-press` + `shadow-tactile`/`shadow-tactile-active` custom utilities for press feedback
- Design tokens: MD3 color system via CSS `@theme` vars in `index.css`

### Recommendations Section
- Horizontal scrollable card container with `overflow-x-auto`, snap scrolling (`snap-x snap-mandatory`)
- Scroll arrows with `group-hover:opacity-100` reveal pattern
- Each card shows domain icon, content title (line-clamp-2), reason, and "开始学习" CTA
- Hidden scrollbar via inline style `{ scrollbarWidth: 'none', msOverflowStyle: 'none' }`

### Voice Playback UI
- HTML5 Audio API: `new Audio(ttsUrl)` with `oncanplaythrough`/`onended`/`onerror` handlers
- TTS URL constructed via `api.getTTSUrl(text)` — returns URL string, not a promise
- Waveform animation: 24 `motion.div` bars with staggered `height: [4, random, 4]` animation when playing
- Audio cleanup on unmount via `useEffect` cleanup

### API Changes
- Added `getTTSUrl(text: string): string` to `ApiService` — synchronous URL builder, not async
- Existing `getRecommendations(params)` already implemented and typed

### Gotchas
- Pre-existing build warnings: CSS `@import` order, chunk size > 500KB — both non-blocking
- `ParentDashboard.tsx` has pre-existing TS errors (`recentMasteredSkills` undefined) — not related to these changes
- `App.tsx` had unused `categoryFilter` state — also pre-existing

## 2026-03-30: Interactive Quiz + Achievement Showcase

### Architecture
- QuizEngine is a standalone component in `components/quiz/` — receives `QuizSection[]` and `onComplete` callback
- ContentDetail detects interactive JSON content via `JSON.parse()` + checks for `questions` arrays
- When interactive content detected, "开始学习" enters quiz mode instead of manual scoring
- AchievementShowcase is a full-page overlay like ContentDetail — navigated via `view === 'achievements'` in App.tsx

### Content JSON Structure
- Backend stores content as `string` field — can be plain text OR JSON string
- JSON format: `Array<{ type: string, title: string, text?: string, questions?: { q, options, answer }[] }>`
- Must `try/catch` JSON.parse since content field can be plain text
- Story `text` extracted from JSON sections for voice playback via `displayText` memo

### QuizEngine Design
- Flattens all questions from all sections into a single `allQuestions` array
- Tracks per-question state: `selectedOption`, `isRevealed`, `correctCount`
- Stars: 3 for 100%, 2 for >50%, 1 for completing — uses `getStars()` helper
- Score sent to `completeLearning` API as percentage: `Math.round((correct/total) * 100)`
- Animated option buttons with spring physics, color-coded feedback (green/red)

### Achievement Showcase Design
- Fetches via `api.getAchievements(userId)` — returns `Achievement[]`
- Icon mapping: `iconMap` record maps API icon strings to lucide components
- Badge colors: rotating palette of 8 color sets via `badgeColors[idx % 8]`
- Growth tree: 5 levels based on unlocked count (种子→小芽→小树→大树→参天大树)
- Stats derived client-side: `totalStars = unlockedCount * 3`, `level = floor(totalPoints/100) + 1`

### App.tsx View Wiring
- Added `'achievements'` to `View` type union
- `StudentDashboard` new prop: `onOpenAchievements: () => void`
- Bottom nav: replaced "Buddy" (UserCircle) with "成就" (Trophy) as clickable `<button>`
- Security badge hidden on achievements view

### Gotchas
- `UserCircle` became unused import after replacing nav item — `tsc --noEmit` catches this
- `useMemo` and `useCallback` needed import additions in ContentDetail.tsx
- `BookOpen` icon needed import in ContentDetail.tsx for content section header

## 2026-03-30: AchievementShowcase Task — Already Implemented

### Finding
- All three files (AchievementShowcase.tsx, App.tsx, StudentDashboard.tsx) were ALREADY fully implemented with the exact requirements specified:
  - AchievementShowcase.tsx: Stats header (stars/points/level), badge grid with lucide icons + motion animations, growth tree visualization, loading/error/empty states
  - StudentDashboard.tsx: Trophy button in bottom nav calling `onOpenAchievements`
  - App.tsx: 'achievements' view type, imports AchievementShowcase, renders with correct props
- Build passes cleanly (`tsc -b && vite build`) with only pre-existing CSS/chunk-size warnings
- No changes were needed — task was already completed in a prior session

## 2026-03-30: ParentDashboard Enhancement (Radar + Trend + Report + Controls)

### Tech Stack Notes
- **recharts v3.8.1**: RadarChart, LineChart, BarChart all work together. RadarChart uses PolarGrid/PolarAngleAxis/PolarRadiusAxis/Radar. LineChart needs CartesianGrid for grid lines.
- **motion v12.23.24**: Use `motion/react` import path. `motion.div` with initial/animate/transition for staggered reveals.
- **Tailwind CSS v4**: `@theme` directive in index.css for design tokens. Opacity modifier like `bg-secondary-container/30` works.

### Recharts TypeScript Gotchas
- `Tooltip formatter` parameter type is `ValueType | undefined` — must use `(value: unknown)` to avoid strict type errors.
- Remove unused imports (`Cell`, `AnimatePresence`, unused lucide icons) — `tsc -b` catches them as TS6133 errors.

### Design System Constants
- Domain colors: language=secondary(#006384), math=tertiary(#586000), science=primary(#705900), art=surface-container-high(#b9ae6e/recharts), social=error(#b02500)
- Recharts stroke colors passed as hex strings directly (not Tailwind classes): ['#006384', '#586000', '#705900', '#b9ae6e', '#b02500']
- MD3 container colors: surface-container-lowest=#ffffff, surface-container-low=#fff2aa, surface-container=#f8e999

### Architecture Pattern
- No router — ParentDashboard toggles to ReportDetail via internal `showReportDetail` state (not a new route in App.tsx)
- Fallback data pattern: API calls in try/catch with hardcoded fallback arrays for offline/graceful degradation
- `DOMAIN_CONFIG` record maps domain strings to label/color/textColor — shared concept across components

### Parent Controls Enhancement
- Time range slider: native HTML `<input type="range">` with dynamic gradient background via inline style
- Domain toggles: 5-column grid of buttons with active/inactive states
- Save button calls `api.updateControls()` with debounce pattern + success state animation
- Eye protection toggle uses onClick on the outer div for simplicity

## 2026-03-31: Production Deployment Infrastructure

### Files Created
- `src/backend/Dockerfile` — multi-stage build (node:20-alpine builder → node:20-alpine production with non-root user)
- `src/frontend-web/Dockerfile` — multi-stage build (node:20-alpine builder → nginx:alpine serving static + reverse proxy)
- `src/frontend-web/nginx.conf` — SPA routing (try_files $uri → index.html), gzip, cache headers, /api/ proxy to backend
- `docker-compose.yml` — backend + frontend services, named volume for SQLite, bridge network, health checks
- `.env.example` — root-level env template (PORT, DB_PATH, JWT_SECRET, VITE_API_BASE_URL)
- `.github/workflows/ci.yml` — 3-job pipeline: backend (lint+test+build), frontend (typecheck+build), docker (build both images)
- `.dockerignore` files for both src/backend and src/frontend-web

### Architecture Decisions
- SQLite DB path in Docker: `/app/data/lingxi.db` with named volume `backend-data` for persistence
- Frontend hardcodes `http://localhost:3000/api` in api.ts — nginx.conf proxies `/api/` to `http://backend:3000/api/` for Docker network, but browser still hits localhost:3000 directly
- Multi-stage builds minimize image size: backend only has production deps + dist, frontend is pure nginx + static files
- Backend runs as non-root `appuser` (uid 1001) for security
- CI uses GitHub Actions cache (`type=gha`) for Docker layers
- Health checks: backend on `/api/contents` (GET), frontend on `/` (GET), both with wget spider mode

### Key Observations
- `better-sqlite3` requires native compilation — alpine images handle this via node:20-alpine having build tools
- Frontend dev server port was 3000 in package.json but 5173 in vite.config.ts — vite.config takes precedence
- Existing `.github/workflows/build-apk.yml` for Flutter frontend left untouched — CI pipeline only handles backend + frontend-web
- Frontend build produces 888KB JS chunk (warning from Vite) — not addressed, out of scope for infrastructure task
