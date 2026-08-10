import { Injectable, Logger } from '@nestjs/common';
import { BookSkillService } from '../../../book-skill/book-skill.service';

@Injectable()
export class GenerateBookLessonTool {
  private readonly logger = new Logger(GenerateBookLessonTool.name);

  constructor(private readonly bookSkillService: BookSkillService) {}

  async execute(args: {
    bookId: number;
    chapterIndex?: number;
    childId: number;
    difficulty?: 'easy' | 'medium' | 'hard';
  }): Promise<string> {
    try {
      const { bookId, chapterIndex, childId, difficulty = 'easy' } = args;

      // Load book content
      const book = await this.bookSkillService.getDetail(bookId);
      const chapters = await this.bookSkillService.getChapters(bookId, true);
      const terms = await this.bookSkillService.getTerms(bookId);
      const patterns = await this.bookSkillService.getPatterns(bookId);

      // Filter to specific chapter if requested
      let targetChapters = chapters;
      if (chapterIndex != null) {
        targetChapters = chapters.filter((ch) => ch.index === chapterIndex);
      }

      if (targetChapters.length === 0) {
        return JSON.stringify({ error: '未找到指定章节' });
      }

      // Build structured lesson content from book data
      const lesson = {
        type: 'book_lesson',
        bookTitle: book.title,
        sources: targetChapters.map((ch) => ({
          title: ch.title,
          summary: ch.summary,
          keyPoints: ch.keyPoints,
        })),
        terms: terms.map((t) => ({
          term: t.term,
          definition: t.definition,
        })),
        patterns: patterns.map((p) => ({
          name: p.name,
          description: p.description,
        })),
        difficulty,
        childId,
        // Suggest quiz questions based on chapter content
        suggestedQuestions: targetChapters.map((ch) => ({
          chapter: ch.title,
          question: `关于"${ch.title}"，你能告诉我学到了什么吗？`,
        })),
      };

      return JSON.stringify(lesson);
    } catch (error) {
      this.logger.error(`GenerateBookLesson failed: ${error.message}`);
      return JSON.stringify({ error: `生成课程失败: ${error.message}` });
    }
  }
}
