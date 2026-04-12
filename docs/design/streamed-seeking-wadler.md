# Multi-Agent System Upgrade Plan

## Context

The current AI module (`src/backend/src/modules/ai/`) is a monolithic god-module with 26 providers, a 40+ method service, an 877-line tool, and rigid registration patterns. The goal is to transform it into a **multi-agent system with skill support**, following SOLID principles, and making it **independently deployable** as a standalone service.

Reference architecture: `claude-code-sourcemap` patterns (buildTool factory, AgentDefinition, sub-agent context, skill system, tool orchestration).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                 Agent Gateway (HTTP)                  │
│         NestJS Controller / WebSocket Gateway         │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Agent Orchestrator                       │
│   - Agent selection & routing                        │
│   - Sub-agent spawning & coordination                │
│   - Conversation context management                  │
│   - Streaming event pipeline                         │
└──────┬──────────┬──────────┬──────────┬─────────────┘
       │          │          │          │
┌──────▼───┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────────┐
│ Child    │ │ Parent │ │ Course │ │ Activity   │
│ Companion│ │ Advisor│ │Designer│ │ Generator  │
│ Agent    │ │ Agent  │ │ Agent  │ │ Agent      │
└──────┬───┘ └───┬────┘ └───┬────┘ └───┬────────┘
       │         │          │          │
┌──────▼─────────▼──────────▼──────────▼─────────────┐
│              Tool Registry                           │
│   - Self-registering tools via decorator             │
│   - Interface-driven (ITool)                         │
│   - Concurrency metadata (read-only / write)         │
└─────────────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────┐
│              Skill Registry                           │
│   - JSON/YAML-defined skills                         │
│   - Prompt templates with variable injection         │
│   - Composable skill chains                          │
└─────────────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────┐
│              LLM Client (shared)                     │
│   - OpenAI-compatible interface                      │
│   - Retry with exponential backoff                   │
│   - Streaming + non-streaming                        │
│   - Token counting & budget management               │
└─────────────────────────────────────────────────────┘
```

---

## Package Structure

New standalone package: `src/backend/src/agent-framework/` (later extractable to npm package)

```
agent-framework/
├── core/                          # Core abstractions (no NestJS dependency)
│   ├── interfaces/
│   │   ├── tool.interface.ts          # ITool, IToolResult, ToolInputSchema
│   │   ├── agent.interface.ts         # IAgent, IAgentDefinition, AgentContext
│   │   ├── skill.interface.ts         # ISkill, ISkillDefinition
│   │   ├── executor.interface.ts      # IAgentExecutor, ExecutionResult
│   │   ├── registry.interface.ts      # IToolRegistry, IAgentRegistry, ISkillRegistry
│   │   ├── prompt.interface.ts        # IPromptProvider, PromptContext
│   │   ├── llm.interface.ts           # ILlmClient, LlmMessage, LlmResponse
│   │   └── index.ts
│   ├── types/
│   │   ├── age-group.ts               # AgeGroup type & helpers
│   │   ├── stream-events.ts           # StreamEvent discriminated union
│   │   ├── tool-metadata.ts           # ToolMetadata (concurrency, age-group, etc.)
│   │   └── index.ts
│   ├── errors/
│   │   ├── agent-errors.ts            # AgentError, ToolExecutionError, etc.
│   │   └── index.ts
│   └── utils/
│       ├── json-extraction.ts         # Unified JSON extraction (eliminate duplication)
│       ├── thinking-parser.ts         # Unified thinking block stripping
│       ├── content-safety.ts          # Safety filtering utilities
│       └── index.ts
│
├── tools/                         # Tool system implementation
│   ├── base-tool.ts                   # Abstract base class implementing ITool
│   ├── tool-registry.module.ts        # NestJS module for tool registration
│   ├── tool-registry.service.ts       # IToolRegistry implementation
│   ├── tool-builder.ts                # buildTool() factory function
│   └── decorators/
│       ├── register-tool.ts           # @RegisterTool() decorator
│       └── tool-metadata.ts           # @ToolMeta() decorator
│
├── agents/                        # Agent system implementation
│   ├── base-agent.ts                  # Abstract base agent
│   ├── agent-registry.module.ts       # NestJS module for agent registration
│   ├── agent-registry.service.ts      # IAgentRegistry implementation
│   ├── agent-executor.service.ts      # Core agent loop (extracted from agent-executor.ts)
│   ├── orchestrator.service.ts        # Multi-agent orchestrator
│   ├── sub-agent-factory.ts           # Sub-agent spawning (isolated context)
│   └── definitions/                   # Built-in agent definitions
│       ├── child-companion.agent.ts       # 3-4 & 5-6 age-adaptive child agent
│       ├── parent-advisor.agent.ts        # Parent assistant agent
│       ├── course-designer.agent.ts       # Course pack generation agent
│       └── activity-generator.agent.ts    # Activity generation agent
│
├── skills/                        # Skill system implementation
│   ├── skill-registry.module.ts       # NestJS module
│   ├── skill-registry.service.ts      # ISkillRegistry implementation
│   ├── skill-executor.ts              # Skill execution engine
│   └── definitions/                   # Built-in skills (JSON/YAML)
│       ├── quiz-generation.json
│       ├── story-generation.json
│       ├── activity-validation.json
│       └── course-pack-flow.json
│
├── prompts/                       # Prompt management
│   ├── prompt-provider.service.ts     # IPromptProvider implementation
│   ├── templates/                     # Prompt template files
│   │   ├── child-3-4.system.ts
│   │   ├── child-5-6.system.ts
│   │   ├── parent.system.ts
│   │   └── skill-base.ts
│   └── age-adaptive.ts               # AgeGroup → prompt mapping
│
├── conversation/                  # Conversation management (refactored)
│   ├── conversation.module.ts
│   ├── conversation.service.ts        # Session CRUD (clean interface)
│   ├── message-builder.service.ts     # Extracted buildMessageArray logic
│   ├── entities/
│   │   ├── conversation.entity.ts     # Refactored with proper types
│   │   └── message.entity.ts          # Refactored with typed columns
│   └── session-cache.ts              # In-memory cache with TTL & size limit
│
├── llm/                           # LLM client (refactored)
│   ├── llm.module.ts
│   ├── llm-client.service.ts          # ILlmClient implementation
│   ├── llm-config.service.ts          # Configuration
│   └── retry.strategy.ts             # Exponential backoff retry
│
├── safety/                        # Content safety (extracted)
│   ├── safety.module.ts
│   ├── content-safety.service.ts      # Refactored from common/services
│   └── prohibited-words.ts           # Word list as configurable data
│
├── agent-framework.module.ts      # Root NestJS module
└── index.ts                       # Public API exports
```

Existing tool implementations move to: `src/backend/src/modules/ai/tools/` (keep in ai module, import from agent-framework)

---

## Core Interfaces

### 1. ITool (Tool Interface)

```typescript
// core/interfaces/tool.interface.ts

