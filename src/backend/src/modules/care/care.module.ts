import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CareCue } from './care-cue.entity';
import { CareService } from './care.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([CareCue])],
  providers: [CareService],
  exports: [CareService],
})
export class CareModule {}
