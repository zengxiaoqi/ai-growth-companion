import { Injectable, Logger, Optional } from '@nestjs/common';
import { AgentExecutor } from './agent/agent-executor';
import { ConversationService } from '../../agent-framework/conversation/conversation.service';
import { ContentSafetyService } from '../../common/services/content-safety.service';
import { UsersService } from '../users/users.service';
import { LearningArchiveService } from '../learning/learning-archive.service';
import { LlmClientService } from '../../agent-framework/llm/llm-client.service';
import { OrchestratorService } from '../../agent-framework/agents/orchestrator.service';
import { IntentClassifierService } from '../../agent-framework/intent/intent-classifier.service';
import { AgentRegistryService } from '../../agent-framework/agents/agent-registry.service';
import { AgentExecutorService as FrameworkAgentExecutorService } from '../../agent-framework/agents/agent-executor.service';
import { SkillRegistryService } from '../../agent-framework/skills/skill-registry.service';
import { SkillExecutor } from '../../agent-framework/skills/skill-executor';
import type { AgentContext, AgeGroupOrParent, ChatMode } from '../../agent-framework/core';
import { contentAgeGroup, normalizeChatMode } from '../../agent-framework/core';
import { GenerateCoursePackTool } from './agent/tools/generate-course-pack';
import { GenerateActivityTool } from './agent/tools/generate-activity';
import JSZip from 'jszip';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { VoiceService } from '../voice/voice.service';
import { SafetyService } from '../safety/safety.service';
import { CareService } from '../care/care.service';
import { careCuePrompt } from '../care/care-prompt';
import { ConfigService } from '@nestjs/config';
import { ParentService } from '../parent/parent.service';
import { AbilitiesService } from '../abilities/abilities.service';
import { resolveEnglishProfile, type EnglishProfile } from '../abilities/english-level';
import { parseCasualToolsEnv } from '../../common/policy/casual-tools';
import { bankSelect } from '../../common/activity/question-bank-registry';
import type { ChatRequest, ChatResponse, QuizRequest, QuizResponse, AgeGroup } from './ai.types';

