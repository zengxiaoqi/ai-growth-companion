# Learning Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect AI chat interactions and homework completion into learning records, abilities, and achievements via a unified `LearningTrackerService`.

**Architecture:** A single aggregator service (`LearningTrackerService`) is called from three trigger points (content completion, assignment completion, AI interactive activity). Each call creates a learning record, updates ability assessment via weighted moving average, and checks/awards achievements. Frontend displays achievements, ability radar, and enhanced learning stats.

**Tech Stack:** NestJS (backend), TypeORM + SQLite (data), React 19 + Vite + Tailwind CSS v4 + Framer Motion (frontend web)

**Design Spec:** `docs/superpowers/specs/2026-04-03-learning-tracker-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/backend/src/modules/learning/learning-tracker.service.ts` | Aggregator: recordActivity() → learning record + ability update + achievement check |

### Modified Backend Files
| File | Responsibility |
|------|---------------|
| `src/backend/src/modules/learning/learning.module.ts` | Register LearningTrackerService, import AchievementsModule + AbilitiesModule |
| `src/backend/src/modules/achievements/achievements.service.ts` | Add 14 new achievement types + batch check logic |
| `src/backend/src/modules/assignment/assignment.service.ts` | Call learningTracker in complete() |
| `src/backend/src/modules/assignment/assignment.module.ts` | Import LearningModule |
| `src/backend/src/modules/ai/agent/tools/record-learning.ts` | Replace direct calls with learningTracker, add domain param |
| `src/backend/src/modules/ai/agent/prompts/tool-definitions.ts` | Add domain param to recordLearning tool schema |
| `src/backend/src/modules/learning/learning.service.ts` | Call learningTracker on completion |
| `src/backend/src/modules/learning/learning.controller.ts` | Extend today stats with source breakdown |

### Modified Frontend Files
| File | Responsibility |
|------|---------------|
| `src/frontend-web/src/components/StudentDashboard.tsx` | Add achievement section + ability radar chart |
| `src/frontend-web/src/components/AIChat.tsx` | Add activity completion feedback |
| `src/frontend-web/src/components/parent/ParentDashboard.tsx` | Add assignment score trend |
| `src/frontend-web/src/services/api.ts` | Extend API calls |
| `src/frontend-web/src/types/index.ts` | Add new types |

---

## Task 1: Extend AchievementsService with new achievement types

**Files:**
- Modify: `src/backend/src/modules/achievements/achievements.service.ts`

- [ ] **Step 1: Add new achievement type names to getNameByType()**

In `src/backend/src/modules/achievements/achievements.service.ts`, replace the `getNameByType` method (lines 54-64) with:

```typescript
  private getNameByType(type: string): string {
    const names: Record<string, string> = {
      // Existing
      'first_lesson': '初次学习',
      'daily_goal': '每日目标',
      'week_streak': '连续学习',
      'language_master': '语言大师',
      'math_wizard': '数学小天才',
      'science_explorer': '科学探索者',
      // Assignment
      'first_homework': '初次完成作业',
      'homework_streak_3': '作业小能手',
      'homework_streak_7': '作业达人',
      'perfect_homework': '满分作业',
      'homework_master_10': '作业大师',
      // Interactive activity
      'first_activity': '初次互动学习',
      'activity_streak_5': '互动达人',
      'activity_master_20': '互动大师',
      'perfect_activity': '满分互动',
      // Domain
      'art_talent': '艺术天赋',
      'social_star': '社交之星',
      // General
      'daily_learner': '每日学习者',
      'explorer_5': '五域探索者',
    };
    return names[type] || '成就';
  }
```

- [ ] **Step 2: Add checkAchievements() method for batch achievement checking**

Add the following method to `AchievementsService` class (after `checkAndAward`, before `getNameByType`):

