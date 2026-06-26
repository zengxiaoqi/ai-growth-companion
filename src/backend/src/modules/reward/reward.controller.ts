import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  ConflictException,
} from '@nestjs/common';
import { RewardService } from './reward.service';

@Controller('reward')
export class RewardController {
  constructor(private readonly rewardService: RewardService) {}

  // ==================== 行为模板 ====================

  @Get('behaviors/:userId')
  async getBehaviors(@Param('userId') userId: string) {
    return this.rewardService.getBehaviors(+userId);
  }

  @Post('behaviors')
  async createBehavior(
    @Body()
    data: {
      userId: number;
      name: string;
      emoji?: string;
      points: number;
      category?: string;
      sortOrder?: number;
    },
  ) {
    return this.rewardService.createBehavior(data);
  }

  @Put('behaviors/:id')
  async updateBehavior(@Param('id') id: string, @Body() data: Record<string, any>) {
    return this.rewardService.updateBehavior(+id, data);
  }

  @Delete('behaviors/:id')
  async deleteBehavior(@Param('id') id: string) {
    return this.rewardService.deleteBehavior(+id);
  }

  @Patch('behaviors/:id/toggle')
  async toggleBehavior(@Param('id') id: string) {
    return this.rewardService.toggleBehavior(+id);
  }

  // ==================== 积分记录 ====================

  @Get('points/:childId')
  async getPointRecords(
    @Param('childId') childId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.rewardService.getPointRecords(+childId, +page, +limit);
  }

  @Post('points')
  async recordPoints(
    @Body()
    data: {
      childId: number;
      templateId?: number;
      behaviorName: string;
      points: number;
      note?: string;
      recordedBy: number;
      recordedAt?: string;
    },
  ) {
    const result = await this.rewardService.recordPoints({
      ...data,
      recordedAt: data.recordedAt ? new Date(data.recordedAt) : undefined,
    });

    if (!result) {
      throw new ConflictException('今日已打卡该行为，不能重复打卡');
    }

    return result;
  }

  @Delete('points/:id')
  async deletePointRecord(@Param('id') id: string) {
    return this.rewardService.deletePointRecord(+id);
  }

  @Get('points/summary/:childId')
  async getPointsSummary(@Param('childId') childId: string) {
    return this.rewardService.getPointsSummary(+childId);
  }

  // ==================== 礼品管理 ====================

  @Get('gifts/:userId')
  async getGifts(@Param('userId') userId: string) {
    return this.rewardService.getGifts(+userId);
  }

  @Post('gifts')
  async createGift(
    @Body()
    data: {
      userId: number;
      name: string;
      emoji?: string;
      description?: string;
      pointsCost: number;
      category?: string;
      stock?: number;
      sortOrder?: number;
    },
  ) {
    return this.rewardService.createGift(data);
  }

  @Put('gifts/:id')
  async updateGift(@Param('id') id: string, @Body() data: Record<string, any>) {
    return this.rewardService.updateGift(+id, data);
  }

  @Delete('gifts/:id')
  async deleteGift(@Param('id') id: string) {
    return this.rewardService.deleteGift(+id);
  }

  // ==================== 兑换管理 ====================

  @Get('redemptions/:childId')
  async getRedemptions(@Param('childId') childId: string) {
    return this.rewardService.getRedemptions(+childId);
  }

  @Post('redemptions')
  async redeemGift(
    @Body()
    data: {
      childId: number;
      giftId: number;
      giftName: string;
      pointsCost: number;
    },
  ) {
    try {
      return await this.rewardService.redeemGift(data);
    } catch (error) {
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Patch('redemptions/:id')
  async updateRedemptionStatus(
    @Param('id') id: string,
    @Body() data: { status: string; approvedBy?: number },
  ) {
    return this.rewardService.updateRedemptionStatus(+id, data.status, data.approvedBy);
  }

  // ==================== 统计 ====================

  @Get('stats/weekly/:childId')
  async getWeeklyStats(@Param('childId') childId: string) {
    return this.rewardService.getWeeklyStats(+childId);
  }

  // ==================== 日历 ====================

  @Get('calendar/:childId')
  async getCalendarData(
    @Param('childId') childId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const y = year ? +year : new Date().getFullYear();
    const m = month ? +month : new Date().getMonth() + 1;
    return this.rewardService.getCalendarData(+childId, y, m);
  }

  @Get('calendar/:childId/day')
  async getDayRecords(@Param('childId') childId: string, @Query('date') date: string) {
    if (!date) {
      throw new HttpException('date 参数必填', HttpStatus.BAD_REQUEST);
    }
    return this.rewardService.getDayRecords(+childId, date);
  }

  // ==================== 种子数据 ====================

  @Post('seed/behaviors/:userId')
  async seedBehaviors(@Param('userId') userId: string) {
    return this.rewardService.seedDefaultBehaviors(+userId);
  }

  @Post('seed/gifts/:userId')
  async seedGifts(@Param('userId') userId: string) {
    return this.rewardService.seedDefaultGifts(+userId);
  }
}
