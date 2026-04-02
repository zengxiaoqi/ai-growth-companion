# Parent AI Chat-Driven Dashboard Design

## Problem

Parent AI chat is broken — `AIChat` component receives no `childId` when rendered in parent view, causing backend errors. Additionally, the parent experience should be conversation-first, with all features accessible through AI dialogue.

## Design Decision

**Approach A: Extend existing AI module** — add parent-mode prompts and tools to the current AI service, rather than creating a separate module.

## Frontend Changes

### Layout: Full-screen Chat + Bottom Tabs

Parent dashboard transforms from a scrollable dashboard to a chat-first layout:

- **Default view**: Full-screen AI conversation (like student companion mode)
- **Bottom tab bar** with 4 tabs:
  - **对话** (Chat) — default, full-screen AI dialogue
  - **报告** (Report) — GrowthReportSection, AbilityRadar, AbilityTrend
  - **控制** (Controls) — ParentalControls settings
  - **作业** (Assignments) — AssignmentManager
- **Top bar**: Keep ChildSelector for switching children
- Chat and tab views share state (selected child, data)

### AIChat Component Changes

- Accept `parentId` and `selectedChildId` props
- Parent mode: pass `parentId` (from auth context) and `selectedChildId` (from child selector)
- Render rich cards in chat for report data, control confirmations, assignment summaries
- Fix: remove duplicate global AIChat in App.tsx for parent view (ParentDashboard manages its own)

## Backend Changes

### AI Service — Parent Mode Support

**ChatRequest** extends with:
- `parentId?: number` — parent user ID
- `childId?: number` — optional, the child being discussed

**Role detection**: When `parentId` is present, use parent-mode system prompt and tools.

### New Parent System Prompt

- Professional tone, addressing the parent
- Can discuss child progress, suggest activities, adjust settings
- Instructs agent to use parent-appropriate tools

### New/Modified Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `listChildren` | `parentId` | List parent's linked children |
| `switchChild` | `parentId, childName` | Switch agent context to a different child |
| `viewReport` | `childId` | Return learning report data (for card rendering) |
| `viewAbilities` | `childId` | Return ability radar data |
| `viewTrend` | `childId` | Return weekly trend data |
| `updateControl` | `childId, settings` | Modify parental control settings (time limits, domains, schedule) |
| `createAssignment` | `parentId, childId, activityType, topic, difficulty, ageGroup, domain, dueDate` | Create assignment (already exists) |
| `listAssignments` | `childId` | List child's assignments |

Existing tools (`getUserProfile`, `getAbilities`, `getLearningHistory`, `searchContent`, `getRecommendations`) remain available in parent mode with child context.

### Streaming Response

- No change to SSE streaming mechanism
- Add `data_type` field to distinguish card data from text:
  - `report_card` — learning report visualization
  - `ability_card` — ability radar
  - `control_updated` — control setting confirmation
  - `assignment_card` — assignment summary

## Data Flow

```
Parent sends: "看看小明最近的学习情况"
  → Frontend: { message, parentId: 5, childId: 12 }
  → Backend: detect parentId → load parent system prompt
  → Agent: call viewReport(12)
  → Backend: return SSE with report_card data + text summary
  → Frontend: render report card component inline in chat
```

## Key Files to Modify

### Backend
- `src/backend/src/modules/ai/ai.controller.ts` — accept parentId param
- `src/backend/src/modules/ai/ai.service.ts` — parent mode routing
- `src/backend/src/modules/ai/agent/agent-executor.ts` — parent prompt selection
- `src/backend/src/modules/ai/agent/prompts/system-prompts.ts` — add parent prompt
- `src/backend/src/modules/ai/agent/tool-registry.ts` — register parent tools
- New: `src/backend/src/modules/ai/tools/parent-*.ts` — parent-specific tools

### Frontend
- `src/frontend-web/src/components/parent/ParentDashboard.tsx` — full rewrite to chat-first layout
- `src/frontend-web/src/components/AIChat.tsx` — accept parentId, render cards
- `src/frontend-web/src/services/api.ts` — add parentId to chat requests
- `src/frontend-web/src/App.tsx` — fix global AIChat for parent view
