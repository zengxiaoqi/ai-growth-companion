import { Injectable, Logger } from '@nestjs/common';
import { AssignmentService } from '../../../assignment/assignment.service';
import { ConversationManager } from '../../conversation/conversation-manager';
import { GenerateActivityTool } from './generate-activity';

type PendingAssignmentDraft = {
  childId: number;
  parentId: number;
  activityType: string;
  topic: string;
  difficulty: number;
  ageGroup: string;
  domain?: string;
  dueDate?: string;
  activityData: Record<string, any>;
  createdAt: string;
  expiresAt: string;
};

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const DRAFTS_METADATA_KEY = 'pendingAssignmentDrafts';
const MAX_DRAFTS_PER_CONVERSATION = 10;

@Injectable()
export class AssignActivityTool {
  private readonly logger = new Logger(AssignActivityTool.name);

  constructor(
    private readonly generateActivityTool: GenerateActivityTool,
    private readonly assignmentService: AssignmentService,
    private readonly conversationManager: ConversationManager,
  ) {}

  async execute(args: {
    childId?: number;
    parentId?: number;
    activityType?: string;
    topic?: string;
    difficulty?: number;
    ageGroup?: string;
    domain?: string;
    dueDate?: string;
    confirmPublish?: boolean;
    cancelDraft?: boolean;
    conversationId?: string;
  }): Promise<string> {
    try {
      const conversationId = args.conversationId;
      if (!conversationId) {
        return JSON.stringify({ error: '缺少会话信息，无法执行作业发布流程' });
      }

      if (args.cancelDraft) {
        await this.saveDrafts(conversationId, []);
        return JSON.stringify({
          status: 'draft_cleared',
          message: '已取消全部作业草稿',
        });
      }

      if (args.confirmPublish) {
        const drafts = await this.loadValidDrafts(conversationId);
        if (!drafts.length) {
          return JSON.stringify({
            error: '未找到可发布的作业草稿，请先生成草稿',
          });
        }

        const results: Array<{
          status: string;
          assignmentId?: number;
          topic: string;
          activityType: string;
          message: string;
        }> = [];

        for (const draft of drafts) {
          const assignment = await this.assignmentService.create({
            parentId: draft.parentId,
            childId: draft.childId,
            activityType: draft.activityType,
            activityData: draft.activityData,
            domain: draft.domain,
            difficulty: draft.difficulty,
            dueDate: draft.dueDate,
          });
          results.push({
            status: 'published',
            assignmentId: assignment.id,
            topic: draft.topic,
            activityType: draft.activityType,
            message: '作业已发布',
          });
        }

        await this.saveDrafts(conversationId, []);
        return JSON.stringify({
          status: 'batch_published',
          count: results.length,
          assignments: results,
          message: `已发布${results.length}个作业`,
        });
      }

      // --- Draft creation mode ---
      if (!Number.isFinite(Number(args.childId))) {
        return JSON.stringify({
          status: 'needs_child_selection',
          message: '请先选择要布置作业的孩子',
        });
      }
      if (!Number.isFinite(Number(args.parentId))) {
        return JSON.stringify({ error: '缺少家长信息，无法生成作业草稿' });
      }
      if (!args.activityType || !args.topic || !Number.isFinite(Number(args.difficulty))) {
        return JSON.stringify({
          error: '生成作业草稿需要 activityType/topic/difficulty',
        });
      }
      const ageGroup = this.resolveAgeGroup(args.ageGroup, Number(args.difficulty));

      const activityJson = await this.generateActivityTool.execute({
        type: args.activityType as any,
        topic: args.topic,
        difficulty: Number(args.difficulty),
        ageGroup,
        domain: args.domain,
      });

      const draft: PendingAssignmentDraft = {
        parentId: Number(args.parentId),
        childId: Number(args.childId),
        activityType: args.activityType,
        topic: args.topic,
        difficulty: Number(args.difficulty),
        ageGroup,
        domain: args.domain,
        dueDate: args.dueDate,
        activityData: JSON.parse(activityJson),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + DRAFT_TTL_MS).toISOString(),
      };

      const existing = await this.loadValidDrafts(conversationId);
      const updated = [...existing, draft].slice(-MAX_DRAFTS_PER_CONVERSATION);
      await this.saveDrafts(conversationId, updated);

      return JSON.stringify({
        status: 'draft_ready',
        message: '作业草稿已生成，请确认后发布',
        totalDrafts: updated.length,
        draft: {
          childId: draft.childId,
          topic: draft.topic,
          activityType: draft.activityType,
          difficulty: draft.difficulty,
          ageGroup: draft.ageGroup,
          domain: draft.domain,
          dueDate: draft.dueDate,
          expiresAt: draft.expiresAt,
        },
      });
    } catch (error: any) {
      this.logger.error(`assignActivity failed: ${error.message}`);
      return JSON.stringify({ error: `布置任务失败: ${error.message}` });
    }
  }

  private async loadValidDrafts(conversationId: string): Promise<PendingAssignmentDraft[]> {
    const conversation = await this.conversationManager.getConversationByUuid(conversationId);
    const raw = conversation?.metadata?.[DRAFTS_METADATA_KEY];
    if (!Array.isArray(raw)) {
      const legacyDraft = conversation?.metadata?.pendingAssignmentDraft;
      if (legacyDraft) {
        return [legacyDraft as PendingAssignmentDraft].filter((d) => this.isDraftValid(d));
      }
      return [];
    }

    return (raw as PendingAssignmentDraft[]).filter((d) => this.isDraftValid(d));
  }

  private isDraftValid(draft: PendingAssignmentDraft): boolean {
    const expiresAt = new Date(draft.expiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  }

  private async saveDrafts(
    conversationId: string,
    drafts: PendingAssignmentDraft[],
  ): Promise<void> {
    await this.conversationManager.updateMetadata(conversationId, {
      [DRAFTS_METADATA_KEY]: drafts,
      pendingAssignmentDraft: drafts.length === 1 ? drafts[0] : null,
    });
  }

  private resolveAgeGroup(ageGroup: string | undefined, difficulty: number): string {
    if (ageGroup === '3-4' || ageGroup === '5-6') return ageGroup;
    return difficulty <= 1 ? '3-4' : '5-6';
  }
}
