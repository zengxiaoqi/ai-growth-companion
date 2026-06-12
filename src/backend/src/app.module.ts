import { Module, Logger } from '@nestjs/common';
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

/**
 * Detect whether better-sqlite3 native bindings are available.
 * Falls back to sql.js (pure JS) when the native module fails to load
 * (e.g. Node.js version mismatch, missing native build, CI environments).
 */
function resolveSqliteDriver(): 'better-sqlite3' | 'sqljs' {
  try {
    // Attempt to instantiate a throwaway in-memory database to verify the
    // native addon loads correctly.  A plain `require()` is not enough
    // because the module object always exists – the failure happens when
    // the constructor tries to dlopen the `.node` binary.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3');
    const probe = new Database(':memory:');
    probe.close();
    return 'better-sqlite3';
  } catch (err) {
    Logger.warn(
      `better-sqlite3 native bindings unavailable (${(err as Error).message}). ` +
        'Falling back to sql.js (pure JS SQLite).',
      'AppModule',
    );
    return 'sqljs';
  }
}

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // 数据库模块 (SQLite 开发 / PostgreSQL 生产)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): any => {
        const databaseUrl = configService.get('DATABASE_URL');

        // PostgreSQL (Railway 生产环境)
        if (databaseUrl) {
          return {
            type: 'postgres',
            url: databaseUrl,
            entities: [__dirname + '/**/*.entity{.ts,.js}'],
            synchronize: true,
            ssl:
              configService.get('NODE_ENV') === 'production'
                ? { rejectUnauthorized: false }
                : false,
            logging: configService.get('NODE_ENV') === 'development',
          };
        }

        // SQLite (本地开发 / 测试)
        // Prefer the faster native better-sqlite3 driver, but gracefully
        // fall back to sql.js when native bindings cannot be loaded
        // (see https://github.com/zengxiaoqi/ai-growth-companion/issues/19).
        const driver = resolveSqliteDriver();

        if (driver === 'sqljs') {
          return {
            type: 'sqljs',
            entities: [__dirname + '/**/*.entity{.ts,.js}'],
            synchronize: true,
            logging: configService.get('NODE_ENV') === 'development',
          };
        }

        return {
          type: 'better-sqlite3',
          database: configService.get('DB_PATH', 'lingxi.db'),
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: true,
          logging: configService.get('NODE_ENV') === 'development',
        };
      },
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
