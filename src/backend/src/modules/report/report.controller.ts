import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportService } from './report.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('report')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async generateReport(
    @Query('userId') userId: string,
    @Query('period') period: 'daily' | 'weekly' | 'monthly' = 'weekly',
  ) {
    return this.reportService.generateReport({
      userId: +userId,
      period,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('trend')
  async getAbilityTrend(
    @Query('userId') userId: string,
    @Query('weeks') weeks: string = '6',
  ) {
    return this.reportService.getAbilityTrend(+userId, +weeks);
  }

  @UseGuards(JwtAuthGuard)
  @Get('recent-skills')
  async getRecentSkills(
    @Query('userId') userId: string,
    @Query('limit') limit: string = '3',
  ) {
    return this.reportService.getRecentMasteredSkills(+userId, +limit);
  }
}