import { Injectable } from "@nestjs/common";
import { ToolRegistryService as FrameworkToolRegistry } from "../../../../agent-framework/tools/tool-registry.service";
import type { VideoRenderEngine } from "../../../../database/entities/video-generation-task.entity";

type EnqueueTeachingVideoArgs = {
  lessonId?: number;
  childId?: number;
  parentId?: number;
  ageGroup?: "3-4" | "5-6" | "parent";
  conversationId?: string;
  engine?: VideoRenderEngine;
  force?: boolean;
};

@Injectable()
export class EnqueueTeachingVideoTool {
  constructor(private readonly frameworkTools: FrameworkToolRegistry) {}

  async execute(args: EnqueueTeachingVideoArgs): Promise<string> {
    const childId = Number(args.childId);
    const parentId =
      args.parentId != null && Number.isFinite(Number(args.parentId))
        ? Number(args.parentId)
        : undefined;
    const ageGroup =
      args.ageGroup === "3-4" || args.ageGroup === "5-6"
        ? args.ageGroup
        : "parent";

    return this.frameworkTools.executeToString("enqueueTeachingVideo", args, {
      childId: Number.isInteger(childId) && childId > 0 ? childId : undefined,
      parentId,
      ageGroup,
      conversationId: String(args.conversationId || "legacy-agent"),
      extra: {},
    });
  }
}
