import { Injectable, Optional } from '@nestjs/common';
import { LessonVideoQueueService } from '../../../modules/learning/lesson-video-queue.service';
import { UsersService } from '../../../modules/users/users.service';
import type { VideoRenderEngine } from '../../../database/entities/video-generation-task.entity';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolExecutionContext, ToolMetadata, ToolResult } from '../../core';

type EnqueueTeachingVideoInput = {
  lessonId?: number;
  childId?: number;
  parentId?: number;
  engine?: VideoRenderEngine;
  force?: boolean;
};

@Injectable()
@RegisterTool()
export class EnqueueTeachingVideoTool extends BaseTool<EnqueueTeachingVideoInput> {
  readonly metadata: ToolMetadata = {
    name: 'enqueueTeachingVideo',
    description:
      '创建课程教学视频异步任务并返回 taskId，默认引擎为 auto（优先 HyperFrames，失败自动回退 Remotion）',
    inputSchema: {
      type: 'object',
      properties: {
        lessonId: { type: 'number', description: '课程内容ID（contentId）' },
        childId: { type: 'number', description: '孩子ID' },
        engine: {
          type: 'string',
          enum: ['auto', 'hyperframes', 'remotion'],
          description: '渲染引擎，默认 auto',
        },
        force: {
          type: 'boolean',
          description: '是否忽略缓存并强制创建新任务，默认 false',
        },
      },
      required: ['lessonId'],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: true,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(
    private readonly lessonVideoQueue: LessonVideoQueueService,
    @Optional() private readonly usersService?: UsersService,
  ) {
    super();
  }

  async execute(
    args: EnqueueTeachingVideoInput,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const lessonId = Number(args.lessonId);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return this.fail('lessonId is required');
    }

    const childId = Number(args.childId ?? context.childId);
    if (!Number.isInteger(childId) || childId <= 0) {
      return this.fail('childId is required');
    }

    const parentId = Number(args.parentId ?? context.parentId);
    if (
      this.usersService &&
      Number.isInteger(parentId) &&
      parentId > 0 &&
      !(await this.usersService.canAccessChild(parentId, 'parent', childId))
    ) {
      return this.fail('no permission to access this child');
    }

    const engine = this.normalizeEngine(args.engine);
    if (!engine) {
      return this.fail('engine must be one of: auto, hyperframes, remotion');
    }

    try {
      const task = await this.lessonVideoQueue.enqueue(lessonId, childId, !!args.force, engine);
      return this.ok({
        taskId: task.id,
        status: task.status,
        progress: task.progress,
        provider: task.provider,
        renderEngine: task.renderEngine,
        errorMessage: task.errorMessage || null,
        ready: task.status === 'completed',
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      });
    } catch (error: any) {
      return this.fail(`创建教学视频任务失败: ${error?.message || 'unknown'}`);
    }
  }

  private normalizeEngine(value: unknown): VideoRenderEngine | null {
    const raw = String(value || 'auto')
      .trim()
      .toLowerCase();
    if (raw === 'auto') return 'auto';
    if (raw === 'hyperframes') return 'hyperframes';
    if (raw === 'remotion') return 'remotion';
    return null;
  }
}
