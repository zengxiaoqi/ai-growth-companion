import { Controller, Post, Get, Query, Body, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('AI 服务')
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private aiService: AiService) {}

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
  @ApiOperation({ summary: 'AI 对话（流式 SSE）' })
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
          res.write(`event: done\ndata: ${JSON.stringify({
            sessionId: event.sessionId,
            wasFiltered: event.wasFiltered,
            suggestions: event.suggestions,
          })}\n\n`);
          break;
        }
        if (event.type === 'thinking') {
          res.write(`event: thinking\ndata: ${JSON.stringify({ content: event.thinkingContent })}\n\n`);
        } else if (event.type === 'tool_start') {
          res.write(`event: tool_start\ndata: ${JSON.stringify({ content: event.content, toolName: event.toolName, toolArgs: event.toolArgs })}\n\n`);
        } else if (event.type === 'tool_result') {
          res.write(`event: tool_result\ndata: ${JSON.stringify({ content: event.content, toolName: event.toolName, toolResult: event.toolResult })}\n\n`);
        } else if (event.type === 'token') {
          res.write(`event: token\ndata: ${JSON.stringify({ content: event.content })}\n\n`);
        } else if (event.type === 'game_data') {
          res.write(`event: game_data\ndata: ${JSON.stringify({ activityType: event.activityType, gameData: event.gameData })}\n\n`);
        }
      }
    } catch (error) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'AI服务暂时不可用' })}\n\n`);
    } finally {
      res.end();
    }
  }

  @Post('quiz')
  @ApiOperation({ summary: '自动生成测验' })
  async generateQuiz(
    @Body() body: { childId: number; topic: string; count?: number },
  ) {
    return this.aiService.generateQuiz({
      childId: body.childId,
      topic: body.topic,
      count: body.count,
    });
  }

  @Post('story')
  @ApiOperation({ summary: 'AI 故事生成（年龄自适应）' })
  async generateStory(
    @Body() body: { childId: number; theme?: string; ageRange?: '3-4' | '5-6' },
  ) {
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
  @ApiOperation({ summary: '获取学习建议（GET 方式）' })
  async getSuggestion(
    @Query('userId') userId?: number,
    @Query('ageRange') ageRange?: '3-4' | '5-6',
  ) {
    return this.aiService.generateSuggestion(null, ageRange === '3-4' ? 4 : ageRange === '5-6' ? 6 : 5);
  }
}
