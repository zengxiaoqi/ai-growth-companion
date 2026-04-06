import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Patch,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AiService } from './ai.service';

@ApiTags('AI 服务')
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'AI 对话（Agent 模式）' })
  async chat(
    @Body() body: { message: string; childId?: number; parentId?: number; sessionId?: string; context?: any },
  ) {
    return this.aiService.chat({
      message: body.message,
      childId: body.childId,
      parentId: body.parentId,
      sessionId: body.sessionId,
      context: body.context,
    });
  }

  @Get('chat/stream')
  @ApiOperation({ summary: 'AI 对话流式输出（SSE）' })
  async chatStream(
    @Query('message') message: string,
    @Query('childId') childId: string,
    @Query('parentId') parentId: string,
    @Query('sessionId') sessionId: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const stream = this.aiService.chatStream({
        message,
        childId: childId ? +childId : undefined,
        parentId: parentId ? +parentId : undefined,
        sessionId: sessionId || undefined,
      });

      for await (const event of stream) {
        if (event.type === 'error') {
          res.write(`event: error\ndata: ${JSON.stringify({ message: event.message })}\n\n`);
          break;
        }

        if (event.type === 'done') {
          res.write(
            `event: done\ndata: ${JSON.stringify({
              sessionId: event.sessionId,
              wasFiltered: event.wasFiltered,
              suggestions: event.suggestions,
            })}\n\n`,
          );
          break;
        }

        if (event.type === 'thinking') {
          res.write(`event: thinking\ndata: ${JSON.stringify({ content: event.thinkingContent })}\n\n`);
        } else if (event.type === 'tool_start') {
          res.write(
            `event: tool_start\ndata: ${JSON.stringify({
              content: event.content,
              toolName: event.toolName,
              toolArgs: event.toolArgs,
            })}\n\n`,
          );
        } else if (event.type === 'tool_result') {
          res.write(
            `event: tool_result\ndata: ${JSON.stringify({
              content: event.content,
              toolName: event.toolName,
              toolResult: event.toolResult,
            })}\n\n`,
          );
        } else if (event.type === 'token') {
          res.write(`event: token\ndata: ${JSON.stringify({ content: event.content })}\n\n`);
        } else if (event.type === 'game_data') {
          res.write(
            `event: game_data\ndata: ${JSON.stringify({
              activityType: event.activityType,
              gameData: event.gameData,
              domain: event.domain,
            })}\n\n`,
          );
        }
      }
    } catch {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'AI服务暂时不可用' })}\n\n`);
    } finally {
      res.end();
    }
  }

  @Get('history/sessions')
  @ApiOperation({ summary: '获取对话会话历史' })
  async getConversationSessions(
    @Request() req: any,
    @Query('childId') childId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      return await this.aiService.getConversationSessions({
        viewerId: req.user.sub,
        viewerType: req.user.type,
        childId: +childId,
        page: page ? +page : undefined,
        limit: limit ? +limit : undefined,
      });
    } catch (error) {
      if (error.message === 'FORBIDDEN_CHILD_ACCESS') {
        throw new ForbiddenException('无权查看该学生历史记录');
      }
      throw error;
    }
  }

  @Get('history/sessions/:sessionId/messages')
  @ApiOperation({ summary: '获取会话消息历史' })
  async getConversationSessionMessages(
    @Request() req: any,
    @Param('sessionId') sessionId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      return await this.aiService.getConversationSessionMessages({
        viewerId: req.user.sub,
        viewerType: req.user.type,
        sessionId,
        page: page ? +page : undefined,
        limit: limit ? +limit : undefined,
      });
    } catch (error) {
      if (error.message === 'FORBIDDEN_CHILD_ACCESS') {
        throw new ForbiddenException('无权查看该学生历史记录');
      }
      throw error;
    }
  }

  @Get('course-packs')
  @ApiOperation({ summary: '获取课程包历史（按学生）' })
  async getCoursePacks(
    @Request() req: any,
    @Query('childId') childId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      return await this.aiService.getCoursePacks({
        viewerId: req.user.sub,
        viewerType: req.user.type,
        childId: +childId,
        page: page ? +page : undefined,
        limit: limit ? +limit : undefined,
      });
    } catch (error) {
      if (error.message === 'FORBIDDEN_CHILD_ACCESS') {
        throw new ForbiddenException('无权查看该学生课程包');
      }
      throw error;
    }
  }

  @Get('course-packs/:id')
  @ApiOperation({ summary: '获取课程包详情' })
  async getCoursePackById(@Request() req: any, @Param('id') id: string) {
    try {
      return await this.aiService.getCoursePackById({
        viewerId: req.user.sub,
        viewerType: req.user.type,
        id: +id,
      });
    } catch (error) {
      if (error.message === 'FORBIDDEN_CHILD_ACCESS') {
        throw new ForbiddenException('无权查看该课程包');
      }
      throw error;
    }
  }

  @Get('course-packs/:id/export')
  @ApiOperation({ summary: '导出课程包（CapCut JSON / 配音TXT / 配音MP3 / 教学视频MP4 / 分镜CSV / 字幕SRT / 双语SRT / 素材包ZIP）' })
  async exportCoursePack(
    @Request() req: any,
    @Param('id') id: string,
    @Query('format')
    format:
      | 'capcut_json'
      | 'narration_txt'
      | 'narration_mp3'
      | 'teaching_video_mp4'
      | 'storyboard_csv'
      | 'subtitle_srt'
      | 'subtitle_srt_bilingual'
      | 'bundle_zip',
    @Res() res: Response,
  ) {
    try {
      const exported = await this.aiService.exportCoursePack({
        viewerId: req.user.sub,
        viewerType: req.user.type,
        id: +id,
        format,
      });
      res.setHeader('Content-Type', exported.mimeType);
      res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(exported.filename));
      res.send(exported.body);
    } catch (error) {
      if (error.message === 'FORBIDDEN_CHILD_ACCESS') {
        throw new ForbiddenException('无权导出该课程包');
      }
      if (error.message === 'COURSE_PACK_NOT_FOUND') {
        throw new NotFoundException('课程包不存在');
      }
      if (error.message === 'NARRATION_AUDIO_UNAVAILABLE') {
        throw new BadRequestException('当前环境暂不可生成配音 MP3，请稍后重试');
      }
      if (error.message === 'TEACHING_VIDEO_UNAVAILABLE') {
        throw new BadRequestException('当前环境暂不可生成 MP4 视频，请稍后重试');
      }
      throw error;
    }
  }

  @Post('course-packs/export-batch')
  @ApiOperation({ summary: '批量导出课程包（多ID合并ZIP）' })
  async exportCoursePacksBatch(
    @Request() req: any,
    @Body()
    body: {
      ids: number[];
      formats?: (
        | 'capcut_json'
        | 'narration_txt'
        | 'narration_mp3'
        | 'teaching_video_mp4'
        | 'storyboard_csv'
        | 'subtitle_srt'
        | 'subtitle_srt_bilingual'
        | 'bundle_zip'
      )[];
    },
    @Res() res: Response,
  ) {
    try {
      if (!Array.isArray(body?.ids) || body.ids.length === 0) {
        throw new BadRequestException('请提供至少一个课程包ID');
      }
      const exported = await this.aiService.exportCoursePacksBatch({
        viewerId: req.user.sub,
        viewerType: req.user.type,
        ids: body.ids,
        formats: body.formats,
      });
      res.setHeader('Content-Type', exported.mimeType);
      res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(exported.filename));
      res.send(exported.body);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (error.message === 'FORBIDDEN_CHILD_ACCESS') {
        throw new ForbiddenException('无权导出所选课程包');
      }
      if (error.message === 'INVALID_COURSE_PACK_IDS') {
        throw new BadRequestException('课程包ID无效');
      }
      if (error.message === 'COURSE_PACK_EXPORT_BATCH_EMPTY') {
        throw new NotFoundException('可导出的课程包不存在');
      }
      throw error;
    }
  }

  @Get('course-packs/:id/versions')
  @ApiOperation({ summary: '获取课程包版本历史' })
  async getCoursePackVersions(
    @Request() req: any,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      return await this.aiService.getCoursePackVersions({
        viewerId: req.user.sub,
        viewerType: req.user.type,
        id: +id,
        page: page ? +page : undefined,
        limit: limit ? +limit : undefined,
      });
    } catch (error) {
      if (error.message === 'FORBIDDEN_CHILD_ACCESS') {
        throw new ForbiddenException('无权查看该课程包版本');
      }
      if (error.message === 'COURSE_PACK_NOT_FOUND') {
        throw new NotFoundException('课程包不存在');
      }
      throw error;
    }
  }

  @Patch('course-packs/:id')
  @ApiOperation({ summary: '保存课程包编辑为新版本' })
  async saveCoursePackVersion(
    @Request() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      planContent?: Record<string, any>;
      note?: string;
      sessionId?: string;
    },
  ) {
    try {
      return await this.aiService.saveCoursePackVersion({
        viewerId: req.user.sub,
        viewerType: req.user.type,
        id: +id,
        title: body.title,
        planContent: body.planContent,
        note: body.note,
        sessionId: body.sessionId,
      });
    } catch (error) {
      if (error.message === 'FORBIDDEN_CHILD_ACCESS') {
        throw new ForbiddenException('无权编辑该课程包');
      }
      if (error.message === 'COURSE_PACK_NOT_FOUND') {
        throw new NotFoundException('课程包不存在');
      }
      throw error;
    }
  }

  @Post('course-packs/:id/enrich-bilingual')
  @ApiOperation({ summary: '自动补全课程包双语文案（可保存新版本）' })
  async enrichCoursePackBilingual(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { saveAsVersion?: boolean; overwrite?: boolean; sessionId?: string },
  ) {
    try {
      return await this.aiService.enrichCoursePackBilingual({
        viewerId: req.user.sub,
        viewerType: req.user.type,
        id: +id,
        saveAsVersion: body?.saveAsVersion,
        overwrite: body?.overwrite,
        sessionId: body?.sessionId,
      });
    } catch (error) {
      if (error.message === 'FORBIDDEN_CHILD_ACCESS') {
        throw new ForbiddenException('无权操作该课程包');
      }
      if (error.message === 'COURSE_PACK_NOT_FOUND') {
        throw new NotFoundException('课程包不存在');
      }
      throw error;
    }
  }

  @Post('course-packs/generate-weekly')
  @ApiOperation({ summary: '一次输入批量生成周课程包（默认7天）' })
  async generateWeeklyCoursePacks(
    @Request() req: any,
    @Body()
    body: {
      topic: string;
      childId: number;
      ageGroup?: '3-4' | '5-6';
      durationMinutes?: number;
      focus?: 'literacy' | 'math' | 'science' | 'mixed';
      difficulty?: number;
      includeGame?: boolean;
      includeAudio?: boolean;
      includeVideo?: boolean;
      parentPrompt?: string;
      sessionId?: string;
      startDate?: string;
      days?: number;
    },
  ) {
    try {
      return await this.aiService.generateWeeklyCoursePacks({
        viewerId: req.user.sub,
        viewerType: req.user.type,
        ...body,
      });
    } catch (error) {
      if (error.message === 'FORBIDDEN_CHILD_ACCESS') {
        throw new ForbiddenException('无权为该学生生成周计划');
      }
      if (error.message === 'INVALID_WEEKLY_TOPIC') {
        throw new BadRequestException('请提供周计划主题');
      }
      if (error.message === 'INVALID_CHILD_ID') {
        throw new BadRequestException('学生ID无效');
      }
      throw error;
    }
  }

  @Post('quiz')
  @ApiOperation({ summary: '自动生成测验' })
  async generateQuiz(@Body() body: { childId: number; topic: string; count?: number }) {
    return this.aiService.generateQuiz({
      childId: body.childId,
      topic: body.topic,
      count: body.count,
    });
  }

  @Post('course-pack')
  @ApiOperation({ summary: '家长一句话生成全课程内容包（听说读写+游戏+图文音视频）' })
  async generateCoursePack(
    @Request() req: any,
    @Body()
    body: {
      topic: string;
      childId?: number;
      ageGroup?: '3-4' | '5-6';
      durationMinutes?: number;
      focus?: 'literacy' | 'math' | 'science' | 'mixed';
      difficulty?: number;
      includeGame?: boolean;
      includeAudio?: boolean;
      includeVideo?: boolean;
      parentPrompt?: string;
      sessionId?: string;
    },
  ) {
    try {
      return this.aiService.generateCoursePack({
        ...body,
        viewerId: req.user.sub,
        viewerType: req.user.type,
      });
    } catch (error) {
      if (error.message === 'FORBIDDEN_CHILD_ACCESS') {
        throw new ForbiddenException('无权为该学生生成课程包');
      }
      throw error;
    }
  }

  @Post('story')
  @ApiOperation({ summary: 'AI 故事生成（年龄自适应）' })
  async generateStory(@Body() body: { childId: number; theme?: string; ageRange?: '3-4' | '5-6' }) {
    return this.aiService.generateStory(body);
  }

  @Post('generate-story')
  @ApiOperation({ summary: '生成故事（旧接口）' })
  async generateStoryLegacy(@Body() body: { topic: string; age: number }) {
    return this.aiService.generateStoryLegacy(body.topic, body.age);
  }

  @Post('evaluate')
  @ApiOperation({ summary: '评估学习' })
  async evaluate(@Body() body: { contentId: number; answers: any[]; age: number }) {
    return this.aiService.evaluateLearning(body.contentId, body.answers, body.age);
  }

  @Post('suggestion')
  @ApiOperation({ summary: '学习建议' })
  async suggestion(@Body() body: { abilities: any; age: number }) {
    return this.aiService.generateSuggestion(body.abilities, body.age);
  }

  @Get('suggest')
  @ApiOperation({ summary: '获取学习建议（GET）' })
  async getSuggestion(@Query('ageRange') ageRange?: '3-4' | '5-6') {
    return this.aiService.generateSuggestion(null, ageRange === '3-4' ? 4 : ageRange === '5-6' ? 6 : 5);
  }
}






