import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BentoService } from './bento.service';
import { BentoController } from './bento.controller';
import { BentoFileGenerator } from './generators/bento-file.generator';
import { ReportWeeklyTemplate } from './templates/report-weekly';

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
  ],
  providers: [BentoService, BentoFileGenerator, ReportWeeklyTemplate],
  controllers: [BentoController],
  exports: [BentoService],
})
export class BentoModule {}
