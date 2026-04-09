import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Response } from 'express';
import { Repository } from 'typeorm';
import { Content } from '../../database/entities/content.entity';
import { VideoGenerationTask } from '../../database/entities/video-generation-task.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { LearningArchiveService, WrongQuestionReviewItem } from './learning-archive.service';
import { LessonContentService } from './lesson-content.service';
import { LessonVideoQueueService } from './lesson-video-queue.service';
import { LearningService } from './learning.service';
import { LearningTrackerService } from './learning-tracker.service';

@ApiTags('学习记录')
@Controller('learning')
export class LearningController {
  constructor(
    private readonly learningService: LearningService,
    private readonly learningTracker: LearningTrackerService,
    private readonly learningArchive: LearningArchiveService,
    private readonly lessonContentService: LessonContentService,
    private readonly lessonVideoQueue: LessonVideoQueueService,
    private readonly usersService: UsersService,
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    @InjectRepository(VideoGenerationTask)
    private readonly videoTaskRepo: Repository<VideoGenerationTask>,
  ) {}

  private async assertAccessToChild(req: any, childId: number): Promise<void> {
    const viewerId = req.user?.sub;
    const viewerType = req.user?.type;

    if (viewerType === 'child') {
      if (viewerId !== childId) {
        throw new ForbiddenException('无权查看其他学生的数据');
      }
      return;
    }

    if (viewerType === 'parent') {
      const child = await this.usersService.findById(childId);
      if (!child || child.parentId !== viewerId) {
        throw new ForbiddenException('仅可查看已关联孩子的数据');
      }
      return;
    }

    throw new ForbiddenException('无访问权限');
  }

  private resolveChildId(req: any, childId?: string): number {
    const viewerType = req.user?.type;
    const numeric =
      viewerType === 'child'
        ? Number(req.user?.sub)
        : Number(childId);

    if (!Number.isInteger(numeric) || numeric <= 0) {
      throw new BadRequestException('childId is required');
    }
    return numeric;
  }

  @Post('start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '开始学习' })
  async start(@Request() req: any, @Body() body: { childId: number; contentId: number }) {
    await this.assertAccessToChild(req, body.childId);
    return this.learningService.create(body.childId, body.contentId);
  }

  @Post('complete/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '完成学习' })
  async complete(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    const record = await this.learningService.findById(+id);
    if (!record) return null;

    await this.assertAccessToChild(req, record.userId);
    const nowMs = Date.now();
    const startedAtMs = record.startedAt ? new Date(record.startedAt).getTime() : nowMs;
    const fallbackDurationSeconds = Math.max(1, Math.floor((nowMs - startedAtMs) / 1000));
    const requestedDuration = typeof body.durationSeconds === 'number' ? body.durationSeconds : null;
    const durationSeconds = requestedDuration && Number.isFinite(requestedDuration)
      ? Math.max(1, Math.floor(requestedDuration))
      : fallbackDurationSeconds;

    const updatePayload: any = {
      status: 'completed',
      completedAt: new Date(),
      durationSeconds,
    };

    if (typeof body.score === 'number') {
      updatePayload.score = body.score;
    }
    if (Array.isArray(body.answers)) {
      updatePayload.answers = body.answers;
    }
    if (body.interactionData && typeof body.interactionData === 'object') {
      updatePayload.interactionData = body.interactionData;
    }

    const updatedRecord = await this.learningService.update(+id, updatePayload);

    if (updatedRecord) {
      try {
        const content = await this.contentRepo.findOne({ where: { id: updatedRecord.contentId } });
        await this.learningTracker.recordActivity({
          type: 'content_completion',
          childId: updatedRecord.userId,
          contentId: updatedRecord.contentId,
          domain: content?.domain || 'language',
          score: typeof updatedRecord.score === 'number' ? updatedRecord.score : 0,
          durationSeconds: updatedRecord.durationSeconds,
        });
      } catch {
        // Keep completion success if tracker fails.
      }
    }

    return updatedRecord;
  }

  @Post('record-activity')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '记录互动学习活动（AI对话等）' })
  async recordActivity(
    @Request() req: any,
    @Body()
    body: {
      childId: number;
      domain: string;
      score: number;
      durationSeconds?: number;
      sessionId?: string;
      activityType?: string;
      interactionData?: Record<string, any>;
      reviewItems?: WrongQuestionReviewItem[];
      topic?: string;
    },
  ) {
    await this.assertAccessToChild(req, body.childId);

    const reviewItems =
      body.reviewItems ||
      ((body.interactionData?.reviewData || body.interactionData?.reviewItems) as
        | WrongQuestionReviewItem[]
        | undefined);

    const result = await this.learningTracker.recordActivity({
      type: 'interactive_activity',
      childId: body.childId,
      domain: body.domain || 'language',
      score: body.score,
      durationSeconds: body.durationSeconds,
      sessionId: body.sessionId,
      activityType: body.activityType,
      interactionData: body.interactionData,
      reviewItems,
      topic: body.topic,
    });

    return {
      success: true,
      recordId: result.learningRecord.id,
      abilityUpdated: result.abilityUpdated,
      achievementsAwarded: result.achievementsAwarded,
    };
  }

