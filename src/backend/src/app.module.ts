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
import { RewardModule } from './modules/reward/reward.module';
import { VideoDownloadModule } from './modules/video-download/video-download.module';
import { PoetryModule } from './modules/poetry/poetry.module';
import { PublicApiModule } from './modules/public-api/public-api.module';
import { BentoModule } from './modules/bento/bento.module';
import { BookSkillModule } from './modules/book-skill/book-skill.module';
import { DatabaseSeederModule } from './database/seeds/seeder.module';
import { HealthModule } from './modules/health/health.module';
import { SafetyModule } from './modules/safety/safety.module';
import { MemoryModule } from './modules/memory/memory.module';
import { CareModule } from './modules/care/care.module';
import { AppUpdateModule } from './modules/app-update/app-update.module';
import { resolveSynchronize } from './database/resolve-synchronize';

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
        const synchronize = resolveSynchronize(configService);
        Logger.log(
          `Schema mode: synchronize=${synchronize}, migrationsRun=${!synchronize}` +
            (synchronize
              ? ' (never enable this in production)'
              : ' (schema is owned by migrations)'),
          'AppModule',
        );

        // PostgreSQL (Railway 生产环境)
        if (databaseUrl) {
          return {
            type: 'postgres',
            url: databaseUrl,
            entities: [__dirname + '/**/*.entity{.ts,.js}'],
            migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
            migrationsRun: !synchronize,
            synchronize,
            ssl:
              configService.get('NODE_ENV') === 'production'
                ? { rejectUnauthorized: false }
                : false,
            // Log only errors/warnings to prevent log flooding from
            // periodic query polling (e.g. video generation task queue).
            logging: ['error', 'warn'],
          };
        }

        // SQLite (本地开发 / 测试)
        // Prefer the faster native better-sqlite3 driver, but gracefully
        // fall back to sql.js when native bindings cannot be loaded
        // (see https://github.com/zengxiaoqi/ai-growth-companion/issues/19).
        const driver = resolveSqliteDriver();

        if (driver === 'sqljs') {
          const dbPath = configService.get('DB_PATH', 'lingxi.db');
          Logger.log(`sql.js fallback: using file-based database at ${dbPath}`, 'AppModule');
          return {
            type: 'sqljs',
            // `location` is the file; `database` would have to be a
            // Uint8Array. Passing the path as `database` left the driver
            // with neither option set, so it threw
            // "Driver option (location or autoSaveCallback) is not set"
            // and the app could not boot at all on a machine without the
            // better-sqlite3 native addon — the exact case this fallback
            // exists for.
            location: dbPath,
            entities: [__dirname + '/**/*.entity{.ts,.js}'],
            migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
            migrationsRun: !synchronize,
            synchronize,
            autoSave: true,
            logging: ['error', 'warn'],
          };
        }

        return {
          type: 'better-sqlite3',
          database: configService.get('DB_PATH', 'lingxi.db'),
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
          migrationsRun: !synchronize,
          synchronize,
          logging: ['error', 'warn'],
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
    RewardModule,
    VideoDownloadModule,
    PoetryModule,
    PublicApiModule,
    BentoModule,
    BookSkillModule,
    SafetyModule,
    MemoryModule,
    CareModule,
    AppUpdateModule,
    DatabaseSeederModule,
    HealthModule,
  ],
})
export class AppModule {}
