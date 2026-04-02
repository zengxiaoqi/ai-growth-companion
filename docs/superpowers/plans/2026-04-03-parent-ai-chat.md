# Parent AI Chat-Driven Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the parent dashboard from a broken AI chat + static dashboard into a chat-first interface where all features (reports, controls, assignments) are accessible through AI dialogue with a tab-based fallback view.

**Architecture:** Extend the existing AI module with parent-mode prompts and tools. The frontend ParentDashboard becomes a full-screen AI chat with a bottom tab bar for report/controls/assignments views. Backend adds parent-specific tools (listChildren, viewReport, viewAbilities, viewTrend, updateParentControl, listAssignments) and a parent system prompt.

**Tech Stack:** NestJS (backend), React 19 + Tailwind CSS v4 (frontend), existing AI agent framework with LLM tool-calling.

---

### Task 1: Backend — Update ChatRequest to support parentId

**Files:**
- Modify: `src/backend/src/modules/ai/ai.types.ts`
- Modify: `src/backend/src/modules/ai/ai.controller.ts`
- Modify: `src/backend/src/modules/ai/ai.service.ts`

- [ ] **Step 1: Update ChatRequest interface in ai.types.ts**

In `src/backend/src/modules/ai/ai.types.ts`, change the `ChatRequest` interface to make `childId` optional and add `parentId`:

```typescript
export interface ChatRequest {
  message: string;
  childId?: number;
  parentId?: number;
  sessionId?: string;
  context?: {
    age?: number;
    currentPage?: string;
  };
}
```

- [ ] **Step 2: Update AiController to accept parentId**

In `src/backend/src/modules/ai/ai.controller.ts`, update the `chat` endpoint body type (line 16) and the `chatStream` endpoint (lines 26-77) to accept and pass `parentId`:

For `POST /ai/chat` (line 13-24):
```typescript
@Post('chat')
@ApiOperation({ summary: 'AI 对话（Agent 模式）' })
async chat(
  @Body() body: { message: string; childId?: number; parentId?: number; sessionId?: string; context?: any },
) {
  return this.aiService.chat({
    message: body.message,
    childId: body.childId,
    parentId: body.parentId,
    sessionId: body.sessionId,
    context: body.context,
  });
}
```

For `GET /ai/chat/stream` (lines 26-77), add `parentId` query param:
```typescript
@Get('chat/stream')
@ApiOperation({ summary: 'AI 对话（流式 SSE）' })
async chatStream(
  @Query('message') message: string,
  @Query('childId') childId: string,
  @Query('parentId') parentId: string,
  @Query('sessionId') sessionId: string,
  @Res() res: Response,
) {
  // ... existing SSE headers setup (lines 34-38 stay the same) ...

  try {
    const stream = this.aiService.chatStream({
      message,
      childId: childId ? +childId : undefined,
      parentId: parentId ? +parentId : undefined,
      sessionId: sessionId || undefined,
    });
    // ... rest stays the same ...
  }
}
```

- [ ] **Step 3: Update AiService.chat() to handle parent mode**

In `src/backend/src/modules/ai/ai.service.ts`, update the `chat()` method (lines 33-82) to detect parent mode:

```typescript
async chat(params: ChatRequest): Promise<ChatResponse> {
  const { message, childId, parentId, sessionId, context } = params;

  // Parent mode
  if (parentId && !childId) {
    const parent = await this.usersService.findById(parentId);
    if (!parent) {
      return { reply: '找不到您的信息，请重新登录试试~', sessionId: '' };
    }
    if (!this.llmConfig.isConfigured) {
      return this.fallbackChat(message, parentId);
    }
    try {
      const session = await this.conversationManager.getOrCreateSession(parentId, sessionId);
      await this.conversationManager.updateMetadata(session.uuid, { parentId });
      const result = await this.agentExecutor.execute(
        session.uuid,
        message,
        'parent',
        parent.name || '家长',
      );
      const suggestions = this.generateParentSuggestions();
      return { reply: result.reply, sessionId: session.uuid, suggestions, toolCalls: result.toolCalls };
    } catch (error) {
      this.logger.error(`Parent agent chat failed: ${error.message}`);
      return this.fallbackChat(message, parentId);
    }
  }

  // Child mode (existing logic, lines 37-82 unchanged)
  const user = await this.usersService.findById(childId!);
  if (!user) {
    return { reply: '找不到你的信息，请重新登录试试~', sessionId: '' };
  }
  // ... rest of existing child mode code ...
}
```

