import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AiService } from './ai.service';

@ApiTags('AI 服务')
@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'AI 对话' })
  async chat(
    @Body()
    body: {
      message: string;
      context?: any;
      history?: any[];
      childId?: number;
    },
  ) {
    return this.aiService.chat(
      body.message,
      body.context,
      body.history,
      body.childId,
    );
  }

  @Post('story')
  @ApiOperation({ summary: 'AI 故事生成（年龄自适应）' })
  async generateStory(
    @Body()
    body: {
      childId: number;
      theme?: string;
      ageRange?: '3-4' | '5-6';
    },
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