import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VideoDownloadService } from './video-download.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('视频下载')
@Controller('video-download')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VideoDownloadController {
  constructor(private readonly service: VideoDownloadService) {}

  @Post()
  @ApiOperation({ summary: '创建视频下载任务（传入链接，后台下载无水印视频）' })
  async createDownload(@Request() req, @Body() body: { url: string; childId?: number }) {
    if (!body?.url) {
      throw new BadRequestException('URL is required');
    }
    return this.service.createDownload(req.user.sub, body.url, body.childId);
  }

  @Get()
  @ApiOperation({ summary: '获取当前家长的所有下载任务' })
  async listDownloads(@Request() req) {
    return this.service.findByParent(req.user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取下载任务详情' })
  async getDownload(@Param('id') id: string) {
    return this.service.findById(+id);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: '重试失败的下载' })
  async retryDownload(@Param('id') id: string) {
    return this.service.retryDownload(+id);
  }

  @Post(':id/toggle-publish')
  @ApiOperation({ summary: '切换是否发布给孩子观看' })
  async togglePublish(@Param('id') id: string) {
    return this.service.togglePublish(+id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '取消卡住的下载任务（pending/downloading → failed）' })
  async cancelDownload(@Param('id') id: string) {
    return this.service.cancelDownload(+id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除下载任务及文件' })
  async deleteDownload(@Param('id') id: string) {
    await this.service.deleteDownload(+id);
    return { success: true };
  }

  @Get('child/:childId')
  @ApiOperation({ summary: '获取发布给指定孩子的视频列表' })
  async getPublishedForChild(@Param('childId') childId: string) {
    return this.service.findPublishedForChild(+childId);
  }
}
