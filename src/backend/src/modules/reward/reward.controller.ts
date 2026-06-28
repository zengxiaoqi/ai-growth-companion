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
  Req,
  HttpException,
  HttpStatus,
  ConflictException,
  UseGuards,
  ForbiddenException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Request } from 'express';
import { RewardService } from './reward.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';

/** 确保上传目录存在 */
function ensureUploadDir(): string {
  const uploadDir = join(__dirname, '..', '..', '..', 'public', 'uploads', 'icons');
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
}

@Controller('reward')
@UseGuards(JwtAuthGuard)
export class RewardController {
  constructor(
    private readonly rewardService: RewardService,
    private readonly usersService: UsersService,
  ) {}

  /** 验证当前认证用户是否有权操作该 childId */
  private async assertCanAccessChild(req: any, childId: number) {
    const userId = req.user.sub as number;
    const userType = req.user.type as string;
    const canAccess = await this.usersService.canAccessChild(userId, userType, childId);
    if (!canAccess) {
      throw new ForbiddenException('无权操作该孩子的数据');
    }
  }

  // ==================== 行为模板 ====================

  @Get('behaviors')
  async getBehaviors(@Req() req: any) {
    const userId = req.user.sub as number;
    return this.rewardService.getBehaviorsWithAutoSeed(userId);
  }

  @Post('behaviors')
  async createBehavior(
    @Req() req: any,
    @Body()
    data: {
      name: string;
      emoji?: string;
      points: number;
      category?: string;
      sortOrder?: number;
    },
  ) {
    const userId = req.user.sub as number;
    return this.rewardService.createBehavior({ ...data, userId });
  }

  @Put('behaviors/:id')
  async updateBehavior(
    @Req() req: any,
    @Param('id') id: string,
    @Body() data: Record<string, any>,
  ) {
    const userId = req.user.sub as number;
    const behavior = await this.rewardService.getBehaviorById(+id);
    if (!behavior) throw new HttpException('模板不存在', HttpStatus.NOT_FOUND);
    if (behavior.userId !== userId) throw new ForbiddenException('无权修改他人模板');
    // 禁止修改 userId 字段
    const { userId: _ignored, ...safeData } = data;
    return this.rewardService.updateBehavior(+id, safeData);
  }

  @Delete('behaviors/:id')
  async deleteBehavior(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.sub as number;
    const behavior = await this.rewardService.getBehaviorById(+id);
    if (!behavior) throw new HttpException('模板不存在', HttpStatus.NOT_FOUND);
    if (behavior.userId !== userId) throw new ForbiddenException('无权删除他人模板');
    return this.rewardService.deleteBehavior(+id);
  }

  @Patch('behaviors/:id/toggle')
  async toggleBehavior(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.sub as number;
    const behavior = await this.rewardService.getBehaviorById(+id);
    if (!behavior) throw new HttpException('模板不存在', HttpStatus.NOT_FOUND);
    if (behavior.userId !== userId) throw new ForbiddenException('无权操作他人模板');
    return this.rewardService.toggleBehavior(+id);
  }

  // ==================== 积分记录 ====================

  @Get('points/:childId')
  async getPointRecords(
    @Req() req: any,
    @Param('childId') childId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    await this.assertCanAccessChild(req, +childId);
    return this.rewardService.getPointRecords(+childId, +page, +limit);
  }

  @Post('points')
  async recordPoints(
    @Req() req: any,
    @Body()
    data: {
      childId: number;
      templateId?: number;
      behaviorName: string;
      points: number;
      note?: string;
      recordedAt?: string;
    },
  ) {
    await this.assertCanAccessChild(req, data.childId);
    const result = await this.rewardService.recordPoints({
      ...data,
      recordedBy: req.user.sub as number,
      recordedAt: data.recordedAt ? new Date(data.recordedAt) : undefined,
    });

    if (!result) {
      throw new ConflictException('该日期已打卡此行为，不能重复打卡');
    }

    return result;
  }