```typescript
  /**
   * Check and award multiple achievements for a user based on activity context.
   * Returns list of newly awarded achievement types.
   */
  async checkAchievements(
    userId: number,
    context: {
      type: 'content_completion' | 'assignment_completion' | 'interactive_activity';
      score: number;
      domain: string;
    },
    stats: {
      totalLearningRecords: number;
      completedAssignments: number;
      completedActivities: number;
      distinctDomains: string[];
      latestAbilityScores: Record<string, number>;
    },
  ): Promise<string[]> {
    const awarded: string[] = [];

    const check = async (type: string) => {
      const result = await this.checkAndAward(userId, type);
      if (result) awarded.push(type);
    };

    // Type-specific checks
    if (context.type === 'assignment_completion') {
      await check('first_homework');
      if (context.score === 100) await check('perfect_homework');
      if (stats.completedAssignments >= 3) await check('homework_streak_3');
      if (stats.completedAssignments >= 7) await check('homework_streak_7');
      if (stats.completedAssignments >= 10) await check('homework_master_10');
    }

    if (context.type === 'interactive_activity') {
      await check('first_activity');
      if (context.score === 100) await check('perfect_activity');
      if (stats.completedActivities >= 5) await check('activity_streak_5');
      if (stats.completedActivities >= 20) await check('activity_master_20');
    }

    if (context.type === 'content_completion') {
      await check('first_lesson');
    }

    // General checks (always run)
    if (stats.totalLearningRecords >= 3) await check('daily_learner');
    if (stats.distinctDomains.length >= 5) await check('explorer_5');

    // Domain ability achievements
    if (stats.latestAbilityScores['art'] >= 80) await check('art_talent');
    if (stats.latestAbilityScores['social'] >= 80) await check('social_star');
    if (stats.latestAbilityScores['language'] >= 80) await check('language_master');
    if (stats.latestAbilityScores['math'] >= 80) await check('math_wizard');
    if (stats.latestAbilityScores['science'] >= 80) await check('science_explorer');

    return awarded;
  }
```

- [ ] **Step 3: Add findByUserCount() method for counting user achievements**

Add before `checkAndAward`:

```typescript
  async findByUserCount(userId: number, type?: string): Promise<number> {
    const where: any = { userId };
    if (type) where.achievementType = type;
    return this.achievementRepository.count({ where });
  }
```

- [ ] **Step 4: Commit**

```bash
git add src/backend/src/modules/achievements/achievements.service.ts
git commit -m "feat(achievements): add 14 new achievement types and batch check method"
```

---

## Task 2: Create LearningTrackerService

**Files:**
- Create: `src/backend/src/modules/learning/learning-tracker.service.ts`

- [ ] **Step 1: Create the aggregator service**

