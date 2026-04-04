import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, MoreThan, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { LearningPoint } from '../../database/entities/learning-point.entity';
import { WrongQuestion } from '../../database/entities/wrong-question.entity';
import { StudyPlanRecord } from '../../database/entities/study-plan-record.entity';

export interface WrongQuestionReviewItem {
  question: string;
  userAnswer?: string;
  correctAnswer?: string;
  isCorrect: boolean;
  explanation?: string;
}

@Injectable()
export class LearningArchiveService {
  private readonly logger = new Logger(LearningArchiveService.name);
  private readonly cooldownDays = 30;

  constructor(
    @InjectRepository(LearningPoint)
    private readonly pointRepo: Repository<LearningPoint>,
    @InjectRepository(WrongQuestion)
    private readonly wrongRepo: Repository<WrongQuestion>,
    @InjectRepository(StudyPlanRecord)
    private readonly planRepo: Repository<StudyPlanRecord>,
  ) {}

  normalizePointKey(raw: string): string {
    const normalized = (raw || '')
      .toLowerCase()
      .trim()
      .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return normalized || 'unknown-topic';
  }

  async upsertLearningPoint(params: {
    childId: number;
    sessionId?: string;
    domain?: string;
    pointLabel: string;
    source: 'chat_summary' | 'activity';
    evidence?: Record<string, any>;
  }): Promise<void> {
    const pointLabel = (params.pointLabel || '').trim().slice(0, 255);
    if (!pointLabel) return;

    const now = new Date();
    const cooldownUntil = new Date(now.getTime() + this.cooldownDays * 24 * 60 * 60 * 1000);
    const pointKey = this.normalizePointKey(pointLabel);

    const existing = await this.pointRepo.findOne({
      where: { childId: params.childId, pointKey },
    });

    if (existing) {
      existing.pointLabel = pointLabel;
      existing.domain = params.domain || existing.domain;
      existing.source = params.source;
      existing.lastLearnedAt = now;
      existing.cooldownUntil = cooldownUntil;
      existing.sessionId = params.sessionId || existing.sessionId;
      existing.evidence = params.evidence || existing.evidence;
      await this.pointRepo.save(existing);
      return;
    }

    const point = this.pointRepo.create({
      childId: params.childId,
      sessionId: params.sessionId || null,
      domain: params.domain || null,
      pointKey,
      pointLabel,
      source: params.source,
      lastLearnedAt: now,
      cooldownUntil,
      evidence: params.evidence || null,
    });
    await this.pointRepo.save(point);
  }

  private inferDomain(text: string): string | undefined {
    const t = text.toLowerCase();
    if (/(数学|加减|乘除|数字|几何|math)/.test(t)) return 'math';
    if (/(科学|实验|植物|动物|自然|science)/.test(t)) return 'science';
    if (/(艺术|绘画|颜色|音乐|art)/.test(t)) return 'art';
    if (/(社交|礼貌|沟通|朋友|social)/.test(t)) return 'social';
    if (/(拼音|汉字|阅读|故事|语言|language)/.test(t)) return 'language';
    return undefined;
  }