  @Delete('points/:id')
  async deletePointRecord(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.sub as number;
    const userType = req.user.type as string;
    // 查找记录，获取 childId 后验证归属
    const record = await this.rewardService.getPointRecordById(+id);
    if (!record) throw new HttpException('记录不存在', HttpStatus.NOT_FOUND);
    const canAccess = await this.usersService.canAccessChild(userId, userType, record.childId);
    if (!canAccess) throw new ForbiddenException('无权删除该记录');
    return this.rewardService.deletePointRecord(+id);
  }

  @Get('points/summary/:childId')
  async getPointsSummary(@Req() req: any, @Param('childId') childId: string) {
    await this.assertCanAccessChild(req, +childId);
    return this.rewardService.getPointsSummary(+childId);
  }

  // ==================== 礼品管理 ====================

  @Get('gifts')
  async getGifts(@Req() req: any) {
    const userId = req.user.sub as number;
    return this.rewardService.getGiftsWithAutoSeed(userId);
  }

  @Post('gifts')
  async createGift(
    @Req() req: any,
    @Body()
    data: {
      name: string;
      emoji?: string;
      description?: string;
      pointsCost: number;
      category?: string;
      stock?: number;
      sortOrder?: number;
    },
  ) {
    const userId = req.user.sub as number;
    return this.rewardService.createGift({ ...data, userId });
  }

  @Put('gifts/:id')
  async updateGift(@Req() req: any, @Param('id') id: string, @Body() data: Record<string, any>) {
    const userId = req.user.sub as number;
    const gift = await this.rewardService.getGiftById(+id);
    if (!gift) throw new HttpException('礼品不存在', HttpStatus.NOT_FOUND);
    if (gift.userId !== userId) throw new ForbiddenException('无权修改他人礼品');
    const { userId: _ignored, ...safeData } = data;
    return this.rewardService.updateGift(+id, safeData);
  }

  @Delete('gifts/:id')
  async deleteGift(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.sub as number;
    const gift = await this.rewardService.getGiftById(+id);
    if (!gift) throw new HttpException('礼品不存在', HttpStatus.NOT_FOUND);
    if (gift.userId !== userId) throw new ForbiddenException('无权删除他人礼品');
    return this.rewardService.deleteGift(+id);
  }

  // ==================== 兑换管理 ====================

  @Get('redemptions/:childId')
  async getRedemptions(@Req() req: any, @Param('childId') childId: string) {
    await this.assertCanAccessChild(req, +childId);
    return this.rewardService.getRedemptions(+childId);
  }

