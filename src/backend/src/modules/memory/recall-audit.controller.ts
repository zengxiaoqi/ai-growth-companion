import { Controller, ForbiddenException, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { RecallAuditService } from './recall-audit.service';
import type { RecallAuditSummary } from './recall-audit.service';

/**
 * Parent-facing calibration view of the memory tools.
 *
 * Unlike `SafetyController`, this one checks ownership: the audit rows
 * hold tool names, outcomes and truncated query text, so an authenticated
 * parent must only ever see their own children. Child accounts are denied
 * outright — a child has no reason to inspect how often the model decided
 * to remember something.
 */
@ApiTags('记忆审计')
@Controller('memory/audit')
@UseGuards(JwtAuthGuard)
export class RecallAuditController {
  constructor(
    private readonly audits: RecallAuditService,
    private readonly users: UsersService,
  ) {}

  @Get(':childId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '获取某孩子记忆工具的调用率 / 命中率 / 拒绝原因分布（不含查询原文）',
  })
  async summary(
    @Param('childId') childId: string,
    @Req() req: any,
    @Query('days') days?: string,
  ): Promise<RecallAuditSummary> {
    const viewer = req?.user ?? {};
    const viewerType = String(viewer.type ?? '');
    const viewerId = Number(viewer.sub);
    const target = Number(childId);

    if (viewerType !== 'parent' || !Number.isFinite(viewerId) || !Number.isFinite(target)) {
      throw new ForbiddenException('只有家长可以查看记忆工具的运行数据');
    }
    if (!(await this.users.canAccessChild(viewerId, viewerType, target))) {
      throw new ForbiddenException('无权查看该孩子的数据');
    }

    return this.audits.summarize(target, Number(days) || 14);
  }
}
