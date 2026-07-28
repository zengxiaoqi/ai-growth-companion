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
import {
  PoetryData,
  ContentSlideData,
  AchievementData,
  SemesterData,
} from './interfaces/bento-template.interface';
import { Slide, Theme } from './interfaces/bento-document.interface';

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
    return {
      fileId,
      fileName: `report-${childId}-${period}-${fileId.slice(0, 8)}.bento.html`,
      url: `/api/bento/${fileId}`,
    };
  }

  @Post('poetry/:poetryId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '生成诗词鉴赏幻灯片' })
  async generatePoetrySlide(@Param('poetryId') poetryId: string, @Body() poetryData: PoetryData) {
    const fileId = await this.bentoService.generatePoetrySlide(poetryData);
    return {
      fileId,
      fileName: `poetry-${poetryId}-${fileId.slice(0, 8)}.bento.html`,
      url: `/api/bento/${fileId}`,
    };
  }

  @Post('lesson/:contentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '生成课程内容幻灯片' })
  async generateContentSlide(
    @Param('contentId') contentId: string,
    @Body() contentData: ContentSlideData,
  ) {
    const fileId = await this.bentoService.generateContentSlide(contentData);
    return {
      fileId,
      fileName: `lesson-${contentId}-${fileId.slice(0, 8)}.bento.html`,
      url: `/api/bento/${fileId}`,
    };
  }

  @Post('achievement')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '生成成就展幻灯片' })
  async generateAchievementSlide(@Body() achievementData: AchievementData) {
    const fileId = await this.bentoService.generateAchievementSlide(achievementData);
    return {
      fileId,
      fileName: `achievement-${fileId.slice(0, 8)}.bento.html`,
      url: `/api/bento/${fileId}`,
    };
  }

  @Post('semester')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '生成学期纪念册幻灯片' })
  async generateSemesterReport(@Body() semesterData: SemesterData) {
    const fileId = await this.bentoService.generateSemesterReport(semesterData);
    return {
      fileId,
      fileName: `semester-${fileId.slice(0, 8)}.bento.html`,
      url: `/api/bento/${fileId}`,
    };
  }

  @Post('from-json')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '从 JSON 数据生成 Bento 幻灯片' })
  async generateFromJson(@Body() body: { title: string; slides: Slide[]; theme: Theme }) {
    const fileId = await this.bentoService.generateFromTemplate(
      body.title,
      body.slides,
      body.theme,
      { readonly: true },
    );
    return {
      fileId,
      fileName: `bento-${fileId.slice(0, 8)}.bento.html`,
      url: `/api/bento/${fileId}`,
    };
  }

  @Get(':fileId')
  @ApiOperation({ summary: '获取并下载 Bento 幻灯片文件（通过 token 认证）' })
  @ApiQuery({ name: 'token', required: true, description: 'JWT token（查询参数）' })
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getBentoFile(
    @Param('fileId') fileId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) throw new UnauthorizedException('缺少 token 参数');
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
