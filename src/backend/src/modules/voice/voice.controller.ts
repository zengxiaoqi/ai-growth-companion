import { Controller, Get, Post, Body, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { VoiceService } from './voice.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  /**
   * 文字转语音 - 返回 MP3 音频流
   */
  @Get('tts')
  async textToSpeech(
    @Query('text') text: string,
    @Query('voice') voice: string = 'zh-CN-XiaoxiaoNeural',
    @Res() res: Response,
  ) {
    if (!text) {
      res.status(400).json({ message: 'text parameter is required' });
      return;
    }

    const audioBuffer = await this.voiceService.textToSpeech(text, voice);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(audioBuffer);
  }

  /**
   * 语音对话
   */
  @UseGuards(JwtAuthGuard)
  @Post('chat')
  async voiceChat(@Body() body: { userId: number; audioUrl: string }) {
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
    return this.voiceService.voiceQuiz(+userId, question);
  }
}
