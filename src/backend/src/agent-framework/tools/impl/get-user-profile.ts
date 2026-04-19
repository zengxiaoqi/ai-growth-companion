/**
 * GetUserProfileTool — retrieves a child's profile information.
 * Migrated from modules/ai/agent/tools/get-user-profile.ts
 */

import { Injectable } from "@nestjs/common";
import { UsersService } from "../../../modules/users/users.service";
import { BaseTool } from "../base-tool";
import { RegisterTool } from "../decorators/register-tool";
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from "../../core";

type GetUserProfileInput = { childId: number };

@Injectable()
@RegisterTool()
export class GetUserProfileTool extends BaseTool<GetUserProfileInput> {
  readonly metadata: ToolMetadata = {
    name: "getUserProfile",
    description: "获取孩子的基本信息，包括姓名、年龄、性别、头像等",
    inputSchema: {
      type: "object",
      properties: {
        childId: { type: "number", description: "孩子ID" },
      },
      required: ["childId"],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: true,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly usersService: UsersService) {
    super();
  }

  async execute(
    args: GetUserProfileInput,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const user = await this.usersService.findById(args.childId);
      if (!user) {
        return this.fail(`未找到ID为 ${args.childId} 的用户`);
      }
      return this.ok({
        id: user.id,
        name: user.name,
        age: user.age,
        gender: user.gender,
        avatar: user.avatar,
      });
    } catch (error: any) {
      return this.fail(`获取用户信息失败: ${error.message}`);
    }
  }
}
