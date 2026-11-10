import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ParentService } from './parent.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CASUAL_TOOL_CATALOG, isCasualToolName, parseCasualToolsEnv } from '../../common/policy/casual-tools';

@ApiTags('家长控制')
@Controller('parent')
export class ParentController {
  constructor(
    private parentService: ParentService,
    private usersService: UsersService,
    private configService: ConfigService,
  ) {}

  @Get('controls/:parentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取家长控制设置' })
  async getControls(@Param('parentId') parentId: string) {
    return this.parentService.getByParent(+parentId);
  }

  @Post('controls')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建家长控制' })
  async create(@Body() body: { parentId: number; childId: number }) {
    return this.parentService.create(body.parentId, body.childId);
  }

  @Patch('controls/:parentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新家长控制设置' })
  async update(@Param('parentId') parentId: string, @Body() body: any) {
    // Find or create controls for this parent
    const controls = await this.parentService.getByParent(+parentId);
    if (controls.id === 0) {
      // No existing controls — create with defaults including required fields
      const created = await this.parentService.createWithDefaults(+parentId);
      if (Object.keys(body).length > 0) {
        return this.parentService.update(created.id, body);
      }
      return created;
    }
    return this.parentService.update(controls.id, body);
  }

  @Get('controls/child/:childId/casual-tools')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取孩子的碎碎念可用工具与当前设置' })
  async getCasualTools(@Param('childId') childId: string, @Request() req: any) {
    const id = +childId;
    await this.assertParentChildAccess(req, id);
    const override = await this.parentService.getCasualTools(id);
    const def = parseCasualToolsEnv(this.configService.get<string>('CASUAL_ALLOWED_TOOLS'));
    return {
      available: CASUAL_TOOL_CATALOG,
      default: def,
      override, // null = 跟随默认
      effective: override ?? def,
    };
  }

  @Patch('controls/child/:childId/casual-tools')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '设置孩子的碎碎念可用工具（tools=null 表示跟随默认）' })
  async setCasualTools(
    @Param('childId') childId: string,
    @Body() body: { tools: string[] | null },
    @Request() req: any,
  ) {
    const id = +childId;
    await this.assertParentChildAccess(req, id);
    const tools = body?.tools;
    if (tools !== null && !Array.isArray(tools)) {
      throw new BadRequestException('tools 必须是数组或 null');
    }
    let normalized: string[] | null = null;
    if (Array.isArray(tools)) {
      const invalid = tools.filter((t) => !isCasualToolName(t));
      if (invalid.length > 0) {
        throw new BadRequestException(`不支持的工具: ${invalid.join(', ')}`);
      }
      normalized = Array.from(new Set(tools));
    }
    const control = await this.parentService.setCasualTools(req.user.sub, id, normalized);
    return { override: control.casualTools };
  }

  private async assertParentChildAccess(req: any, childId: number) {
    if (req.user?.type !== 'parent') {
      throw new ForbiddenException('仅家长可配置碎碎念工具');
    }
    const canAccess = await this.usersService.canAccessChild(req.user.sub, req.user.type, childId);
    if (!canAccess) throw new ForbiddenException('无权访问该孩子');
  }
}
