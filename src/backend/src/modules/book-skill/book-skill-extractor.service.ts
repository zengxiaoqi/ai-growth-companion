import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { BookSkill } from './book-skill.entity';
import { BookSkillService } from './book-skill.service';

const execAsync = promisify(exec);

/**
 * Book-skill extractor — runs content extraction asynchronously.
 *
 * Currently uses a Node.js-based extraction path (pdf-parse for PDFs).
 * A future upgrade can integrate the full book-to-skill Python pipeline.
 */
@Injectable()
export class BookSkillExtractorService {
  private readonly logger = new Logger(BookSkillExtractorService.name);

  constructor(
    @InjectRepository(BookSkill)
    private readonly bookRepo: Repository<BookSkill>,
    private readonly bookSkillService: BookSkillService,
  ) {}

  /**
   * Extract content from a book file asynchronously.
   * Called after upload; runs in the background.
   */
  async extract(bookId: number, absoluteFilePath: string): Promise<void> {
    this.logger.log(`Starting extraction for book ${bookId}: ${absoluteFilePath}`);

    try {
      // Try Python extractor first (if available)
      const pythonScript = join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        '..',
        'scripts',
        'book-extract.py',
      );
      if (existsSync(pythonScript)) {
        await this.extractWithPython(bookId, absoluteFilePath, pythonScript);
        return;
      }

      // Fallback: Node.js built-in extraction
      await this.extractWithNode(bookId, absoluteFilePath);
    } catch (err) {
      this.logger.error(`Extraction failed for book ${bookId}: ${err.message}`);
      await this.bookSkillService.updateStatus(bookId, {
        status: 'failed',
        errorMessage: err.message,
      });
    }
  }

  /** Extract using the Python book-extract.py script */
  private async extractWithPython(
    bookId: number,
    filePath: string,
    scriptPath: string,
  ): Promise<void> {
    this.logger.log(`Running Python extractor for book ${bookId}`);

    const { stdout, stderr } = await execAsync(
      `python3 "${scriptPath}" --file "${filePath}" --id ${bookId}`,
      { timeout: 300000 }, // 5 min timeout
    );

    if (stderr) {
      this.logger.warn(`Python extractor stderr: ${stderr}`);
    }

    // Parse JSON output
    let result: any;
    try {
      result = JSON.parse(stdout);
    } catch {
      throw new Error(`Python extractor output is not valid JSON: ${stdout.slice(0, 200)}`);
    }

    // Save extracted data
    await this.bookSkillService.saveChapters(bookId, result.chapters || []);
    await this.bookSkillService.saveTerms(bookId, result.terms || []);
    await this.bookSkillService.savePatterns(bookId, result.patterns || []);

    await this.bookSkillService.updateStatus(bookId, {
      status: 'ready',
      title: result.title || undefined,
      author: result.author || undefined,
      description: result.description || undefined,
      totalChapters: result.chapters?.length || 0,
      ageGroup: result.ageGroup || undefined,
    });

    this.logger.log(`Python extraction completed for book ${bookId}`);
  }

  /** Fallback: Node.js built-in extraction (pdf-parse for PDFs, text for TXT) */
  private async extractWithNode(bookId: number, filePath: string): Promise<void> {
    this.logger.log(`Running Node.js extractor for book ${bookId}`);

    const ext = filePath.toLowerCase().split('.').pop();
    let fullText = '';

    if (ext === 'txt' || ext === 'md') {
      fullText = readFileSync(filePath, 'utf-8');
    } else if (ext === 'pdf') {
      // Try pdf-parse if available
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pdfParse = require('pdf-parse');
        const dataBuffer = readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        fullText = pdfData.text;
      } catch {
        // pdf-parse may not be installed — fall back to pdftotext
        try {
          const { stdout } = await execAsync(`pdftotext "${filePath}" -`, { timeout: 60000 });
          fullText = stdout;
        } catch {
          this.logger.warn('pdftotext not available, trying pdfminer...');
          const { stdout } = await execAsync(
            `python3 -c "import sys; from pdfminer.high_level import extract_text; print(extract_text(sys.argv[1]))" "${filePath}"`,
            { timeout: 120000 },
          );
          fullText = stdout;
        }
      }
    } else {
      // For other formats (epub, docx, rtf), try Calibre's ebook-convert
      try {
        const { stdout } = await execAsync(
          `ebook-convert "${filePath}" /tmp/book_skill_${bookId}.txt --txt-version 1 2>/dev/null && cat /tmp/book_skill_${bookId}.txt`,
          { timeout: 120000 },
        );
        fullText = stdout;
      } catch {
        throw new Error(`不支持的格式或无法提取内容: ${ext}`);
      }
    }

    if (!fullText || fullText.trim().length < 50) {
      throw new Error('提取内容过少，可能文件为空或格式不支持');
    }

    // Truncate to avoid token overflow (max 200K chars)
    fullText = fullText.slice(0, 200000);

    // Generate a simple chapter structure from the text
    // For now, create a single "全部内容" chapter
    const chapters = [
      {
        index: 1,
        title: '全部内容',
        summary: fullText.slice(0, 5000) + (fullText.length > 5000 ? '...' : ''),
        content: fullText,
        keyPoints: JSON.stringify([]),
      },
    ];

    await this.bookSkillService.saveChapters(bookId, chapters);
    await this.bookSkillService.updateStatus(bookId, {
      status: 'ready',
      totalChapters: 1,
    });

    this.logger.log(`Node.js extraction completed for book ${bookId} (${fullText.length} chars)`);
  }
}
