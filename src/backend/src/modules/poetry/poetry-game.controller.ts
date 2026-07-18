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
    @Query('lang') lang?: string,
  ) {
    return this.gameService.generateFillBlank(difficulty, lang);
  }

  /**
   * 飞花令 - 获取包含指定关键字的诗句
   * GET /poetry/game/flying-flower?keyword=月&lang=zh-Hans
   */
  @Get('flying-flower')
  async getFlyingFlower(@Query('keyword') keyword?: string, @Query('lang') lang?: string) {
    return this.gameService.getFlyingFlower(keyword, lang);
  }

  /**
   * 诗词接龙 - 给出上句，选择正确的下句
   * GET /poetry/game/solitaire?lang=zh-Hans
   */
  @Get('solitaire')
  async getSolitaire(@Query('lang') lang?: string) {
    return this.gameService.getSolitaire(lang);
  }
}
