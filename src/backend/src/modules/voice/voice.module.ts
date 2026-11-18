import { Module, forwardRef } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { ReadAloudService } from './read-aloud.service';
import { VoiceController } from './voice.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [forwardRef(() => AiModule)],
  providers: [VoiceService, ReadAloudService],
  controllers: [VoiceController],
  exports: [VoiceService],
})
export class VoiceModule {}
