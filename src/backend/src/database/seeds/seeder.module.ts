import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Content } from '../entities/content.entity';
import { DatabaseSeederService } from './seeder.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Content])],
  providers: [DatabaseSeederService],
  exports: [DatabaseSeederService],
})
export class DatabaseSeederModule {}