/**
 * AssignActivityTool: parent-side assignment drafting + publish flow.
 */

import { Injectable, Logger } from "@nestjs/common";
import { AssignmentService } from "../../../modules/assignment/assignment.service";
import { ConversationManager } from "../../../modules/ai/conversation/conversation-manager";
import { BaseTool } from "../base-tool";
import { RegisterTool } from "../decorators/register-tool";
import type {
  ToolExecutionContext,
  ToolMetadata,
  ToolResult,
} from "../../core";
import { GenerateActivityTool } from "./generate-activity";

type AssignActivityInput = {
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
};

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

const ACTIVITY_TYPE_NAMES: Record<string, string> = {
  quiz: "选择题",
  true_false: "判断题",
  fill_blank: "填空题",
  matching: "配对游戏",
  connection: "连线游戏",
  sequencing: "排序游戏",
  puzzle: "拼图游戏",
};

@Injectable()
@RegisterTool()
export class AssignActivityTool extends BaseTool<AssignActivityInput> {
  private readonly logger = new Logger(AssignActivityTool.name);

  readonly metadata: ToolMetadata = {
    name: "assignActivity",
    description:
      "家长作业两步流：先生成草稿(confirmPublish=false)，家长确认后发布(confirmPublish=true)，也支持取消草稿(cancelDraft=true)",
    inputSchema: {
      type: "object",
      properties: {
        parentId: {
          type: "number",
          description: "家长ID（通常由运行时自动注入）",
        },
        childId: { type: "number", description: "孩子ID" },
        activityType: {
          type: "string",
          enum: [
            "quiz",
            "true_false",
            "fill_blank",
            "matching",
            "connection",
            "sequencing",
            "puzzle",
          ],
          description: "活动类型",
        },
        topic: { type: "string", description: "主题" },
        difficulty: { type: "number", description: "难度(1-3)" },
        ageGroup: { type: "string", description: "年龄段(3-4 或 5-6)" },
        domain: { type: "string", description: "学习领域（可选）" },
        dueDate: { type: "string", description: "截止日期（可选）" },
        confirmPublish: {
          type: "boolean",
          description: "false=生成草稿，true=确认发布",
        },
        cancelDraft: { type: "boolean", description: "是否取消当前草稿" },
      },
      required: [],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: false,
    requiresParentId: true,
    requiresAgeGroup: false,
  };

  constructor(
    private readonly generateActivityTool: GenerateActivityTool,
    private readonly assignmentService: AssignmentService,
    private readonly conversationManager: ConversationManager,
  ) {
    super();
  }

  async execute(
    args: AssignActivityInput,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const parentId = Number(args.parentId ?? context.parentId);
    const conversationId = context.conversationId;

    if (!Number.isFinite(parentId)) {
      return this.fail("缺少家长身份信息，无法执行作业发布流程");
    }

    if (args.cancelDraft) {
      await this.saveDraft(conversationId, null);
      return this.ok({
        status: "draft_cleared",
        message: "已取消当前作业草稿。需要时我可以重新生成。",
      });
    }

    if (args.confirmPublish) {
      return this.publishDraft(args, context, parentId);
    }

    return this.createDraft(args, context, parentId);
  }

  private async createDraft(
    args: AssignActivityInput,
    context: ToolExecutionContext,
    parentId: number,
  ): Promise<ToolResult> {
    if (!Number.isFinite(Number(args.childId))) {
      return this.ok({
        status: "needs_child_selection",
        message: "请先选择要布置作业的孩子，然后我再生成作业草稿。",
      });
    }

    if (
      !args.activityType ||
      !args.topic ||
      !Number.isFinite(Number(args.difficulty))
    ) {
      return this.fail(
        "生成作业草稿需要 childId、activityType、topic、difficulty",
      );
    }
    const ageGroup = this.resolveAgeGroup(
      args.ageGroup,
      Number(args.difficulty),
    );

    const activityResult = await this.generateActivityTool.execute(
      {
        type: args.activityType as any,
        topic: args.topic,
        difficulty: Number(args.difficulty),
        ageGroup,
        domain: args.domain,
      },
      context,
    );

    if (!activityResult.success || !activityResult.data) {
      return this.fail(activityResult.error || "生成作业内容失败");
    }

    const draft = this.buildDraft({
      parentId,
      childId: Number(args.childId),
      activityType: args.activityType,
      topic: args.topic,
      difficulty: Number(args.difficulty),
      ageGroup,
      domain: args.domain,
      dueDate: args.dueDate,
      activityData: activityResult.data as Record<string, any>,
    });

    await this.saveDraft(context.conversationId, draft);

    return this.ok({
      status: "draft_ready",
      message: "作业草稿已生成。若确认发布，请回复“确认发布”。",
      draft: {
        childId: draft.childId,
        activityType: draft.activityType,
        activityTypeLabel:
          ACTIVITY_TYPE_NAMES[draft.activityType] || draft.activityType,
        topic: draft.topic,
        difficulty: draft.difficulty,
        ageGroup: draft.ageGroup,
        domain: draft.domain,
        dueDate: draft.dueDate,
        expiresAt: draft.expiresAt,
      },
    });
  }

  private async publishDraft(
    args: AssignActivityInput,
    context: ToolExecutionContext,
    parentId: number,
  ): Promise<ToolResult> {
    const storedDraft = await this.loadValidDraft(context.conversationId);
    const payload = this.resolvePublishPayload(args, parentId, storedDraft);

    if (!payload) {
      return this.fail("未找到可发布的作业草稿，请先让我生成草稿。");
    }

    const assignment = await this.assignmentService.create({
      parentId: payload.parentId,
      childId: payload.childId,
      activityType: payload.activityType,
      activityData: payload.activityData,
      domain: payload.domain,
      difficulty: payload.difficulty,
      dueDate: payload.dueDate,
    });

    await this.saveDraft(context.conversationId, null);

    return this.ok({
      status: "published",
      assignmentId: assignment.id,
      message: `作业已发布：${payload.topic}（${ACTIVITY_TYPE_NAMES[payload.activityType] || payload.activityType}）`,
      childId: payload.childId,
      activityType: payload.activityType,
      topic: payload.topic,
    });
  }

  private buildDraft(
    input: Omit<PendingAssignmentDraft, "createdAt" | "expiresAt">,
  ): PendingAssignmentDraft {
    const now = Date.now();
    return {
      ...input,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + DRAFT_TTL_MS).toISOString(),
    };
  }

