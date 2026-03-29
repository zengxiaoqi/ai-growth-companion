import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LearningService } from './learning.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('学习记录')
@Controller('learning')
export class LearningController {
  constructor(private learningService: LearningService) {}

  @Post('start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '开始学习' })
  async start(@Body() body: { userId: number; contentId: number }) {
    return this.learningService.create(body.userId, body.contentId);
  }

  @Post('complete/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '完成学习' })
  async complete(@Param('id') id: string, @Body() body: any) {
    return this.learningService.update(+id, { ...body, status: 'completed' });
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
}