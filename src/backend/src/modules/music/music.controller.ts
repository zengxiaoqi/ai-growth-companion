import { Controller, Get, Headers, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MusicService } from './music.service';

function clampLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 10;
  return Math.min(20, Math.floor(parsed));
}

@Controller('music')
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  /** Track urls are relative to the API root ("/music/audio/<token>"). */
  @UseGuards(JwtAuthGuard)
  @Get('search')
  search(@Query('q') q = '', @Query('limit') limit?: string) {
    const query = String(q).trim().slice(0, 200);
    return this.musicService.search(query, clampLimit(limit));
  }

  /**
   * No JWT guard on purpose (same as voice/tts): the random capability
   * token is the authorization, so <audio>/audioplayers can use the URL
   * directly without custom headers.
   */
  @Get('audio/:token')
  async audio(
    @Param('token') token: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ) {
    await this.musicService.streamAudio(token, range, res);
  }
}