import { Module } from '@nestjs/common';
import { BentoService } from './bento.service';
import { BentoController } from './bento.controller';
import { BentoFileGenerator } from './generators/bento-file.generator';
import { ReportWeeklyTemplate } from './templates/report-weekly';

@Module({
  providers: [BentoService, BentoFileGenerator, ReportWeeklyTemplate],
  controllers: [BentoController],
  exports: [BentoService],
})
export class BentoModule {}