- [ ] **Step 4: Update AiService.chatStream() to handle parent mode**

In the same file, update `chatStream()` (lines 85-145) similarly. Add parent mode detection before the existing child mode code:

```typescript
async *chatStream(params: ChatRequest): AsyncGenerator<...> {
  const { message, childId, parentId, sessionId, context } = params;

  // Parent mode
  if (parentId && !childId) {
    const parent = await this.usersService.findById(parentId);
    if (!parent) {
      yield { type: 'error', message: '找不到您的信息' };
      return;
    }
    if (!this.llmConfig.isConfigured) {
      const fallback = this.getFallbackResponse(message);
      yield { type: 'token', content: fallback };
      yield { type: 'done', suggestions: [] };
      return;
    }
    try {
      const session = await this.conversationManager.getOrCreateSession(parentId, sessionId);
      await this.conversationManager.updateMetadata(session.uuid, { parentId });
      const suggestions = this.generateParentSuggestions();
      for await (const event of this.agentExecutor.executeStream(session.uuid, message, 'parent', parent.name || '家长')) {
        if (event.type === 'done') {
          yield { ...event, sessionId: session.uuid, suggestions };
        } else {
          yield event;
        }
      }
    } catch (error) {
      this.logger.error(`Parent stream failed: ${error.message}`);
      yield { type: 'error', message: 'AI暂时无法回答，请稍后再试~' };
    }
    return;
  }

  // Existing child mode code (lines 102-145) unchanged below...
  const user = await this.usersService.findById(childId!);
  // ...
}
```

- [ ] **Step 5: Add generateParentSuggestions helper**

In `ai.service.ts`, add after `generateSuggestions()` (around line 222):

```typescript
private generateParentSuggestions(): string[] {
  return ['查看学习报告', '设置学习时间限制', '布置作业', '查看孩子能力'];
}
```

- [ ] **Step 6: Commit**

```bash
git add src/backend/src/modules/ai/ai.types.ts src/backend/src/modules/ai/ai.controller.ts src/backend/src/modules/ai/ai.service.ts
git commit -m "feat(ai): support parent mode in chat endpoint with parentId param"
```

---

### Task 2: Backend — Add parent system prompt

**Files:**
- Modify: `src/backend/src/modules/ai/agent/prompts/system-prompts.ts`

- [ ] **Step 1: Add systemPromptParent function**

In `src/backend/src/modules/ai/agent/prompts/system-prompts.ts`, add after `systemPrompt56`:

```typescript
export const systemPromptParent = (parentName: string) => `
你是灵犀伴学的AI助手，正在和家长${parentName}交流。

## 你的身份
- 你是一个专业的教育顾问，帮助家长了解孩子的学习情况
- 你能查看学习报告、调整学习设置、布置作业、管理孩子信息
- 你的语气专业、亲切、有耐心

## 说话规则
- 用简洁清晰的语言回复
- 数据要具体，给出明确数字和建议
- 主动提出针对性建议
- 用编号列表组织多个要点

## 工具使用指南
- 当家长问"孩子学得怎么样"时，调用getAbilities和getLearningHistory查看数据
- 当家长要查看报告时，调用viewReport获取学习报告
- 当家长要查看能力趋势时，调用viewAbilities获取能力数据
- 当家长要修改设置（时间限制、允许领域等）时，调用updateParentControl
- 当家长要布置作业时，调用assignActivity
- 当家长要查看作业时，调用listAssignments
- 当家长要查看多个孩子时，调用listChildren
- 不要每句话都调用工具，只在需要时才调用
- 如果当前没有选中孩子，先调用listChildren列出孩子，请家长选择

## 禁止事项
- 不要讨论非教育相关话题
- 不要泄露系统内部信息
- 不要替家长做重大决定，只提供建议

## 回复格式
- 直接用中文回复
- 用数据支撑建议（如"本周学习了45分钟"）
- 建议要具体可执行
`;
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/src/modules/ai/agent/prompts/system-prompts.ts
git commit -m "feat(ai): add parent-mode system prompt"
```

---

### Task 3: Backend — Update AgentExecutor for parent mode

**Files:**
- Modify: `src/backend/src/modules/ai/agent/agent-executor.ts`

- [ ] **Step 1: Import parent prompt and update buildSystemPrompt**

