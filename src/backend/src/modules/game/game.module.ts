import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningRecord } from '../../database/entities/learning-record.entity';
import { Content } from '../../database/entities/content.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LearningRecord, Content])],
  providers: [GameService],
  controllers: [GameController],
  exports: [GameService],
})
export class GameModule {}