Create file `src/backend/src/modules/learning/learning-tracker.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { LearningService } from './learning.service';
import { AbilitiesService } from '../abilities/abilities.service';
import { AchievementsService } from '../achievements/achievements.service';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearningRecord as LearningRecordEntity } from '../../database/entities/learning-record.entity';
import { Achievement } from '../../database/entities/achievement.entity';

export type ActivityType = 'content_completion' | 'assignment_completion' | 'interactive_activity';

export interface RecordActivityParams {
  type: ActivityType;
  childId: number;
  contentId?: number;
  assignmentId?: number;
  domain: string;
  score: number;
  durationSeconds?: number;
  metadata?: Record<string, any>;
}

export interface RecordActivityResult {
  learningRecord: LearningRecord;
  abilityUpdated: boolean;
  achievementsAwarded: string[];
}

@Injectable()
export class LearningTrackerService {
  private readonly logger = new Logger(LearningTrackerService.name);

  constructor(
    private readonly learningService: LearningService,
    private readonly abilitiesService: AbilitiesService,
    private readonly achievementsService: AchievementsService,
    @InjectRepository(LearningRecordEntity)
    private readonly recordRepo: Repository<LearningRecordEntity>,
    @InjectRepository(Achievement)
    private readonly achievementRepo: Repository<Achievement>,
  ) {}

  async recordActivity(params: RecordActivityParams): Promise<RecordActivityResult> {
    this.logger.log(`Recording activity: type=${params.type}, child=${params.childId}, domain=${params.domain}, score=${params.score}`);

    // 1. Create learning record
    const contentId = params.contentId || 0; // 0 indicates no specific content
    const record = await this.learningService.create(params.childId, contentId);
    await this.learningService.update(record.id, {
      score: params.score,
      status: 'completed',
      completedAt: new Date(),
      durationSeconds: params.durationSeconds || 0,
      interactionData: {
        source: params.type,
        assignmentId: params.assignmentId,
        domain: params.domain,
        ...params.metadata,
      },
    });

    // 2. Update ability assessment
    const abilityUpdated = await this.updateAbility(params.childId, params.domain, params.score, params.type);

    // 3. Check and award achievements
    const stats = await this.gatherStats(params.childId);
    const achievementsAwarded = await this.achievementsService.checkAchievements(
      params.childId,
      { type: params.type, score: params.score, domain: params.domain },
      stats,
    );

    this.logger.log(`Activity recorded: record=${record.id}, abilityUpdated=${abilityUpdated}, achievements=${achievementsAwarded.length}`);

    return {
      learningRecord: record,
      abilityUpdated,
      achievementsAwarded,
    };
  }

  private async updateAbility(childId: number, domain: string, score: number, source: string): Promise<boolean> {
    try {
      const latest = await this.abilitiesService.getLatestByDomain(childId, domain);
      let newScore: number;

      if (latest) {
        newScore = Math.round(0.7 * latest.score + 0.3 * score);
      } else {
        newScore = score;
      }

      await this.abilitiesService.create(childId, domain, newScore);
      return true;
    } catch (error) {
      this.logger.warn(`Failed to update ability for child=${childId}, domain=${domain}: ${error.message}`);
      return false;
    }
  }

  private async gatherStats(childId: number) {
    // Total learning records today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRecords = await this.recordRepo
      .createQueryBuilder('r')
      .where('r.userId = :childId', { childId })
      .andWhere('r.startedAt >= :today', { today })
      .getMany();

    // All-time completed assignments count
    const allAchievements = await this.achievementRepo.find({ where: { userId: childId } });

    // Distinct domains from all learning records (with interactionData containing domain)
    const allRecords = await this.recordRepo
      .createQueryBuilder('r')
      .where('r.userId = :childId', { childId })
      .getMany();

    const domains = new Set<string>();
    let completedAssignments = 0;
    let completedActivities = 0;

    for (const r of allRecords) {
      if (r.interactionData?.domain) {
        domains.add(r.interactionData.domain);
      }
      if (r.interactionData?.source === 'assignment_completion') {
        completedAssignments++;
      }
      if (r.interactionData?.source === 'interactive_activity') {
        completedActivities++;
      }
    }

    // Latest ability scores per domain
    const abilities = await this.abilitiesService.getByUser(childId);
    const latestAbilityScores: Record<string, number> = {};
    for (const a of abilities) {
      if (latestAbilityScores[a.domain] === undefined) {
        latestAbilityScores[a.domain] = a.score;
      }
    }

    return {
      totalLearningRecords: todayRecords.length,
      completedAssignments,
      completedActivities,
      distinctDomains: Array.from(domains),
      latestAbilityScores,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/src/modules/learning/learning-tracker.service.ts
git commit -m "feat(learning): create LearningTrackerService aggregator"
```

---

## Task 3: Wire LearningTrackerService into LearningModule

**Files:**
- Modify: `src/backend/src/modules/learning/learning.module.ts`

- [ ] **Step 1: Update LearningModule imports and providers**

Replace entire contents of `src/backend/src/modules/learning/learning.module.ts` with:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { ParentControl } from '../../database/entities/parent-control.entity';
import { Achievement } from '../../database/entities/achievement.entity';
import { LearningService } from './learning.service';
import { LearningTrackerService } from './learning-tracker.service';
import { LearningController } from './learning.controller';
import { SseModule } from '../sse/sse.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { AbilitiesModule } from '../abilities/abilities.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LearningRecord, ParentControl, Achievement]),
    SseModule,
    AchievementsModule,
    AbilitiesModule,
  ],
  providers: [LearningService, LearningTrackerService],
  controllers: [LearningController],
  exports: [LearningService, LearningTrackerService],
})
export class LearningModule {}
```

Key changes:
- Added `Achievement` entity to `TypeOrmModule.forFeature` (needed by `LearningTrackerService`)
- Added `AchievementsModule` and `AbilitiesModule` imports
- Added `LearningTrackerService` to providers and exports

- [ ] **Step 2: Commit**

```bash
git add src/backend/src/modules/learning/learning.module.ts
git commit -m "feat(learning): wire LearningTrackerService into module with dependencies"
```

---

## Task 4: Hook assignment completion into LearningTracker

**Files:**
- Modify: `src/backend/src/modules/assignment/assignment.service.ts`
- Modify: `src/backend/src/modules/assignment/assignment.module.ts`

- [ ] **Step 1: Inject LearningTrackerService into AssignmentService**

In `src/backend/src/modules/assignment/assignment.service.ts`, update the constructor (lines 9-16) to:

```typescript
@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    @InjectRepository(Assignment)
    private readonly assignmentRepo: Repository<Assignment>,
    private readonly generateActivityTool: GenerateActivityTool,
    private readonly learningTracker: import('../learning/learning-tracker.service').LearningTrackerService,
  ) {}