export interface ToolMetadata {
  /** Tool name used by LLM function calling */
  name: string;
  /** Human-readable description */
  description: string;
  /** OpenAI function-calling parameter schema */
  inputSchema: Record<string, any>;
  /** Whether this tool can run concurrently with others */
  concurrencySafe: boolean;
  /** Whether this tool only reads data (no side effects) */
  readOnly: boolean;
  /** Tools that require childId to be auto-injected */
  requiresChildId: boolean;
  /** Tools that require parentId to be auto-injected */
  requiresParentId: boolean;
  /** Tools that require ageGroup to be auto-injected */
  requiresAgeGroup: boolean;
}

export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  /** Optional game data to emit as stream event */
  gameData?: any;
}

export interface ITool<TInput = any, TOutput = any> {
  readonly metadata: ToolMetadata;
  execute(args: TInput, context: ToolExecutionContext): Promise<ToolResult<TOutput>>;
}

export interface ToolExecutionContext {
  childId?: string;
  parentId?: string;
  ageGroup: AgeGroup;
  conversationId: string;
  /** Additional context from agent */
  extra: Record<string, any>;
}
```

### 2. IAgent (Agent Interface)

```typescript
// core/interfaces/agent.interface.ts

export interface AgentDefinition {
  /** Unique agent type identifier */
  type: string;
  /** Human-readable name */
  name: string;
  /** Description for agent selection */
  description: string;
  /** System prompt builder function */
  buildSystemPrompt: (context: AgentContext) => string;
  /** Tools this agent can use (whitelist, empty = all registered) */
  allowedTools?: string[];
  /** Tools this agent cannot use (blacklist) */
  disallowedTools?: string[];
  /** Skills this agent can invoke */
  allowedSkills?: string[];
  /** LLM model override */
  model?: string;
  /** Max agent loop iterations */
  maxIterations: number;
  /** Default age group for this agent */
  defaultAgeGroup?: AgeGroup;
  /** Whether this agent can spawn sub-agents */
  canSpawnSubAgents: boolean;
  /** Max sub-agent depth */
  maxSubAgentDepth: number;
}