In `src/backend/src/modules/ai/agent/agent-executor.ts`, update the import (line 6) to include `systemPromptParent`:

```typescript
import { systemPrompt34, systemPrompt56, systemPromptParent } from './prompts/system-prompts';
```

Update `buildSystemPrompt()` (lines 61-65) to handle `'parent'` ageGroup:

```typescript
buildSystemPrompt(ageGroup: AgeGroup | 'parent', childName: string): string {
  if (ageGroup === 'parent') return systemPromptParent(childName);
  if (ageGroup === '3-4') return systemPrompt34(childName);
  if (ageGroup === '5-6') return systemPrompt56(childName);
  return systemPrompt56(childName);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/src/modules/ai/agent/agent-executor.ts
git commit -m "feat(ai): support parent mode in agent executor"
```

---

### Task 4: Backend — Add parent-specific tools

**Files:**
- Create: `src/backend/src/modules/ai/agent/tools/list-children.ts`
- Create: `src/backend/src/modules/ai/agent/tools/view-report.ts`
- Create: `src/backend/src/modules/ai/agent/tools/view-abilities.ts`
- Create: `src/backend/src/modules/ai/agent/tools/update-parent-control.ts`
- Create: `src/backend/src/modules/ai/agent/tools/list-assignments.ts`
- Modify: `src/backend/src/modules/ai/agent/prompts/tool-definitions.ts`
- Modify: `src/backend/src/modules/ai/agent/tool-registry.ts`
- Modify: `src/backend/src/modules/ai/ai.module.ts`

- [ ] **Step 1: Create list-children.ts tool**

Create `src/backend/src/modules/ai/agent/tools/list-children.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { UsersService } from '../../../users/users.service';

@Injectable()
export class ListChildrenTool {
  constructor(private readonly usersService: UsersService) {}

  async execute(args: { parentId: number }): Promise<string> {
    try {
      const children = await this.usersService.findByParentId(args.parentId);
      return JSON.stringify({
        children: children.map(c => ({
          id: c.id,
          name: c.name,
          age: c.age,
          gender: c.gender,
          avatar: c.avatar,
        })),
      });
    } catch (error) {
      return JSON.stringify({ error: `获取孩子列表失败: ${error.message}` });
    }
  }
}
```

- [ ] **Step 2: Create view-report.ts tool**

Create `src/backend/src/modules/ai/agent/tools/view-report.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ReportService } from '../../../report/report.service';

@Injectable()
export class ViewReportTool {
  constructor(private readonly reportService: ReportService) {}

  async execute(args: { childId: number; period?: 'daily' | 'weekly' | 'monthly' }): Promise<string> {
    try {
      const period = args.period || 'weekly';
      const report = await this.reportService.generateReport({ userId: args.childId, period });
      return JSON.stringify({
        period,
        totalLearningTime: report.totalLearningTime,
        totalLessonsCompleted: report.totalLessonsCompleted,
        averageScore: report.averageScore,
        streak: report.streak,
        skillProgress: report.skillProgress,
        insights: report.insights,
        summary: report.summary,
      });
    } catch (error) {
      return JSON.stringify({ error: `获取报告失败: ${error.message}` });
    }
  }
}
```

- [ ] **Step 3: Create view-abilities.ts tool**

Create `src/backend/src/modules/ai/agent/tools/view-abilities.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { AbilitiesService } from '../../../abilities/abilities.service';
import { ReportService } from '../../../report/report.service';

@Injectable()
export class ViewAbilitiesTool {
  constructor(
    private readonly abilitiesService: AbilitiesService,
    private readonly reportService: ReportService,
  ) {}

  async execute(args: { childId: number }): Promise<string> {
    try {
      const [abilities, trend] = await Promise.all([
        this.abilitiesService.getByUser(args.childId),
        this.reportService.getAbilityTrend(args.childId, 4),
      ]);

      const domainLabels: Record<string, string> = {
        language: '语言表达',
        math: '数学逻辑',
        science: '科学探索',
        art: '艺术创造',
        social: '社会交往',
      };

      return JSON.stringify({
        abilities: abilities.map(a => ({
          domain: a.domain,
          domainLabel: domainLabels[a.domain] || a.domain,
          score: a.score,
          level: a.level,
        })),
        trend,
      });
    } catch (error) {
      return JSON.stringify({ error: `获取能力数据失败: ${error.message}` });
    }
  }
}
```

- [ ] **Step 4: Create update-parent-control.ts tool**

