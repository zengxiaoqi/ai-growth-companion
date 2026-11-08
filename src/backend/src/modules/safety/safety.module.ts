import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationModule } from '../notification/notification.module';
import { UsersModule } from '../users/users.module';
import { SafetyClassifier } from './safety-classifier.service';
import { SafetyController } from './safety.controller';
import { SafetyDetector } from './safety-detector.service';
import { SafetyEvent } from './safety-event.entity';
import { SafetyService } from './safety.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([SafetyEvent]),
    NotificationModule,
    UsersModule,
  ],
  providers: [SafetyDetector, SafetyClassifier, SafetyService],
  controllers: [SafetyController],
  exports: [SafetyService, SafetyDetector],
})
export class SafetyModule {}