```

- [ ] **Step 2: Add learningTracker call in complete() method**

Replace the `complete()` method (lines 134-144) with:

```typescript
  async complete(id: number, result: {
    score: number;
    resultData?: any;
  }): Promise<Assignment> {
    const assignment = await this.findById(id);
    assignment.status = 'completed';
    assignment.completedAt = new Date();
    assignment.score = result.score;
    assignment.resultData = result.resultData;
    const saved = await this.assignmentRepo.save(assignment);

    // Feed into learning tracker (non-blocking — don't fail assignment save if tracker fails)
    try {
      await this.learningTracker.recordActivity({
        type: 'assignment_completion',
        childId: assignment.childId,
        assignmentId: assignment.id,
        domain: assignment.domain || 'language',
        score: result.score,
        metadata: {
          activityType: assignment.activityType,
          difficulty: assignment.difficulty,
          resultData: result.resultData,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to record learning activity for assignment ${id}: ${err.message}`);
    }

    return saved;
  }
```

- [ ] **Step 3: Add LearningModule import to AssignmentModule**

In `src/backend/src/modules/assignment/assignment.module.ts`, add `LearningModule` to imports. Replace entire file:

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from '../../database/entities/assignment.entity';
import { AssignmentService } from './assignment.service';
import { AssignmentController } from './assignment.controller';
import { AiModule } from '../ai/ai.module';
import { LearningModule } from '../learning/learning.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Assignment]),
    forwardRef(() => AiModule),
    LearningModule,
  ],
  providers: [AssignmentService],
  controllers: [AssignmentController],
  exports: [AssignmentService],
})
export class AssignmentModule {}
```

- [ ] **Step 4: Commit**

```bash
git add src/backend/src/modules/assignment/assignment.service.ts src/backend/src/modules/assignment/assignment.module.ts
git commit -m "feat(assignment): hook completion into LearningTracker for records + achievements"
```

---

## Task 5: Hook AI interactive activity into LearningTracker

**Files:**
- Modify: `src/backend/src/modules/ai/agent/tools/record-learning.ts`
- Modify: `src/backend/src/modules/ai/agent/prompts/tool-definitions.ts`

- [ ] **Step 1: Replace RecordLearningTool to use LearningTrackerService**

Replace entire contents of `src/backend/src/modules/ai/agent/tools/record-learning.ts` with:

```typescript
import { Injectable } from '@nestjs/common';
import { LearningTrackerService } from '../../../learning/learning-tracker.service';

@Injectable()
export class RecordLearningTool {
  constructor(private readonly learningTracker: LearningTrackerService) {}

  async execute(args: {
    childId: number;
    contentId: number;
    score: number;
    domain: string;
  }): Promise<string> {
    try {
      if (args.score < 0 || args.score > 100) {
        return JSON.stringify({ error: '分数必须在0-100之间' });
      }

      const result = await this.learningTracker.recordActivity({
        type: 'interactive_activity',
        childId: args.childId,
        contentId: args.contentId,
        domain: args.domain,
        score: args.score,
        metadata: { toolName: 'recordLearning' },
      });

      return JSON.stringify({
        success: true,
        message: `学习记录已保存，得分：${args.score}。${result.achievementsAwarded.length > 0 ? `获得新成就：${result.achievementsAwarded.join('、')}！` : ''}`,
        recordId: result.learningRecord.id,
        abilityUpdated: result.abilityUpdated,
        achievementsAwarded: result.achievementsAwarded,
      });
    } catch (error) {
      return JSON.stringify({ error: `记录学习结果失败: ${error.message}` });
    }
  }
}
```

- [ ] **Step 2: Add domain parameter to recordLearning tool definition**

In `src/backend/src/modules/ai/agent/prompts/tool-definitions.ts`, find the `recordLearning` tool definition (lines 117-130) and replace with:

```typescript
  {
    type: 'function',
    function: {
      name: 'recordLearning',
      description: '记录一次学习结果。当孩子完成了一个测验或学习活动后调用，用于更新学习记录和能力评估。请根据对话上下文判断学习领域。',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: '孩子的用户ID' },
          contentId: { type: 'number', description: '学习内容的ID' },
          score: { type: 'number', description: '得分 0-100', minimum: 0, maximum: 100 },
          domain: { type: 'string', enum: ['language', 'math', 'science', 'art', 'social'], description: '学习领域：language=语言, math=数学, science=科学, art=艺术, social=社会。根据对话内容推断。' },
        },
        required: ['childId', 'contentId', 'score', 'domain'],
      },
    },
  },
