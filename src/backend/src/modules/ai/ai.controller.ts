import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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

  @Post('quiz')
  @ApiOperation({ summary: '自动生成测验' })
  async generateQuiz(@Body() body: { childId: number; topic: string; count?: number }) {
    return this.aiService.generateQuiz({
      childId: body.childId,
      topic: body.topic,
      count: body.count,
    });
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
