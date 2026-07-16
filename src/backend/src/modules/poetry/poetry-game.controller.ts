import { Controller, Get, Query } from '@nestjs/common';
import { PoetryGameService } from './poetry-game.service';

@Controller('poetry/game')
export class PoetryGameController {
  constructor(private readonly gameService: PoetryGameService) {}

  /**
   * 填字游戏 - 获取题目
   * GET /poetry/game/fill-blank?difficulty=easy|medium|hard
   */
  @Get('fill-blank')
  async getFillBlank(
    @Query('difficulty') difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  ) {
    return this.gameService.generateFillBlank(difficulty);
  }

  /**
   * 飞花令 - 获取包含指定字的诗句
   * GET /poetry/game/flying-flower?char=月
   */
  @Get('flying-flower')
  async getFlyingFlower(@Query('char') char?: string) {
    return this.gameService.getFlyingFlower(char);
  }

  /**
   * 诗词接龙
   * GET /poetry/game/solitaire?lastChar=春
   */
  @Get('solitaire')
  async getSolitaire(@Query('lastChar') lastChar?: string) {
    return this.gameService.getSolitaire(lastChar);
  }
}