  @Post('redemptions')
  async redeemGift(
    @Req() req: any,
    @Body()
    data: {
      childId: number;
      giftId: number;
      giftName: string;
      pointsCost: number;
    },
  ) {
    await this.assertCanAccessChild(req, data.childId);
    try {
      return await this.rewardService.redeemGift(data);
    } catch (error) {
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Patch('redemptions/:id')
  async updateRedemptionStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() data: { status: string; approvedBy?: number },
  ) {
    const userId = req.user.sub as number;
    const userType = req.user.type as string;
    const redemption = await this.rewardService.getRedemptionById(+id);
    if (!redemption) throw new HttpException('兑换记录不存在', HttpStatus.NOT_FOUND);
    const canAccess = await this.usersService.canAccessChild(userId, userType, redemption.childId);
    if (!canAccess) throw new ForbiddenException('无权操作该兑换记录');
    return this.rewardService.updateRedemptionStatus(+id, data.status, data.approvedBy ?? userId);
  }

  // ==================== 统计 ====================

  @Get('stats/weekly/:childId')
  async getWeeklyStats(@Req() req: any, @Param('childId') childId: string) {
    await this.assertCanAccessChild(req, +childId);
    return this.rewardService.getWeeklyStats(+childId);
  }

  // ==================== 日历 ====================

  @Get('calendar/:childId')
  async getCalendarData(
    @Req() req: any,
    @Param('childId') childId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    await this.assertCanAccessChild(req, +childId);
    const y = year ? +year : new Date().getFullYear();
    const m = month ? +month : new Date().getMonth() + 1;
    return this.rewardService.getCalendarData(+childId, y, m);
  }

  @Get('calendar/:childId/day')
  async getDayRecords(
    @Req() req: any,
    @Param('childId') childId: string,
    @Query('date') date: string,
  ) {
    await this.assertCanAccessChild(req, +childId);
    if (!date) {
      throw new HttpException('date 参数必填', HttpStatus.BAD_REQUEST);
    }
    return this.rewardService.getDayRecords(+childId, date);
  }

  // ==================== 种子数据 ====================

  @Post('seed/behaviors')
  async seedBehaviors(@Req() req: any) {
    const userId = req.user.sub as number;
    return this.rewardService.seedDefaultBehaviors(userId);
  }

  @Post('seed/gifts')
  async seedGifts(@Req() req: any) {
    const userId = req.user.sub as number;
    return this.rewardService.seedDefaultGifts(userId);
  }

  // ==================== 图标图片上传 ====================

  /** 上传行为模板图标 */
  @Post('behaviors/:id/icon')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: any, file: any, cb: any) => {
          const uploadDir = ensureUploadDir();
          cb(null, uploadDir);
        },
        filename: (req: any, file: any, cb: any) => {
          const ext = extname(file.originalname) || '.png';
          cb(null, `behavior_${req.params.id}_${Date.now()}${ext}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
      fileFilter: (req: any, file: any, cb: any) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return cb(
            new HttpException('只支持 JPG/PNG/GIF/WEBP 格式', HttpStatus.BAD_REQUEST),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadBehaviorIcon(
    @Req() req: Request,
    @Param('id') id: string,
    @UploadedFile() file: any,
  ) {
    if (!file) throw new HttpException('请选择文件', HttpStatus.BAD_REQUEST);
    const userId = (req.user as any).sub as number;
    const behavior = await this.rewardService.getBehaviorById(+id);
    if (!behavior) throw new HttpException('模板不存在', HttpStatus.NOT_FOUND);
    if (behavior.userId !== userId) throw new ForbiddenException('无权操作他人模板');
    const iconImage = `/uploads/icons/${file.filename}`;
    await this.rewardService.updateBehavior(+id, { iconImage });
    return { url: iconImage };
  }

  /** 上传礼品图标 */
  @Post('gifts/:id/icon')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: any, file: any, cb: any) => {
          const uploadDir = ensureUploadDir();
          cb(null, uploadDir);
        },
        filename: (req: any, file: any, cb: any) => {
          const ext = extname(file.originalname) || '.png';
          cb(null, `gift_${req.params.id}_${Date.now()}${ext}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
      fileFilter: (req: any, file: any, cb: any) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return cb(
            new HttpException('只支持 JPG/PNG/GIF/WEBP 格式', HttpStatus.BAD_REQUEST),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadGiftIcon(@Req() req: Request, @Param('id') id: string, @UploadedFile() file: any) {
    if (!file) throw new HttpException('请选择文件', HttpStatus.BAD_REQUEST);
    const userId = (req.user as any).sub as number;
    const gift = await this.rewardService.getGiftById(+id);
    if (!gift) throw new HttpException('礼品不存在', HttpStatus.NOT_FOUND);
    if (gift.userId !== userId) throw new ForbiddenException('无权操作他人礼品');
    const iconImage = `/uploads/icons/${file.filename}`;
    await this.rewardService.updateGift(+id, { iconImage });
    return { url: iconImage };
  }

  /** 删除行为模板图标（恢复为 emoji） */
  @Delete('behaviors/:id/icon')
  async deleteBehaviorIcon(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.sub as number;
    const behavior = await this.rewardService.getBehaviorById(+id);
    if (!behavior) throw new HttpException('模板不存在', HttpStatus.NOT_FOUND);
    if (behavior.userId !== userId) throw new ForbiddenException('无权操作他人模板');
    await this.rewardService.updateBehavior(+id, { iconImage: null });
    return { success: true };
  }

  /** 删除礼品图标（恢复为 emoji） */
  @Delete('gifts/:id/icon')
  async deleteGiftIcon(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.sub as number;
    const gift = await this.rewardService.getGiftById(+id);
    if (!gift) throw new HttpException('礼品不存在', HttpStatus.NOT_FOUND);
    if (gift.userId !== userId) throw new ForbiddenException('无权操作他人礼品');
    await this.rewardService.updateGift(+id, { iconImage: null });
    return { success: true };
  }
}