  @Get('history/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '学习历史' })
  async history(@Request() req: any, @Param('userId') userId: string, @Query('limit') limit?: string) {
    await this.assertAccessToChild(req, +userId);
    return this.learningService.findByUser(+userId, +limit || 10);
  }

  @Get('today/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '今日学习统计' })
  async today(@Request() req: any, @Param('userId') userId: string) {
    await this.assertAccessToChild(req, +userId);
    return this.learningService.getTodayStats(+userId);
  }

  @Get('today-detail/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '今日学习统计（含来源分类）' })
  async todayDetail(@Request() req: any, @Param('userId') userId: string) {
    await this.assertAccessToChild(req, +userId);
    return this.learningService.getTodayStatsWithSources(+userId);
  }

  @Get('points/:childId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '学习点历史' })
  async getLearningPoints(
    @Request() req: any,
    @Param('childId') childId: string,
    @Query('domain') domain?: string,
    @Query('status') status?: 'cooldown' | 'available',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const numericChildId = +childId;
    await this.assertAccessToChild(req, numericChildId);
    return this.learningArchive.getLearningPoints({
      childId: numericChildId,
      domain,
      status,
      from,
      to,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }

  @Get('wrong-questions/:childId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '错题本' })
  async getWrongQuestions(
    @Request() req: any,
    @Param('childId') childId: string,
    @Query('domain') domain?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const numericChildId = +childId;
    await this.assertAccessToChild(req, numericChildId);
    return this.learningArchive.getWrongQuestions({
      childId: numericChildId,
      domain,
      status,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }

  // ─── Structured Lesson Endpoints ───────────────────────────────────

  @Get('lessons/drafts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前孩子的课程草稿列表' })
  async getDraftLessons(
    @Request() req: any,
    @Query('childId') childId: string,
  ) {
    if (req.user?.type !== 'parent') {
      throw new ForbiddenException('仅家长可查看课程草稿');
    }
    const numericChildId = Number(childId);
    if (!Number.isInteger(numericChildId) || numericChildId <= 0) {
      throw new BadRequestException('childId is required');
    }
    await this.assertAccessToChild(req, numericChildId);
    return this.lessonContentService.listDraftLessonsForChild(numericChildId);
  }

  @Post('lessons/generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '一键生成结构化课程（六步学习）' })
  async generateLesson(
    @Request() req: any,
    @Body()
    body: {
      topic: string;
      childId: number;
      ageGroup?: '3-4' | '5-6';
      domain?: 'language' | 'math' | 'science' | 'art' | 'social';
      focus?: 'literacy' | 'math' | 'science' | 'mixed';
      difficulty?: number;
      durationMinutes?: number;
      parentPrompt?: string;
    },
  ) {
    const parentId = req.user?.sub;
    const viewerType = req.user?.type;
    if (viewerType !== 'parent') {
      throw new ForbiddenException('仅家长可生成课程');
    }
    await this.assertAccessToChild(req, body.childId);

    return this.lessonContentService.generateDraft({
      ...body,
      parentId,
    });
  }

  @Patch('lessons/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '修改课程草稿（AI对话式修改）' })
  async modifyLesson(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { modification: string; stepId?: string },
  ) {
    const parentId = req.user?.sub;
    if (req.user?.type !== 'parent') {
      throw new ForbiddenException('仅家长可修改课程');
    }
    if (!body?.modification?.trim()) {
      throw new BadRequestException('modification is required');
    }
    return this.lessonContentService.modifyDraft(+id, parentId, body.modification, {
      stepId: body.stepId,
    });
  }

  @Post('lessons/:id/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '确认并发布课程' })
  async confirmLesson(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { childId: number },
  ) {
    const parentId = req.user?.sub;
    if (req.user?.type !== 'parent') {
      throw new ForbiddenException('仅家长可确认课程');
    }
    await this.assertAccessToChild(req, body.childId);
    return this.lessonContentService.confirmAndPublish(+id, parentId, body.childId);
  }

  @Get('lessons/:id/progress')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询课程步骤进度' })
  async getLessonProgress(
    @Request() req: any,
    @Param('id') id: string,
    @Query('childId') childId: string,
  ) {
    const numericChildId = +childId;
    await this.assertAccessToChild(req, numericChildId);
    return this.lessonContentService.getLessonProgress(+id, numericChildId);
  }

  @Post('lessons/:id/teaching-video/tasks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建教学视频生成任务（异步）' })
  async enqueueLessonTeachingVideoTask(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { childId?: number },
  ) {
    const resolvedChildId = this.resolveChildId(req, body?.childId != null ? String(body.childId) : undefined);
    await this.assertAccessToChild(req, resolvedChildId);

    const task = await this.lessonVideoQueue.enqueue(+id, resolvedChildId);
    return {
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      provider: task.provider,
      errorMessage: task.errorMessage || null,
      ready: task.status === 'completed',
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  @Get('lessons/:id/teaching-video/tasks/:taskId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询教学视频任务状态' })
  async getLessonTeachingVideoTask(
    @Request() req: any,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Query('childId') childId?: string,
  ) {
    const resolvedChildId = this.resolveChildId(req, childId);
    await this.assertAccessToChild(req, resolvedChildId);

    const numericTaskId = Number(taskId);
    if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) {
      throw new BadRequestException('taskId is invalid');
    }

    const task = await this.lessonVideoQueue.getTask(+id, numericTaskId, resolvedChildId);
    return {
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      provider: task.provider,
      errorMessage: task.errorMessage || null,
      ready: task.status === 'completed',
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  @Get('lessons/:id/teaching-video')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '下载已生成的课程教学视频（MP4）' })
  async getLessonTeachingVideo(
    @Request() req: any,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('childId') childId?: string,
    @Query('taskId') taskId?: string,
  ) {
    const resolvedChildId = this.resolveChildId(req, childId);
    await this.assertAccessToChild(req, resolvedChildId);

    const numericTaskId = Number(taskId);
    const task = Number.isInteger(numericTaskId) && numericTaskId > 0
      ? await this.lessonVideoQueue.getTask(+id, numericTaskId, resolvedChildId)
      : await this.lessonVideoQueue.getLatestTask(+id, resolvedChildId);

    if (!task) {
      throw new NotFoundException('视频任务不存在，请先创建任务');
    }
    if (task.status !== 'completed') {
      throw new BadRequestException('视频尚未生成完成');
    }

    // Student must have approved video; parent can always view
    if (req.user?.type === 'child' && task.approvalStatus !== 'approved') {
      throw new ForbiddenException('视频尚未通过审批');
    }

    const content = await this.contentRepo.findOne({ where: { id: +id } });
    const safeTitle = String(content?.title || `lesson-${id}`)
      .replace(/[\\/:*?"<>|]+/g, '-')
      .trim();
    const body = await this.lessonVideoQueue.readVideoBuffer(task);
    const filename = `${safeTitle || `lesson-${id}`}-teaching-video.mp4`;

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(filename));
    res.send(body);
  }

  @Get('lessons/:id/video-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询视频任务状态及审批状态' })
  async getVideoStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Query('childId') childId?: string,
    @Query('taskId') taskId?: string,
  ) {
    const resolvedChildId = this.resolveChildId(req, childId);
    await this.assertAccessToChild(req, resolvedChildId);

    const numericTaskId = Number(taskId);
    const task = Number.isInteger(numericTaskId) && numericTaskId > 0
      ? await this.lessonVideoQueue.getTask(+id, numericTaskId, resolvedChildId)
      : await this.lessonVideoQueue.getLatestTask(+id, resolvedChildId);

    if (!task) {
      return { exists: false };
    }

    return {
      exists: true,
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      approvalStatus: task.approvalStatus,
      rejectionReason: task.rejectionReason || null,
      errorMessage: task.errorMessage || null,
      ready: task.status === 'completed',
    };
  }

  @Post('lessons/:id/video-approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '审批教学视频（家长）' })
  async approveVideo(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { childId: number; approved: boolean; feedback?: string; taskId?: number },
  ) {
    if (req.user?.type !== 'parent') {
      throw new ForbiddenException('仅家长可审批视频');
    }
    await this.assertAccessToChild(req, body.childId);

    const task = body.taskId
      ? await this.lessonVideoQueue.getTask(+id, body.taskId, body.childId)
      : await this.lessonVideoQueue.getLatestTask(+id, body.childId);

    if (!task) {
      throw new NotFoundException('视频任务不存在');
    }
    if (task.status !== 'completed') {
      throw new BadRequestException('视频尚未生成完成');
    }

    task.approvalStatus = body.approved ? 'approved' : 'rejected';
    task.rejectionReason = body.approved ? null : (body.feedback || '').slice(0, 500) || null;
    await this.videoTaskRepo.save(task);

    return {
      success: true,
      approvalStatus: task.approvalStatus,
    };
  }

  @Post('lessons/:id/complete-step')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '完成课程的一个步骤' })
  async completeLessonStep(
    @Request() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      childId: number;
      stepId: string;
      score?: number;
      durationSeconds?: number;
      interactionData?: Record<string, any>;
    },
  ) {
    await this.assertAccessToChild(req, body.childId);
    return this.lessonContentService.completeStep({
      contentId: +id,
      childId: body.childId,
      stepId: body.stepId,
      score: body.score,
      durationSeconds: body.durationSeconds,
      interactionData: body.interactionData,
    });
  }

  // ─── Existing Endpoints ────────────────────────────────────────────

  @Get('plans/:childId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '学习计划历史' })
  async getStudyPlans(
    @Request() req: any,
    @Param('childId') childId: string,
    @Query('sourceType') sourceType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const numericChildId = +childId;
    await this.assertAccessToChild(req, numericChildId);
    return this.learningArchive.getStudyPlans({
      childId: numericChildId,
      sourceType,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }
}