export interface AgentContext {
  childId?: string;
  parentId?: string;
  childName?: string;
  parentName?: string;
  ageGroup: AgeGroup;
  conversationId: string;
  /** Message history */
  messages: AgentMessage[];
  /** Sub-agent depth (0 = root) */
  depth: number;
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Extra metadata */
  metadata: Record<string, any>;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: any[];
  toolCallId?: string;
  toolName?: string;
}

export interface ExecutionResult {
  response: string;
  toolCalls: ToolCallInfo[];
  gameData?: any;
  tokenUsage?: { prompt: number; completion: number };
}

export interface IAgent {
  readonly definition: AgentDefinition;
  execute(input: string, context: AgentContext): Promise<ExecutionResult>;
  executeStream(input: string, context: AgentContext): AsyncGenerator<StreamEvent>;
}
```

### 3. ISkill (Skill Interface)

```typescript
// core/interfaces/skill.interface.ts

export interface SkillDefinition {
  /** Unique skill identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this skill does */
  description: string;
  /** Trigger keywords/patterns */
  triggers: string[];
  /** Prompt template with {{variable}} placeholders */
  promptTemplate: string;
  /** Variables expected by the template */
  variables: SkillVariable[];
  /** Tool this skill uses (if any) */
  requiredTools?: string[];
  /** Whether this skill chains to another skill */
  chainTo?: string;
  /** Age groups this skill applies to */
  ageGroups?: AgeGroup[];
}

export interface SkillVariable {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  defaultValue?: any;
  description: string;
}

export interface ISkill {
  readonly definition: SkillDefinition;
  execute(
    variables: Record<string, any>,
    context: SkillExecutionContext
  ): Promise<ExecutionResult>;
}

export interface SkillExecutionContext {
  agentContext: AgentContext;
  llmClient: ILlmClient;
  toolRegistry: IToolRegistry;
}
```

### 4. IToolRegistry (Registry Interface)

```typescript
// core/interfaces/registry.interface.ts

export interface IToolRegistry {
  /** Register a tool */
  register(tool: ITool): void;
  /** Register multiple tools */
  registerAll(tools: ITool[]): void;
  /** Get a tool by name */
  get(name: string): ITool | undefined;
  /** Get all registered tools */
  getAll(): ITool[];
  /** Get tool definitions for LLM function calling */
  getToolDefinitions(filter?: (tool: ITool) => boolean): Array<{ type: 'function'; function: any }>;
  /** Execute a tool by name */
  execute(name: string, args: any, context: ToolExecutionContext): Promise<ToolResult>;
  /** Check if a tool is registered */
  has(name: string): boolean;
}
```

### 5. IPromptProvider

```typescript
// core/interfaces/prompt.interface.ts

export interface PromptContext {
  childName?: string;
  parentName?: string;
  ageGroup: AgeGroup;
  role: 'child' | 'parent';
  availableTools: string[];
}

export interface IPromptProvider {
  /** Get system prompt for given context */
  getSystemPrompt(context: PromptContext): string;
  /** Register a custom prompt template */
  registerTemplate(ageGroup: AgeGroup, role: string, template: string): void;
  /** Build tool usage instructions */
  buildToolInstructions(tools: string[]): string;
}
```

---

## Key Design Decisions

### 1. Tool Registration via Decorator + Module

Instead of injecting 15 tools into ToolRegistry constructor, tools self-register:

```typescript
// tools/generate-activity.ts
@Injectable()
@RegisterTool()
export class GenerateActivityTool implements ITool<GenerateActivityInput, GenerateActivityOutput> {
  readonly metadata: ToolMetadata = {
    name: 'generateActivity',
    description: '生成互动活动',
    inputSchema: { /* OpenAI schema */ },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: true,
    requiresParentId: false,
    requiresAgeGroup: true,
  };

  constructor(private readonly llmClient: LlmClientService) {}