```

- [ ] **Step 3: Commit**

```bash
git add src/backend/src/modules/ai/agent/tools/record-learning.ts src/backend/src/modules/ai/agent/prompts/tool-definitions.ts
git commit -m "feat(ai): hook recordLearning tool into LearningTracker with domain param"
```

---

## Task 6: Hook content learning completion into LearningTracker

**Files:**
- Modify: `src/backend/src/modules/learning/learning.service.ts`

- [ ] **Step 1: Inject LearningTrackerService and Content entity into LearningService**

In `src/backend/src/modules/learning/learning.service.ts`, update imports and constructor. Replace lines 1-17 with:

```typescript
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { ParentControl } from '../../database/entities/parent-control.entity';
import { Content } from '../../database/entities/content.entity';
import { SseService } from '../sse/sse.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(
    @InjectRepository(LearningRecord)
    private recordRepository: Repository<LearningRecord>,
    @InjectRepository(ParentControl)
    private controlRepository: Repository<ParentControl>,
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
    private sseService: SseService,
  ) {}
```

- [ ] **Step 2: Add tracker call after completion notification in update()**

Replace the `update()` method (lines 44-61) with:

```typescript
  async update(id: number, data: Partial<LearningRecord>) {
    await this.recordRepository.update(id, data);
    const record = await this.findById(id);

    // Notify parent via SSE on completion
    if (record && data.status === 'completed') {
      const parentControl = await this.controlRepository.findOne({ where: { childId: record.userId } });
      if (parentControl) {
        this.sseService.sendToUser(parentControl.parentId, 'learning_completed', {
          childId: record.userId,
          recordId: id,
          score: record.score,
        });
      }
    }

    return record;
  }
```

Note: The LearningTracker call for content_completion happens at the controller level (see Task 7), not here, to avoid the tracker calling back into LearningService.update() and causing infinite recursion.

- [ ] **Step 3: Commit**

```bash
git add src/backend/src/modules/learning/learning.service.ts
git commit -m "refactor(learning): inject Content repo for domain lookup"
```

---

## Task 7: Extend LearningController to call LearningTracker on completion

**Files:**
- Modify: `src/backend/src/modules/learning/learning.controller.ts`

- [ ] **Step 1: Inject LearningTrackerService and call on complete**

Replace entire contents of `src/backend/src/modules/learning/learning.controller.ts` with:

```typescript
import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LearningService } from './learning.service';
import { LearningTrackerService } from './learning-tracker.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('学习记录')
@Controller('learning')
export class LearningController {
  constructor(
    private learningService: LearningService,
    private learningTracker: LearningTrackerService,
  ) {}

