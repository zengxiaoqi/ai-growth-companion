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
}