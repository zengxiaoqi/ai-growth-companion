import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PoetryService } from './poetry.service';
import { PoetryAnnotationService } from './poetry-annotation.service';
import { PoetryController } from './poetry.controller';
import { PoetryGameService } from './poetry-game.service';
import { PoetryGameController } from './poetry-game.controller';
import { Poem } from './entities/poem.entity';
import { Author } from './entities/author.entity';
import { Dynasty } from './entities/dynasty.entity';
import { PoemAnnotationRecord } from './entities/poem-annotation.entity';

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
    // 注解持久化表注册到默认（主库）连接
    TypeOrmModule.forFeature([PoemAnnotationRecord]),
  ],
  providers: [PoetryService, PoetryAnnotationService, PoetryGameService],
  controllers: [PoetryController, PoetryGameController],
  exports: [PoetryService, PoetryAnnotationService, PoetryGameService],
})
export class PoetryModule {}
