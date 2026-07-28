import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Res,
  Header,
  Body,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import * as path from 'path';
import { BentoService } from './bento.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Bento 幻灯片')
@Controller('bento')
export class BentoController {
  constructor(
    private readonly bentoService: BentoService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('report/:period/:childId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '生成学习报告幻灯片' })
  async generateReport(
    @Param('childId') childId: string,
    @Param('period') period: 'daily' | 'weekly' | 'monthly',
    @Body() reportData: any,
  ) {
    const fileId = await this.bentoService.generateReport(+childId, period, reportData);
    const fileName = `report-${childId}-${period}-${fileId.slice(0, 8)}.bento.html`;

    return {
      fileId,
      fileName,
      url: `/api/bento/${fileId}`,
    };
  }

  @Get(':fileId')
  @ApiOperation({ summary: '获取并下载 Bento 幻灯片文件（通过 token 认证）' })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'JWT token（查询参数，用于浏览器新标签页打开）',
  })
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getBentoFile(
    @Param('fileId') fileId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    // 验证 token（浏览器新标签页不能传 Authorization header，所以用 query param）
    if (!token) {
      throw new UnauthorizedException('缺少 token 参数');
    }
    try {
      await this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('无效的 token');
    }

    const fileInfo = await this.bentoService.getBentoFile(fileId);
    const fileName = path.basename(fileInfo.name);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.sendFile(fileInfo.path);
  }

  @Delete(':fileId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除 Bento 幻灯片文件' })
  async deleteBentoFile(@Param('fileId') fileId: string) {
    await this.bentoService.deleteBentoFile(fileId);
    return { message: '文件已删除', fileId };
  }
}
