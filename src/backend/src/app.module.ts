import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ContentsModule } from './modules/contents/contents.module';
import { LearningModule } from './modules/learning/learning.module';
import { AbilitiesModule } from './modules/abilities/abilities.module';
import { AchievementsModule } from './modules/achievements/achievements.module';
import { AiModule } from './modules/ai/ai.module';
import { ParentModule } from './modules/parent/parent.module';
import { RecommendModule } from './modules/recommend/recommend.module';
import { ReportModule } from './modules/report/report.module';
import { GameModule } from './modules/game/game.module';
import { VoiceModule } from './modules/voice/voice.module';
import { NotificationModule } from './modules/notification/notification.module';
import { SseModule } from './modules/sse/sse.module';
import { AssignmentModule } from './modules/assignment/assignment.module';
import { EmergencyModule } from './modules/emergency/emergency.module';
import { DatabaseSeederModule } from './database/seeds/seeder.module';

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // 数据库模块 (SQLite for testing)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): any => ({
        type: 'better-sqlite3',
        database: configService.get('DB_PATH', 'lingxi.db'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true, // 开发环境自动建表
        logging: configService.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),
    
    // 功能模块
    AuthModule,
    UsersModule,
    ContentsModule,
    LearningModule,
    AbilitiesModule,
    AchievementsModule,
    AiModule,
    ParentModule,
    RecommendModule,
    ReportModule,
    GameModule,
    VoiceModule,
    NotificationModule,
    SseModule,
    AssignmentModule,
    EmergencyModule,
    DatabaseSeederModule,
  ],
})
export class AppModule {}