  async execute(args: GenerateActivityInput, context: ToolExecutionContext): Promise<ToolResult> {
    // Implementation
  }
}
```

ToolRegistry discovers all `@RegisterTool()` decorated classes via NestJS discovery service.

### 2. Agent Definitions are Declarative

```typescript
// agents/definitions/child-companion.agent.ts
export const ChildCompanionAgent: AgentDefinition = {
  type: 'child-companion',
  name: '儿童学习伙伴',
  description: '为3-6岁儿童提供AI学习陪伴',
  buildSystemPrompt: (ctx) => ctx.ageGroup === '3-4'
    ? systemPrompt34(ctx.childName)
    : systemPrompt56(ctx.childName),
  allowedTools: ['getUserProfile', 'getAbilities', 'getLearningHistory',
                 'searchContent', 'getRecommendations', 'generateActivity',
                 'generateQuiz', 'recordLearning'],
  maxIterations: 8,
  defaultAgeGroup: '5-6',
  canSpawnSubAgents: true,
  maxSubAgentDepth: 2,
};
```

### 3. Skill Definitions are JSON/YAML

```json
// skills/definitions/quiz-generation.json
{
  "id": "quiz-generation",
  "name": "Quiz Generation",
  "description": "Generate age-appropriate quiz questions on a topic",
  "triggers": ["测验", "测试", "考考我", "出题"],
  "promptTemplate": "为{{ageGroup}}岁的{{childName}}生成关于{{topic}}的测验题目...",
  "variables": [
    { "name": "topic", "type": "string", "required": true, "description": "Quiz topic" },
    { "name": "count", "type": "number", "required": false, "defaultValue": 3, "description": "Number of questions" }
  ],
  "requiredTools": ["generateQuiz"],
  "ageGroups": ["3-4", "5-6"]
}
```

### 4. Orchestrator Routes to Agents

```typescript
// orchestrator.service.ts
class AgentOrchestrator {
  async route(input: string, context: AgentContext): Promise<ExecutionResult> {
    // 1. Classify intent → select agent
    const agent = this.selectAgent(input, context);

    // 2. Execute agent
    return agent.execute(input, context);
  }

  async routeStream(input: string, context: AgentContext): AsyncGenerator<StreamEvent> {
    const agent = this.selectAgent(input, context);
    return agent.executeStream(input, context);
  }
}
```

### 5. Sub-Agent Spawning

```typescript
// sub-agent-factory.ts
class SubAgentFactory {
  spawn(definition: AgentDefinition, parentContext: AgentContext): IAgent {
    const childContext: AgentContext = {
      ...parentContext,
      depth: parentContext.depth + 1,
      messages: [],          // Fresh message history
      abortSignal: AbortSignal.any([
        parentContext.abortSignal,
        AbortSignal.timeout(60000)
      ]),
    };

    if (childContext.depth > definition.maxSubAgentDepth) {
      throw new AgentError('Max sub-agent depth exceeded');
    }

    return new BaseAgent(definition, this.toolRegistry, this.llmClient, childContext);
  }
}
```

---

## Migration Path (Phase-by-Phase)

### Phase 1: Foundation — Core Interfaces & Utilities
**No breaking changes. New code only.**

1. Create `src/backend/src/agent-framework/core/interfaces/` — all interfaces
2. Create `src/backend/src/agent-framework/core/types/` — AgeGroup, StreamEvent, etc.
3. Create `src/backend/src/agent-framework/core/errors/` — typed error classes
4. Create `src/backend/src/agent-framework/core/utils/`:
   - `json-extraction.ts` — unified extraction (from generate-activity.ts, deduplicated)
   - `thinking-parser.ts` — unified stripping (from agent-executor.ts + llm-client.ts)
   - `content-safety.ts` — extracted utilities
5. Create `src/backend/src/agent-framework/index.ts` — public API

**Files to create:** ~15 new files
**Files to modify:** 0

### Phase 2: Tool System Redesign
**Parallel with Phase 1 output.**

1. Create `base-tool.ts` — abstract class implementing ITool with defaults
2. Create `tool-builder.ts` — `buildTool()` factory for simple tools
3. Create `decorators/register-tool.ts` — `@RegisterTool()` decorator
4. Create `tool-registry.service.ts` — new registry using NestJS DiscoveryService
5. Create `tool-registry.module.ts` — NestJS module
6. Migrate existing 16 tools one by one to new interface:
   - Simple wrappers first (getUserProfile, getAbilities, listChildren, etc.)
   - Complex tools last (GenerateActivity, GenerateCoursePack)

**Files to create:** ~25 new files
**Files to modify:** 16 tool files (migrate to new interface)

### Phase 3: Prompt System
1. Create `prompt-provider.service.ts`
2. Extract prompt templates from `system-prompts.ts` into separate template files
3. Create `age-adaptive.ts` — mapping logic
4. Support external prompt loading (JSON/YAML files)

**Files to create:** ~5 new files
**Files to modify:** 0

### Phase 4: Agent System
1. Create `base-agent.ts` — abstract agent implementing IAgent
2. Create `agent-executor.service.ts` — extracted loop from agent-executor.ts
3. Create `agent-registry.service.ts` + module
4. Create `sub-agent-factory.ts`
5. Create 4 built-in agent definitions
6. Create `orchestrator.service.ts`

**Files to create:** ~8 new files
**Files to modify:** 0

### Phase 5: Skill System
1. Create `skill-registry.service.ts` + module
2. Create `skill-executor.ts`
3. Create JSON skill definitions
4. Integrate skills into agent execution loop

**Files to create:** ~6 new files
**Files to modify:** 0

### Phase 6: LLM & Conversation Refactoring
1. Refactor `llm-client.ts` — implement ILlmClient, add retry strategy, fix streaming
2. Refactor `conversation-manager.ts` — extract MessageBuilder, add session TTL
3. Fix entity types — proper enums, typed JSON columns
4. Remove TLS rejection hack

**Files to create:** ~4 new files
**Files to modify:** 4 existing files

### Phase 7: Integration & Cutover
1. Create `agent-framework.module.ts` — root module
2. Update `ai.module.ts` — import from agent-framework, deprecate old code
3. Update `ai.service.ts` — use orchestrator instead of direct AgentExecutor
4. Update `ai.controller.ts` — use new streaming pipeline
5. Add `generateVideoData` to tool registry (fix missing registration)
6. Integration tests

**Files to modify:** ai.module.ts, ai.service.ts, ai.controller.ts, app.module.ts

---

## File-by-File Implementation Order

```
Phase 1  [no dependencies]
├── core/interfaces/tool.interface.ts
├── core/interfaces/agent.interface.ts
├── core/interfaces/skill.interface.ts
├── core/interfaces/executor.interface.ts
├── core/interfaces/registry.interface.ts
├── core/interfaces/prompt.interface.ts
├── core/interfaces/llm.interface.ts
├── core/interfaces/index.ts
├── core/types/age-group.ts
├── core/types/stream-events.ts
├── core/types/tool-metadata.ts
├── core/types/index.ts
├── core/errors/agent-errors.ts
├── core/errors/index.ts
├── core/utils/json-extraction.ts          ← extract from generate-activity.ts:extractJsonObject, generate-video-data.ts, generate-quiz.ts
├── core/utils/thinking-parser.ts          ← extract from agent-executor.ts:stripThinking, llm-client.ts:stripThinking
├── core/utils/content-safety.ts
├── core/utils/index.ts