  private extractLearningPoints(text: string): string[] {
    const clean = (text || '')
      .replace(/[#>*`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return [];

    const candidates = clean
      .split(/[。！？\n;；]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 6 && s.length <= 48)
      .filter((s) => !/(你好|当然|可以|如果你愿意|继续|总结|我们来)/.test(s));

    const unique = Array.from(new Set(candidates));
    return unique.slice(0, 4);
  }

  private isAiPlanLikeReply(userMessage: string, assistantReply: string): boolean {
    const joined = `${userMessage} ${assistantReply}`.toLowerCase();
    const hasIntent = /(计划|安排|任务|日程|复习|学习清单|步骤)/.test(joined);
    const hasStructure = /(1\.|2\.|第一|第二|第三|今日|明日|本周)/.test(assistantReply);
    return hasIntent && hasStructure;
  }

  private buildPlanTitle(userMessage: string): string {
    const msg = (userMessage || '').trim();
    if (!msg) return 'AI 学习计划';
    return msg.length > 36 ? `${msg.slice(0, 36)}...` : msg;
  }

  async recordChatTurnSummary(params: {
    childId: number;
    parentId?: number;
    sessionId?: string;
    userMessage: string;
    assistantReply: string;
  }): Promise<void> {
    try {
      const points = this.extractLearningPoints(params.assistantReply);
      const domain = this.inferDomain(`${params.userMessage} ${params.assistantReply}`);

      for (const point of points) {
        await this.upsertLearningPoint({
          childId: params.childId,
          sessionId: params.sessionId,
          domain,
          pointLabel: point,
          source: 'chat_summary',
          evidence: {
            userMessage: params.userMessage.slice(0, 240),
            assistantReply: params.assistantReply.slice(0, 240),
          },
        });
      }

      if (this.isAiPlanLikeReply(params.userMessage, params.assistantReply)) {
        await this.createStudyPlanRecord({
          childId: params.childId,
          parentId: params.parentId,
          sourceType: 'ai_generated',
          title: this.buildPlanTitle(params.userMessage),
          sessionId: params.sessionId,
          planContent: {
            userMessage: params.userMessage,
            assistantReply: params.assistantReply,
          },
          status: 'active',
        });
      }
    } catch (error) {
      this.logger.warn(`recordChatTurnSummary failed: ${error.message}`);
    }
  }

  async recordActivityLearning(params: {
    childId: number;
    sessionId?: string;
    domain?: string;
    topic?: string;
    activityType?: string;
    interactionData?: Record<string, any>;
  }): Promise<void> {
    if (!params.topic) return;

    await this.upsertLearningPoint({
      childId: params.childId,
      sessionId: params.sessionId,
      domain: params.domain,
      pointLabel: params.topic,
      source: 'activity',
      evidence: {
        activityType: params.activityType,
        interactionData: params.interactionData,
      },
    });
  }

  async recordWrongQuestions(params: {
    childId: number;
    sessionId?: string;
    domain?: string;
    activityType?: string;
    reviewItems: WrongQuestionReviewItem[];
  }): Promise<void> {
    const items = (params.reviewItems || []).filter((item) => !item.isCorrect && item.question);
    if (items.length === 0) return;

    for (const item of items) {
      const questionText = item.question.trim().slice(0, 2000);
      const hash = createHash('sha256')
        .update(`${params.childId}|${questionText}`)
        .digest('hex');

      const existing = await this.wrongRepo.findOne({
        where: { childId: params.childId, questionHash: hash },
      });

      if (existing) {
        existing.sessionId = params.sessionId || existing.sessionId;
        existing.domain = params.domain || existing.domain;
        existing.activityType = params.activityType || existing.activityType;
        existing.userAnswer = item.userAnswer || existing.userAnswer;
        existing.correctAnswer = item.correctAnswer || existing.correctAnswer;
        existing.explanation = item.explanation || existing.explanation;
        existing.status = 'new';
        existing.occurredAt = new Date();
        await this.wrongRepo.save(existing);
        continue;
      }

      const row = this.wrongRepo.create({
        childId: params.childId,
        sessionId: params.sessionId || null,
        domain: params.domain || null,
        activityType: params.activityType || null,
        questionHash: hash,
        questionText,
        userAnswer: item.userAnswer || null,
        correctAnswer: item.correctAnswer || null,
        explanation: item.explanation || null,
        status: 'new',
        occurredAt: new Date(),
        metadata: null,
      });
      await this.wrongRepo.save(row);
    }
  }

  async createStudyPlanRecord(params: {
    childId: number;
    parentId?: number;
    sourceType: 'ai_generated' | 'parent_assignment';
    sourceId?: number;
    title: string;
    planContent?: Record<string, any>;
    status?: string;
    sessionId?: string;
  }): Promise<StudyPlanRecord> {
    const title = (params.title || '学习计划').trim().slice(0, 180);
    const row = this.planRepo.create({
      childId: params.childId,
      parentId: params.parentId ?? null,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      title,
      planContent: params.planContent ?? null,
      status: params.status || 'active',
      sessionId: params.sessionId || null,
    });
    return this.planRepo.save(row);
  }

  async getLearningPoints(params: {
    childId: number;
    domain?: string;
    status?: 'cooldown' | 'available';
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 20));
    const where: Record<string, any> = { childId: params.childId };
    if (params.domain) where.domain = params.domain;

    const now = new Date();
    if (params.status === 'cooldown') where.cooldownUntil = MoreThan(now);
    if (params.status === 'available') where.cooldownUntil = Between(new Date(0), now);

    if (params.from || params.to) {
      where.lastLearnedAt = Between(
        params.from ? new Date(params.from) : new Date(0),
        params.to ? new Date(params.to) : new Date(),
      );
    }

    const [list, total] = await this.pointRepo.findAndCount({
      where,
      order: { lastLearnedAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return { list, total, page, limit };
  }

  async getWrongQuestions(params: {
    childId: number;
    domain?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 20));
    const where: Record<string, any> = { childId: params.childId };
    if (params.domain) where.domain = params.domain;
    if (params.status) where.status = params.status;

    const [list, total] = await this.wrongRepo.findAndCount({
      where,
      order: { occurredAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return { list, total, page, limit };
  }

  async getStudyPlans(params: {
    childId: number;
    sourceType?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 20));
    const where: Record<string, any> = { childId: params.childId };
    if (params.sourceType) where.sourceType = params.sourceType;

    const [list, total] = await this.planRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return { list, total, page, limit };
  }

  async getActiveCooldownPointKeys(childId: number): Promise<Set<string>> {
    const rows = await this.pointRepo.find({
      where: {
        childId,
        cooldownUntil: MoreThan(new Date()),
      },
      select: ['pointKey'],
    });
    return new Set(rows.map((row) => row.pointKey));
  }
}

