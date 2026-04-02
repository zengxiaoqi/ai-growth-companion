# Learning Tracker Design Spec

**Date**: 2026-04-03
**Status**: Draft
**Scope**: Full-stack — backend (NestJS) + frontend web (React)

## Problem

The system has three disconnected modules that should form a closed learning loop:

| Module | Current Gap |
|--------|-------------|
| AI Chat | Conversations stored but no learning records created from interactive activities |
| Assignments | Full assign→complete→score flow exists, but completion creates no `LearningRecord`, triggers no achievement check, updates no ability |
| Achievements | 6 predefined types exist, `checkAndAward()` method exists, but **nothing calls it** |
| Abilities | Manual API call required; no automatic update on learning completion |

**Result**: Students learn through AI chat and complete homework, but none of this feeds into their learning records, abilities, or achievements.

## Design Decision: Aggregator Service (Option C)

A dedicated `LearningTrackerService` acts as a unified entry point. All learning triggers call one method: `learningTracker.recordActivity(...)`.

**Why not EventEmitter (A)**: Project is a single NestJS monolith; event-driven architecture adds complexity without proportional benefit.

**Why not direct calls (B)**: Would scatter logic across `AssignmentService`, `AiService`, `LearningService`, making it hard to maintain as trigger sources grow.

---

## Section 1: Core Data Model

### 1.1 LearningTrackerService

**File**: `src/backend/src/modules/learning/learning-tracker.service.ts`

Single entry method:

```typescript
async recordActivity(params: {
  type: 'content_completion' | 'assignment_completion' | 'interactive_activity';
  childId: number;               // the student user ID
  contentId?: number;            // present for content learning
  assignmentId?: number;         // present for assignment completion
  domain: string;                // language|math|science|art|social
  score: number;                 // 0-100
  durationSeconds?: number;
  metadata?: Record<string, any>; // extra data (questions, activity type, etc.)
}): Promise<{
  learningRecord: LearningRecord;
  abilityUpdated: boolean;
  achievementsAwarded: string[];
}>
```

Internal flow:
1. **Create LearningRecord** via `LearningService` — always, regardless of type
2. **Update AbilityAssessment** via `AbilitiesService` — weighted moving average: `newScore = 0.7 × currentScore + 0.3 × activityScore`
3. **Check & Award Achievements** via `AchievementsService.checkAndAward()` — evaluate all applicable achievement rules

### 1.2 Extended Achievement Types

Existing types (unchanged): `first_lesson`, `daily_goal`, `week_streak`, `language_master`, `math_wizard`, `science_explorer`

New types added to `AchievementsService.getNameByType()`:

**Assignment achievements:**

| achievementType | Name (CN) | Criteria |
|----------------|-----------|----------|
| `first_homework` | 初次完成作业 | First assignment completed |
| `homework_streak_3` | 作业小能手 | 3 assignments completed in a row |
| `homework_streak_7` | 作业达人 | 7 assignments completed in a row |
| `perfect_homework` | 满分作业 | Score = 100 on an assignment |
| `homework_master_10` | 作业大师 | 10 assignments completed total |

**Interactive activity achievements:**

| achievementType | Name (CN) | Criteria |
|----------------|-----------|----------|
| `first_activity` | 初次互动学习 | First interactive activity completed |
| `activity_streak_5` | 互动达人 | 5 correct in a row |
| `activity_master_20` | 互动大师 | 20 activities completed total |
| `perfect_activity` | 满分互动 | Score = 100 on an activity |

**Domain achievements:**

| achievementType | Name (CN) | Criteria |
|----------------|-----------|----------|
| `art_talent` | 艺术天赋 | Art domain ability ≥ 80 |
| `social_star` | 社交之星 | Social domain ability ≥ 80 |

**General achievements:**

| achievementType | Name (CN) | Criteria |
|----------------|-----------|----------|
| `daily_learner` | 每日学习者 | 3+ learning records in one day |
| `explorer_5` | 五域探索者 | Learning records in all 5 domains |

### 1.3 Ability Assessment Update Logic

Within `LearningTrackerService`:

- Query latest `AbilityAssessment` for the given `userId + domain`
- If none exists: create new with `score = activityScore`
- If exists: `newScore = 0.7 × latestScore + 0.3 × activityScore`
- Auto-map level: ≥80 → `advanced`, ≥60 → `intermediate`, <60 → `beginner`
- Store `evidence` JSON: `{ source: type, sourceId, score, timestamp }`

---

## Section 2: Trigger Point Integration

### 2.1 Assignment Completion Trigger

**File**: `src/backend/src/modules/assignment/assignment.service.ts`

In `complete()` method, after existing notification logic:

```typescript
// existing: update assignment status/score, notify parent via SSE
// new:
await this.learningTracker.recordActivity({
  type: 'assignment_completion',
  childId,
  assignmentId: assignment.id,
  domain: assignment.domain,
  score: assignment.score,
  metadata: {
    activityType: assignment.activityType,
    difficulty: assignment.difficulty,
    resultData: assignment.resultData,
  },
});
```

### 2.2 AI Interactive Activity Trigger

**File**: `src/backend/src/modules/ai/agent/tools/record-learning.ts`

Replace current direct `LearningService` calls with:

