import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookSkill } from './book-skill.entity';
import { BookSkillChapter } from './book-skill-chapter.entity';
import { BookSkillTerm } from './book-skill-term.entity';
import { BookSkillPattern } from './book-skill-pattern.entity';
import { BookSkillController } from './book-skill.controller';
import { BookSkillService } from './book-skill.service';
import { BookSkillExtractorService } from './book-skill-extractor.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BookSkill, BookSkillChapter, BookSkillTerm, BookSkillPattern]),
  ],
  controllers: [BookSkillController],
  providers: [BookSkillService, BookSkillExtractorService],
  exports: [BookSkillService],
})
export class BookSkillModule {}
