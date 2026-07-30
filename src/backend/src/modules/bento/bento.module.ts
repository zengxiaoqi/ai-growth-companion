import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BentoService } from './bento.service';
import { BentoController } from './bento.controller';
import { BentoFileGenerator } from './generators/bento-file.generator';
import { BentoJsonGenerator } from './generators/bento-json.generator';
import { ReportWeeklyTemplate } from './templates/report-weekly';
import { ReportMonthlyTemplate } from './templates/report-monthly';
import { PoetryTemplate } from './templates/poetry';
import { LessonPackTemplate } from './templates/lesson-pack';
import { AchievementTemplate } from './templates/achievement';
import { SemesterReportTemplate } from './templates/semester-report';
import { ReportModule } from '../report/report.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET', 'lingxi-secret-key'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    ReportModule,
    UsersModule,
  ],
  providers: [
    BentoService,
    BentoFileGenerator,
    BentoJsonGenerator,
    ReportWeeklyTemplate,
    ReportMonthlyTemplate,
    PoetryTemplate,
    LessonPackTemplate,
    AchievementTemplate,
    SemesterReportTemplate,
  ],
  controllers: [BentoController],
  exports: [BentoService],
})
export class BentoModule {}
