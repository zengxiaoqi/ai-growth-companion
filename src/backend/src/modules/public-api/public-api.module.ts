import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PublicApiService } from './public-api.service';
import { PublicApiController } from './public-api.controller';
import { Fruit } from '../../database/entities/fruit.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Fruit])],
  providers: [PublicApiService],
  controllers: [PublicApiController],
  exports: [PublicApiService],
})
export class PublicApiModule {}