Create `src/backend/src/modules/ai/agent/tools/update-parent-control.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ParentService } from '../../../parent/parent.service';

@Injectable()
export class UpdateParentControlTool {
  constructor(private readonly parentService: ParentService) {}

  async execute(args: {
    parentId: number;
    childId?: number;
    dailyLimitMinutes?: number;
    allowedDomains?: string[];
    blockedTopics?: string[];
    eyeProtectionEnabled?: boolean;
    restReminderMinutes?: number;
  }): Promise<string> {
    try {
      let control = await this.parentService.getByParent(args.parentId);

      const updateData: Record<string, any> = {};
      if (args.dailyLimitMinutes !== undefined) updateData.dailyLimitMinutes = args.dailyLimitMinutes;
      if (args.allowedDomains !== undefined) updateData.allowedDomains = args.allowedDomains;
      if (args.blockedTopics !== undefined) updateData.blockedTopics = args.blockedTopics;
      if (args.eyeProtectionEnabled !== undefined) updateData.eyeProtectionEnabled = args.eyeProtectionEnabled;
      if (args.restReminderMinutes !== undefined) updateData.restReminderMinutes = args.restReminderMinutes;
      if (args.childId !== undefined) updateData.childId = args.childId;

      if (control.id === 0) {
        control = await this.parentService.createWithDefaults(args.parentId);
      }

      const updated = await this.parentService.update(control.id, updateData);
      return JSON.stringify({
        success: true,
        message: '设置已更新',
        controls: {
          dailyLimitMinutes: updated.dailyLimitMinutes,
          allowedDomains: updated.allowedDomains,
          blockedTopics: updated.blockedTopics,
          eyeProtectionEnabled: updated.eyeProtectionEnabled,
          restReminderMinutes: updated.restReminderMinutes,
        },
      });
    } catch (error) {
      return JSON.stringify({ error: `更新设置失败: ${error.message}` });
    }
  }
}
```

- [ ] **Step 5: Create list-assignments.ts tool**

Create `src/backend/src/modules/ai/agent/tools/list-assignments.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { AssignmentService } from '../../../assignment/assignment.service';

@Injectable()
export class ListAssignmentsTool {
  constructor(private readonly assignmentService: AssignmentService) {}

  async execute(args: { childId: number }): Promise<string> {
    try {
      const assignments = await this.assignmentService.findByChild(args.childId);
      return JSON.stringify({
        assignments: assignments.map(a => ({
          id: a.id,
          activityType: a.activityType,
          domain: a.domain,
          difficulty: a.difficulty,
          status: a.status,
          dueDate: a.dueDate,
          score: a.score,
          createdAt: a.createdAt,
        })),
      });
    } catch (error) {
      return JSON.stringify({ error: `获取作业列表失败: ${error.message}` });
    }
  }
}
```

- [ ] **Step 6: Add tool definitions**

In `src/backend/src/modules/ai/agent/prompts/tool-definitions.ts`, append these 5 new tools to the `toolDefinitions` array (before the closing `];`):

```typescript
  {
    type: 'function',
    function: {
      name: 'listChildren',
      description: '获取家长关联的所有孩子列表。当家长想查看或切换孩子时调用。',
      parameters: {
        type: 'object',
        properties: {
          parentId: { type: 'number', description: '家长用户ID' },
        },
        required: ['parentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'viewReport',
      description: '查看孩子的学习报告，包含学习时长、完成课程数、平均分、连续学习天数等。当家长问孩子学习情况时调用。',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: '孩子用户ID' },
          period: { type: 'string', enum: ['daily', 'weekly', 'monthly'], description: '报告周期，默认weekly' },
        },
        required: ['childId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'viewAbilities',
      description: '查看孩子各领域能力评估（语言、数学、科学、艺术、社会）及近期趋势。当家长问孩子能力水平时调用。',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: '孩子用户ID' },
        },
        required: ['childId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateParentControl',
      description: '修改家长控制设置，包括每日学习时间限制、允许的学习领域、屏蔽的主题等。当家长要求调整设置时调用。',
      parameters: {
        type: 'object',
        properties: {
          parentId: { type: 'number', description: '家长用户ID' },
          childId: { type: 'number', description: '孩子用户ID（可选）' },
          dailyLimitMinutes: { type: 'number', description: '每日学习时间限制（分钟）' },
          allowedDomains: { type: 'array', items: { type: 'string' }, description: '允许的学习领域' },
          blockedTopics: { type: 'array', items: { type: 'string' }, description: '屏蔽的主题' },
          eyeProtectionEnabled: { type: 'boolean', description: '是否开启护眼模式' },
          restReminderMinutes: { type: 'number', description: '休息提醒间隔（分钟）' },
        },
        required: ['parentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listAssignments',
      description: '查看孩子的作业列表，包含作业类型、状态、分数等。当家长问作业情况时调用。',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'number', description: '孩子用户ID' },
        },
        required: ['childId'],
      },
    },
  },
```

