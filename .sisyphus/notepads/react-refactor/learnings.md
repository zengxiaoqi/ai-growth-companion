# Learnings - React Frontend Integration

## 2026-03-29 Backend API Analysis
- Backend uses `phone` + `password` auth (NOT username)
- API prefix: `/api` (set in main.ts)
- CORS enabled: origin `*`
- Auth endpoints: POST /api/auth/register, POST /api/auth/login
- Auth DTO: RegisterDto { phone, password, name, type, age }
- Auth DTO: LoginDto { phone, password }
- Auth returns: { user, token } (JWT)
- AI endpoints: POST /api/ai/chat { message, childId }, POST /api/ai/generate-content, POST /api/ai/evaluate-learning, GET /api/ai/suggest
- User types: 'parent' | 'child'
- User entity: id, phone, password, name, type, avatar, age, gender, parentId, settings
- Content entity: uuid, title, subtitle, ageRange, domain, topic, difficulty, durationMinutes, contentType, content, mediaUrls, status
- Learning: POST /api/learning/start { childId, contentId }, POST /api/learning/complete { recordId, score, feedback }
- Achievements: GET /api/achievements/user/:userId
- Parent controls: GET/PATCH /api/parent/controls/:parentId
- Reports: GET /api/report?userId=&period=
- Recommend: GET /api/recommend?userId=&ageRange=

## 2026-03-29 Integration Notes
- Frontend-web project created at src/frontend-web/ with Vite + React 19 + Tailwind CSS 4
- AuthContext handles JWT token in localStorage, provides login/register/logout
- App.tsx has flow: login/register → selection → parent/student dashboards
- LoginScreen and RegisterScreen are separate components
- AIChat is a floating panel (bottom-right FAB), connected to POST /api/ai/chat
- StudentDashboard fetches: api.getContents({ ageRange }), api.getAchievements(userId)
- ParentDashboard fetches: api.getReport({ userId, period }), api.getAchievements, api.getControls
- All API calls have try/catch fallback to hardcoded data (graceful degradation)
- ModeSelection: parent entry checks auth.isAuthenticated && user.type === 'parent'
- Build passes: tsc -b && vite build (766KB JS, 39KB CSS)
