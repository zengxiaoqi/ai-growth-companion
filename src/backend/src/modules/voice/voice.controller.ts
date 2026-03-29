import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  /**
   * 文字转语音
   */
  @Get('tts')
  async textToSpeech(
    @Query('text') text: string,
    @Query('voice') voice: string = 'xiaoyun',
  ) {
    return this.voiceService.textToSpeech(decodeURIComponent(text), voice);
  }

  /**
   * 语音对话
   */
  @UseGuards(JwtAuthGuard)
  @Post('chat')
  async voiceChat(
    @Body() body: { userId: number; audioUrl: string },
  ) {
    return this.voiceService.voiceChat(body.userId, body.audioUrl);
  }

  /**
   * 生成故事
   */
  @UseGuards(JwtAuthGuard)
  @Get('story')
  async generateStory(
    @Query('userId') userId: string,
    @Query('theme') theme: string = '动物',
    @Query('ageRange') ageRange: string = '3-4',
  ) {
    return this.voiceService.generateStory(+userId, theme, ageRange);
  }

  /**
   * 儿歌列表
   */
  @Get('rhyme')
  async getNurseryRhyme(@Query('id') id?: string) {
    return this.voiceService.getNurseryRhyme(id);
  }

  /**
   * 语音问答
   */
  @UseGuards(JwtAuthGuard)
  @Get('quiz')
  async voiceQuiz(
    @Query('userId') userId: string,
    @Query('question') question: string,
  ) {
    return this.voiceService.voiceQuiz(+userId, decodeURIComponent(question));
  }
}