Phase 2  [depends on Phase 1]
├── tools/base-tool.ts
├── tools/tool-builder.ts                  ← inspired by claude-code-sourcemap buildTool()
├── tools/decorators/register-tool.ts      ← uses NestJS DiscoveryService
├── tools/decorators/tool-metadata.ts
├── tools/tool-registry.service.ts
├── tools/tool-registry.module.ts
├── [migrate] tools/get-user-profile.ts    ← simple, migrate first
├── [migrate] tools/get-abilities.ts
├── [migrate] tools/get-learning-history.ts
├── [migrate] tools/search-content.ts
├── [migrate] tools/get-recommendations.ts
├── [migrate] tools/get-parent-control.ts
├── [migrate] tools/list-children.ts
├── [migrate] tools/view-report.ts
├── [migrate] tools/view-abilities.ts
├── [migrate] tools/record-learning.ts
├── [migrate] tools/update-parent-control.ts
├── [migrate] tools/list-assignments.ts
├── [migrate] tools/assign-activity.ts
├── [migrate] tools/generate-quiz.ts       ← uses shared json-extraction
├── [migrate] tools/generate-video-data.ts ← FIX: register in registry, use shared utils
├── [migrate] tools/generate-activity.ts   ← 877→~300 lines, extract sub-services
├── [migrate] tools/generate-course-pack.ts

Phase 3  [depends on Phase 1]
├── prompts/prompt-provider.service.ts
├── prompts/templates/child-3-4.system.ts  ← extract from system-prompts.ts
├── prompts/templates/child-5-6.system.ts
├── prompts/templates/parent.system.ts
├── prompts/age-adaptive.ts

Phase 4  [depends on Phase 2 + 3]
├── agents/base-agent.ts
├── agents/agent-executor.service.ts       ← extract from agent-executor.ts
├── agents/agent-registry.service.ts
├── agents/agent-registry.module.ts
├── agents/sub-agent-factory.ts            ← inspired by createSubagentContext
├── agents/orchestrator.service.ts
├── agents/definitions/child-companion.agent.ts
├── agents/definitions/parent-advisor.agent.ts
├── agents/definitions/course-designer.agent.ts
├── agents/definitions/activity-generator.agent.ts