  @Post('start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '开始学习' })
  async start(@Body() body: { childId: number; contentId: number }) {
    return this.learningService.create(body.childId, body.contentId);
  }

  @Post('complete/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '完成学习' })
  async complete(@Param('id') id: string, @Body() body: any) {
    const record = await this.learningService.update(+id, { ...body, status: 'completed' });

    // Feed into learning tracker
    if (record) {
      try {
        // Look up content domain
        const content = await this.learningService['contentRepository'].findOne({
          where: { id: record.contentId },
        });
        await this.learningTracker.recordActivity({
          type: 'content_completion',
          childId: record.userId,
          contentId: record.contentId,
          domain: content?.domain || 'language',
          score: body.score || 0,
          durationSeconds: body.durationSeconds,
        });
      } catch (err) {
        // Don't fail the completion request if tracker fails
      }
    }

    return record;
  }

  @Get('history/:userId')
  @ApiOperation({ summary: '学习历史' })
  async history(@Param('userId') userId: string, @Query('limit') limit?: string) {
    return this.learningService.findByUser(+userId, +limit || 10);
  }

  @Get('today/:userId')
  @ApiOperation({ summary: '今日学习统计' })
  async today(@Param('userId') userId: string) {
    return this.learningService.getTodayStats(+userId);
  }
}
```

**Wait** — accessing `this.learningService['contentRepository']` is a code smell. Let me fix this properly by adding a `findById()` method to `Content` module or by having the controller inject a content repo.

**Better approach**: Add a `getContentById` method to `LearningService`:

Actually, the simplest approach is to inject `@InjectRepository(Content)` directly in the controller. Replace the controller with:

```typescript
import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearningService } from './learning.service';
import { LearningTrackerService } from './learning-tracker.service';
import { Content } from '../../database/entities/content.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('学习记录')
@Controller('learning')
export class LearningController {
  constructor(
    private learningService: LearningService,
    private learningTracker: LearningTrackerService,
    @InjectRepository(Content)
    private contentRepo: Repository<Content>,
  ) {}

