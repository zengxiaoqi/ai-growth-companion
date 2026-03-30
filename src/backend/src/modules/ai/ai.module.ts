import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { UsersModule } from '../users/users.module';
import { ContentSafetyService } from '../../common/services/content-safety.service';

@Module({
  imports: [UsersModule],
  providers: [AiService, ContentSafetyService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}