```typescript
// replace: learningService.create() + learningService.update()
// with:
const result = await this.learningTracker.recordActivity({
  type: 'interactive_activity',
  userId: childId,
  childId: childId,
  contentId,
  domain,  // new required parameter
  score,
  metadata: { sessionId, toolName: 'recordLearning' },
});
```

**Tool definition update** (`src/backend/src/modules/ai/agent/prompts/tool-definitions.ts`):
- Add `domain` as a required parameter to the `recordLearning` tool schema
- AI infers domain from conversation context (e.g., discussing numbers → `math`)

### 2.3 Content Learning Trigger

**File**: `src/backend/src/modules/learning/learning.service.ts`

In `update()` method, when `status === 'completed'`:

```typescript
// existing: update record, notify parent via SSE
// new:
if (updateData.status === 'completed') {
  const content = await this.contentRepository.findOne({ where: { id: record.contentId } });
  await this.learningTracker.recordActivity({
    type: 'content_completion',
    userId: record.userId,
    childId: record.userId,
    contentId: record.contentId,
    domain: content?.domain || 'language',
    score: updateData.score || 0,
    durationSeconds: updateData.durationSeconds,
  });
}
```

### 2.4 Dependency Injection

```
LearningModule
  ├── imports: AchievementsModule, AbilitiesModule, ContentModule
  ├── providers: [LearningService, LearningTrackerService]
  └── exports: [LearningService, LearningTrackerService]

AssignmentModule
  └── imports: LearningModule (uses LearningTrackerService)

AIModule
  └── imports: LearningModule (uses LearningTrackerService)
```

**No circular dependencies**: LearningTrackerService → AchievementsService/AbilitiesService (one direction), AssignmentService/AiService → LearningTrackerService (one direction).

---

## Section 3: Frontend Full-Chain Display

### 3.1 Student — Achievement Display

**File**: `src/frontend-web/src/components/StudentDashboard.tsx`

Add "我的成就" section below the existing "今日任务" area:
- Show recent achievements (icon + name + earnedAt)
- Expandable to full achievement list
- Framer Motion animation when new achievement earned
- Data: `GET /api/achievements/user/:userId`

### 3.2 Student — Interactive Learning Feedback

**File**: `src/frontend-web/src/components/AIChat.tsx`

After interactive activity/game completion:
- Display brief feedback ("太棒了！你答对了3/5题！")
- Show score + domain ability improvement hint
- StudentDashboard "今日学习" stats include activity-sourced records (no source distinction in summary)

### 3.3 Student — Ability Radar Chart

**File**: `src/frontend-web/src/components/StudentDashboard.tsx`

New section for ability overview:
- 5-dimension radar chart: language/math/science/art/social
- Data: `GET /api/report?userId&period=weekly` → `skillProgress`
- Click domain to navigate to related content

### 3.4 Parent — Assignment Completion Feedback

**File**: `src/frontend-web/src/components/parent/ParentDashboard.tsx`

- Completed assignments show score + completion time
- New "作业完成趋势" chart: recent assignment score trend line
- Enhanced SSE notification includes score and ability change summary

### 3.5 Parent — Enhanced Learning Report

**File**: Report display components

- Report adds "互动学习" category in statistics (distinct from content learning and homework)
- Achievement section shows newly earned achievements with details
- Ability trend chart distinguishes contribution sources (content vs assignment vs activity)

### 3.6 API Changes

| Endpoint | Change |
|----------|--------|
| `GET /api/achievements/user/:userId` | No change — already sufficient |
| `GET /api/report` | No change — `skillProgress` and `achievements` already present |
| `GET /api/learning/today/:userId` | Extend: return stats grouped by source (content/assignment/activity) |
| `GET /api/assignments/child/:childId` | Extend: return completed assignment score trend data |

---

## Files to Modify

### Backend
| File | Change |
|------|--------|
| `src/modules/learning/learning-tracker.service.ts` | **NEW** — aggregator service |
| `src/modules/learning/learning.module.ts` | Register LearningTrackerService, add imports |
| `src/modules/assignment/assignment.service.ts` | Call learningTracker.recordActivity() in complete() |
| `src/modules/assignment/assignment.module.ts` | Import LearningModule |
| `src/modules/ai/agent/tools/record-learning.ts` | Replace direct calls with learningTracker |
| `src/modules/ai/agent/prompts/tool-definitions.ts` | Add domain parameter to recordLearning |
| `src/modules/ai/ai.module.ts` | Import LearningModule (if not already) |
| `src/modules/achievements/achievements.service.ts` | Add 14 new achievement types + check logic |
| `src/modules/learning/learning.service.ts` | Call learningTracker on completion |
| `src/modules/learning/learning.controller.ts` | Extend today stats endpoint |

### Frontend
| File | Change |
|------|--------|
| `src/components/StudentDashboard.tsx` | Add achievement section + ability radar chart |
| `src/components/AIChat.tsx` | Add activity completion feedback UI |
| `src/components/parent/ParentDashboard.tsx` | Add assignment score trend + enhanced notifications |
| `src/services/api.ts` | Extend learning/assignment API calls for new data |
| `src/types/index.ts` | Add new types for activity-sourced records |

---

## Out of Scope

- Flutter mobile frontend (future phase)
- Real-time achievement push notifications (beyond existing SSE)
- Achievement sharing/social features
- Parent-defined custom achievements
