import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { GameService } from './game.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  /** @deprecated 前端已无调用方；出题统一走 generateActivity 引擎。保留仅为兼容旧客户端。 */
  @Get('list')
  getGameList(@Query('ageRange') ageRange: string) {
    return this.gameService.getGameList(ageRange || '3-4');
  }

  /** @deprecated 硬编码静态池，仅作静态课程 game block 的兜底；新内容走 generateActivity。 */
  @Get(':gameId')
  generateGame(@Param('gameId') gameId: string, @Query('difficulty') difficulty: string) {
    return this.gameService.generateGame(gameId, +(difficulty || 1));
  }

  @UseGuards(JwtAuthGuard)
  @Post('result')
  async saveGameResult(
    @Body()
    body: {
      userId: number;
      gameId: string;
      score: number;
      timeSpent: number;
      correctAnswers: number;
      totalQuestions: number;
    },
  ) {
    return this.gameService.saveGameResult(body.userId, body.gameId, {
      gameId: body.gameId,
      score: body.score,
      timeSpent: body.timeSpent,
      correctAnswers: body.correctAnswers,
      totalQuestions: body.totalQuestions,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('level/:userId')
  getLevelInfo(@Param('userId') userId: string) {
    return this.gameService.getLevelInfo(+userId);
  }
}
