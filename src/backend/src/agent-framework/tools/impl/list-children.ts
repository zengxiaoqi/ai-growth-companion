/**
 * ListChildrenTool — lists all children under a parent.
 * Migrated from modules/ai/agent/tools/list-children.ts
 */

import { Injectable } from '@nestjs/common';
import { UsersService } from '../../../modules/users/users.service';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';

type ListChildrenInput = { parentId: number };

@Injectable()
@RegisterTool()
export class ListChildrenTool extends BaseTool<ListChildrenInput> {
  readonly metadata: ToolMetadata = {
    name: 'listChildren',
    description: '获取家长下所有孩子的列表信息',
    inputSchema: {
      type: 'object',
      properties: {
        parentId: { type: 'number', description: '家长ID' },
      },
      required: ['parentId'],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: false,
    requiresParentId: true,
    requiresAgeGroup: false,
  };

  constructor(private readonly usersService: UsersService) {
    super();
  }

  async execute(args: ListChildrenInput, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const children = await this.usersService.findByParentId(args.parentId);
      return this.ok(
        children.map(c => ({
          id: c.id,
          name: c.name,
          age: c.age,
          gender: c.gender,
          avatar: c.avatar,
        })),
      );
    } catch (error: any) {
      return this.fail(`获取孩子列表失败: ${error.message}`);
    }
  }
}
