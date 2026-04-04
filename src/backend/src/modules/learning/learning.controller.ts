import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Content } from '../../database/entities/content.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { LearningArchiveService, WrongQuestionReviewItem } from './learning-archive.service';
import { LearningService } from './learning.service';
import { LearningTrackerService } from './learning-tracker.service';

@ApiTags('学习记录')
@Controller('learning')
export class LearningController {
  constructor(
    private readonly learningService: LearningService,
    private readonly learningTracker: LearningTrackerService,
    private readonly learningArchive: LearningArchiveService,
    private readonly usersService: UsersService,
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
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
    const updatedRecord = await this.learningService.update(+id, { ...body, status: 'completed' });

    if (updatedRecord) {
      try {
        const content = await this.contentRepo.findOne({ where: { id: updatedRecord.contentId } });
        await this.learningTracker.recordActivity({
          type: 'content_completion',
          childId: updatedRecord.userId,
          contentId: updatedRecord.contentId,
          domain: content?.domain || 'language',
          score: body.score || 0,
          durationSeconds: body.durationSeconds,
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
