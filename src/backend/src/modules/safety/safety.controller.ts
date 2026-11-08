import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SafetyService } from './safety.service';
import type { SafetyEvent } from './safety-event.entity';

/**
 * Parent-facing read of the safety audit trail.
 *
 * The excerpt is stripped here on purpose: the parent gets "there was an
 * event, at this time, of this kind", which is what a doorbell should
 * say. The matched words stay in the database for calibration only —
 * surfacing them would turn the safety net into a transcript reader.
 */
@ApiTags('安全事件')
@Controller('safety')
@UseGuards(JwtAuthGuard)
export class SafetyController {
  constructor(private readonly safetyService: SafetyService) {}

  @Get('events/:childId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取某个孩子的安全事件列表（不含原文片段）' })
  async listForChild(
    @Param('childId') childId: string,
    @Query('limit') limit?: string,
  ): Promise<Array<Omit<SafetyEvent, 'excerpt'>>> {
    const events = await this.safetyService.listEvents(+childId, Number(limit) || 20);
    return events.map(toPublicEvent);
  }

  @Get('events/parent/:parentId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取某位家长名下所有孩子的安全事件' })
  async listForParent(
    @Param('parentId') parentId: string,
    @Query('limit') limit?: string,
  ): Promise<Array<Omit<SafetyEvent, 'excerpt'>>> {
    const events = await this.safetyService.listEventsForParent(
      +parentId,
      Number(limit) || 20,
    );
    return events.map(toPublicEvent);
  }
}

function toPublicEvent(event: SafetyEvent): Omit<SafetyEvent, 'excerpt'> {
  const { excerpt: _excerpt, ...rest } = event;
  return rest;
}
