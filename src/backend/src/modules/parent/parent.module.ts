import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParentControl } from '../../database/entities/parent-control.entity';
import { ParentService } from './parent.service';
import { ParentController } from './parent.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ParentControl])],
  providers: [ParentService],
  controllers: [ParentController],
  exports: [ParentService],
})
export class ParentModule {}