- [ ] **Step 7: Register tools in ToolRegistry**

In `src/backend/src/modules/ai/agent/tool-registry.ts`:

Add imports at top:
```typescript
import { ListChildrenTool } from './tools/list-children';
import { ViewReportTool } from './tools/view-report';
import { ViewAbilitiesTool } from './tools/view-abilities';
import { UpdateParentControlTool } from './tools/update-parent-control';
import { ListAssignmentsTool } from './tools/list-assignments';
```

Add constructor injections:
```typescript
constructor(
  // ... existing injections ...
  private readonly listChildrenTool: ListChildrenTool,
  private readonly viewReportTool: ViewReportTool,
  private readonly viewAbilitiesTool: ViewAbilitiesTool,
  private readonly updateParentControlTool: UpdateParentControlTool,
  private readonly listAssignmentsTool: ListAssignmentsTool,
) {
  this.handlers = new Map([
    // ... existing handlers ...
    ['listChildren', (args) => this.listChildrenTool.execute(args)],
    ['viewReport', (args) => this.viewReportTool.execute(args)],
    ['viewAbilities', (args) => this.viewAbilitiesTool.execute(args)],
    ['updateParentControl', (args) => this.updateParentControlTool.execute(args)],
    ['listAssignments', (args) => this.listAssignmentsTool.execute(args)],
  ]);
}
```

- [ ] **Step 8: Register in AiModule**

In `src/backend/src/modules/ai/ai.module.ts`:

Add imports:
```typescript
import { ListChildrenTool } from './agent/tools/list-children';
import { ViewReportTool } from './agent/tools/view-report';
import { ViewAbilitiesTool } from './agent/tools/view-abilities';
import { UpdateParentControlTool } from './agent/tools/update-parent-control';
import { ListAssignmentsTool } from './agent/tools/list-assignments';
import { ReportModule } from '../report/report.module';
```

Add `ReportModule` to imports array, and add the 5 new tools to the providers array:
```typescript
imports: [
  // ... existing ...
  ReportModule,
],
providers: [
  // ... existing ...
  ListChildrenTool,
  ViewReportTool,
  ViewAbilitiesTool,
  UpdateParentControlTool,
  ListAssignmentsTool,
],
```

- [ ] **Step 9: Check ReportModule exports**

Verify `src/backend/src/modules/report/report.module.ts` exports `ReportService`. If not, add it to exports. Also check that `AbilitiesModule` exports `AbilitiesService` (it should since the AI module already imports it).

- [ ] **Step 10: Commit**

```bash
git add src/backend/src/modules/ai/agent/tools/list-children.ts src/backend/src/modules/ai/agent/tools/view-report.ts src/backend/src/modules/ai/agent/tools/view-abilities.ts src/backend/src/modules/ai/agent/tools/update-parent-control.ts src/backend/src/modules/ai/agent/tools/list-assignments.ts src/backend/src/modules/ai/agent/prompts/tool-definitions.ts src/backend/src/modules/ai/agent/tool-registry.ts src/backend/src/modules/ai/ai.module.ts
git commit -m "feat(ai): add parent-specific tools (listChildren, viewReport, viewAbilities, updateParentControl, listAssignments)"
```

---

### Task 5: Frontend — Update types and API for parentId

**Files:**
- Modify: `src/frontend-web/src/types/index.ts`
- Modify: `src/frontend-web/src/services/api.ts`

- [ ] **Step 1: Update ChatMessage type**

In `src/frontend-web/src/types/index.ts`, update the `ChatMessage` interface (lines 115-119):

```typescript
export interface ChatMessage {
  message: string;
  childId?: number;
  parentId?: number;
  sessionId?: string;
}
```

- [ ] **Step 2: Update api.ts sendChatMessageStream**

