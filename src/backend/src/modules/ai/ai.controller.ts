import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AiService } from './ai.service';

@ApiTags('AI 服务')
@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'AI 对话' })
  async chat(@Body() body: { message: string; context?: any; history?: any[] }) {
    return this.aiService.chat(body.message, body.context, body.history);
  }

  @Post('generate-story')
  @ApiOperation({ summary: '生成故事' })
  async generateStory(@Body() body: { topic: string; age: number }) {
    return this.aiService.generateStory(body.topic, body.age);
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
}