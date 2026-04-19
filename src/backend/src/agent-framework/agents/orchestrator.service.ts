/**
 * OrchestratorService - top-level routing and coordination layer.
 *
 * Responsibilities:
 * - Select the best agent (single-agent path)
 * - Build a multi-agent execution plan for composite intents
 * - Persist user/tool/assistant messages
 * - Keep tool access constrained per agent definition
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  IAgentRegistry,
  AgentContext,
  AgentDefinition,
  ExecutionResult,
  StreamEvent,
  LlmMessage,
  LlmToolDefinition,
} from '../core';
import { filterContent } from '../core';
import { AgentExecutorService } from './agent-executor.service';
import { SkillRegistryService } from '../skills/skill-registry.service';
import { SkillExecutor } from '../skills/skill-executor';

/** Interface for conversation persistence - implemented externally */
export interface IConversationStore {
  addMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'tool',
    content: string,
    meta?: Record<string, any>,
  ): Promise<void>;

  buildMessageArray(sessionId: string): Promise<LlmMessage[]>;
}

type AgentType =
  | 'child-companion'
  | 'parent-advisor'
  | 'course-designer'
  | 'activity-generator';

type RouteMode = 'single' | 'coordinated';

interface IntentSignals {
  course: number;
  activity: number;
  report: number;
  control: number;
  assignment: number;
}

interface RoutePlan {
  mode: RouteMode;
  primaryAgent: AgentType;
  collaborators: AgentType[];
  reason: string;
  signals: IntentSignals;
}

interface AgentRunSection {
  agentType: AgentType;
  title: string;
  result: ExecutionResult;
}

interface CoordinatedRunOutput {
  result: ExecutionResult;
  executionChain: AgentType[];
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  private static readonly COURSE_PATTERNS: Array<[RegExp, number]> = [
    [/\u8BFE\u7A0B\u5305|\u8BFE\u7A0B\u8BA1\u5212|\u5B66\u4E60\u8BA1\u5212|\u5468\u8BA1\u5212|\u6559\u6848|\u8BFE\u8868/i, 3],
    [/\bcourse\b|\bpack\b|\blesson\s*plan\b|\bcurriculum\b/i, 2],
  ];

  private static readonly ACTIVITY_PATTERNS: Array<[RegExp, number]> = [
    [/\u6D3B\u52A8|\u7EC3\u4E60|\u6D4B\u9A8C|\u9898\u76EE|\u6E38\u620F|\u4F5C\u4E1A/i, 3],
    [/\bactivity\b|\bquiz\b|\bexercise\b|\bgame\b|\bworksheet\b/i, 2],
  ];

  private static readonly REPORT_PATTERNS: Array<[RegExp, number]> = [
    [/\u62A5\u544A|\u8D8B\u52BF|\u80FD\u529B|\u5206\u6790|\u6570\u636E/i, 2],
    [/\breport\b|\bprogress\b|\bability\b|\banalytics?\b/i, 2],
  ];

  private static readonly CONTROL_PATTERNS: Array<[RegExp, number]> = [
    [/\u65F6\u957F|\u9650\u5236|\u5BB6\u957F\u63A7\u5236|\u8BBE\u7F6E|\u7BA1\u63A7/i, 2],
    [/\bparent\s*control\b|\blimit\b|\brestriction\b|\bsetting\b/i, 2],
  ];

  private static readonly ASSIGNMENT_PATTERNS: Array<[RegExp, number]> = [
    [/\u4F5C\u4E1A|\u5E03\u7F6E|\u4EFB\u52A1|\u7EC3\u4E60\u5B89\u6392/i, 2],
    [/\bassignment\b|\bassign\b|\bhomework\b/i, 2],
  ];

  private static readonly ASSIGNMENT_PUBLISH_PATTERNS: RegExp[] = [
    /\u786e\u8ba4\u53d1\u5e03|\u53d1\u5e03\u4f5c\u4e1a|\u5c31\u6309\u8fd9\u4e2a\u53d1\u5e03/i,
    /\bconfirm\s*publish\b|\bpublish\s*assignment\b/i,
  ];

  constructor(
    private readonly agentRegistry: IAgentRegistry,
    private readonly executorService: AgentExecutorService,
    private readonly conversationStore: IConversationStore | null,
    private readonly skillRegistry: SkillRegistryService,
    private readonly skillExecutor: SkillExecutor,
  ) {}