In `src/frontend-web/src/services/api.ts`, update `sendChatMessageStream()` (around lines 189-204) to include `parentId` in the URL:

```typescript
sendChatMessageStream(data: ChatMessage): Promise<Response> {
  const params = new URLSearchParams({ message: data.message });
  if (data.childId) params.append('childId', String(data.childId));
  if (data.parentId) params.append('parentId', String(data.parentId));
  if (data.sessionId) params.append('sessionId', data.sessionId);

  return fetch(`${this.baseUrl}/ai/chat/stream?${params.toString()}`, {
    headers: {
      ...(this.getToken() ? { Authorization: `Bearer ${this.getToken()}` } : {}),
    },
  });
}
```

- [ ] **Step 3: Update api.ts sendChatMessage (non-streaming)**

In the same file, update `sendChatMessage()` (around lines 181-186) to pass `parentId`:

```typescript
async sendChatMessage(data: ChatMessage): Promise<ChatResponse> {
  return this.request<ChatResponse>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
```

(This should already work since it sends the full body — no change needed unless it strips fields.)

- [ ] **Step 4: Commit**

```bash
git add src/frontend-web/src/types/index.ts src/frontend-web/src/services/api.ts
git commit -m "feat(frontend): add parentId support to chat API"
```

---

### Task 6: Frontend — Update AIChat component for parent mode

**Files:**
- Modify: `src/frontend-web/src/components/AIChat.tsx`

- [ ] **Step 1: Add parentId prop to AIChatProps**

In `src/frontend-web/src/components/AIChat.tsx`, update the `AIChatProps` interface (around lines 41-47):

```typescript
interface AIChatProps {
  childId?: number;
  parentId?: number;
  fullPage?: boolean;
  onBack?: () => void;
}
```

- [ ] **Step 2: Update handleSendStream to pass parentId**

In the same file, update `handleSendStream` (around line 130) where `api.sendChatMessageStream` is called:

```typescript
const response = await api.sendChatMessageStream({ message: messageText, childId, parentId, sessionId });
```

Also update the fallback non-streaming call (around line 212):

```typescript
const data = await api.sendChatMessage({ message: messageText, childId, parentId, sessionId });
```

- [ ] **Step 3: Update parent suggestion chips**

In the same file, find where `suggestions` state is used. When `parentId` is set (parent mode), show parent-appropriate suggestion chips. Locate the suggestions rendering section and add a parent-mode check. If the component already uses the suggestions from the server response, this should work automatically since the backend now returns parent suggestions.

- [ ] **Step 4: Commit**

```bash
git add src/frontend-web/src/components/AIChat.tsx
git commit -m "feat(frontend): add parentId prop to AIChat for parent mode"
```

---

### Task 7: Frontend — Rewrite ParentDashboard to chat-first layout

**Files:**
- Modify: `src/frontend-web/src/components/parent/ParentDashboard.tsx`

- [ ] **Step 1: Restructure ParentDashboard layout**

This is the largest frontend change. The ParentDashboard transforms from a scrollable dashboard to a chat-first layout with bottom tabs.

**State changes** — add tab state:
```typescript
const [activeTab, setActiveTab] = useState<'chat' | 'report' | 'controls' | 'assignments'>('chat');
```

**Layout structure** — replace the current dashboard layout (lines 230-370) with:

```
<div className="h-screen flex flex-col bg-gradient-to-b from-blue-50 to-indigo-50">
  {/* Top bar: child selector + title */}
  <header className="sticky top-0 z-10 bg-white shadow-sm px-4 py-3">
    {/* Avatar + 灵犀伴学 + ChildSelector + Logout */}
  </header>

  {/* Main content area — switches by tab */}
  <main className="flex-1 overflow-hidden">
    {activeTab === 'chat' && (
      <AIChat fullPage parentId={user.id} childId={selectedChildId ?? undefined} onBack={onBack} />
    )}
    {activeTab === 'report' && (
      <div className="overflow-y-auto h-full p-4">
        {/* GrowthReportSection + AbilityRadar + AbilityTrend */}
      </div>
    )}
    {activeTab === 'controls' && (
      <div className="overflow-y-auto h-full p-4">
        {/* ParentalControls */}
      </div>
    )}
    {activeTab === 'assignments' && (
      <div className="overflow-y-auto h-full p-4">
        {/* AssignmentManager */}
      </div>
    )}
  </main>

  {/* Bottom tab bar */}
  <nav className="bg-white border-t border-gray-200 px-2 py-1 flex justify-around">
    {tabs.map(tab => (
      <button
        key={tab.key}
        onClick={() => setActiveTab(tab.key)}
        className={`flex flex-col items-center py-2 px-4 ${activeTab === tab.key ? 'text-indigo-600' : 'text-gray-500'}`}
      >
        <span className="text-xl">{tab.icon}</span>
        <span className="text-xs mt-1">{tab.label}</span>
      </button>
    ))}
  </nav>
</div>
```

