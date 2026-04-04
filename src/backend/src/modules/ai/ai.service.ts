import { Injectable, Logger } from '@nestjs/common';
import { AgentExecutor } from './agent/agent-executor';
import { ConversationManager } from './conversation/conversation-manager';
import { ContentSafetyService } from '../../common/services/content-safety.service';
import { UsersService } from '../users/users.service';
import { LearningArchiveService } from '../learning/learning-archive.service';
import { LlmConfig } from './llm/llm.config';
import { LlmClient } from './llm/llm-client';
import type { ChatRequest, ChatResponse, QuizRequest, QuizResponse, AgeGroup } from './ai.types';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

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
    private readonly conversationManager: ConversationManager,
    private readonly contentSafetyService: ContentSafetyService,
    private readonly usersService: UsersService,
    private readonly learningArchiveService: LearningArchiveService,
    private readonly llmConfig: LlmConfig,
    private readonly llmClient: LlmClient,
  ) {}

  /** Main chat endpoint — uses Agent with function calling */
  async chat(params: ChatRequest): Promise<ChatResponse> {
    const { message, childId, parentId, sessionId, context } = params;

    // Parent mode: parentId present, no childId
    if (parentId && !childId) {
      const parent = await this.usersService.findById(parentId);
      if (!parent) {
        return {
          reply: '找不到您的信息，请重新登录试试~',
          sessionId: '',
        };
      }

      if (!this.llmConfig.isConfigured) {
        return this.fallbackChat(message, parentId);
      }

      const session = await this.conversationManager.getOrCreateSession(parentId, sessionId);
      const parentName = parent.name || '家长';

      // Update session metadata
      await this.conversationManager.updateMetadata(session.uuid, { ageGroup: 'parent', childName: parentName });

      // Execute agent in parent mode
      const result = await this.agentExecutor.execute(
        session.uuid,
        message,
        'parent',
        parentName,
        { parentId },
      );

      // Generate parent suggestions
      const suggestions = this.generateParentSuggestions();

      return {
        reply: result.reply,
        sessionId: session.uuid,
        suggestions,
        toolCalls: result.toolCalls,
      };
    }

    // Child mode
    const user = await this.usersService.findById(childId!);
    if (!user) {
      return {
        reply: '找不到你的信息，请重新登录试试~',
        sessionId: '',
      };
    }

    const age = context?.age ?? user.age;
    const ageGroup = this.agentExecutor.classifyAge(age);
    const childName = user.name || '小朋友';

    // Check if LLM is available
    if (!this.llmConfig.isConfigured) {
      return this.fallbackChat(message, childId!);
    }

    try {
      // Get or create conversation session
      const session = await this.conversationManager.getOrCreateSession(childId!, sessionId);

      // Update session metadata
      await this.conversationManager.updateMetadata(session.uuid, { ageGroup, childName });

      // Execute agent
      const result = await this.agentExecutor.execute(
        session.uuid,
        message,
        ageGroup,
        childName,
        { childId: childId!, parentId },
      );

      void this.learningArchiveService.recordChatTurnSummary({
        childId: childId!,
        parentId,
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
      };
    } catch (error) {
      this.logger.error(`Agent chat failed: ${error.message}`);
      return this.fallbackChat(message, childId!);
    }
  }

  /** Streaming chat — yields tokens via AsyncGenerator */
  async *chatStream(params: ChatRequest): AsyncGenerator<{
    type: 'thinking' | 'token' | 'done' | 'error' | 'tool_start' | 'tool_result' | 'game_data';
    content?: string;
    thinkingContent?: string;
    toolName?: string;
    toolArgs?: Record<string, any>;
    toolResult?: string;
    sessionId?: string;
    wasFiltered?: boolean;
    suggestions?: string[];
    toolCalls?: any[];
    message?: string;
    activityType?: string;
    gameData?: string;
    domain?: string;
  }> {
    const { message, childId, parentId, sessionId, context } = params;

    // Parent mode: parentId present, no childId
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

      const session = await this.conversationManager.getOrCreateSession(parentId, sessionId);
      const parentName = parent.name || '家长';
      await this.conversationManager.updateMetadata(session.uuid, { ageGroup: 'parent', childName: parentName });

      const suggestions = this.generateParentSuggestions();

      for await (const event of this.agentExecutor.executeStream(
        session.uuid,
        message,
        'parent',
        parentName,
        { parentId },
      )) {
        if (event.type === 'done') {
          yield {
            ...event,
            sessionId: session.uuid,
            suggestions,
          };
        } else {
          yield event;
        }
      }
      return;
    }

    // Child mode
    const user = await this.usersService.findById(childId!);
    if (!user) {
      yield { type: 'error', message: '找不到你的信息' };
      return;
    }

    const age = context?.age ?? user.age;
    const ageGroup = this.agentExecutor.classifyAge(age);
    const childName = user.name || '小朋友';

    if (!this.llmConfig.isConfigured) {
      const fallback = this.getFallbackResponse(message);
      yield { type: 'token', content: fallback };
      yield { type: 'done', suggestions: [] };
      return;
    }

    try {
      const session = await this.conversationManager.getOrCreateSession(childId!, sessionId);
      await this.conversationManager.updateMetadata(session.uuid, { ageGroup, childName });

      const suggestions = this.generateSuggestions('', ageGroup);
      let finalReply = '';

      for await (const event of this.agentExecutor.executeStream(
        session.uuid,
        message,
        ageGroup,
        childName,
        { childId: childId!, parentId },
      )) {
        if (event.type === 'token' && event.content) {
          finalReply += event.content;
        }

        if (event.type === 'done') {
          if (finalReply.trim()) {
            void this.learningArchiveService.recordChatTurnSummary({
              childId: childId!,
              parentId,
              sessionId: session.uuid,
              userMessage: message,
              assistantReply: finalReply,
            });
          }

          yield {
            ...event,
            sessionId: session.uuid,
            suggestions,
          };
        } else {
          yield event;
        }
      }
    } catch (error) {
      this.logger.error(`Agent stream failed: ${error.message}`);
      yield { type: 'error', message: 'AI暂时无法回答，请稍后再试~' };
    }
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

    return this.conversationManager.listSessions({
      childId: params.childId,
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
    const conversation = await this.conversationManager.getConversationByUuid(params.sessionId);
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

    const result = await this.conversationManager.getSessionMessages({
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

  /** Generate a quiz on demand */
  async generateQuiz(params: QuizRequest): Promise<QuizResponse> {
    const { childId, topic, count = 3 } = params;

    const user = await this.usersService.findById(childId);
    if (!user) {
      throw new Error('用户不存在');
    }

    const age = user.age;
    const ageGroup: AgeGroup = age >= 3 && age <= 4 ? '3-4' : '5-6';
    const difficulty = ageGroup === '3-4' ? 1 : 2;

    const prompt = `请为${ageGroup}岁的孩子生成${count}道关于"${topic}"的选择题。

要求：
- 难度适中
- 每道题3个选项
- 内容适合${ageGroup}岁儿童
- 用简单有趣的语言

请严格按以下JSON格式返回，不要加任何其他文字：
[
  {
    "question": "题目",
    "options": ["选项A", "选项B", "选项C"],
    "correctIndex": 0,
    "explanation": "答案解析"
  }
]`;

    const response = await this.llmClient.generate(prompt);
    const jsonMatch = response.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      // Fallback quiz
      return {
        questions: [{
          question: `关于${topic}，下面哪个是对的？`,
          options: ['选项A', '选项B', '选项C'],
          correctIndex: 0,
          explanation: '这是正确答案的解释~',
        }],
        topic,
        ageGroup,
      };
    }

    const questions = JSON.parse(jsonMatch[0]);
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

  /** Generate follow-up suggestion chips */
  private generateSuggestions(reply: string, ageGroup: AgeGroup): string[] {
    if (ageGroup === '3-4') {
      return ['我想学颜色 🎨', '给我讲故事 📖', '我们玩游戏吧 🎮'];
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
    const ageGroup = ageRange ?? (age >= 3 && age <= 4 ? '3-4' : age >= 5 && age <= 6 ? '5-6' : '5-6') as AgeGroup;
    const storyTopic = theme ?? '友谊与分享';

    // Try LLM first
    if (this.llmConfig.isConfigured) {
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

  async evaluateLearning(contentId: number, answers: any[], age: number) {
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
    return { score, feedback: safe.content, stars: score >= 80 ? 3 : score >= 60 ? 2 : 1 };
  }

  async generateSuggestion(abilities: any, age: number) {
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
    return { title: `${topic}的故事`, content: safe.content, duration: age < 4 ? 3 : 5 };
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
      questions: [
        `故事里的小朋友们探索了什么？`,
        `如果是你，你会怎么去探索${topic}呢？`,
      ],
    };
  }
}