  @Post('start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '开始学习' })
  async start(@Body() body: { childId: number; contentId: number }) {
    return this.learningService.create(body.childId, body.contentId);
  }

  @Post('complete/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '完成学习' })
  async complete(@Param('id') id: string, @Body() body: any) {
    const record = await this.learningService.update(+id, { ...body, status: 'completed' });

    // Feed into learning tracker
    if (record) {
      try {
        const content = await this.contentRepo.findOne({ where: { id: record.contentId } });
        await this.learningTracker.recordActivity({
          type: 'content_completion',
          childId: record.userId,
          contentId: record.contentId,
          domain: content?.domain || 'language',
          score: body.score || 0,
          durationSeconds: body.durationSeconds,
        });
      } catch (err) {
        // Don't fail completion if tracker fails
      }
    }

    return record;
  }

  @Get('history/:userId')
  @ApiOperation({ summary: '学习历史' })
  async history(@Param('userId') userId: string, @Query('limit') limit?: string) {
    return this.learningService.findByUser(+userId, +limit || 10);
  }

  @Get('today/:userId')
  @ApiOperation({ summary: '今日学习统计' })
  async today(@Param('userId') userId: string) {
    return this.learningService.getTodayStats(+userId);
  }
}
```

Also need to add `Content` entity to the module's `TypeOrmModule.forFeature`. Update `learning.module.ts` Task 3's code — add `Content` import:

```typescript
import { Content } from '../../database/entities/content.entity';
// ...
TypeOrmModule.forFeature([LearningRecord, ParentControl, Achievement, Content]),
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/src/modules/learning/learning.controller.ts src/backend/src/modules/learning/learning.module.ts
git commit -m "feat(learning): call LearningTracker on content completion"
```

---

## Task 8: Extend today stats endpoint with source breakdown

**Files:**
- Modify: `src/backend/src/modules/learning/learning.service.ts`

- [ ] **Step 1: Add getTodayStatsWithSources() method**

Add to `LearningService` class (after `getTodayStats`, before `enforceTimeLimit`):

```typescript
  async getTodayStatsWithSources(userId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const records = await this.recordRepository
      .createQueryBuilder('record')
      .where('record.userId = :userId', { userId })
      .andWhere('record.startedAt >= :today', { today })
      .getMany();

    const totalMinutes = records.reduce((sum, r) => sum + (r.durationSeconds || 0), 0) / 60;
    const completedCount = records.filter(r => r.status === 'completed').length;

    // Breakdown by source
    const sources = {
      content: 0,
      assignment: 0,
      activity: 0,
      unknown: 0,
    };

    for (const r of records) {
      const source = r.interactionData?.source;
      if (source === 'content_completion') sources.content++;
      else if (source === 'assignment_completion') sources.assignment++;
      else if (source === 'interactive_activity') sources.activity++;
      else sources.unknown++;
    }

    return {
      totalMinutes: Math.round(totalMinutes),
      completedCount,
      recordsCount: records.length,
      sources,
    };
  }
```

- [ ] **Step 2: Add new controller endpoint for source stats**

In `src/backend/src/modules/learning/learning.controller.ts`, add after the existing `today` endpoint:

```typescript
  @Get('today-detail/:userId')
  @ApiOperation({ summary: '今日学习统计（含来源分类）' })
  async todayDetail(@Param('userId') userId: string) {
    return this.learningService.getTodayStatsWithSources(+userId);
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/backend/src/modules/learning/learning.service.ts src/backend/src/modules/learning/learning.controller.ts
git commit -m "feat(learning): add today stats with source breakdown endpoint"
```

---

## Task 9: Verify backend compiles and fix any issues

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript compilation**

```bash
cd src/backend && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 2: Fix any compilation errors**

If errors appear, fix them. Common issues to watch for:
- Circular dependency between LearningModule and AssignmentModule (use `forwardRef` if needed)
- Missing `@InjectRepository` for new entities
- Type mismatches in method signatures

- [ ] **Step 3: Start dev server and verify**

```bash
cd src/backend && npm run start:dev
```

Expected: Server starts on :3000 without errors.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: resolve compilation issues from learning tracker integration"
```

---

## Task 10: Frontend — Add types and API extensions

**Files:**
- Modify: `src/frontend-web/src/types/index.ts`
- Modify: `src/frontend-web/src/services/api.ts`

- [ ] **Step 1: Add new types to types/index.ts**

Append to the end of `src/frontend-web/src/types/index.ts`:

```typescript
// Learning Tracker types
export interface TodayStatsWithSources {
  totalMinutes: number;
  completedCount: number;
  recordsCount: number;
  sources: {
    content: number;
    assignment: number;
    activity: number;
    unknown: number;
  };
}

export interface AchievementDisplay {
  id: number;
  uuid: string;
  userId: number;
  achievementType: string;
  achievementName: string;
  description?: string;
  icon?: string;
  earnedAt: string;
}

export interface ActivityFeedback {
  score: number;
  total: number;
  correct: number;
  domain: string;
  message: string;
}
```

- [ ] **Step 2: Add new API methods to api.ts**

In `src/frontend-web/src/services/api.ts`, add the following methods to the `ApiService` class:

```typescript
  // Learning tracker
  async getTodayStatsDetail(userId: number): Promise<TodayStatsWithSources> {
    const response = await fetch(`${this.baseUrl}/learning/today-detail/${userId}`, {
      headers: { 'Authorization': `Bearer ${this.getToken()}` },
    });
    return response.json();
  }

  async getAchievements(userId: number): Promise<AchievementDisplay[]> {
    const response = await fetch(`${this.baseUrl}/achievements/user/${userId}`, {
      headers: { 'Authorization': `Bearer ${this.getToken()}` },
    });
    return response.json();
  }
```

Also import the new types at the top of api.ts:

```typescript
import { ..., TodayStatsWithSources, AchievementDisplay } from '../types';
```

- [ ] **Step 3: Commit**

```bash
git add src/frontend-web/src/types/index.ts src/frontend-web/src/services/api.ts
git commit -m "feat(frontend): add learning tracker types and API methods"
```

---

## Task 11: Frontend — Student achievement display + ability radar

**Files:**
- Modify: `src/frontend-web/src/components/StudentDashboard.tsx`

- [ ] **Step 1: Add achievement section to StudentDashboard**

In `StudentDashboard.tsx`, add a state for achievements and an achievement display section. After the existing daily stats section, add a "我的成就" card.

The implementation should:
- Fetch achievements via `api.getAchievements(childId)` on component mount
- Display the 3 most recent achievements with icon + name + earnedAt
- Use Framer Motion `AnimatePresence` for entrance animation
- Have an expandable full list triggered by "查看全部" button
- Use existing Tailwind CSS styling patterns from the dashboard

Achievement icons mapping (emoji-based, matching the child-friendly design):
```typescript
const achievementIcons: Record<string, string> = {
  first_lesson: '📚', daily_goal: '🎯', week_streak: '🔥',
  language_master: '📖', math_wizard: '🔢', science_explorer: '🔬',
  first_homework: '📝', homework_streak_3: '✏️', homework_streak_7: '🏆',
  perfect_homework: '💯', homework_master_10: '👑',
  first_activity: '🎮', activity_streak_5: '⭐', activity_master_20: '🌟',
  perfect_activity: '🎯', art_talent: '🎨', social_star: '🤝',
  daily_learner: '📅', explorer_5: '🗺️',
};
```

- [ ] **Step 2: Add ability radar chart section**

After the achievement section, add a 5-dimension ability overview:
- Use SVG to render a simple radar/spider chart (no external library needed)
- Fetch data from `api.getReport({ userId: childId, period: 'weekly' })`
- Display `skillProgress` values for language/math/science/art/social
- Use domain-specific colors matching the existing curriculum section
- Each domain label is clickable, triggering `onSelectContent` with domain filter

Domain display config (matching existing dashboard patterns):
```typescript
const domainConfig = [
  { key: 'language', label: '语言', icon: '📖', color: '#FF6B6B' },
  { key: 'math', label: '数学', icon: '🔢', color: '#4ECDC4' },
  { key: 'science', label: '科学', icon: '🔬', color: '#45B7D1' },
  { key: 'art', label: '艺术', icon: '🎨', color: '#FFA07A' },
  { key: 'social', label: '社会', icon: '🤝', color: '#98D8C8' },
];
```

- [ ] **Step 3: Commit**

```bash
git add src/frontend-web/src/components/StudentDashboard.tsx
git commit -m "feat(student-dashboard): add achievement display and ability radar chart"
```

---

## Task 12: Frontend — AI Chat activity completion feedback

**Files:**
- Modify: `src/frontend-web/src/components/AIChat.tsx`

- [ ] **Step 1: Add feedback UI after interactive activity completion**

In `AIChat.tsx`, after the existing game rendering logic (when `generateActivity` tool returns results and the child completes the activity), add a feedback overlay:

- Show a brief result card: "太棒了！你答对了 X/Y 题！" or "加油！继续努力！"
- Display the score as a colored progress bar (green ≥ 80, yellow ≥ 60, red < 60)
- Show a domain improvement hint: "你的数学能力提升了！"
- Auto-dismiss after 5 seconds or on tap
- Use Framer Motion for entrance/exit animation

The feedback should be triggered when:
1. The `generateActivity` tool returns a `game_data` SSE event
2. The child submits answers (existing game completion flow)
3. The `recordLearning` tool is called (new `domain` param available)

- [ ] **Step 2: Commit**

```bash
git add src/frontend-web/src/components/AIChat.tsx
git commit -m "feat(ai-chat): add interactive activity completion feedback"
```

---

## Task 13: Frontend — Parent dashboard assignment trends

**Files:**
- Modify: `src/frontend-web/src/components/parent/ParentDashboard.tsx`

- [ ] **Step 1: Add assignment score trend chart**

In the parent dashboard, add a score trend section for completed assignments:

- Fetch assignments via `api.getChildAssignments(childId)`
- Filter completed assignments, sort by completedAt
- Render a simple line chart using SVG (score over time)
- Show average score, highest score, and completion rate stats
- Style matches existing parent dashboard design (Tailwind + card layout)

- [ ] **Step 2: Commit**

```bash
git add src/frontend-web/src/components/parent/ParentDashboard.tsx
git commit -m "feat(parent-dashboard): add assignment score trend chart"
```

---

## Task 14: Final verification — full stack

**Files:** None (verification only)

- [ ] **Step 1: Backend compilation check**

```bash
cd src/backend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Frontend typecheck**

```bash
cd src/frontend-web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Frontend build**

```bash
cd src/frontend-web && npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Start both servers and manual smoke test**

```bash
# Terminal 1: Backend
cd src/backend && npm run start:dev

# Terminal 2: Frontend
cd src/frontend-web && npm run dev
```

Smoke test checklist:
1. Login with test account (13800000001 / password123)
2. Complete a learning content → verify learning record created
3. Open AI chat → generate an activity → complete it → verify feedback shows
4. Go to parent dashboard → verify assignment trend chart renders
5. Check student dashboard → verify achievements display and ability radar

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "feat: complete learning tracker integration — full stack"
```