**Tab definitions:**
```typescript
const tabs = [
  { key: 'chat', label: '对话', icon: '💬' },
  { key: 'report', label: '报告', icon: '📊' },
  { key: 'controls', label: '控制', icon: '⚙️' },
  { key: 'assignments', label: '作业', icon: '📝' },
] as const;
```

**Key points:**
- Remove the separate `<AIChat />` floating widget at the bottom (old line 368)
- The `AIChat` is now rendered as `fullPage` in the chat tab
- Pass `parentId={user.id}` and `childId={selectedChildId ?? undefined}` to AIChat
- Keep all existing data fetching logic (report, controls, abilities, etc.) for the report/controls/assignments tabs
- Remove the welcome section, AIInsightsPanel — those are now handled through chat
- Keep header with ChildSelector at top

- [ ] **Step 2: Commit**

```bash
git add src/frontend-web/src/components/parent/ParentDashboard.tsx
git commit -m "feat(frontend): transform parent dashboard to chat-first layout with bottom tabs"
```

---

### Task 8: Frontend — Fix App.tsx global AIChat for parent view

**Files:**
- Modify: `src/frontend-web/src/App.tsx`

- [ ] **Step 1: Exclude parent view from global floating AIChat**

In `src/frontend-web/src/App.tsx`, update the global AIChat rendering condition (around lines 340-345). The parent view now manages its own AIChat, so exclude it:

```tsx
{view !== 'companion' && view !== 'login' && view !== 'register' && view !== 'parent' && (
  <Suspense fallback={null}>
    <AIChat childId={user?.type === 'child' ? user.id : undefined} />
  </Suspense>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/frontend-web/src/App.tsx
git commit -m "fix(frontend): exclude parent view from global floating AIChat"
```

---

### Task 9: Backend — Verify build and fix module imports

**Files:**
- Modify: `src/backend/src/modules/report/report.module.ts` (if needed)

- [ ] **Step 1: Check ReportModule exports**

Read `src/backend/src/modules/report/report.module.ts` and verify `ReportService` is in the `exports` array. If not, add it:

```typescript
exports: [ReportService],
```

- [ ] **Step 2: Build backend and fix any errors**

Run: `cd src/backend && npm run build`
Expected: Clean build with no TypeScript errors. Fix any type mismatches.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A src/backend/
git commit -m "fix(backend): resolve build errors for parent AI chat"
```

---

### Task 10: Frontend — Build and verify

**Files:**
- May need minor fixes in modified files

- [ ] **Step 1: Run frontend type check**

Run: `cd src/frontend-web && npm run typecheck`
Expected: No TypeScript errors. Fix any type issues.

- [ ] **Step 2: Run frontend lint**

Run: `cd src/frontend-web && npm run lint`
Expected: No errors. Fix any linting issues.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A src/frontend-web/
git commit -m "fix(frontend): resolve build errors for parent AI chat"
```

---

### Task 11: Integration test — Manual verification

- [ ] **Step 1: Start backend and frontend**

Run: `cd src/backend && npm run start:dev` (terminal 1)
Run: `cd src/frontend-web && npm run dev` (terminal 2)

- [ ] **Step 2: Test parent chat flow**

1. Login as parent (phone: `13800000001`, password: `password123`)
2. Verify parent dashboard shows full-screen chat with bottom tabs
3. Type "你好" — should get parent-mode greeting
4. Type "查看学习报告" — should trigger viewReport tool
5. Type "设置每天学习30分钟" — should trigger updateParentControl tool
6. Type "布置一个数学作业" — should trigger assignActivity tool
7. Switch to 报告 tab — should show existing dashboard report
8. Switch to 控制 tab — should show parental controls
9. Switch to 作业 tab — should show assignment manager

- [ ] **Step 3: Verify child chat still works**

1. Login as child user
2. Verify child AI chat works as before (childId passed correctly)
3. Verify floating AIChat widget appears on student views
