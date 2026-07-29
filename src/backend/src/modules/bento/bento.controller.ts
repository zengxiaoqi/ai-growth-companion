import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Res,
  Header,
  Body,
  Query,
  UnauthorizedException,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import * as path from 'path';
import { BentoService } from './bento.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  GenerateReportDto,
  GeneratePoetryDto,
  GenerateContentSlideDto,
  GenerateAchievementDto,
  GenerateSemesterDto,
  GenerateFromJsonDto,
} from './bento.dto';

@ApiTags('Bento 幻灯片')
@Controller('bento')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
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
    @Body() reportData: GenerateReportDto,
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
  async generatePoetrySlide(
    @Param('poetryId') poetryId: string,
    @Body() poetryData: GeneratePoetryDto,
  ) {
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
    @Body() contentData: GenerateContentSlideDto,
  ) {
    const fileId = await this.bentoService.generateContentSlide(contentData as any);
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
  async generateAchievementSlide(@Body() achievementData: GenerateAchievementDto) {
    const { accentColor, backgroundColor, fontFamily, ...data } = achievementData;
    const fileId = await this.bentoService.generateAchievementSlide(data as any, {
      accentColor,
      backgroundColor,
      fontFamily,
    });
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
  async generateSemesterReport(@Body() semesterData: GenerateSemesterDto) {
    const { accentColor, backgroundColor, fontFamily, ...data } = semesterData;
    const fileId = await this.bentoService.generateSemesterReport(data, {
      accentColor,
      backgroundColor,
      fontFamily,
    });
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
  async generateFromJson(@Body() body: GenerateFromJsonDto) {
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
    // 安全审查：验证 token 有效性和过期时间
    if (!token) throw new UnauthorizedException('缺少 token 参数');
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('无效的 token');
    }

    // 额外安全：检查 token 过期时间（虽然 JwtService.verify 已检查，但作为防御层）
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new UnauthorizedException('token 已过期');
    }

    const fileInfo = await this.bentoService.getBentoFile(fileId);
    const fileName = path.basename(fileInfo.name);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.sendFile(fileInfo.path);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取已生成的 Bento 文件列表（分页）' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listBentoFiles(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.bentoService.listBentoFiles(page, Math.min(limit, 100));
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
