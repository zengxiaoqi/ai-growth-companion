# React Frontend Refactor Plan

## Overview
Replace Flutter frontend with React + Vite + Tailwind web frontend based on UI design in `docs/design/灵犀伴学-(lingxi-companion)/`.

## Design Source
- Tech: React 19 + Vite 6 + Tailwind CSS 4 + TypeScript + motion/react + lucide-react + recharts
- Views: ModeSelection, ParentDashboard, StudentDashboard
- Theme: Material Design 3 color system with custom CSS variables

## Tasks

### T1: Project Setup
- [x] Initialize `src/frontend-web/` with Vite + React + TypeScript
- [x] Configure Tailwind CSS 4 with design theme
- [x] Install all dependencies from design (motion, lucide-react, recharts, clsx, tailwind-merge)
- [x] Set up tsconfig and vite config

### T2: Core App Structure
- [x] Port `lib/utils.ts` (cn utility)
- [x] Port `App.tsx` with mode switching (selection/parent/student)
- [x] Port `main.tsx` entry point
- [x] Port `index.css` with theme variables and tactile utilities

### T3: Components
- [x] Port `ModeSelection.tsx` - mode selection screen with PIN input
- [x] Port `ParentDashboard.tsx` - parent dashboard with charts and controls
- [x] Port `StudentDashboard.tsx` - student dashboard with mascot, missions, curriculum

### T4: API Integration Layer
- [x] Create API service for backend integration (auth, users, learning, etc.)
- [x] Create types/interfaces for API data

### T5: Final Polish
- [x] Update index.html with proper Chinese title and metadata
- [x] Build and verify

## Final Verification Wave
- [x] F1: `npm run build` passes without errors ✅
- [x] F2: All components render correctly (mode selection → parent/student) ✅
- [x] F3: Design matches the original design files ✅
- [x] F4: Code quality - no TypeScript errors, clean structure ✅
