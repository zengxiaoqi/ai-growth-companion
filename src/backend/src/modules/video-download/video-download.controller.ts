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
  async createDownload(
    @Request() req,
    @Body() body: { url: string; childId?: number; quality?: string },
  ) {
    if (!body?.url) {
      throw new BadRequestException('URL is required');
    }
    return this.service.createDownload(req.user.sub, body.url, body.childId, body.quality);
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

  @Post('batch/delete')
  @ApiOperation({ summary: '批量删除下载任务' })
  async batchDeleteDownload(@Body() body: { ids: number[] }) {
    await this.service.batchDelete(body.ids);
    return { success: true };
  }

  @Post('batch/retry')
  @ApiOperation({ summary: '批量重试失败下载' })
  async batchRetryDownload(@Body() body: { ids: number[] }) {
    return this.service.batchRetry(body.ids);
  }

  @Post('batch/toggle-publish')
  @ApiOperation({ summary: '批量发布给孩子' })
  async batchTogglePublish(@Body() body: { ids: number[]; childId: number }) {
    return this.service.batchTogglePublish(body.ids, body.childId);
  }

  @Post(':id/toggle-publish')
  @ApiOperation({ summary: '切换是否发布给孩子观看，可选 childId' })
  async togglePublish(@Param('id') id: string, @Body() body: { childId?: number }) {
    return this.service.togglePublish(+id, body.childId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '取消卡住的下载任务（pending/downloading → failed）' })
  async cancelDownload(@Param('id') id: string) {
    return this.service.cancelDownload(+id);
  }

  @Post(':id/re-download')
  @ApiOperation({ summary: '重新下载——文件被清理/丢失时从原始链接重新下载' })
  async reDownload(@Param('id') id: string) {
    return this.service.reDownload(+id);
  }

  @Post(':id/update-url')
  @ApiOperation({ summary: '修改失败下载任务的链接并重新下载' })
  async updateUrl(@Param('id') id: string, @Body() body: { url: string }) {
    if (!body?.url) {
      throw new BadRequestException('URL is required');
    }
    return this.service.updateUrl(+id, body.url);
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