  async route(input: string, context: AgentContext): Promise<ExecutionResult> {
    const startedAt = Date.now();
    const selected = this.agentRegistry.select(input, context);
    const plan = this.buildRoutePlan(input, context, selected.definition.type as AgentType);
    this.logPlan(plan, false);

    await this.persistMessage(context, 'user', input);
    const history = await this.loadHistory(context);

    let result: ExecutionResult;
    let executionChain: AgentType[];
    if (plan.mode === 'coordinated') {
      const coordinated = await this.runCoordinatedFlow(plan, input, context, history);
      result = coordinated.result;
      executionChain = coordinated.executionChain;
    } else {
      result = await this.runSingleAgent(selected.definition, context, history);
      executionChain = [plan.primaryAgent];
    }

    await this.persistMessage(context, 'assistant', result.response);
    this.logRouteResult(false, plan, executionChain, startedAt, result);
    return result;
  }

  async *routeStream(input: string, context: AgentContext): AsyncGenerator<StreamEvent> {
    const startedAt = Date.now();
    const selected = this.agentRegistry.select(input, context);
    const plan = this.buildRoutePlan(input, context, selected.definition.type as AgentType);
    this.logPlan(plan, true);

    await this.persistMessage(context, 'user', input);
    const history = await this.loadHistory(context);

    if (plan.mode === 'coordinated') {
      yield {
        type: 'thinking',
        thinkingContent: 'Detected composite request, coordinating multiple agents.',
      };
      const coordinated = await this.runCoordinatedFlow(plan, input, context, history);
      await this.persistMessage(context, 'assistant', coordinated.result.response);
      this.logRouteResult(true, plan, coordinated.executionChain, startedAt, coordinated.result);
      yield { type: 'token', content: coordinated.result.response };
      yield {
        type: 'done',
        sessionId: context.conversationId,
        wasFiltered: coordinated.result.wasFiltered ?? false,
        toolCalls: coordinated.result.toolCalls,
      };
      return;
    }

    let systemPrompt = selected.definition.buildSystemPrompt(context);
    systemPrompt = this.injectSkills(systemPrompt, selected.definition.allowedSkills);
    const toolDefinitions = this.getFilteredToolDefinitions(selected.definition);

    let finalContent = '';
    let finalDone: Extract<StreamEvent, { type: 'done' }> | null = null;
    const stream = this.executorService.runLoopStream(
      systemPrompt,
      history,
      toolDefinitions,
      selected.definition.maxIterations,
      context,
      async (event) => {
        await this.persistMessage(context, 'tool', event.result, { toolName: event.toolName });
      },
    );

    for await (const event of stream) {
      if (event.type === 'token') {
        finalContent = event.content;
      }
      yield event;

      if (event.type === 'done') {
        const safeResult = filterContent(finalContent);
        await this.persistMessage(context, 'assistant', safeResult.content);
        finalDone = event;
      }
    }

    this.logRouteResult(
      true,
      plan,
      [plan.primaryAgent],
      startedAt,
      {
        toolCalls: finalDone?.toolCalls || [],
        wasFiltered: finalDone?.wasFiltered || false,
      },
    );
  }

