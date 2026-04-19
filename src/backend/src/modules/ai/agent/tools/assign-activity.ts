import { Injectable, Logger } from "@nestjs/common";
import { AssignmentService } from "../../../assignment/assignment.service";
import { ConversationManager } from "../../conversation/conversation-manager";
import { GenerateActivityTool } from "./generate-activity";

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
        return JSON.stringify({ error: "缺少会话信息，无法执行作业发布流程" });
      }

      if (args.cancelDraft) {
        await this.saveDraft(conversationId, null);
        return JSON.stringify({
          status: "draft_cleared",
          message: "已取消当前作业草稿",
        });
      }

      if (args.confirmPublish) {
        const draft = await this.loadValidDraft(conversationId);
        if (!draft) {
          return JSON.stringify({
            error: "未找到可发布的作业草稿，请先生成草稿",
          });
        }

        const assignment = await this.assignmentService.create({
          parentId: draft.parentId,
          childId: draft.childId,
          activityType: draft.activityType,
          activityData: draft.activityData,
          domain: draft.domain,
          difficulty: draft.difficulty,
          dueDate: args.dueDate ?? draft.dueDate,
        });

        await this.saveDraft(conversationId, null);
        return JSON.stringify({
          status: "published",
          assignmentId: assignment.id,
          topic: draft.topic,
          activityType: draft.activityType,
          message: "作业已发布",
        });
      }

      if (!Number.isFinite(Number(args.childId))) {
        return JSON.stringify({
          status: "needs_child_selection",
          message: "请先选择要布置作业的孩子",
        });
      }
      if (!Number.isFinite(Number(args.parentId))) {
        return JSON.stringify({ error: "缺少家长信息，无法生成作业草稿" });
      }
      if (
        !args.activityType ||
        !args.topic ||
        !Number.isFinite(Number(args.difficulty))
      ) {
        return JSON.stringify({
          error: "生成作业草稿需要 activityType/topic/difficulty",
        });
      }
      const ageGroup = this.resolveAgeGroup(
        args.ageGroup,
        Number(args.difficulty),
      );

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

      await this.saveDraft(conversationId, draft);

      return JSON.stringify({
        status: "draft_ready",
        message: "作业草稿已生成，请确认后发布",
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

  private async loadValidDraft(
    conversationId: string,
  ): Promise<PendingAssignmentDraft | null> {
    const conversation =
      await this.conversationManager.getConversationByUuid(conversationId);
    const draft = (conversation?.metadata?.pendingAssignmentDraft ||
      null) as PendingAssignmentDraft | null;
    if (!draft) return null;

    const expiresAt = new Date(draft.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await this.saveDraft(conversationId, null);
      return null;
    }

    return draft;
  }

  private async saveDraft(
    conversationId: string,
    draft: PendingAssignmentDraft | null,
  ): Promise<void> {
    await this.conversationManager.updateMetadata(conversationId, {
      pendingAssignmentDraft: draft,
    });
  }

  private resolveAgeGroup(
    ageGroup: string | undefined,
    difficulty: number,
  ): string {
    if (ageGroup === "3-4" || ageGroup === "5-6") return ageGroup;
    return difficulty <= 1 ? "3-4" : "5-6";
  }
}