  private resolvePublishPayload(
    args: AssignActivityInput,
    parentId: number,
    draft: PendingAssignmentDraft | null,
  ): PendingAssignmentDraft | null {
    if (draft) {
      return {
        ...draft,
        parentId,
        dueDate: args.dueDate ?? draft.dueDate,
      };
    }

    if (
      !args.childId ||
      !args.activityType ||
      !args.topic ||
      !Number.isFinite(Number(args.difficulty))
    ) {
      return null;
    }
    const ageGroup = this.resolveAgeGroup(
      args.ageGroup,
      Number(args.difficulty),
    );

    const activityData =
      args &&
      typeof args === "object" &&
      "activityData" in (args as Record<string, any>)
        ? ((args as Record<string, any>).activityData as Record<string, any>)
        : undefined;

    if (!activityData || typeof activityData !== "object") {
      return null;
    }

    return this.buildDraft({
      parentId,
      childId: Number(args.childId),
      activityType: args.activityType,
      topic: args.topic,
      difficulty: Number(args.difficulty),
      ageGroup,
      domain: args.domain,
      dueDate: args.dueDate,
      activityData,
    });
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
    try {
      await this.conversationManager.updateMetadata(conversationId, {
        pendingAssignmentDraft: draft,
      });
    } catch (error: any) {
      this.logger.warn(
        `Failed to update assignment draft metadata: ${error.message}`,
      );
    }
  }

  private resolveAgeGroup(
    ageGroup: string | undefined,
    difficulty: number,
  ): string {
    if (ageGroup === "3-4" || ageGroup === "5-6") return ageGroup;
    return difficulty <= 1 ? "3-4" : "5-6";
  }
}