  private buildRoutePlan(
    input: string,
    context: AgentContext,
    selectedType: AgentType,
  ): RoutePlan {
    const signals = this.computeIntentSignals(input);
    const wantsAssignmentPublish = this.matchesAnyPattern(
      input,
      OrchestratorService.ASSIGNMENT_PUBLISH_PATTERNS,
    );

    if (context.ageGroup === 'parent') {
      if (signals.course >= 3 && signals.activity >= 3) {
        return {
          mode: 'coordinated',
          primaryAgent: 'parent-advisor',
          collaborators: ['course-designer', 'activity-generator'],
          reason: 'parent composite plan: course + activity',
          signals,
        };
      }
      if (signals.course >= 3) {
        return {
          mode: 'coordinated',
          primaryAgent: 'parent-advisor',
          collaborators: ['course-designer'],
          reason: 'parent asks for structured course planning',
          signals,
        };
      }
      if (signals.assignment >= 2) {
        if (wantsAssignmentPublish) {
          return {
            mode: 'single',
            primaryAgent: 'parent-advisor',
            collaborators: [],
            reason: 'parent confirms assignment publish',
            signals,
          };
        }

        return {
          mode: 'coordinated',
          primaryAgent: 'parent-advisor',
          collaborators: ['activity-generator'],
          reason: 'parent requests assignment drafting',
          signals,
        };
      }
      if (signals.activity >= 4) {
        return {
          mode: 'coordinated',
          primaryAgent: 'parent-advisor',
          collaborators: ['activity-generator'],
          reason: 'parent asks for rich activity generation',
          signals,
        };
      }
      return {
        mode: 'single',
        primaryAgent: 'parent-advisor',
        collaborators: [],
        reason: 'default parent advisory path',
        signals,
      };
    }

    if (signals.course >= 3 && signals.activity >= 3) {
      return {
        mode: 'coordinated',
        primaryAgent: 'child-companion',
        collaborators: ['course-designer', 'activity-generator'],
        reason: 'child composite request: teach + practice',
        signals,
      };
    }

    if (selectedType === 'course-designer' && signals.activity >= 3) {
      return {
        mode: 'coordinated',
        primaryAgent: 'course-designer',
        collaborators: ['activity-generator'],
        reason: 'course-first request with activity follow-up',
        signals,
      };
    }

    if (selectedType === 'activity-generator' && signals.course >= 3) {
      return {
        mode: 'coordinated',
        primaryAgent: 'activity-generator',
        collaborators: ['course-designer'],
        reason: 'activity-first request with course follow-up',
        signals,
      };
    }

    return {
      mode: 'single',
      primaryAgent: selectedType,
      collaborators: [],
      reason: 'single-agent route from registry selection',
      signals,
    };
  }

  private computeIntentSignals(input: string): IntentSignals {
    const text = input.toLowerCase();
    return {
      course: this.scoreIntent(text, OrchestratorService.COURSE_PATTERNS),
      activity: this.scoreIntent(text, OrchestratorService.ACTIVITY_PATTERNS),
      report: this.scoreIntent(text, OrchestratorService.REPORT_PATTERNS),
      control: this.scoreIntent(text, OrchestratorService.CONTROL_PATTERNS),
      assignment: this.scoreIntent(text, OrchestratorService.ASSIGNMENT_PATTERNS),
    };
  }

  private scoreIntent(text: string, patterns: Array<[RegExp, number]>): number {
    let score = 0;
    for (const [pattern, weight] of patterns) {
      if (pattern.test(text)) score += weight;
    }
    return score;
  }

