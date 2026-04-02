import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmergencyService } from './emergency.service';

@ApiTags('紧急呼叫')
@Controller('emergency')
@UseGuards(JwtAuthGuard)
export class EmergencyController {
  constructor(private emergencyService: EmergencyService) {}

  @Post('trigger')
  @ApiBearerAuth()
  @ApiOperation({ summary: '触发紧急呼叫（短信+语音通知家长）' })
  async trigger(@Body() body: { childId: number }) {
    return this.emergencyService.triggerEmergencyCall(body.childId);
  }

  @Get('history/:childId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取紧急呼叫历史' })
  async getHistory(@Param('childId') childId: string) {
    return this.emergencyService.getHistory(+childId);
  }
}
