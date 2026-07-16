import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoDownload } from '../../database/entities/video-download.entity';
import { VideoDownloadService } from './video-download.service';
import { VideoDownloadController } from './video-download.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VideoDownload])],
  providers: [VideoDownloadService],
  controllers: [VideoDownloadController],
  exports: [VideoDownloadService],
})
export class VideoDownloadModule {}
