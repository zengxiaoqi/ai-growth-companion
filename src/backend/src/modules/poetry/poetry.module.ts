import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PoetryService } from './poetry.service';
import { PoetryController } from './poetry.controller';
import { PoetryGameService } from './poetry-game.service';
import { PoetryGameController } from './poetry-game.controller';
import { Poem } from './entities/poem.entity';
import { Author } from './entities/author.entity';
import { Dynasty } from './entities/dynasty.entity';

@Module({
  imports: [
    // 诗词数据库连接（只读外部 SQLite）
    TypeOrmModule.forRootAsync({
      name: 'poetry',
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'sqlite',
        database: configService.get('POETRY_DB_PATH', 'poetry.db'),
        entities: [Poem, Author, Dynasty],
        synchronize: false, // 只读外部数据库
        logging: false,
      }),
      inject: [ConfigService],
    }),
    // 注册实体到 poetry 连接
    TypeOrmModule.forFeature([Poem, Author, Dynasty], 'poetry'),
  ],
  providers: [PoetryService, PoetryGameService],
  controllers: [PoetryController, PoetryGameController],
  exports: [PoetryService, PoetryGameService],
})
export class PoetryModule {}
