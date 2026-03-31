import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('通知管理')
@Controller('notifications')
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  @Get(':userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取用户通知列表' })
  async list(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    const notifications = await this.notificationService.findByUser(+userId, +limit || 20);
    const unreadCount = await this.notificationService.getUnreadCount(+userId);
    return { notifications, unreadCount };
  }

  @Get(':userId/unread-count')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取未读通知数量' })
  async unreadCount(@Param('userId') userId: string) {
    const count = await this.notificationService.getUnreadCount(+userId);
    return { count };
  }

  @Post(':id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '标记通知为已读' })
  async markAsRead(@Param('id') id: string) {
    return this.notificationService.markAsRead(+id);
  }

  @Post('user/:userId/read-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '标记所有通知为已读' })
  async markAllAsRead(@Param('userId') userId: string) {
    await this.notificationService.markAllAsRead(+userId);
    return { success: true };
  }
}
