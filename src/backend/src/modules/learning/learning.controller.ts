import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearningService } from './learning.service';
import { LearningTrackerService } from './learning-tracker.service';
import { Content } from '../../database/entities/content.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('学习记录')
@Controller('learning')
export class LearningController {
  constructor(
    private learningService: LearningService,
    private learningTracker: LearningTrackerService,
    @InjectRepository(Content)
    private contentRepo: Repository<Content>,
  ) {}

  @Post('start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '开始学习' })
  async start(@Body() body: { childId: number; contentId: number }) {
    return this.learningService.create(body.childId, body.contentId);
  }

  @Post('complete/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '完成学习' })
  async complete(@Param('id') id: string, @Body() body: any) {
    const record = await this.learningService.update(+id, { ...body, status: 'completed' });

    // Feed into learning tracker
    if (record) {
      try {
        const content = await this.contentRepo.findOne({ where: { id: record.contentId } });
        await this.learningTracker.recordActivity({
          type: 'content_completion',
          childId: record.userId,
          contentId: record.contentId,
          domain: content?.domain || 'language',
          score: body.score || 0,
          durationSeconds: body.durationSeconds,
        });
      } catch (err) {
        // Don't fail completion if tracker fails
      }
    }

    return record;
  }

  @Get('history/:userId')
  @ApiOperation({ summary: '学习历史' })
  async history(@Param('userId') userId: string, @Query('limit') limit?: string) {
    return this.learningService.findByUser(+userId, +limit || 10);
  }

  @Get('today/:userId')
  @ApiOperation({ summary: '今日学习统计' })
  async today(@Param('userId') userId: string) {
    return this.learningService.getTodayStats(+userId);
  }

  @Get('today-detail/:userId')
  @ApiOperation({ summary: '今日学习统计（含来源分类）' })
  async todayDetail(@Param('userId') userId: string) {
    return this.learningService.getTodayStatsWithSources(+userId);
  }
}
