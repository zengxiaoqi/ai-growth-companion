import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { AchievementsService } from './achievements.service';

@Controller('achievements')
export class AchievementsController {
  constructor(private readonly achievementsService: AchievementsService) {}

  @Get('user/:userId')
  async findByUser(@Param('userId') userId: string) {
    return this.achievementsService.findByUser(+userId);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.achievementsService.findById(+id);
  }

  @Post()
  async create(@Body() data: any) {
    return this.achievementsService.create(data);
  }
}