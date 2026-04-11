import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AbilitiesService } from './abilities.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('能力评估')
@Controller('abilities')
export class AbilitiesController {
  constructor(private abilitiesService: AbilitiesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建能力评估' })
  async create(@Body() body: { userId: number; domain: string; score: number }) {
    return this.abilitiesService.create(body.userId, body.domain, body.score);
  }

  @Get(':userId')
  @ApiOperation({ summary: '获取用户能力评估' })
  async findByUser(@Param('userId') userId: string) {
    return this.abilitiesService.getByUser(+userId);
  }
}