  private matchesAnyPattern(input: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(input));
  }

  private logPlan(plan: RoutePlan, streaming: boolean): void {
    const mode = streaming ? '[STREAM]' : '[SYNC]';
    this.logger.log(
      `${mode} Route plan: mode=${plan.mode}, primary=${plan.primaryAgent}, ` +
      `collaborators=${plan.collaborators.join(',') || 'none'}, reason=${plan.reason}, ` +
      `signals=${JSON.stringify(plan.signals)}`,
    );
  }

  private logRouteResult(
    streaming: boolean,
    plan: RoutePlan,
    executionChain: AgentType[],
    startedAt: number,
    result: Pick<ExecutionResult, 'toolCalls' | 'wasFiltered'>,
  ): void {
    const mode = streaming ? '[STREAM]' : '[SYNC]';
    const payload = {
      mode: plan.mode,
      primaryAgent: plan.primaryAgent,
      collaborators: plan.collaborators,
      executionChain,
      elapsedMs: Date.now() - startedAt,
      toolCalls: result.toolCalls.length,
      wasFiltered: Boolean(result.wasFiltered),
    };
    this.logger.log(`${mode} Route result: ${JSON.stringify(payload)}`);
  }

  private async runCoordinatedFlow(
    plan: RoutePlan,
    input: string,
    context: AgentContext,
    history: LlmMessage[],
  ): Promise<CoordinatedRunOutput> {
    const sections: AgentRunSection[] = [];
    const executionChain: AgentType[] = [];

    for (const collaborator of this.uniqueAgentList(plan.collaborators)) {
      const collaboratorDef = this.getAgentDefinition(collaborator);
      if (!collaboratorDef) continue;

      const taskPrompt = this.buildSpecialistTaskPrompt(collaborator, input, sections);
      const runHistory: LlmMessage[] = [...history, { role: 'user', content: taskPrompt }];

      const result = await this.runSingleAgent(collaboratorDef, context, runHistory);
      executionChain.push(collaborator);
      sections.push({
        agentType: collaborator,
        title: this.agentTitle(collaborator),
        result,
      });
    }

    const primaryDef = this.getAgentDefinition(plan.primaryAgent);
    let primaryResult: ExecutionResult | undefined;
    if (primaryDef) {
      const integrationPrompt = this.buildPrimaryIntegrationPrompt(plan, input, sections);
      const runHistory: LlmMessage[] = [...history, { role: 'user', content: integrationPrompt }];
      primaryResult = await this.runSingleAgent(primaryDef, context, runHistory);
      executionChain.push(plan.primaryAgent);
    }

    const merged = this.mergeCoordinationResult(plan, sections, primaryResult);
    const safeMerged = filterContent(merged.response);

    return {
      result: {
        response: safeMerged.content,
        toolCalls: merged.toolCalls,
        wasFiltered: merged.wasFiltered || safeMerged.wasFiltered,
        tokenUsage: merged.tokenUsage,
      },
      executionChain,
    };
  }

  private mergeCoordinationResult(
    plan: RoutePlan,
    sections: AgentRunSection[],
    primaryResult?: ExecutionResult,
  ): ExecutionResult {
    const allToolCalls: ExecutionResult['toolCalls'] = [];
    let promptTokens = 0;
    let completionTokens = 0;
    let wasFiltered = false;

    for (const section of sections) {
      allToolCalls.push(...section.result.toolCalls);
      promptTokens += section.result.tokenUsage?.prompt || 0;
      completionTokens += section.result.tokenUsage?.completion || 0;
      wasFiltered = wasFiltered || Boolean(section.result.wasFiltered);
    }

    if (primaryResult) {
      allToolCalls.push(...primaryResult.toolCalls);
      promptTokens += primaryResult.tokenUsage?.prompt || 0;
      completionTokens += primaryResult.tokenUsage?.completion || 0;
      wasFiltered = wasFiltered || Boolean(primaryResult.wasFiltered);

      return {
        response: primaryResult.response,
        toolCalls: allToolCalls,
        wasFiltered,
        tokenUsage: { prompt: promptTokens, completion: completionTokens },
      };
    }

    const text = [
      `Multi-agent coordination completed (primary: ${this.agentTitle(plan.primaryAgent)}).`,
      '',
      ...sections.map(section => [
        `## ${section.title}`,
        section.result.response,
        '',
      ].join('\n')),
    ].join('\n');

    return {
      response: text,
      toolCalls: allToolCalls,
      wasFiltered,
      tokenUsage: { prompt: promptTokens, completion: completionTokens },
    };
  }

  private buildSpecialistTaskPrompt(
    collaborator: AgentType,
    userInput: string,
    existingSections: AgentRunSection[],
  ): string {
    const knownOutputs = existingSections.length > 0
      ? `Existing specialist outputs:\n${existingSections.map(section => `- ${section.title}: ${this.truncateText(section.result.response, 260)}`).join('\n')}`
      : 'No prior specialist outputs.';

    if (collaborator === 'course-designer') {
      return [
        'You are the course-design specialist in a coordinated run. Output only the course plan part.',
        `User request: ${userInput}`,
        knownOutputs,
        'Must include: learning goals, modules, duration per module, parent execution tips.',
      ].join('\n');
    }

    if (collaborator === 'activity-generator') {
      return [
        'You are the activity-design specialist in a coordinated run. Output only activities/exercises.',
        `User request: ${userInput}`,
        knownOutputs,
        'Must include: activity type, target ability, steps, difficulty, duration.',
      ].join('\n');
    }

    return [
      'You are a specialist in a coordinated run.',
      `User request: ${userInput}`,
      knownOutputs,
    ].join('\n');
  }

  private buildPrimaryIntegrationPrompt(
    plan: RoutePlan,
    userInput: string,
    sections: AgentRunSection[],
  ): string {
    const sectionText = sections.length > 0
      ? sections.map(section => [
          `### ${section.title}`,
          section.result.response,
        ].join('\n')).join('\n\n')
      : 'No specialist results available. Complete the request directly.';

    return [
      'You are the primary coordinating agent. Integrate specialist outputs into one final answer.',
      `Original user request: ${userInput}`,
      `Primary agent: ${this.agentTitle(plan.primaryAgent)}`,
      '',
      sectionText,
      '',
      'Requirements:',
      '- Give an actionable final answer first.',
      '- Keep course/activity content clearly structured if both exist.',
      '- Do not expose internal coordination details.',
    ].join('\n');
  }

  private agentTitle(agentType: AgentType): string {
    switch (agentType) {
      case 'child-companion':
        return 'Child Companion';
      case 'parent-advisor':
        return 'Parent Advisor';
      case 'course-designer':
        return 'Course Designer';
      case 'activity-generator':
        return 'Activity Generator';
      default:
        return agentType;
    }
  }

  private getAgentDefinition(agentType: AgentType): AgentDefinition | null {
    const agent = this.agentRegistry.get(agentType);
    if (!agent) {
      this.logger.warn(`Agent "${agentType}" is not available in registry`);
      return null;
    }
    return agent.definition;
  }

  private uniqueAgentList(agentTypes: AgentType[]): AgentType[] {
    const seen = new Set<AgentType>();
    const result: AgentType[] = [];
    for (const agentType of agentTypes) {
      if (seen.has(agentType)) continue;
      seen.add(agentType);
      result.push(agentType);
    }
    return result;
  }

  private async runSingleAgent(
    definition: AgentDefinition,
    context: AgentContext,
    history: LlmMessage[],
  ): Promise<ExecutionResult> {
    let systemPrompt = definition.buildSystemPrompt(context);
    systemPrompt = this.injectSkills(systemPrompt, definition.allowedSkills);
    const toolDefinitions = this.getFilteredToolDefinitions(definition);

    return this.executorService.runLoop(
      systemPrompt,
      history,
      toolDefinitions,
      definition.maxIterations,
      context,
      async (event) => {
        await this.persistMessage(context, 'tool', event.result, { toolName: event.toolName });
      },
    );
  }

  private getFilteredToolDefinitions(
    definition: AgentDefinition,
  ): LlmToolDefinition[] | undefined {
    const { allowedTools, disallowedTools } = definition;
    return this.executorService['toolRegistry'].getToolDefinitions(tool => {
      if (allowedTools && allowedTools.length > 0 && !allowedTools.includes(tool.metadata.name))
        return false;
      if (disallowedTools && disallowedTools.includes(tool.metadata.name)) return false;
      return true;
    }) as LlmToolDefinition[] | undefined;
  }

  private injectSkills(systemPrompt: string, allowedSkills?: string[]): string {
    if (!allowedSkills || allowedSkills.length === 0) return systemPrompt;

    const skills = this.skillRegistry.getSkillsForAgent(allowedSkills);
    if (skills.length === 0) return systemPrompt;

    const rendered = skills.map(skill =>
      this.skillExecutor.renderSkillForPrompt(skill.definition),
    );
    this.logger.debug(`Injecting ${skills.length} skills: ${skills.map(s => s.definition.id).join(', ')}`);
    return `${systemPrompt}\n\n---\n\n# Active Skills\n\n${rendered.join('\n\n')}`;
  }

  private async loadHistory(context: AgentContext): Promise<LlmMessage[]> {
    if (this.conversationStore) {
      const raw = await this.conversationStore.buildMessageArray(context.conversationId);
      return this.normalizeHistory(raw as any[]);
    }
    return this.normalizeHistory((context.messages || []) as any[]);
  }

  private async persistMessage(
    context: AgentContext,
    role: 'user' | 'assistant' | 'tool',
    content: string,
    meta?: Record<string, any>,
  ): Promise<void> {
    if (!this.conversationStore) return;
    await this.conversationStore.addMessage(context.conversationId, role, content, meta);
  }

  private normalizeHistory(messages: any[]): LlmMessage[] {
    return (messages || []).map((msg: any) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: typeof msg.content === 'string' ? msg.content : '',
          toolCallId: msg.toolCallId || msg.tool_call_id,
        };
      }
      if (msg.role === 'assistant') {
        return {
          role: 'assistant' as const,
          content: msg.content ?? null,
          toolCalls: msg.toolCalls || msg.tool_calls,
        };
      }
      return {
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : (msg.content ?? ''),
      };
    });
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}\n...(content truncated)...`;
  }
}