type CoursePackExportFormat =
  | 'capcut_json'
  | 'narration_txt'
  | 'narration_mp3'
  | 'teaching_video_mp4'
  | 'storyboard_csv'
  | 'subtitle_srt'
  | 'subtitle_srt_bilingual'
  | 'bundle_zip';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly frameworkOrchestrator: OrchestratorService | null;

  // Fallback template responses when LLM is unavailable
  private readonly fallbackResponses = [
    '太棒了！继续加油~ 🌟',
    '你真聪明！🎉',
    '让我们一起学习吧！📚',
    '太好了，这个问题问得很好！',
    '我喜欢你提出的问题，继续探索吧~ ✨',
  ];

  constructor(
    private readonly agentExecutor: AgentExecutor,
    private readonly conversationService: ConversationService,
    private readonly contentSafetyService: ContentSafetyService,
    private readonly usersService: UsersService,
    private readonly learningArchiveService: LearningArchiveService,
    private readonly llmClient: LlmClientService,
    private readonly generateCoursePackTool: GenerateCoursePackTool,
    @Optional() private readonly voiceService?: VoiceService,
    @Optional() agentRegistry?: AgentRegistryService,
    @Optional() frameworkExecutor?: FrameworkAgentExecutorService,
    @Optional() skillRegistry?: SkillRegistryService,
    @Optional() _skillExecutor?: SkillExecutor,
    // Appended last on purpose: every earlier parameter keeps its position,
    // so existing unit specs that construct AiService by hand still line up.
    @Optional() private readonly safetyService?: SafetyService,
    @Optional() private readonly careService?: CareService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly parentService?: ParentService,
    @Optional() private readonly abilitiesService?: AbilitiesService,
    @Optional() private readonly generateActivityTool?: GenerateActivityTool,
  ) {
    this.frameworkOrchestrator =
      agentRegistry && frameworkExecutor && skillRegistry
        ? new OrchestratorService(
            agentRegistry,
            frameworkExecutor,
            this.conversationService as any,
            skillRegistry,
            new IntentClassifierService(this.llmClient, this.configService),
          )
        : null;
  }

  /** Main chat endpoint — uses Agent with function calling */
  async chat(params: ChatRequest): Promise<ChatResponse> {
    const {
      message,
      sessionId,
      context,
      viewerId,
      viewerType,
      targetChildId,
      bookId,
      bookTitle,
      mode,
    } = params;

    // Parent mode: always routed by authenticated viewer type
    if (viewerType === 'parent') {
      const parent = await this.usersService.findById(viewerId);
      if (!parent) {
        return {
          reply: '找不到您的信息，请重新登录试试~',
          sessionId: '',
        };
      }

      if (!this.llmClient.isConfigured) {
        return this.fallbackChat(message, viewerId);
      }

      // Parent conversations are keyed by parent account to avoid mixing with child-side sessions.
      const session = await this.conversationService.getOrCreateSession(
        viewerId,
        'parent',
        sessionId,
      );
      const parentName = parent.name || '家长';

      // Update session metadata
      await this.conversationService.updateMetadata(session.uuid, {
        ageGroup: 'parent',
        childName: parentName,
        actorType: 'parent',
        targetChildId: targetChildId ?? null,
      });

      const result = await this.executeRoutedChat({
        sessionId: session.uuid,
        message,
        ageGroup: 'parent',
        displayName: parentName,
        executionContext: { parentId: viewerId, childId: targetChildId },
        actorType: 'parent',
        targetChildId,
        bookId,
        bookTitle,
        mode,
      });

      // Generate parent suggestions
      const suggestions = this.generateParentSuggestions();

      return {
        reply: result.reply,
        sessionId: session.uuid,
        suggestions,
        toolCalls: result.toolCalls,
        wasFiltered: result.wasFiltered,
        gameData: result.gameData as any,
        musicData: result.musicData,
      };
    }

    // Child mode
    const user = await this.usersService.findById(viewerId);
    if (!user) {
      return {
        reply: '找不到你的信息，请重新登录试试~',
        sessionId: '',
      };
    }

    const age = context?.age ?? user.age;
    const ageGroup = this.normalizeAgentAgeGroup(this.agentExecutor.classifyAge(age));
    const childName = user.name || '小朋友';

    // Safety circuit breaker — first thing in the pipeline, before even the
    // "is the LLM configured" check. A child saying 救命 must be intercepted
    // even when every model backend is down, which is exactly why this is a
    // local word list and not a tool the model may choose to call.
    const safety = this.safetyService?.checkMessage({
      childId: viewerId,
      parentId: user.parentId,
      text: message,
      ageGroup,
    });
    if (safety?.intercepted) {
      return {
        reply: safety.reply ?? '我在呢，别怕。',
        sessionId: sessionId ?? '',
        suggestions: [],
        toolCalls: [],
        wasFiltered: true,
      };
    }

    // Second layer: score the turn with a model, off the reply path. It
    // never delays an answer and never changes what the child hears.
    this.safetyService?.classifyInBackground({
      childId: viewerId,
      parentId: user.parentId,
      text: message,
      ageGroup,
    });

    // Check if LLM is available
    if (!this.llmClient.isConfigured) {
      return this.fallbackChat(message, viewerId);
    }

    try {
      // Get or create conversation session
      const session = await this.conversationService.getOrCreateSession(
        viewerId,
        'child',
        sessionId,
      );

      // Update session metadata
      const effectiveMode = this.resolveChatMode(mode, session.metadata);
      await this.conversationService.updateMetadata(session.uuid, {
        ageGroup,
        childName,
        actorType: 'child',
        targetChildId: viewerId,
        ...(effectiveMode === 'english' ? { chatMode: 'english' } : {}),
      });

      const careTopic = await this.openingCareTopic(viewerId, sessionId, session.uuid);

      const result = await this.executeRoutedChat({
        sessionId: session.uuid,
        message,
        ageGroup,
        displayName: childName,
        executionContext: { childId: viewerId, parentId: user.parentId },
        actorType: 'child',
        targetChildId: viewerId,
        bookId,
        bookTitle,
        careTopic,
        mode: effectiveMode,
      });

      void this.learningArchiveService.recordChatTurnSummary({
        childId: viewerId,
        parentId: user.parentId,
        sessionId: session.uuid,
        userMessage: message,
        assistantReply: result.reply,
      });

      // Generate suggestions based on the reply
      const suggestions = this.generateSuggestions(result.reply, ageGroup);

      return {
        reply: result.reply,
        sessionId: session.uuid,
        suggestions,
        toolCalls: result.toolCalls,
        wasFiltered: result.wasFiltered,
        gameData: result.gameData as any,
        musicData: result.musicData,
        englishLevel:
          effectiveMode === 'english' ? await this.readEnglishLevel(viewerId) : undefined,
      };
    } catch (error) {
      this.logger.error(`Agent chat failed: ${error.message}`);
      return this.fallbackChat(message, viewerId);
    }
  }

  /** Streaming chat — yields tokens via AsyncGenerator */
  async *chatStream(params: ChatRequest): AsyncGenerator<{
    type: 'thinking' | 'token' | 'done' | 'error' | 'tool_start' | 'tool_result' | 'game_data' | 'music_data';
    content?: string;
    thinkingContent?: string;
    toolName?: string;
    toolArgs?: Record<string, any>;
    toolResult?: string;
    sessionId?: string;
    wasFiltered?: boolean;
    suggestions?: string[];
    englishLevel?: string;
    toolCalls?: any[];
    message?: string;
    activityType?: string;
    gameData?: string;
    musicData?: string;
    domain?: string;
  }> {
    const {
      message,
      sessionId,
      context,
      viewerId,
      viewerType,
      targetChildId,
      bookId,
      bookTitle,
      mode,
    } = params;

    // Parent mode: always routed by authenticated viewer type
    if (viewerType === 'parent') {
      const parent = await this.usersService.findById(viewerId);
      if (!parent) {
        yield { type: 'error', message: '找不到您的信息' };
        return;
      }

      if (!this.llmClient.isConfigured) {
        const fallback = this.getFallbackResponse(message);
        yield { type: 'token', content: fallback };
        yield { type: 'done', suggestions: [] };
        return;
      }

      const session = await this.conversationService.getOrCreateSession(
        viewerId,
        'parent',
        sessionId,
      );
      const parentName = parent.name || '家长';
      await this.conversationService.updateMetadata(session.uuid, {
        ageGroup: 'parent',
        childName: parentName,
        actorType: 'parent',
        targetChildId: targetChildId ?? null,
      });

      const suggestions = this.generateParentSuggestions();

      try {
        for await (const event of this.executeRoutedChatStream({
          sessionId: session.uuid,
          message,
          ageGroup: 'parent',
          displayName: parentName,
          executionContext: { parentId: viewerId, childId: targetChildId },
          actorType: 'parent',
          targetChildId,
          bookId,
          bookTitle,
          mode,
        })) {
          yield {
            ...event,
            sessionId: session.uuid,
            ...(event.type === 'done' ? { suggestions } : {}),
          };
        }
      } catch (error) {
        this.logger.error(`Parent agent stream failed: ${error.message}`);
        yield { type: 'error', message: 'AI暂时无法回答，请稍后再试~', sessionId: session.uuid };
      }
      return;
    }

    // Child mode
    const user = await this.usersService.findById(viewerId);
    if (!user) {
      yield { type: 'error', message: '找不到你的信息' };
      return;
    }

    const age = context?.age ?? user.age;
    const ageGroup = this.normalizeAgentAgeGroup(this.agentExecutor.classifyAge(age));
    const childName = user.name || '小朋友';

    // Safety circuit breaker — same contract as `chat()`: local, synchronous,
    // and ahead of the LLM availability check.
    const safety = this.safetyService?.checkMessage({
      childId: viewerId,
      parentId: user.parentId,
      text: message,
      ageGroup,
    });
    if (safety?.intercepted) {
      yield { type: 'token', content: safety.reply ?? '我在呢，别怕。' };
      yield { type: 'done', sessionId: sessionId ?? '', wasFiltered: true, suggestions: [] };
      return;
    }
    this.safetyService?.classifyInBackground({
      childId: viewerId,
      parentId: user.parentId,
      text: message,
      ageGroup,
    });

    if (!this.llmClient.isConfigured) {
      const fallback = this.getFallbackResponse(message);
      yield { type: 'token', content: fallback };
      yield { type: 'done', suggestions: [] };
      return;
    }

    try {
      const session = await this.conversationService.getOrCreateSession(
        viewerId,
        'child',
        sessionId,
      );
      const effectiveMode = this.resolveChatMode(mode, session.metadata);
      await this.conversationService.updateMetadata(session.uuid, {
        ageGroup,
        childName,
        actorType: 'child',
        targetChildId: viewerId,
        ...(effectiveMode === 'english' ? { chatMode: 'english' } : {}),
      });

      const suggestions = this.generateSuggestions('', ageGroup);
      let finalReply = '';

      const careTopic = await this.openingCareTopic(viewerId, sessionId, session.uuid);

      for await (const event of this.executeRoutedChatStream({
        sessionId: session.uuid,
        message,
        ageGroup,
        displayName: childName,
        executionContext: { childId: viewerId, parentId: user.parentId },
        actorType: 'child',
        targetChildId: viewerId,
        bookId,
        bookTitle,
        careTopic,
        mode: effectiveMode,
      })) {
        if (event.type === 'token' && event.content) {
          finalReply += event.content;
        }

        let englishLevel: string | undefined;
        if (event.type === 'done') {
          if (finalReply.trim()) {
            void this.learningArchiveService.recordChatTurnSummary({
              childId: viewerId,
              parentId: user.parentId,
              sessionId: session.uuid,
              userMessage: message,
              assistantReply: finalReply,
            });
          }
          if (effectiveMode === 'english') {
            englishLevel = await this.readEnglishLevel(viewerId);
          }
        }

        yield {
          ...event,
          sessionId: session.uuid,
          ...(event.type === 'done' ? { suggestions, englishLevel } : {}),
        };
      }
    } catch (error) {
      this.logger.error(`Agent stream failed: ${error.message}`);
      yield { type: 'error', message: 'AI暂时无法回答，请稍后再试~', sessionId: '' };
    }
  }

  /**
   * Bridge the legacy executor's AgeGroup (which has an 'unknown' sentinel)
   * to the framework's real age groups.
   *
   * This used to collapse anything above 6 back into '5-6', which made the
   * school-age prompts unreachable from the HTTP entry point no matter what
   * classifyAge() returned. Only a missing age keeps the historical default.
   */
  private normalizeAgentAgeGroup(ageGroup: AgeGroup): Exclude<AgeGroup, 'unknown'> {
    return ageGroup === 'unknown' ? '5-6' : ageGroup;
  }

  /**
   * The topic this conversation may open with, if any.
   *
   * `getOrCreateSession` returns a *different* uuid whenever the requested
   * id could not be reused, which is a precise "this is a new conversation"
   * signal without adding a return flag to a method used everywhere. Only a
   * new conversation gets a cue: asking about 春游 on turn 12 would be odd,
   * and the 24h gate should be spent on an opening, not a mid-chat aside.
   *
   * Never fails the chat. A care cue is a nice-to-have; a broken cue table
   * must not take down the reply.
   */
  private async openingCareTopic(
    childId: number,
    requestedSessionId: string | undefined,
    resolvedSessionId: string,
  ): Promise<string | undefined> {
    if (!this.careService) return undefined;
    if (requestedSessionId && requestedSessionId === resolvedSessionId) return undefined;

    try {
      const cue = await this.careService.dueCue(childId);
      return cue?.topic;
    } catch (error) {
      this.logger.warn(`Could not read care cue for child ${childId}: ${(error as Error).message}`);
      return undefined;
    }
  }

  private buildAgentContext(params: {
    sessionId: string;
    ageGroup: AgeGroupOrParent;
    displayName: string;
    executionContext: { childId?: number; parentId?: number };
    actorType: 'parent' | 'child';
    targetChildId?: number;
    careTopic?: string;
    mode?: ChatMode;
    casualTools?: string[];
    englishProfile?: EnglishProfile;
  }): AgentContext {
    const chatMode = normalizeChatMode(params.mode);
    return {
      childId: params.executionContext.childId,
      parentId: params.executionContext.parentId,
      childName: params.ageGroup === 'parent' ? undefined : params.displayName,
      parentName: params.ageGroup === 'parent' ? params.displayName : undefined,
      ageGroup: params.ageGroup,
      conversationId: params.sessionId,
      messages: [],
      depth: 0,
      metadata: {
        source: 'ai-module',
        actorType: params.actorType,
        targetChildId: params.targetChildId,
        chatMode,
        casualTools: params.casualTools,
        // English practice level is resolved in the business layer and passed
        // via metadata so the framework never imports a business module.
        ...(chatMode === 'english' && params.englishProfile
          ? {
              englishLevel: params.englishProfile.level,
              englishScore: params.englishProfile.score,
              englishLevelSource: params.englishProfile.source,
            }
          : {}),
        // Rendered here so the framework layer never imports a business
        // module just to format a sentence.
        careCueNote: careCuePrompt(params.careTopic),
      },
    };
  }

  /**
   * Resolve the 碎碎念 casual-tool allowlist. A per-child parent override
   * (ParentControl.casualTools) wins; otherwise the env default applies.
   * Resolved in the business layer and passed via context.metadata so the
   * framework never imports a business module.
   */
  private async resolveCasualTools(childId?: number): Promise<string[]> {
    if (childId != null && this.parentService) {
      try {
        const control = await this.parentService.getByChild(childId);
        if (control && Array.isArray(control.casualTools)) {
          return control.casualTools;
        }
      } catch {
        // A lookup failure must not break chat — fall back to the env default.
      }
    }
    const raw = this.configService?.get<string>('CASUAL_ALLOWED_TOOLS');
    return parseCasualToolsEnv(raw);
  }

  /**
   * Resolve the effective chat mode for a turn. An english session is locked:
   * once a session is marked english, every turn (text or voice) stays english
   * even if the request omits mode or asks for casual/default. Casual remains
   * per-request and is never persisted, so normal sessions behave as before.
   */
  private resolveChatMode(
    requestMode: ChatMode | undefined,
    sessionMetadata?: Record<string, any>,
  ): ChatMode {
    if (sessionMetadata?.chatMode === 'english') return 'english';
    return normalizeChatMode(requestMode);
  }

  /** Read the child's current english level for done-event / response payloads. */
  private async readEnglishLevel(childId?: number): Promise<string | undefined> {
    if (childId == null || !this.abilitiesService) return undefined;
    try {
      const latest = await this.abilitiesService.getLatestByDomain(childId, 'english');
      return resolveEnglishProfile(latest, '5-6').level;
    } catch {
      return undefined;
    }
  }

  /** Resolve the english profile to inject into AgentContext for english turns. */
  private async resolveEnglishProfileForChat(params: {
    mode?: ChatMode;
    ageGroup: AgeGroupOrParent;
    executionContext: { childId?: number; parentId?: number };
  }): Promise<EnglishProfile | undefined> {
    const childId = params.executionContext.childId;
    if (params.mode !== 'english' || childId == null || !this.abilitiesService) return undefined;
    try {
      const latest = await this.abilitiesService.getLatestByDomain(childId, 'english');
      return resolveEnglishProfile(latest, params.ageGroup);
    } catch {
      return resolveEnglishProfile(null, params.ageGroup);
    }
  }

  private async executeRoutedChat(params: {
    sessionId: string;
    message: string;
    ageGroup: AgeGroupOrParent;
    displayName: string;
    executionContext: { childId?: number; parentId?: number };
    actorType?: 'parent' | 'child';
    targetChildId?: number;
    bookId?: number;
    bookTitle?: string;
    careTopic?: string;
    mode?: ChatMode;
  }): Promise<{ reply: string; toolCalls: any[]; wasFiltered?: boolean; gameData?: unknown; musicData?: unknown }> {
    if (this.frameworkOrchestrator) {
      const casualTools =
        params.mode === 'casual'
          ? await this.resolveCasualTools(params.executionContext.childId)
          : undefined;
      const englishProfile = await this.resolveEnglishProfileForChat(params);
      const context = this.buildAgentContext({
        ...params,
        casualTools,
        englishProfile,
        actorType: params.actorType || (params.ageGroup === 'parent' ? 'parent' : 'child'),
      });
      const result = await this.frameworkOrchestrator.route(params.message, context);
      return {
        reply: result.response,
        toolCalls: result.toolCalls,
        wasFiltered: result.wasFiltered,
        gameData: result.gameData,
        musicData: result.musicData,
      };
    }

    const legacy = await this.agentExecutor.execute(
      params.sessionId,
      params.message,
      params.ageGroup,
      params.displayName,
      params.executionContext,
      params.bookId,
      params.bookTitle,
      params.careTopic,
    );
    return {
      reply: legacy.reply,
      toolCalls: legacy.toolCalls,
    };
  }

  private async *executeRoutedChatStream(params: {
    sessionId: string;
    message: string;
    ageGroup: AgeGroupOrParent;
    displayName: string;
    executionContext: { childId?: number; parentId?: number };
    actorType?: 'parent' | 'child';
    targetChildId?: number;
    bookId?: number;
    bookTitle?: string;
    careTopic?: string;
    mode?: ChatMode;
  }): AsyncGenerator<{
    type: 'thinking' | 'token' | 'done' | 'error' | 'tool_start' | 'tool_result' | 'game_data' | 'music_data';
    content?: string;
    thinkingContent?: string;
    toolName?: string;
    toolArgs?: Record<string, any>;
    toolResult?: string;
    sessionId?: string;
    wasFiltered?: boolean;
    toolCalls?: any[];
    message?: string;
    activityType?: string;
    gameData?: string;
    musicData?: string;
    domain?: string;
  }> {
    if (this.frameworkOrchestrator) {
      const casualTools =
        params.mode === 'casual'
          ? await this.resolveCasualTools(params.executionContext.childId)
          : undefined;
      const englishProfile = await this.resolveEnglishProfileForChat(params);
      const context = this.buildAgentContext({
        ...params,
        casualTools,
        englishProfile,
        actorType: params.actorType || (params.ageGroup === 'parent' ? 'parent' : 'child'),
      });
      for await (const event of this.frameworkOrchestrator.routeStream(params.message, context)) {
        yield event as any;
      }
      return;
    }

    for await (const event of this.agentExecutor.executeStream(
      params.sessionId,
      params.message,
      params.ageGroup,
      params.displayName,
      params.executionContext,
      params.bookId,
      params.bookTitle,
      params.careTopic,
    )) {
      yield event as any;
    }
  }

  async canViewerAccessChild(params: {
    viewerId: number;
    viewerType: string;
    childId: number;
  }): Promise<boolean> {
    return this.usersService.canAccessChild(params.viewerId, params.viewerType, params.childId);
  }

  async createChatSession(params: { viewerId: number; viewerType: string }) {
    const actorType = params.viewerType === 'parent' ? 'parent' : 'child';
    // Pass no sessionId → always creates a brand new session
    return this.conversationService.getOrCreateSession(params.viewerId, actorType);
  }

  async getConversationSessions(params: {
    viewerId: number;
    viewerType: string;
    childId: number;
    page?: number;
    limit?: number;
  }) {
    const canAccess = await this.usersService.canAccessChild(
      params.viewerId,
      params.viewerType,
      params.childId,
    );
    if (!canAccess) {
      throw new Error('FORBIDDEN_CHILD_ACCESS');
    }

    // Parent conversations are stored with childId = viewerId (parent's own ID),
    // not the child's ID. When a parent views history, use viewerId as childId.
    // Don't filter by actorType for parent mode — old sessions may have been
    // created with actorType='child' before the parent mode refactor.
    const effectiveChildId = params.viewerType === 'parent' ? params.viewerId : params.childId;
    return this.conversationService.listSessions({
      childId: effectiveChildId,
      actorType: params.viewerType === 'parent' ? undefined : 'child',
      page: params.page,
      limit: params.limit,
    });
  }

  async getConversationSessionMessages(params: {
    viewerId: number;
    viewerType: string;
    sessionId: string;
    page?: number;
    limit?: number;
  }) {
    const conversation = await this.conversationService.getConversationByUuid(params.sessionId);
    if (!conversation) {
      return {
        sessionId: params.sessionId,
        list: [],
        total: 0,
        page: Math.max(1, params.page || 1),
        limit: Math.min(200, Math.max(1, params.limit || 50)),
      };
    }

    const canAccess = await this.usersService.canAccessChild(
      params.viewerId,
      params.viewerType,
      conversation.childId,
    );
    if (!canAccess) {
      throw new Error('FORBIDDEN_CHILD_ACCESS');
    }

    const result = await this.conversationService.getSessionMessages({
      sessionId: params.sessionId,
      page: params.page,
      limit: params.limit,
    });

    return {
      sessionId: params.sessionId,
      childId: conversation.childId,
      list: result.list,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async getCoursePacks(params: {
    viewerId: number;
    viewerType: string;
    childId: number;
    page?: number;
    limit?: number;
  }) {
    const canAccess = await this.usersService.canAccessChild(
      params.viewerId,
      params.viewerType,
      params.childId,
    );
    if (!canAccess) {
      throw new Error('FORBIDDEN_CHILD_ACCESS');
    }

    return this.learningArchiveService.getStudyPlans({
      childId: params.childId,
      sourceType: 'ai_course_pack',
      page: params.page,
      limit: params.limit,
    });
  }

  async getCoursePackById(params: { viewerId: number; viewerType: string; id: number }) {
    const row = await this.learningArchiveService.getStudyPlanById(params.id);
    if (!row || row.sourceType !== 'ai_course_pack') {
      return null;
    }

    const canAccess = await this.usersService.canAccessChild(
      params.viewerId,
      params.viewerType,
      row.childId,
    );
    if (!canAccess) {
      throw new Error('FORBIDDEN_CHILD_ACCESS');
    }

    return row;
  }

  async getCoursePackVersions(params: {
    viewerId: number;
    viewerType: string;
    id: number;
    page?: number;
    limit?: number;
  }) {
    const row = await this.getCoursePackById({
      viewerId: params.viewerId,
      viewerType: params.viewerType,
      id: params.id,
    });
    if (!row) {
      throw new Error('COURSE_PACK_NOT_FOUND');
    }
    const rootSourceId = row.sourceId || row.id;
    const result = await this.learningArchiveService.getStudyPlanVersions({
      childId: row.childId,
      sourceType: 'ai_course_pack',
      rootSourceId,
      page: params.page,
      limit: params.limit,
    });
    return {
      ...result,
      rootSourceId,
    };
  }

  async exportCoursePack(params: {
    viewerId: number;
    viewerType: string;
    id: number;
    format?: CoursePackExportFormat;
  }): Promise<{ filename: string; mimeType: string; body: string | Buffer }> {
    const row = await this.getCoursePackById({
      viewerId: params.viewerId,
      viewerType: params.viewerType,
      id: params.id,
    });
    if (!row) {
      throw new Error('COURSE_PACK_NOT_FOUND');
    }

    const pack = this.generateCoursePackTool.ensureTeachingMediaPack(
      ((row.planContent || {}) as Record<string, any>) || {},
    );
    const format = params.format || 'capcut_json';
    const title = this.toSafeFilename(String(pack.title || row.title || `course-pack-${row.id}`));
    const capcutBody = JSON.stringify(this.buildCapCutPayload(pack, row.id), null, 2);
    const narrationBody = this.buildNarrationText(pack);
    const storyboardBody = this.buildStoryboardCsv(pack);
    const subtitleBody = this.buildSubtitleSrt(pack);
    const subtitleBilingualBody = this.buildSubtitleSrtBilingual(pack);
    const needNarrationMp3 =
      format === 'narration_mp3' || format === 'bundle_zip' || format === 'teaching_video_mp4';
    const narrationMp3Body = needNarrationMp3 ? await this.buildNarrationMp3(pack) : null;
    const needTeachingVideo =
      format === 'teaching_video_mp4' || (format === 'bundle_zip' && !this.isUnitTestEnvironment());
    const teachingVideoMp4Body = needTeachingVideo
      ? await this.buildTeachingVideoMp4(pack, narrationMp3Body)
      : null;

    if (format === 'bundle_zip') {
      const zip = new JSZip();
      zip.file(`${title}-capcut.json`, capcutBody);
      zip.file(`${title}-narration.txt`, narrationBody);
      zip.file(`${title}-storyboard.csv`, storyboardBody);
      zip.file(`${title}-subtitle.srt`, subtitleBody);
      zip.file(`${title}-subtitle-bilingual.srt`, subtitleBilingualBody);
      if (narrationMp3Body) {
        zip.file(`${title}-narration.mp3`, narrationMp3Body);
      }
      if (teachingVideoMp4Body) {
        zip.file(`${title}-teaching-video.mp4`, teachingVideoMp4Body);
      }
      zip.file(
        `${title}-README.txt`,
        [
          'AI Growth Companion Export Bundle',
          `Record ID: ${row.id}`,
          '',
          'Files:',
          '- *-capcut.json : enhanced timeline/storyboard JSON with transitions, audio tracks, and edit cues',
          '- *-narration.txt : voice-over script',
          '- *-storyboard.csv : shot list spreadsheet',
          '- *-subtitle.srt : subtitle track file',
          '- *-subtitle-bilingual.srt : bilingual subtitle track file (ZH+EN)',
          '- *-narration.mp3 : voice-over audio track (importable)',
          '- *-teaching-video.mp4 : directly importable draft video for CapCut',
        ].join('\n'),
      );
      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });
      return {
        filename: `${title}-bundle.zip`,
        mimeType: 'application/zip',
        body: buffer,
      };
    }

    if (format === 'narration_txt') {
      return {
        filename: `${title}-narration.txt`,
        mimeType: 'text/plain; charset=utf-8',
        body: narrationBody,
      };
    }

    if (format === 'storyboard_csv') {
      return {
        filename: `${title}-storyboard.csv`,
        mimeType: 'text/csv; charset=utf-8',
        body: storyboardBody,
      };
    }

    if (format === 'narration_mp3') {
      if (!narrationMp3Body) {
        throw new Error('NARRATION_AUDIO_UNAVAILABLE');
      }
      return {
        filename: `${title}-narration.mp3`,
        mimeType: 'audio/mpeg',
        body: narrationMp3Body,
      };
    }

    if (format === 'teaching_video_mp4') {
      if (!teachingVideoMp4Body) {
        throw new Error('TEACHING_VIDEO_UNAVAILABLE');
      }
      return {
        filename: `${title}-teaching-video.mp4`,
        mimeType: 'video/mp4',
        body: teachingVideoMp4Body,
      };
    }

    if (format === 'subtitle_srt') {
      return {
        filename: `${title}-subtitle.srt`,
        mimeType: 'application/x-subrip; charset=utf-8',
        body: subtitleBody,
      };
    }

    if (format === 'subtitle_srt_bilingual') {
      return {
        filename: `${title}-subtitle-bilingual.srt`,
        mimeType: 'application/x-subrip; charset=utf-8',
        body: subtitleBilingualBody,
      };
    }

    return {
      filename: `${title}-capcut.json`,
      mimeType: 'application/json; charset=utf-8',
      body: capcutBody,
    };
  }

  async exportCoursePacksBatch(params: {
    viewerId: number;
    viewerType: string;
    ids: number[];
    formats?: CoursePackExportFormat[];
  }): Promise<{ filename: string; mimeType: string; body: Buffer }> {
    const rawIds = Array.isArray(params.ids) ? params.ids : [];
    const ids = [
      ...new Set(rawIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)),
    ];
    if (ids.length === 0) {
      throw new Error('INVALID_COURSE_PACK_IDS');
    }

    const formats = this.normalizeCoursePackExportFormats(params.formats);
    const zip = new JSZip();
    const manifestLines: string[] = [
      'AI Growth Companion Batch Export Manifest',
      `Exported At: ${new Date().toISOString()}`,
      `Requested IDs: ${ids.join(', ')}`,
      `Formats: ${formats.join(', ')}`,
      '',
      'Items:',
    ];

    let successCount = 0;
    for (const id of ids) {
      try {
        const row = await this.getCoursePackById({
          viewerId: params.viewerId,
          viewerType: params.viewerType,
          id,
        });
        if (!row) {
          manifestLines.push(`- #${id}: skipped (not found)`);
          continue;
        }

        const pack = (row.planContent || {}) as Record<string, any>;
        const title = this.toSafeFilename(
          String(pack.title || row.title || `course-pack-${row.id}`),
        );
        const folder = `${title}-${row.id}`;

        for (const format of formats) {
          const exported = await this.exportCoursePack({
            viewerId: params.viewerId,
            viewerType: params.viewerType,
            id: row.id,
            format,
          });
          zip.file(`${folder}/${exported.filename}`, exported.body);
          successCount += 1;
        }
        manifestLines.push(`- #${id}: exported (${formats.join(', ')})`);
      } catch (error: any) {
        const reason =
          error?.message === 'FORBIDDEN_CHILD_ACCESS'
            ? 'forbidden'
            : error?.message === 'COURSE_PACK_NOT_FOUND'
              ? 'not found'
              : String(error?.message || 'unknown error');
        manifestLines.push(`- #${id}: failed (${reason})`);
      }
    }

    if (successCount === 0) {
      throw new Error('COURSE_PACK_EXPORT_BATCH_EMPTY');
    }

    zip.file('README.txt', manifestLines.join('\n'));
    const body = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
    return {
      filename: this.buildBatchExportFilename(),
      mimeType: 'application/zip',
      body,
    };
  }

  async renderTeachingVideoFromPack(pack: Record<string, any>): Promise<Buffer | null> {
    const safePack = this.generateCoursePackTool.ensureTeachingMediaPack(
      (pack && typeof pack === 'object' ? pack : {}) as Record<string, any>,
    );
    const narrationMp3 = await this.buildNarrationMp3(safePack);
    return this.buildTeachingVideoMp4(safePack, narrationMp3);
  }

  async saveCoursePackVersion(params: {
    viewerId: number;
    viewerType: string;
    id: number;
    title?: string;
    planContent?: Record<string, any>;
    note?: string;
    sessionId?: string;
  }): Promise<Record<string, any>> {
    const baseRow = await this.getCoursePackById({
      viewerId: params.viewerId,
      viewerType: params.viewerType,
      id: params.id,
    });
    if (!baseRow) {
      throw new Error('COURSE_PACK_NOT_FOUND');
    }

    const rootSourceId = baseRow.sourceId || baseRow.id;
    if (baseRow.sourceId == null) {
      await this.learningArchiveService.updateStudyPlanRecord(baseRow.id, {
        sourceId: rootSourceId,
      });
    }

    const versions = await this.learningArchiveService.getStudyPlanVersions({
      childId: baseRow.childId,
      sourceType: 'ai_course_pack',
      rootSourceId,
      limit: 200,
    });
    const versionNumber = Math.max(1, (versions.total || 0) + 1);

    const nextPack = this.deepCloneObject(
      params.planContent && typeof params.planContent === 'object'
        ? params.planContent
        : baseRow.planContent || {},
    );
    const parentId =
      params.viewerType === 'parent' && params.viewerId != null
        ? params.viewerId
        : baseRow.parentId || undefined;
    const baseTitle = String(
      params.title || nextPack?.title || baseRow.title || `Course Pack ${baseRow.id}`,
    );
    const nextTitle = this.createVersionTitle(baseTitle, versionNumber);
    nextPack.title = nextTitle;
    nextPack.version = {
      ...(nextPack.version || {}),
      rootSourceId,
      parentRecordId: baseRow.id,
      versionNumber,
      note: String(params.note || ''),
      editedAt: new Date().toISOString(),
    };

    const record = await this.learningArchiveService.createStudyPlanRecord({
      childId: baseRow.childId,
      parentId,
      sourceType: 'ai_course_pack',
      sourceId: rootSourceId,
      title: nextTitle,
      planContent: nextPack,
      sessionId: params.sessionId || baseRow.sessionId || undefined,
      status: 'active',
    });

    return {
      ...nextPack,
      coursePackRecordId: record.id,
      rootSourceId,
      versionNumber,
      saved: true,
    };
  }

  async enrichCoursePackBilingual(params: {
    viewerId: number;
    viewerType: string;
    id: number;
    saveAsVersion?: boolean;
    overwrite?: boolean;
    sessionId?: string;
  }): Promise<Record<string, any>> {
    const row = await this.getCoursePackById({
      viewerId: params.viewerId,
      viewerType: params.viewerType,
      id: params.id,
    });
    if (!row) {
      throw new Error('COURSE_PACK_NOT_FOUND');
    }

    const pack = this.deepCloneObject((row.planContent || {}) as Record<string, any>);
    const overwrite = !!params.overwrite;
    const textList = this.collectTextsForBilingual(pack, overwrite);
    const translations = await this.translateTextsToEnglish(textList);
    const updatedPack = this.applyBilingualTranslations(pack, translations, overwrite);
    updatedPack.bilingual = {
      status: 'completed',
      languagePair: 'zh-CN->en',
      translatedItems: textList.length,
      enrichedAt: new Date().toISOString(),
    };

    if (params.saveAsVersion === false) {
      return {
        ...updatedPack,
        coursePackRecordId: row.id,
        saved: false,
      };
    }

    return this.saveCoursePackVersion({
      viewerId: params.viewerId,
      viewerType: params.viewerType,
      id: row.id,
      title: `${String(updatedPack.title || row.title || `Course Pack ${row.id}`)} Bilingual`,
      planContent: updatedPack,
      note: 'bilingual_enrichment',
      sessionId: params.sessionId || row.sessionId || undefined,
    });
  }

  async generateCoursePack(params: {
    topic: string;
    childId?: number;
    ageGroup?: '3-4' | '5-6';
    domain?: 'language' | 'math' | 'science' | 'art' | 'social';
    durationMinutes?: number;
    difficulty?: number;
    includeGame?: boolean;
    includeAudio?: boolean;
    includeVideo?: boolean;
    parentPrompt?: string;
    sessionId?: string;
    viewerId?: number;
    viewerType?: string;
  }): Promise<Record<string, any>> {
    const childId = params.childId;
    if (childId != null && params.viewerId != null && params.viewerType) {
      const canAccess = await this.usersService.canAccessChild(
        params.viewerId,
        params.viewerType,
        childId,
      );
      if (!canAccess) {
        throw new Error('FORBIDDEN_CHILD_ACCESS');
      }
    }

    let resolvedAgeGroup = params.ageGroup;
    if (!resolvedAgeGroup && childId != null) {
      const child = await this.usersService.findById(childId);
      const inferred = this.agentExecutor.classifyAge(child?.age);
      // A school-age child still needs a content bucket: the curriculum
      // directories only serve '3-4' / '5-6'. Leaving it undefined used to
      // drop the age hint entirely for anyone older than six.
      if (inferred !== 'unknown') {
        resolvedAgeGroup = contentAgeGroup(inferred);
      }
    }

    const rawResult = await this.generateCoursePackTool.execute({
      topic: params.topic,
      ageGroup: resolvedAgeGroup,
      domain: params.domain,
      durationMinutes: params.durationMinutes,
      difficulty: params.difficulty,
      includeGame: params.includeGame,
      includeAudio: params.includeAudio,
      includeVideo: params.includeVideo,
      parentPrompt: params.parentPrompt || params.topic,
    });

    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(rawResult);
    } catch {
      parsed = {
        type: 'course_pack',
        topic: params.topic,
        ageGroup: resolvedAgeGroup || '5-6',
        raw: rawResult,
      };
    }

    if (childId != null) {
      try {
        const parentId =
          params.viewerType === 'parent' && params.viewerId != null ? params.viewerId : null;
        const record = await this.learningArchiveService.createStudyPlanRecord({
          childId,
          parentId: parentId ?? undefined,
          sourceType: 'ai_course_pack',
          title: String(parsed.title || params.topic || 'AI Course Pack').slice(0, 180),
          planContent: parsed,
          sessionId: params.sessionId,
          status: 'active',
        });
        await this.learningArchiveService.updateStudyPlanRecord(record.id, {
          sourceId: record.id,
        });

        return {
          ...parsed,
          rootSourceId: record.id,
          versionNumber: 1,
          coursePackRecordId: record.id,
          saved: true,
        };
      } catch (error: any) {
        this.logger.warn(`save course pack failed: ${error?.message || 'unknown'}`);
      }
    }

    return {
      ...parsed,
      saved: false,
    };
  }

  async generateWeeklyCoursePacks(params: {
    viewerId: number;
    viewerType: string;
    topic: string;
    childId: number;
    ageGroup?: '3-4' | '5-6';
    durationMinutes?: number;
    difficulty?: number;
    includeGame?: boolean;
    includeAudio?: boolean;
    includeVideo?: boolean;
    parentPrompt?: string;
    sessionId?: string;
    startDate?: string;
    days?: number;
  }): Promise<Record<string, any>> {
    const topic = String(params.topic || '').trim();
    if (!topic) throw new Error('INVALID_WEEKLY_TOPIC');
    const childId = Number(params.childId);
    if (!Number.isInteger(childId) || childId <= 0) throw new Error('INVALID_CHILD_ID');

    const canAccess = await this.usersService.canAccessChild(
      params.viewerId,
      params.viewerType,
      childId,
    );
    if (!canAccess) throw new Error('FORBIDDEN_CHILD_ACCESS');

    const totalDays = Math.min(14, Math.max(1, Number(params.days) || 7));
    const startDate = this.resolveWeeklyStartDate(params.startDate);
    const planItems: Record<string, any>[] = [];

    for (let i = 0; i < totalDays; i++) {
      const current = new Date(startDate);
      current.setDate(startDate.getDate() + i);
      const dateLabel = this.formatDateKey(current);
      const dayNo = i + 1;
      const dayTopic = `${topic} - Day ${dayNo}`;
      const dayDomain = this.weeklyDomainForDay(dayNo);
      const dayPrompt = [
        params.parentPrompt || topic,
        `Generate lesson for day ${dayNo}, date ${dateLabel}.`,
        `Domain of today: ${dayDomain}.`,
      ].join(' ');

      try {
        const result = await this.generateCoursePack({
          topic: dayTopic,
          childId,
          ageGroup: params.ageGroup,
          durationMinutes: params.durationMinutes,
          domain: dayDomain,
          difficulty: params.difficulty,
          includeGame: params.includeGame,
          includeAudio: params.includeAudio,
          includeVideo: params.includeVideo,
          parentPrompt: dayPrompt,
          sessionId: params.sessionId,
          viewerId: params.viewerId,
          viewerType: params.viewerType,
        });
        planItems.push({
          day: dayNo,
          date: dateLabel,
          topic: dayTopic,
          recordId: result?.coursePackRecordId || null,
          title: String(result?.title || dayTopic),
          saved: !!result?.saved,
        });
      } catch (error: any) {
        planItems.push({
          day: dayNo,
          date: dateLabel,
          topic: dayTopic,
          recordId: null,
          title: dayTopic,
          saved: false,
          error: String(error?.message || 'generation failed'),
        });
      }
    }

    return {
      type: 'weekly_course_plan',
      topic,
      childId,
      startDate: this.formatDateKey(startDate),
      days: totalDays,
      generatedAt: new Date().toISOString(),
      items: planItems,
    };
  }

  /** Generate a quiz on demand — delegates to the unified activity engine */
  async generateQuiz(params: QuizRequest): Promise<QuizResponse> {
    const { childId, topic, count = 3 } = params;

    const user = await this.usersService.findById(childId);
    if (!user) {
      throw new Error('用户不存在');
    }

    const age = user.age;
    const ageGroup: AgeGroup = age >= 3 && age <= 4 ? '3-4' : '5-6';
    const difficulty = ageGroup === '3-4' ? 1 : 2;

    // Bank-first: reuse quality-tuned questions; fall back to fresh generation
    // only when the bank can't cover the request.
    const banked = await bankSelect({
      topic,
      ageGroup,
      type: 'quiz',
      difficulty,
      childId,
      count,
    });
    let questions = (Array.isArray(banked?.questions) ? banked.questions : []).slice(0, count);

    if (questions.length < count) {
      if (!this.generateActivityTool) {
        throw new Error('测验生成器不可用');
      }
      const activityJson = await this.generateActivityTool.execute({
        type: 'quiz',
        topic,
        difficulty,
        ageGroup,
      });
      const activity = JSON.parse(activityJson);
      questions = (Array.isArray(activity?.questions) ? activity.questions : []).slice(0, count);
    }
    if (questions.length === 0) {
      throw new Error('生成测验失败：题目为空');
    }
    // Safety filter on quiz content
    for (const q of questions) {
      const safe = this.contentSafetyService.filterContent(q.question);
      q.question = safe.content;
    }

    return { questions, topic, ageGroup };
  }

  /** Fallback to template responses when LLM is unavailable */
  private async fallbackChat(message: string, _childId: number): Promise<ChatResponse> {
    const reply = this.getFallbackResponse(message);
    return { reply, sessionId: '' };
  }

  private getFallbackResponse(message: string): string {
    const idx = message.length % this.fallbackResponses.length;
    return this.fallbackResponses[idx];
  }

  private toSafeFilename(input: string): string {
    const cleaned = (input || '')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    return cleaned || `course-pack-${Date.now()}`;
  }

  private normalizeCoursePackExportFormats(
    formats?: CoursePackExportFormat[],
  ): CoursePackExportFormat[] {
    const allowSet = new Set<CoursePackExportFormat>([
      'capcut_json',
      'narration_txt',
      'narration_mp3',
      'teaching_video_mp4',
      'storyboard_csv',
      'subtitle_srt',
      'subtitle_srt_bilingual',
      'bundle_zip',
    ]);
    const source: string[] =
      Array.isArray(formats) && formats.length > 0 ? formats : ['bundle_zip'];
    const normalized = source.filter((item): item is CoursePackExportFormat =>
      allowSet.has(item as CoursePackExportFormat),
    );
    const unique = [...new Set(normalized)];
    return unique.length > 0 ? unique : ['bundle_zip'];
  }

  private buildBatchExportFilename(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const hour = String(now.getUTCHours()).padStart(2, '0');
    const minute = String(now.getUTCMinutes()).padStart(2, '0');
    const second = String(now.getUTCSeconds()).padStart(2, '0');
    return `course-pack-batch-${year}${month}${day}-${hour}${minute}${second}Z.zip`;
  }

  private deepCloneObject<T>(value: T): T {
    try {
      return JSON.parse(JSON.stringify(value ?? {}));
    } catch {
      return { ...(value as any) } as T;
    }
  }

  private createVersionTitle(baseTitle: string, versionNumber: number): string {
    const clean = String(baseTitle || '')
      .replace(/\(v\d+\)\s*$/i, '')
      .replace(/v\d+\s*$/i, '')
      .trim();
    return `${clean || 'Course Pack'} (v${Math.max(1, versionNumber)})`;
  }

  private collectTextsForBilingual(pack: Record<string, any>, overwrite: boolean): string[] {
    const list: string[] = [];
    const pushText = (zh: any, en?: any) => {
      const zhText = String(zh || '').trim();
      if (!zhText) return;
      const enText = String(en || '').trim();
      if (!overwrite && enText) return;
      list.push(zhText);
    };

    pushText(pack?.title, pack?.titleEn);
    pushText(pack?.summary, pack?.summaryEn);
    (Array.isArray(pack?.outcomes) ? pack.outcomes : []).forEach((item: any, idx: number) =>
      pushText(item, Array.isArray(pack?.outcomesEn) ? pack.outcomesEn[idx] : undefined),
    );

    const shots = Array.isArray(pack?.videoLesson?.shots) ? pack.videoLesson.shots : [];
    shots.forEach((shot: any) => {
      pushText(shot?.caption, shot?.captionEn);
      pushText(shot?.narration, shot?.narrationEn);
    });

    const scenes = Array.isArray(pack?.visualStory?.scenes) ? pack.visualStory.scenes : [];
    scenes.forEach((scene: any) => {
      pushText(scene?.onScreenText, scene?.onScreenTextEn);
      pushText(scene?.narration, scene?.narrationEn);
    });

    const audioScript = Array.isArray(pack?.modules?.listening?.audioScript)
      ? pack.modules.listening.audioScript
      : [];
    audioScript.forEach((item: any) => {
      pushText(item?.narration, item?.narrationEn);
    });

    return [...new Set(list)].slice(0, 200);
  }

  private applyBilingualTranslations(
    pack: Record<string, any>,
    translations: Record<string, string>,
    overwrite: boolean,
  ): Record<string, any> {
    const translate = (zh: any, fallbackEn?: any) => {
      const zhText = String(zh || '').trim();
      if (!zhText) return '';
      const enText = String(fallbackEn || '').trim();
      if (!overwrite && enText) return enText;
      return String(translations[zhText] || zhText).trim() || zhText;
    };

    if (pack?.title) pack.titleEn = translate(pack.title, pack?.titleEn);
    if (pack?.summary) pack.summaryEn = translate(pack.summary, pack?.summaryEn);
    if (Array.isArray(pack?.outcomes)) {
      pack.outcomesEn = pack.outcomes.map((item: any, idx: number) =>
        translate(item, Array.isArray(pack?.outcomesEn) ? pack.outcomesEn[idx] : undefined),
      );
    }

    const shots = Array.isArray(pack?.videoLesson?.shots) ? pack.videoLesson.shots : [];
    shots.forEach((shot: any) => {
      if (shot?.caption) shot.captionEn = translate(shot.caption, shot?.captionEn);
      if (shot?.narration) shot.narrationEn = translate(shot.narration, shot?.narrationEn);
    });

    const scenes = Array.isArray(pack?.visualStory?.scenes) ? pack.visualStory.scenes : [];
    scenes.forEach((scene: any) => {
      if (scene?.onScreenText)
        scene.onScreenTextEn = translate(scene.onScreenText, scene?.onScreenTextEn);
      if (scene?.narration) scene.narrationEn = translate(scene.narration, scene?.narrationEn);
    });

    const audioScript = Array.isArray(pack?.modules?.listening?.audioScript)
      ? pack.modules.listening.audioScript
      : [];
    audioScript.forEach((item: any) => {
      if (item?.narration) item.narrationEn = translate(item.narration, item?.narrationEn);
    });

    return pack;
  }

  private async translateTextsToEnglish(texts: string[]): Promise<Record<string, string>> {
    const uniqueTexts = [
      ...new Set((texts || []).map((text) => String(text || '').trim()).filter(Boolean)),
    ];
    const results: Record<string, string> = {};
    uniqueTexts.forEach((text) => {
      results[text] = text;
    });

    const toTranslate = uniqueTexts.filter((text) => !this.isMostlyEnglish(text));
    if (toTranslate.length === 0) return results;

    const canUseLlm = this.llmClient.isConfigured && typeof this.llmClient.generate === 'function';
    if (!canUseLlm) return results;

    const chunkSize = 25;
    for (let i = 0; i < toTranslate.length; i += chunkSize) {
      const chunk = toTranslate.slice(i, i + chunkSize);
      const payload = chunk.map((text, index) => ({ id: index + 1, zh: text }));
      const prompt = [
        'Translate each Chinese text into concise natural English for child education content.',
        'Keep meaning faithful. Return strict JSON array only.',
        'Format: [{"id":1,"en":"..."}, ...]',
        `Input: ${JSON.stringify(payload)}`,
      ].join('\n');

      try {
        const raw = await this.llmClient.generate(prompt);
        const json = this.extractJsonArray(raw);
        const mapped = Array.isArray(json) ? json : [];
        mapped.forEach((item: any) => {
          const id = Number(item?.id);
          const en = String(item?.en || '').trim();
          if (!Number.isInteger(id) || id < 1 || id > chunk.length) return;
          if (!en) return;
          results[chunk[id - 1]] = en;
        });
      } catch {
        // keep fallback text
      }
    }

    return results;
  }

  private extractJsonArray(raw: string): any[] {
    if (!raw) return [];
    const match = String(raw).match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private isMostlyEnglish(text: string): boolean {
    const value = String(text || '');
    if (!value.trim()) return true;
    return !/[\u4e00-\u9fa5]/.test(value);
  }

  private resolveWeeklyStartDate(startDate?: string): Date {
    const parsed = startDate ? new Date(startDate) : new Date();
    const safe = Number.isFinite(parsed.getTime()) ? parsed : new Date();
    safe.setHours(0, 0, 0, 0);
    return safe;
  }

  private formatDateKey(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private weeklyDomainForDay(dayNo: number): 'language' | 'math' | 'science' {
    const domains = ['language', 'math', 'science'] as const;
    return domains[(Math.max(1, dayNo) - 1) % domains.length];
  }

  private buildNarrationText(pack: Record<string, any>): string {
    const segments = this.collectNarrationScriptSegments(pack);
    const lines = segments.map((text, index) => `第${index + 1}段：${text}`);
    if (lines.length === 0) lines.push('No narration content found in this course pack.');
    return lines.join('\n');
  }

  private buildNarrationSpeechText(pack: Record<string, any>): string {
    return this.collectNarrationScriptSegments(pack).join('。');
  }

  private collectNarrationScriptSegments(pack: Record<string, any>): string[] {
    const segments: string[] = [];
    const pushText = (value: any) => {
      const text = String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) return;
      if (segments[segments.length - 1] === text) return;
      segments.push(text);
    };

    const shots = Array.isArray(pack?.videoLesson?.shots) ? pack.videoLesson.shots : [];
    shots.forEach((shot: any) => pushText(shot?.narration || shot?.caption));

    const scenes = Array.isArray(pack?.visualStory?.scenes) ? pack.visualStory.scenes : [];
    scenes.forEach((scene: any) => pushText(scene?.narration || scene?.onScreenText));

    const audioScript = Array.isArray(pack?.modules?.listening?.audioScript)
      ? pack.modules.listening.audioScript
      : [];
    audioScript.forEach((item: any) => pushText(item?.narration));

    return segments;
  }

  private async buildNarrationMp3(pack: Record<string, any>): Promise<Buffer | null> {
    if (!this.voiceService) return null;
    const narration = this.buildNarrationSpeechText(pack);
    const plain = narration
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/No narration content found in this course pack\./i, '')
      .trim();
    if (!plain) return null;

    // Keep TTS payload bounded for stability.
    const text = plain.length > 1200 ? `${plain.slice(0, 1200)}。` : plain;
    try {
      return await this.voiceService.textToSpeech(text, 'zh-CN-XiaoxiaoNeural');
    } catch (error: any) {
      this.logger.warn(`build narration mp3 failed: ${error?.message || 'unknown'}`);
      return null;
    }
  }

  private async buildTeachingVideoMp4(
    pack: Record<string, any>,
    narrationMp3: Buffer | null,
  ): Promise<Buffer | null> {
    const ffmpegPath = this.getFfmpegExecutablePath();
    if (!ffmpegPath) return null;

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'course-pack-video-'));
    const outputPath = path.join(tempRoot, 'teaching-video.mp4');
    const narrationPath = path.join(tempRoot, 'narration.mp3');
    const fontLocalName = 'subtitle-font.ttf';
    const fontLocalPath = path.join(tempRoot, fontLocalName);

    try {
      const storyboard = this.collectStoryboardVideoSegments(pack);
      const fallbackDuration = this.resolvePackDurationSec(pack);
      if (storyboard.length === 0) {
        storyboard.push({
          headline: String(pack?.title || '学习视频'),
          subtitle: String(pack?.summary || pack?.topic || '学习内容讲解'),
          visualHint: '',
          durationSec: fallbackDuration,
        });
      }

      const sourceFontPath = await this.resolveSubtitleFontPath();
      let hasLocalFont = false;
      if (sourceFontPath) {
        try {
          await fs.copyFile(sourceFontPath, fontLocalPath);
          hasLocalFont = true;
        } catch {
          hasLocalFont = false;
        }
      }

      const segmentNames: string[] = [];
      const segmentDurations: number[] = [];
      for (let index = 0; index < storyboard.length; index += 1) {
        const shot = storyboard[index];
        const themeStyle = this.buildThemeAnimationProfile(pack, shot, index);
        const shotFile = `shot-${String(index + 1).padStart(3, '0')}.mp4`;
        const titleFile = `shot-${index + 1}-title.txt`;
        const subtitleFile = `shot-${index + 1}-subtitle.txt`;
        const visualFile = `shot-${index + 1}-visual.txt`;
        const safeDuration = this.toSafeNumber(shot.durationSec, 6, 1, 180);

        const titleText = this.wrapSubtitleText(
          String(shot.headline || `镜头 ${index + 1}`).trim() || `镜头 ${index + 1}`,
          14,
          2,
        );
        const subtitleText = this.wrapSubtitleText(
          String(shot.subtitle || shot.headline || '').trim() || '学习进行中',
          18,
          2,
        );
        const visualText = this.wrapSubtitleText(String(shot.visualHint || '').trim(), 18, 2);

        await fs.writeFile(path.join(tempRoot, titleFile), titleText, 'utf8');
        await fs.writeFile(path.join(tempRoot, subtitleFile), subtitleText, 'utf8');
        if (visualText) {
          await fs.writeFile(path.join(tempRoot, visualFile), visualText, 'utf8');
        }

        const fontPrefix = hasLocalFont ? `fontfile='${fontLocalName}':` : '';
        const filterParts = [
          `drawbox=x=iw*0.30:y=ih*0.30:w=iw*0.40:h=ih*0.30:color=${themeStyle.cardColor}@0.30:t=fill`,
          'drawbox=x=0:y=0:w=iw:h=118:color=black@0.28:t=fill',
          'drawbox=x=0:y=ih-198:w=iw:h=198:color=black@0.45:t=fill',
          `drawtext=${fontPrefix}textfile='${titleFile}':fontcolor=white:fontsize=36:line_spacing=8:x=(w-text_w)/2:y=28`,
          `drawtext=${fontPrefix}textfile='${subtitleFile}':fontcolor=white:fontsize=44:line_spacing=10:x=(w-text_w)/2:y=h-160`,
        ];
        if (visualText) {
          filterParts.push(
            `drawtext=${fontPrefix}textfile='${visualFile}':fontcolor=white@0.85:fontsize=26:line_spacing=6:x=(w-text_w)/2:y=ih*0.40`,
          );
        }
        filterParts.push('fade=t=in:st=0:d=0.22');
        if (safeDuration > 0.9) {
          const fadeOutStart = this.roundSeconds(Math.max(0.1, safeDuration - 0.28));
          filterParts.push(`fade=t=out:st=${fadeOutStart}:d=0.28`);
        }
        const videoFilter = filterParts.join(',');
        const spriteAssets = await this.buildShotSpriteAssets(themeStyle, shot, index, tempRoot);
        const hasMainSprite = !!spriteAssets.main;
        const hasAuxSprite = !!spriteAssets.aux;

        if (hasMainSprite || hasAuxSprite) {
          const inputArgs: string[] = [
            '-y',
            '-f',
            'lavfi',
            '-i',
            `color=c=${themeStyle.backgroundColor}:s=1280x720:d=${safeDuration}`,
          ];
          const complexParts: string[] = [`[0:v]${videoFilter}[base]`];
          let lastLabel = 'base';
          let inputIndex = 1;

          if (hasMainSprite) {
            inputArgs.push(
              '-loop',
              '1',
              '-t',
              String(safeDuration),
              '-i',
              path.basename(spriteAssets.main as string),
            );
            complexParts.push(`[${inputIndex}:v]scale=264:-1[sp${inputIndex}]`);
            complexParts.push(
              `[${lastLabel}][sp${inputIndex}]overlay=${this.buildSpriteOverlayExpression(themeStyle, index, 'main')}:shortest=1[o${inputIndex}]`,
            );
            lastLabel = `o${inputIndex}`;
            inputIndex += 1;
          }

          if (hasAuxSprite) {
            inputArgs.push(
              '-loop',
              '1',
              '-t',
              String(safeDuration),
              '-i',
              path.basename(spriteAssets.aux as string),
            );
            complexParts.push(`[${inputIndex}:v]scale=176:-1[sp${inputIndex}]`);
            complexParts.push(
              `[${lastLabel}][sp${inputIndex}]overlay=${this.buildSpriteOverlayExpression(themeStyle, index, 'aux')}:shortest=1[o${inputIndex}]`,
            );
            lastLabel = `o${inputIndex}`;
          }

          await this.runFfmpeg(
            ffmpegPath,
            [
              ...inputArgs,
              '-filter_complex',
              complexParts.join(';'),
              '-map',
              `[${lastLabel}]`,
              '-r',
              '30',
              '-c:v',
              'libx264',
              '-pix_fmt',
              'yuv420p',
              '-t',
              String(safeDuration),
              '-an',
              shotFile,
            ],
            { cwd: tempRoot },
          );
        } else {
          await this.runFfmpeg(
            ffmpegPath,
            [
              '-y',
              '-f',
              'lavfi',
              '-i',
              `color=c=${themeStyle.backgroundColor}:s=1280x720:d=${safeDuration}`,
              '-vf',
              videoFilter,
              '-r',
              '30',
              '-c:v',
              'libx264',
              '-pix_fmt',
              'yuv420p',
              '-an',
              shotFile,
            ],
            { cwd: tempRoot },
          );
        }

        segmentNames.push(shotFile);
        segmentDurations.push(safeDuration);
      }

      const stitchedFile = await this.mergeSegmentsWithTransitions(
        ffmpegPath,
        tempRoot,
        segmentNames,
        segmentDurations,
      );

      if (narrationMp3) {
        await fs.writeFile(narrationPath, narrationMp3);
      }

      await this.runFfmpeg(
        ffmpegPath,
        narrationMp3
          ? [
              '-y',
              '-i',
              path.basename(stitchedFile),
              '-i',
              path.basename(narrationPath),
              '-shortest',
              '-c:v',
              'copy',
              '-c:a',
              'aac',
              '-b:a',
              '128k',
              '-movflags',
              '+faststart',
              path.basename(outputPath),
            ]
          : [
              '-y',
              '-i',
              path.basename(stitchedFile),
              '-f',
              'lavfi',
              '-i',
              'anullsrc=r=44100:cl=stereo',
              '-shortest',
              '-c:v',
              'copy',
              '-c:a',
              'aac',
              '-b:a',
              '96k',
              '-movflags',
              '+faststart',
              path.basename(outputPath),
            ],
        { cwd: tempRoot },
      );

      const buffer = await fs.readFile(outputPath);
      return buffer.length > 0 ? buffer : null;
    } catch (error: any) {
      this.logger.warn(`build teaching video mp4 failed: ${error?.message || 'unknown'}`);
      return null;
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    }
  }

  private resolvePackDurationSec(pack: Record<string, any>): number {
    const shots = Array.isArray(pack?.videoLesson?.shots) ? pack.videoLesson.shots : [];
    const shotDuration = shots.reduce(
      (sum: number, shot: any) => sum + this.toSafeNumber(shot?.durationSec, 8, 1, 180),
      0,
    );
    if (shotDuration > 0) return this.toSafeNumber(shotDuration, 30, 3, 300);

    const scenes = Array.isArray(pack?.visualStory?.scenes) ? pack.visualStory.scenes : [];
    const sceneDuration = scenes.reduce(
      (sum: number, scene: any) => sum + this.toSafeNumber(scene?.durationSec, 6, 1, 120),
      0,
    );
    if (sceneDuration > 0) return this.toSafeNumber(sceneDuration, 30, 3, 300);

    const declaredDuration = this.toSafeNumber(pack?.videoLesson?.durationSec, 30, 3, 300);
    return declaredDuration || 30;
  }

  private collectStoryboardVideoSegments(pack: Record<string, any>): Array<{
    headline: string;
    subtitle: string;
    visualHint: string;
    durationSec: number;
  }> {
    const segments: Array<{
      headline: string;
      subtitle: string;
      visualHint: string;
      durationSec: number;
    }> = [];
    const pushSegment = (
      headline: any,
      subtitle: any,
      visualHint: any,
      durationSec: any,
      fallbackTitle: string,
      fallbackDuration: number,
    ) => {
      const s = String(subtitle || '')
        .replace(/\s+/g, ' ')
        .trim();
      const h = this.normalizeStoryboardHeadline(headline, s, fallbackTitle);
      const v = String(visualHint || '')
        .replace(/\s+/g, ' ')
        .trim();
      const d = this.toSafeNumber(durationSec, fallbackDuration, 1, 180);
      segments.push({
        headline: h,
        subtitle: s || h,
        visualHint: v,
        durationSec: d,
      });
    };

    const shots = Array.isArray(pack?.videoLesson?.shots) ? pack.videoLesson.shots : [];
    shots.forEach((shot: any, idx: number) =>
      pushSegment(
        shot?.shot || `镜头 ${idx + 1}`,
        shot?.caption || shot?.narration || '',
        shot?.visualPrompt || '',
        shot?.durationSec,
        `镜头 ${idx + 1}`,
        8,
      ),
    );
    if (segments.length > 0) return segments;

    const scenes = Array.isArray(pack?.visualStory?.scenes) ? pack.visualStory.scenes : [];
    scenes.forEach((scene: any, idx: number) =>
      pushSegment(
        scene?.scene || `场景 ${idx + 1}`,
        scene?.onScreenText || scene?.narration || '',
        scene?.imagePrompt || '',
        scene?.durationSec,
        `场景 ${idx + 1}`,
        7,
      ),
    );
    if (segments.length > 0) return segments;

    const audioScript = Array.isArray(pack?.modules?.listening?.audioScript)
      ? pack.modules.listening.audioScript
      : [];
    audioScript.forEach((item: any, idx: number) =>
      pushSegment(
        `音频片段 ${idx + 1}`,
        item?.narration || '',
        '',
        item?.durationSec,
        `音频片段 ${idx + 1}`,
        6,
      ),
    );

    return segments;
  }

  private normalizeStoryboardHeadline(
    headline: any,
    subtitle: string,
    fallbackTitle: string,
  ): string {
    const rawHeadline = String(headline || '')
      .replace(/\s+/g, ' ')
      .trim();
    const rawSubtitle = String(subtitle || '')
      .replace(/\s+/g, ' ')
      .trim();
    const shouldPreferSubtitle =
      !rawHeadline ||
      /^(opening|concept|practice|wrap[\s-]?up|shot\s*\d+|scene\s*\d+|audio\s*\d+)$/i.test(
        rawHeadline,
      ) ||
      (this.isMostlyEnglish(rawHeadline) && !!rawSubtitle);

    const source = shouldPreferSubtitle ? rawSubtitle : rawHeadline;
    const normalized = source || fallbackTitle;
    return this.compactStoryboardHeadline(normalized, fallbackTitle);
  }

  private compactStoryboardHeadline(text: string, fallbackTitle: string): string {
    const normalized = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return fallbackTitle;

    const chineseMatch = normalized.match(/^[^，。！？；：,.!?;:]{1,10}/);
    if (chineseMatch?.[0]) return chineseMatch[0];
    if (normalized.length <= 24) return normalized;
    return `${normalized.slice(0, 21).trim()}...`;
  }

  private wrapSubtitleText(text: string, maxCharsPerLine: number, maxLines: number = 3): string {
    const raw = String(text || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (raw.length === 0) return '';

    const wrapped: string[] = [];
    for (const line of raw) {
      const chars = [...line];
      if (chars.length <= maxCharsPerLine) {
        wrapped.push(line);
        continue;
      }
      for (let i = 0; i < chars.length; i += maxCharsPerLine) {
        wrapped.push(chars.slice(i, i + maxCharsPerLine).join(''));
      }
    }
    const limited = wrapped.slice(0, Math.max(1, maxLines));
    if (wrapped.length > limited.length) {
      const lastIdx = limited.length - 1;
      const tail = [...limited[lastIdx]];
      if (tail.length >= 1) {
        limited[lastIdx] = `${tail.slice(0, Math.max(1, maxCharsPerLine - 3)).join('')}...`;
      } else {
        limited[lastIdx] = '...';
      }
    }
    return limited.join('\n');
  }

  private buildThemeAnimationProfile(
    pack: Record<string, any>,
    shot: { headline?: string; subtitle?: string; visualHint?: string },
    index: number,
  ): {
    themeKind: 'nature' | 'math' | 'literacy' | 'science' | 'english' | 'general';
    backgroundColor: string;
    ribbonColorA: string;
    ribbonColorB: string;
    cardColor: string;
    motionTokens: string[];
  } {
    type ThemeKind = 'nature' | 'math' | 'literacy' | 'science' | 'english' | 'general';
    type ThemeProfile = {
      themeKind: ThemeKind;
      backgroundColor: string;
      ribbonColorA: string;
      ribbonColorB: string;
      cardColor: string;
      motifSeed: string[];
    };
    const sourceTextRaw = [
      String(pack?.topic || ''),
      String(pack?.title || ''),
      String(shot?.headline || ''),
      String(shot?.subtitle || ''),
      String(shot?.visualHint || ''),
    ].join(' ');
    const sourceText = sourceTextRaw.toLowerCase();

    let palette: ThemeProfile = {
      themeKind: 'general' as const,
      backgroundColor: this.pickShotColor(index),
      ribbonColorA: '0x14b8a6',
      ribbonColorB: '0xf97316',
      cardColor: '0x1f2937',
      motifSeed: ['启发', '思考', '练习', '互动'],
    };

    if (
      /(山|河|湖|海|森林|地理|自然|海洋|river|ocean|mountain|lake|nature|earth)/.test(sourceText)
    ) {
      palette = {
        themeKind: 'nature',
        backgroundColor: '0x0b3b5a',
        ribbonColorA: '0x06b6d4',
        ribbonColorB: '0x34d399',
        cardColor: '0x0f172a',
        motifSeed: ['山', '河', '湖', '海', '云', '风'],
      };
    } else if (
      /(数学|算数|数感|加法|减法|乘法|除法|几何|math|number|geometry|count)/.test(sourceText)
    ) {
      palette = {
        themeKind: 'math',
        backgroundColor: '0x1f1d4d',
        ribbonColorA: '0x60a5fa',
        ribbonColorB: '0xf59e0b',
        cardColor: '0x111827',
        motifSeed: ['1', '2', '3', '+', '-', 'x', '='],
      };
    } else if (
      /(汉字|识字|拼音|语文|阅读|写字|literacy|chinese|character|word|reading)/.test(sourceText)
    ) {
      palette = {
        themeKind: 'literacy',
        backgroundColor: '0x4a1d35',
        ribbonColorA: '0xf472b6',
        ribbonColorB: '0xfb7185',
        cardColor: '0x1f2937',
        motifSeed: ['字', '词', '句', '读', '写', '说'],
      };
    } else if (/(科学|实验|观察|探索|science|physics|chemistry|biology|planet)/.test(sourceText)) {
      palette = {
        themeKind: 'science',
        backgroundColor: '0x0f3d32',
        ribbonColorA: '0x22d3ee',
        ribbonColorB: '0xa3e635',
        cardColor: '0x111827',
        motifSeed: ['观察', '实验', '发现', '推理', '星球'],
      };
    } else if (/(英语|英文|单词|字母|english|alphabet|phonics)/.test(sourceText)) {
      palette = {
        themeKind: 'english',
        backgroundColor: '0x12203f',
        ribbonColorA: '0x38bdf8',
        ribbonColorB: '0xfacc15',
        cardColor: '0x1e293b',
        motifSeed: ['A', 'B', 'C', 'D', 'E', 'F'],
      };
    }

    // mascot 标签只用 curated 主题词，避免对标题硬切产生「彩虹的颜」式截断
    const motionTokens = palette.motifSeed;

    return {
      themeKind: palette.themeKind,
      backgroundColor: palette.backgroundColor,
      ribbonColorA: palette.ribbonColorA,
      ribbonColorB: palette.ribbonColorB,
      cardColor: palette.cardColor,
      motionTokens,
    };
  }

  private async buildShotSpriteAssets(
    themeStyle: {
      themeKind: 'nature' | 'math' | 'literacy' | 'science' | 'english' | 'general';
      motionTokens: string[];
    },
    shot: { headline?: string; subtitle?: string; visualHint?: string },
    index: number,
    tempRoot: string,
  ): Promise<{ main: string | null; aux: string | null }> {
    const primaryLabel = this.pickSpriteLabel(themeStyle, shot, 0);
    const secondaryLabel = this.pickSpriteLabel(themeStyle, shot, 1);
    const mainPath = path.join(tempRoot, `shot-${index + 1}-sprite-main.png`);
    const auxPath = path.join(tempRoot, `shot-${index + 1}-sprite-aux.png`);

    const mainSvg = this.buildThemeSpriteSvg(themeStyle, primaryLabel, 'main');
    const auxSvg = this.buildThemeSpriteSvg(themeStyle, secondaryLabel, 'aux');

    const mainOk = await this.renderSvgSpriteToPng(mainSvg, mainPath);
    const auxOk = await this.renderSvgSpriteToPng(auxSvg, auxPath);
    return {
      main: mainOk ? mainPath : null,
      aux: auxOk ? auxPath : null,
    };
  }

  private pickSpriteLabel(
    themeStyle: { motionTokens: string[] },
    _shot: { headline?: string; subtitle?: string; visualHint?: string },
    rank: number,
  ): string {
    const tokens = themeStyle.motionTokens || [];
    return String(tokens[rank] || tokens[0] || '学习').trim() || '学习';
  }

  private async renderSvgSpriteToPng(svg: string, outputPath: string): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Resvg } = require('@resvg/resvg-js');
      const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: 512 },
      });
      const rendered = resvg.render();
      const pngBuffer: Buffer = rendered.asPng();
      await fs.writeFile(outputPath, pngBuffer);
      return pngBuffer.length > 0;
    } catch (error: any) {
      this.logger.warn(`render sprite png failed: ${error?.message || 'unknown'}`);
      return false;
    }
  }

  private buildThemeSpriteSvg(
    themeStyle: {
      themeKind: 'nature' | 'math' | 'literacy' | 'science' | 'english' | 'general';
    },
    label: string,
    variant: 'main' | 'aux',
  ): string {
    const style = this.getThemeSpriteStyle(themeStyle.themeKind);
    const safeLabel = this.escapeXml(String(label || '学习').slice(0, variant === 'main' ? 6 : 4));
    const eyeY = variant === 'main' ? 190 : 184;
    const mouthY = variant === 'main' ? 238 : 226;
    const accentOpacity = variant === 'main' ? '0.92' : '0.82';
    const bodySize = variant === 'main' ? 286 : 238;
    const bodyX = variant === 'main' ? 113 : 137;
    const bodyY = variant === 'main' ? 102 : 128;
    const ring =
      variant === 'main'
        ? `<ellipse cx="256" cy="428" rx="166" ry="34" fill="${style.shadow}" opacity="0.34" />`
        : '';

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">`,
      `<defs>`,
      `<linearGradient id="bgG" x1="0" y1="0" x2="1" y2="1">`,
      `<stop offset="0%" stop-color="${style.bgA}" />`,
      `<stop offset="100%" stop-color="${style.bgB}" />`,
      `</linearGradient>`,
      `</defs>`,
      `<rect x="0" y="0" width="512" height="512" fill="transparent" />`,
      ring,
      `<rect x="${bodyX}" y="${bodyY}" width="${bodySize}" height="${bodySize}" rx="56" fill="url(#bgG)" opacity="${accentOpacity}" />`,
      `<rect x="${bodyX + 20}" y="${bodyY + 18}" width="${Math.max(120, bodySize - 40)}" height="${Math.max(70, bodySize - 150)}" rx="34" fill="${style.inner}" opacity="0.66" />`,
      `<circle cx="212" cy="${eyeY}" r="11" fill="${style.eye}" />`,
      `<circle cx="300" cy="${eyeY}" r="11" fill="${style.eye}" />`,
      `<rect x="214" y="${mouthY}" width="84" height="12" rx="6" fill="${style.eye}" opacity="0.86" />`,
      `<rect x="173" y="298" width="166" height="84" rx="20" fill="${style.labelBg}" opacity="0.86" />`,
      `<text x="256" y="351" text-anchor="middle" font-size="${variant === 'main' ? 44 : 34}" font-family="Microsoft YaHei, SimHei, sans-serif" fill="${style.labelText}" font-weight="700">${safeLabel}</text>`,
      style.icon,
      `</svg>`,
    ].join('');
  }

  private getThemeSpriteStyle(
    themeKind: 'nature' | 'math' | 'literacy' | 'science' | 'english' | 'general',
  ): {
    bgA: string;
    bgB: string;
    inner: string;
    eye: string;
    shadow: string;
    labelBg: string;
    labelText: string;
    icon: string;
  } {
    if (themeKind === 'nature') {
      return {
        bgA: '#3b82f6',
        bgB: '#22d3ee',
        inner: '#0f172a',
        eye: '#f8fafc',
        shadow: '#0ea5e9',
        labelBg: '#0f172a',
        labelText: '#e0f2fe',
        icon: `<path d="M352 128l34 20-34 20-34-20 34-20z" fill="#fde68a" opacity="0.82" /><path d="M118 362h154l-56 38H80z" fill="#1e3a8a" opacity="0.52" />`,
      };
    }
    if (themeKind === 'math') {
      return {
        bgA: '#60a5fa',
        bgB: '#4338ca',
        inner: '#111827',
        eye: '#f8fafc',
        shadow: '#312e81',
        labelBg: '#1e1b4b',
        labelText: '#fef3c7',
        icon: `<rect x="362" y="118" width="34" height="34" rx="10" fill="#f59e0b" opacity="0.82"/><rect x="74" y="318" width="34" height="34" rx="10" fill="#93c5fd" opacity="0.72"/>`,
      };
    }
    if (themeKind === 'literacy') {
      return {
        bgA: '#f472b6',
        bgB: '#be185d',
        inner: '#1f2937',
        eye: '#f8fafc',
        shadow: '#9d174d',
        labelBg: '#3f3f46',
        labelText: '#fdf2f8',
        icon: `<rect x="94" y="128" width="52" height="244" rx="9" fill="#fef3c7" opacity="0.38"/><rect x="366" y="122" width="36" height="252" rx="8" fill="#fde68a" opacity="0.32"/>`,
      };
    }
    if (themeKind === 'science') {
      return {
        bgA: '#22d3ee',
        bgB: '#0f766e',
        inner: '#0f172a',
        eye: '#f8fafc',
        shadow: '#134e4a',
        labelBg: '#0f172a',
        labelText: '#dcfce7',
        icon: `<ellipse cx="396" cy="182" rx="42" ry="16" fill="#a3e635" opacity="0.52"/><circle cx="392" cy="182" r="18" fill="#22d3ee" opacity="0.72"/>`,
      };
    }
    if (themeKind === 'english') {
      return {
        bgA: '#38bdf8',
        bgB: '#1d4ed8',
        inner: '#0f172a',
        eye: '#f8fafc',
        shadow: '#1e3a8a',
        labelBg: '#1e293b',
        labelText: '#fef9c3',
        icon: `<rect x="352" y="124" width="64" height="46" rx="12" fill="#facc15" opacity="0.78"/><rect x="84" y="124" width="64" height="46" rx="12" fill="#93c5fd" opacity="0.74"/>`,
      };
    }
    return {
      bgA: '#64748b',
      bgB: '#334155',
      inner: '#111827',
      eye: '#f8fafc',
      shadow: '#1e293b',
      labelBg: '#1f2937',
      labelText: '#e5e7eb',
      icon: `<circle cx="402" cy="156" r="24" fill="#cbd5e1" opacity="0.56"/><circle cx="108" cy="362" r="20" fill="#94a3b8" opacity="0.48"/>`,
    };
  }

  private escapeXml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private buildSpriteOverlayExpression(
    _themeStyle: {
      themeKind: 'nature' | 'math' | 'literacy' | 'science' | 'english' | 'general';
    },
    _index: number,
    slot: 'main' | 'aux',
  ): string {
    // 静态侧边站位，避免漂移到中央文字区造成重叠
    if (slot === 'main') return 'x=main_w*0.05:y=main_h*0.34';
    return 'x=main_w*0.78:y=main_h*0.40';
  }

  private async mergeSegmentsWithTransitions(
    ffmpegPath: string,
    tempRoot: string,
    segmentNames: string[],
    segmentDurations: number[],
  ): Promise<string> {
    if (segmentNames.length === 0) throw new Error('NO_VIDEO_SEGMENTS');
    if (segmentNames.length === 1) return segmentNames[0];
    // Compatibility mode: some ffmpeg builds in deployment don't include xfade.
    // We bake fade-in/fade-out in each segment and concatenate here.
    void segmentDurations;
    return this.concatSegmentsWithoutTransition(ffmpegPath, tempRoot, segmentNames);
  }

  private async concatSegmentsWithoutTransition(
    ffmpegPath: string,
    tempRoot: string,
    segmentNames: string[],
  ): Promise<string> {
    if (segmentNames.length === 0) throw new Error('NO_VIDEO_SEGMENTS');
    if (segmentNames.length === 1) return segmentNames[0];
    const concatName = 'segments-concat.txt';
    const concatPath = path.join(tempRoot, concatName);
    const outputName = 'stitched.mp4';
    const concatBody = segmentNames.map((name) => `file ${name}`).join('\n');
    await fs.writeFile(concatPath, concatBody, 'utf8');
    await this.runFfmpeg(
      ffmpegPath,
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatName,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-r',
        '30',
        '-an',
        outputName,
      ],
      { cwd: tempRoot },
    );
    return outputName;
  }

  private pickTransitionEffect(index: number): string {
    const sequence = ['fade', 'slideleft', 'wiperight', 'wipeleft'];
    return sequence[Math.abs(index) % sequence.length];
  }

  private isUnitTestEnvironment(): boolean {
    return process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
  }

  private pickShotColor(index: number): string {
    const palette = [
      '0x1f2937',
      '0x0f766e',
      '0x7c2d12',
      '0x0c4a6e',
      '0x3f3f46',
      '0x4c1d95',
      '0x14532d',
      '0x7f1d1d',
    ];
    return palette[Math.abs(index) % palette.length];
  }

  private async resolveSubtitleFontPath(): Promise<string | null> {
    const candidates = [
      'C:\\Windows\\Fonts\\msyh.ttc',
      'C:\\Windows\\Fonts\\msyh.ttf',
      'C:\\Windows\\Fonts\\simhei.ttf',
      'C:\\Windows\\Fonts\\simsun.ttc',
      'C:\\Windows\\Fonts\\NotoSansCJK-Regular.ttc',
    ];
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // try next candidate
      }
    }
    return null;
  }

  private getFfmpegExecutablePath(): string | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const installer = require('@ffmpeg-installer/ffmpeg');
      const installerPath = typeof installer?.path === 'string' ? installer.path.trim() : '';
      if (installerPath) return installerPath;
    } catch {
      // continue
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ffmpegPath = require('ffmpeg-static');
      if (typeof ffmpegPath !== 'string' || !ffmpegPath.trim()) return null;
      return ffmpegPath;
    } catch {
      // continue
    }

    const fromEnv = String(process.env.FFMPEG_PATH || '').trim();
    if (fromEnv) return fromEnv;

    return null;
  }

  private async runFfmpeg(
    ffmpegPath: string,
    args: string[],
    options?: { cwd?: string },
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegPath, args, {
        windowsHide: true,
        cwd: options?.cwd,
      });
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += String(chunk);
      });
      child.on('error', (error) => reject(error));
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
      });
    });
  }

  private buildStoryboardCsv(pack: Record<string, any>): string {
    const headers = [
      'index',
      'type',
      'scene_or_shot',
      'visual_prompt',
      'narration',
      'caption_or_text',
      'duration_sec',
    ];
    const rows: string[][] = [headers];
    const pushRow = (
      idx: number,
      type: string,
      name: string,
      visual: string,
      narration: string,
      caption: string,
      durationSec: any,
    ) => {
      rows.push([
        String(idx),
        type,
        name || '',
        visual || '',
        narration || '',
        caption || '',
        Number.isFinite(Number(durationSec)) ? String(durationSec) : '',
      ]);
    };

    let index = 1;
    const shots = Array.isArray(pack?.videoLesson?.shots) ? pack.videoLesson.shots : [];
    for (const shot of shots) {
      pushRow(
        index++,
        'video_shot',
        String(shot?.shot || ''),
        String(shot?.visualPrompt || ''),
        String(shot?.narration || ''),
        String(shot?.caption || ''),
        shot?.durationSec,
      );
    }
    const scenes = Array.isArray(pack?.visualStory?.scenes) ? pack.visualStory.scenes : [];
    for (const scene of scenes) {
      pushRow(
        index++,
        'visual_scene',
        String(scene?.scene || ''),
        String(scene?.imagePrompt || ''),
        String(scene?.narration || ''),
        String(scene?.onScreenText || ''),
        scene?.durationSec,
      );
    }
    if (rows.length === 1)
      rows.push(['1', 'note', 'empty', '', 'No storyboard data found', '', '']);
    return rows.map((row) => row.map((cell) => this.toCsvCell(cell)).join(',')).join('\n');
  }

  private toCsvCell(value: string): string {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  private buildCapCutPayload(pack: Record<string, any>, recordId: number): Record<string, any> {
    const shots = Array.isArray(pack?.videoLesson?.shots) ? pack.videoLesson.shots : [];
    const scenes = Array.isArray(pack?.visualStory?.scenes) ? pack.visualStory.scenes : [];
    const renderGuide = pack?.videoLesson?.renderGuide || {};
    const voiceStyle = String(renderGuide?.voiceStyle || 'friendly teacher');
    const musicStyle = String(renderGuide?.musicStyle || 'light and playful');

    let timelineCursor = 0;
    const timeline = shots.map((shot: any, index: number) => {
      const durationSec = this.toSafeNumber(shot?.durationSec, 12, 1, 180);
      const startSec = this.roundSeconds(timelineCursor);
      const endSec = this.roundSeconds(startSec + durationSec);
      timelineCursor = endSec;
      const pauseAfterSec =
        index < shots.length - 1
          ? this.toSafeNumber(shot?.pauseAfterSec, durationSec >= 18 ? 0.8 : 0.5, 0, 2)
          : 0;
      return {
        id: `shot-${index + 1}`,
        type: 'video_shot',
        order: index + 1,
        name: String(shot?.shot || `Shot ${index + 1}`),
        startSec,
        endSec,
        durationSec,
        visualPrompt: String(shot?.visualPrompt || ''),
        narration: String(shot?.narration || ''),
        caption: String(shot?.caption || ''),
        transitionToNext: this.recommendTransition(index, shots.length, durationSec),
        pauseAfterSec,
        voiceTrackId: 'voice-main',
      };
    });

    let visualCursor = 0;
    const visualScenes = scenes.map((scene: any, index: number) => {
      const durationSec = this.toSafeNumber(scene?.durationSec, 10, 1, 120);
      const startSec = this.roundSeconds(visualCursor);
      const endSec = this.roundSeconds(startSec + durationSec);
      visualCursor = endSec;
      return {
        id: `scene-${index + 1}`,
        type: 'visual_scene',
        order: index + 1,
        name: String(scene?.scene || `Scene ${index + 1}`),
        startSec,
        endSec,
        durationSec,
        imagePrompt: String(scene?.imagePrompt || ''),
        narration: String(scene?.narration || ''),
        onScreenText: String(scene?.onScreenText || ''),
        linkedShotId: timeline[index]?.id || null,
      };
    });

    const totalDurationSec = this.roundSeconds(
      timeline.reduce((sum, item) => sum + (item.durationSec || 0), 0),
    );
    const safeTotalDurationSec = totalDurationSec > 0 ? totalDurationSec : 3;
    const voiceOverSegments = timeline.map((item: any, index: number) => {
      const holdTailSec = item.pauseAfterSec > 0 ? Math.min(item.pauseAfterSec, 1) : 0;
      const endSec = this.roundSeconds(Math.max(item.startSec + 0.8, item.endSec - holdTailSec));
      return {
        id: `voice-${index + 1}`,
        trackId: 'voice-main',
        startSec: item.startSec,
        endSec,
        text: String(item.narration || item.caption || item.name || ''),
        style: voiceStyle,
        pace: item.durationSec >= 18 ? 'slow' : 'normal',
      };
    });
    const subtitleSegments = timeline.map((item: any, index: number) => ({
      id: `sub-${index + 1}`,
      trackId: 'subtitle-main',
      startSec: item.startSec,
      endSec: item.endSec,
      text: String(item.caption || item.narration || item.name || ''),
    }));
    const transitionSfx = timeline
      .filter((item: any) => item.transitionToNext?.type !== 'none')
      .map((item: any, index: number) => {
        const cueStart = this.roundSeconds(
          Math.max(
            item.startSec + 0.2,
            item.endSec - this.toSafeNumber(item.transitionToNext?.durationSec, 0.5, 0, 3),
          ),
        );
        return {
          id: `sfx-transition-${index + 1}`,
          trackId: 'sfx-main',
          cue: 'soft-whoosh',
          startSec: cueStart,
          durationSec: 0.35,
          volumePercent: 26,
        };
      });
    const pausePointsSec = timeline
      .filter((item: any) => item.pauseAfterSec > 0)
      .map((item: any) => this.roundSeconds(item.endSec));
    const beatPointsSec = timeline.map((item: any) => this.roundSeconds(item.startSec));
    if (safeTotalDurationSec > 0) beatPointsSec.push(this.roundSeconds(safeTotalDurationSec));

    return {
      exporter: 'ai-growth-companion',
      version: '1.1',
      recordId,
      title: String(pack?.title || `Course Pack ${recordId}`),
      topic: String(pack?.topic || ''),
      ageGroup: String(pack?.ageGroup || ''),
      renderGuide,
      capcutHint: {
        importAs: 'scripted_storyboard',
        notes: 'Use timeline start/end, transitions, and tracks as direct edit references.',
        recommendedWorkflow: [
          'Import timeline as shot list',
          'Apply transitionToNext between adjacent shots',
          'Lay voice-main first, then subtitle-main, and bgm-main last',
          'Use pausePointsSec for interaction pauses',
        ],
      },
      timeline,
      visualScenes,
      tracks: {
        voiceOver: {
          trackId: 'voice-main',
          style: voiceStyle,
          segments: voiceOverSegments,
        },
        subtitles: { trackId: 'subtitle-main', segments: subtitleSegments },
        backgroundMusic: {
          trackId: 'bgm-main',
          preset: musicStyle,
          startSec: 0,
          endSec: safeTotalDurationSec,
          volumePercent: 30,
          fadeInSec: 1.2,
          fadeOutSec: 1.2,
        },
        soundEffects: transitionSfx,
      },
      editPlan: {
        pausePointsSec,
        beatPointsSec,
        totalDurationSec: safeTotalDurationSec,
      },
      totalDurationSec: safeTotalDurationSec,
      generatedAt: new Date().toISOString(),
    };
  }

  private buildSubtitleSrt(pack: Record<string, any>): string {
    const segments = this.collectSubtitleSegments(pack);
    if (segments.length === 0) return '1\n00:00:00,000 --> 00:00:03,000\n(Empty subtitle)\n';
    let cursor = 0;
    const blocks: string[] = [];
    segments.forEach((segment, index) => {
      const start = cursor;
      const end = start + segment.durationSec;
      blocks.push(
        `${index + 1}\n${this.formatSrtTime(start)} --> ${this.formatSrtTime(end)}\n${segment.text}\n`,
      );
      cursor = end;
    });
    return blocks.join('\n');
  }

  private buildSubtitleSrtBilingual(pack: Record<string, any>): string {
    const segments = this.collectSubtitleSegments(pack);
    if (segments.length === 0) return '1\n00:00:00,000 --> 00:00:03,000\n(Empty subtitle)\n';
    let cursor = 0;
    const blocks: string[] = [];
    segments.forEach((segment, index) => {
      const start = cursor;
      const end = start + segment.durationSec;
      const englishLine = (segment.textEn || '').trim() || segment.text;
      blocks.push(
        `${index + 1}\n${this.formatSrtTime(start)} --> ${this.formatSrtTime(end)}\n${segment.text}\n${englishLine}\n`,
      );
      cursor = end;
    });
    return blocks.join('\n');
  }

  private collectSubtitleSegments(
    pack: Record<string, any>,
  ): Array<{ text: string; textEn: string; durationSec: number }> {
    const segments: Array<{
      text: string;
      textEn: string;
      durationSec: number;
    }> = [];
    const pushSegment = (text: any, durationSec: any, textEn?: any) => {
      const content = String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!content) return;
      const en = String(textEn || '')
        .replace(/\s+/g, ' ')
        .trim();
      const duration = Number.isFinite(Number(durationSec)) ? Math.max(1, Number(durationSec)) : 3;
      segments.push({ text: content, textEn: en, durationSec: duration });
    };
    const shots = Array.isArray(pack?.videoLesson?.shots) ? pack.videoLesson.shots : [];
    for (const shot of shots) {
      pushSegment(
        shot?.caption || shot?.narration,
        shot?.durationSec,
        shot?.captionEn || shot?.narrationEn,
      );
    }
    if (segments.length === 0) {
      const scenes = Array.isArray(pack?.visualStory?.scenes) ? pack.visualStory.scenes : [];
      for (const scene of scenes) {
        pushSegment(
          scene?.onScreenText || scene?.narration,
          scene?.durationSec,
          scene?.onScreenTextEn || scene?.narrationEn,
        );
      }
    }
    if (segments.length === 0) {
      const audioScript = Array.isArray(pack?.modules?.listening?.audioScript)
        ? pack.modules.listening.audioScript
        : [];
      for (const item of audioScript) {
        pushSegment(item?.narration, item?.durationSec, item?.narrationEn);
      }
    }
    return segments;
  }

  private formatSrtTime(totalSec: number): string {
    const ms = Math.max(0, Math.round(totalSec * 1000));
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }

  private recommendTransition(
    index: number,
    totalShots: number,
    durationSec: number,
  ): { type: string; durationSec: number; note: string } {
    if (index >= totalShots - 1) return { type: 'none', durationSec: 0, note: 'last shot' };
    const sequence = ['crossfade', 'slide_left', 'zoom_in', 'dip_to_white'];
    const type = sequence[index % sequence.length];
    const transitionDuration = this.roundSeconds(Math.min(1.2, Math.max(0.4, durationSec * 0.08)));
    return {
      type,
      durationSec: transitionDuration,
      note: 'gentle child-friendly transition',
    };
  }

  private toSafeNumber(value: any, fallback: number, min: number, max: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  private roundSeconds(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
  }

  /** Generate follow-up suggestion chips */
  private generateSuggestions(reply: string, ageGroup: AgeGroup): string[] {
    if (ageGroup === '3-4') {
      return ['我想学颜色 🎨', '给我讲故事 📖', '我们玩游戏吧 🎮'];
    }
    if (ageGroup === '7-9') {
      return ['给我出几道挑战题', '这个词是什么意思', '我最近进步了吗？'];
    }
    if (ageGroup === '10-12') {
      return ['帮我梳理一下思路', '来一道难一点的题', '看看我的学习报告'];
    }
    return ['推荐学习内容', '出一道数学题', '我最近学得怎么样？'];
  }

  /** Generate suggestions for parent mode */
  private generateParentSuggestions(): string[] {
    return ['查看学习报告', '设置学习时间限制', '布置作业', '查看孩子能力'];
  }

  // ========== Legacy endpoints preserved for backward compatibility ==========

  async generateStory(params: {
    childId: number;
    theme?: string;
    ageRange?: '3-4' | '5-6';
  }): Promise<{ title: string; content: string; questions: string[] }> {
    const { childId, theme, ageRange } = params;
    const user = await this.usersService.findById(childId);
    const age = user?.age;
    const ageGroup =
      ageRange ??
      ((age >= 3 && age <= 4 ? '3-4' : age >= 5 && age <= 6 ? '5-6' : '5-6') as AgeGroup);
    const storyTopic = theme ?? '友谊与分享';

    // Try LLM first
    if (this.llmClient.isConfigured) {
      try {
        const prompt = `请为${ageGroup}岁的孩子编一个关于"${storyTopic}"的简短故事。

要求：
- 语言简单有趣，适合${ageGroup}岁儿童
- 有教育意义
- 包含emoji表情

请按以下JSON格式返回：
{
  "title": "故事标题",
  "content": "故事内容",
  "questions": ["问题1", "问题2", "问题3"]
}`;

        const response = await this.llmClient.generate(prompt);
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const story = JSON.parse(jsonMatch[0]);
          return this.contentSafetyService.filterStoryResponse(story);
        }
      } catch (error) {
        this.logger.warn(`LLM story generation failed, using template: ${error.message}`);
      }
    }

    // Template fallback
    const story = this.buildStoryTemplate(storyTopic, ageGroup);
    return this.contentSafetyService.filterStoryResponse(story);
  }

  async evaluateLearning(contentId: number, answers: any[], _age: number) {
    const correctCount = answers.filter((a, i) => i % 2 === 0).length;
    const score = Math.round((correctCount / answers.length) * 100);

    let feedback: string;
    if (score >= 80) {
      feedback = '你做得太棒了！';
    } else if (score >= 60) {
      feedback = '不错哦，继续加油！';
    } else {
      feedback = '再接再厉哦~';
    }

    const safe = this.contentSafetyService.filterContent(feedback);
    return {
      score,
      feedback: safe.content,
      stars: score >= 80 ? 3 : score >= 60 ? 2 : 1,
    };
  }

  async generateSuggestion(_abilities: any, _age: number) {
    const suggestions = [
      '今天表现很棒！明天我们继续加油~',
      '语言方面有进步！可以多听听故事哦~',
      '数学思维越来越好了！继续做游戏吧~',
      '今天学了很多新知识，太厉害了！',
    ];
    const suggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
    const safe = this.contentSafetyService.filterContent(suggestion);
    return { suggestion: safe.content };
  }

  async generateStoryLegacy(topic: string, age: number) {
    const stories = {
      short: `从前有一只小动物，它${topic}...最后它学到了...`,
      medium: `在一个遥远的森林里，住着一只可爱的小动物。有一天，它遇到了${topic}的挑战...经过努力，它终于成功了！`,
    };
    const content = age < 4 ? stories.short : stories.medium;
    const safe = this.contentSafetyService.filterContent(content);
    return {
      title: `${topic}的故事`,
      content: safe.content,
      duration: age < 4 ? 3 : 5,
    };
  }

  private buildStoryTemplate(
    topic: string,
    ageGroup: AgeGroup,
  ): { title: string; content: string; questions: string[] } {
    if (ageGroup === '3-4') {
      return {
        title: `小兔子的${topic}故事 🐰`,
        content:
          `从前，有一只可爱的小兔子🐰。小兔子最喜欢和朋友一起玩！有一天，小兔子学习了关于"${topic}"的事情。` +
          `小兔子说："哇！${topic}好好玩呀！"🌟\n\n` +
          `小兔子把学到的东西分享给了好朋友小熊🐻。小熊说："谢谢你，小兔子！你真棒！"🎉\n\n` +
          `小兔子开心地笑了，因为它学到了新东西，还和好朋友分享了！太棒了！🌈`,
        questions: [
          '小兔子学了什么呀？🐰',
          '小兔子把学到的东西分享给了谁？',
          '你觉得小兔子开心吗？为什么呢？😊',
        ],
      };
    }
    return {
      title: `探索${topic}的奇妙之旅 🌍`,
      content:
        `在一个美丽的小镇上，住着一群爱学习的好朋友。有一天，他们决定一起去探索"${topic}"的奥秘。\n\n` +
        `经过认真的观察和思考，他们终于弄明白了${topic}的原理。大家都非常高兴！\n\n` +
        `回家的路上，小明说："学习真有趣！下次我们再一起探索新的知识吧！" 🌟`,
      questions: [`故事里的小朋友们探索了什么？`, `如果是你，你会怎么去探索${topic}呢？`],
    };
  }
}
