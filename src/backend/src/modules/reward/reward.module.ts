import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BehaviorTemplate } from '../../database/entities/behavior-template.entity';
import { PointRecord } from '../../database/entities/point-record.entity';
import { Gift } from '../../database/entities/gift.entity';
import { RedemptionRecord } from '../../database/entities/redemption-record.entity';
import { RewardService } from './reward.service';
import { RewardController } from './reward.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BehaviorTemplate, PointRecord, Gift, RedemptionRecord]),
    UsersModule,
  ],
  providers: [RewardService],
  controllers: [RewardController],
  exports: [RewardService],
})
export class RewardModule {}