Phase 5  [depends on Phase 4]
├── skills/skill-registry.service.ts
├── skills/skill-registry.module.ts
├── skills/skill-executor.ts
├── skills/definitions/quiz-generation.json
├── skills/definitions/story-generation.json
├── skills/definitions/activity-validation.json
├── skills/definitions/course-pack-flow.json

Phase 6  [depends on Phase 1]
├── llm/retry.strategy.ts
├── llm/llm-client.service.ts             ← refactor existing, implement ILlmClient
├── llm/llm-config.service.ts
├── llm/llm.module.ts
├── conversation/session-cache.ts          ← TTL + size limit
├── conversation/message-builder.service.ts ← extract buildMessageArray
├── [refactor] conversation/entities/      ← proper types
├── [refactor] conversation/conversation.service.ts

Phase 7  [depends on all]
├── agent-framework.module.ts
├── [modify] modules/ai/ai.module.ts       ← import agent-framework
├── [modify] modules/ai/ai.service.ts      ← use orchestrator
├── [modify] modules/ai/ai.controller.ts   ← use new streaming
├── [modify] app.module.ts
├── integration tests
```

---

## SOLID Compliance Map

| Principle | How Achieved |
|-----------|-------------|
| **S** — Single Responsibility | Each tool = one capability. Each agent = one role. Extracted: MessageBuilder, SessionCache, JsonExtraction, ThinkingParser, RetryStrategy |
| **O** — Open/Closed | New tools: `@RegisterTool()` decorator, zero file changes. New agents: add definition file. New skills: add JSON file. New prompts: registerTemplate() |
| **L** — Liskov Substitution | All tools implement ITool, all agents implement IAgent. AgentOrchestrator works with any IAgent. ToolRegistry works with any ITool |
| **I** — Interface Segregation | ITool has only execute + metadata. IAgent has execute + executeStream. IToolRegistry has only registration + lookup. Agents don't see skills they don't need |
| **D** — Dependency Inversion | AgentExecutor depends on ILlmClient (not LlmClient). Orchestrator depends on IAgentRegistry (not concrete). Tools receive ToolExecutionContext (not full app state) |

---

## Issues Fixed

| Current Issue | Resolution |
|---------------|-----------|
| generateVideoData not in registry | Phase 2: all tools self-register via `@RegisterTool()` |
| Duplicated stripThinking (3 files) | Phase 1: unified `thinking-parser.ts` |
| Duplicated JSON extraction (3 files) | Phase 1: unified `json-extraction.ts` |
| Duplicated retry logic | Phase 6: unified `retry.strategy.ts` |
| Hardcoded CHILD_ID_TOOLS/PARENT_ID_TOOLS | Phase 2: ToolMetadata.requiresChildId/requiresParentId per tool |
| In-memory session cache no TTL | Phase 6: SessionCache with TTL + size limit |
| buildMessageArray 104-line method | Phase 6: extracted MessageBuilder service |
| No rate limiting on AI endpoints | Phase 7: add rate limiter middleware |
| TLS rejection hack | Phase 6: proper TLS configuration |
| LLM output not validated | Phase 2: tool execute() returns typed ToolResult |

---

## Verification Plan

1. **Unit Tests** (per phase):
   - Phase 1: Test json-extraction, thinking-parser with real LLM outputs
   - Phase 2: Test each migrated tool with mocked services
   - Phase 4: Test agent executor with mocked LLM + tools
   - Phase 5: Test skill execution with prompt templates

2. **Integration Tests** (Phase 7):
   - Chat endpoint returns same format as before
   - Streaming produces same SSE events
   - All 16 tools callable through agent
   - Sub-agent spawning works with depth limit
   - Course pack generation end-to-end
   - Activity generation with all 7 types

3. **Regression Tests**:
   - Existing frontend continues to work without changes
   - API contract unchanged (same endpoints, same request/response shapes)
   - Test account `13800000001` / `password123` still works

4. **Build Verification**:
   ```bash
   cd src/backend
   npm run build          # TypeScript compiles
   npm run test          # All tests pass
   npm run test:cov      # Coverage >= 80%
   npm run lint           # No lint errors
   ```

---

## Estimated Scope

- **New files:** ~55
- **Migrated/modified files:** ~25
- **Deleted files:** 0 (old code deprecated, not removed until verified)
