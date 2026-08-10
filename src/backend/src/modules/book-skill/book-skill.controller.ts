import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BookSkillService } from './book-skill.service';
import { BookSkillExtractorService } from './book-skill-extractor.service';

@Controller('book-skill')
@UseGuards(JwtAuthGuard)
export class BookSkillController {
  private readonly logger = new Logger(BookSkillController.name);

  constructor(
    private readonly bookSkillService: BookSkillService,
    private readonly extractorService: BookSkillExtractorService,
  ) {}

  /** Ensure upload directory exists */
  private ensureUploadDir(): string {
    const uploadDir = join(__dirname, '..', '..', '..', 'public', 'uploads', 'books');
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }
    return uploadDir;
  }

  /** POST /api/book-skill/upload — upload a book file (PDF/EPUB/DOCX/TXT) */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: any, file: any, cb: any) => {
          const uploadDir = join(__dirname, '..', '..', '..', 'public', 'uploads', 'books');
          if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
          cb(null, uploadDir);
        },
        filename: (req: any, file: any, cb: any) => {
          const ext = extname(file.originalname).toLowerCase();
          // Sanitize filename: keep only alphanumeric, dots, and hyphens
          const base = file.originalname
            .replace(ext, '')
            .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');
          cb(null, `${base}_${Date.now()}${ext}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
      fileFilter: (req: any, file: any, cb: any) => {
        const allowed = ['.pdf', '.epub', '.docx', '.txt', '.md', '.rtf'];
        const ext = extname(file.originalname).toLowerCase();
        if (!allowed.includes(ext)) {
          return cb(
            new HttpException(
              '不支持的文件格式，仅支持 PDF/EPUB/DOCX/TXT/MD/RTF',
              HttpStatus.BAD_REQUEST,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @Req() req: any,
    @UploadedFile() file: any,
    @Body('title') title?: string,
    @Body('ageGroup') ageGroup?: string,
    @Body('author') author?: string,
  ) {
    if (!file) throw new HttpException('请选择文件', HttpStatus.BAD_REQUEST);

    const userId = req.user.sub as number;
    const ext = extname(file.originalname).toLowerCase().replace('.', '');
    const bookTitle = title?.trim() || file.originalname.replace(extname(file.originalname), '');

    // Create DB record
    const book = await this.bookSkillService.create({
      title: bookTitle,
      author: author?.trim() || undefined,
      filePath: `/uploads/books/${file.filename}`,
      fileType: ext,
      fileSize: file.size,
      uploaderId: userId,
      ageGroup: ageGroup || undefined,
    });

    this.logger.log(`Book uploaded: id=${book.id}, file=${file.filename}, title=${bookTitle}`);

    // Trigger async extraction (non-blocking)
    this.extractorService.extract(book.id, file.path).catch((err) => {
      this.logger.error(`Extraction failed for book ${book.id}: ${err.message}`);
      this.bookSkillService.updateStatus(book.id, {
        status: 'failed',
        errorMessage: err.message,
      });
    });

    return {
      id: book.id,
      title: book.title,
      filePath: book.filePath,
      fileType: book.fileType,
      fileSize: book.fileSize,
      status: 'processing',
      message: '文件上传成功，正在提取内容...',
    };
  }

  /** GET /api/book-skill/list — list books */
  @Get('list')
  async list(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('ageGroup') ageGroup?: string,
    @Query('status') status?: string,
  ) {
    const userId = req.user.sub as number;
    const userType = req.user.type as string;

    // Parents see their own uploads; children see all ready books
    const uploaderId = userType === 'parent' ? userId : undefined;

    return this.bookSkillService.list({
      uploaderId,
      ageGroup,
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? Math.min(parseInt(limit, 10), 50) : 20,
    });
  }

  /** GET /api/book-skill/:id — book detail */
  @Get(':id')
  async detail(@Param('id') id: string) {
    const book = await this.bookSkillService.getDetail(parseInt(id, 10));
    // Record view
    await this.bookSkillService.recordView(book.id);
    return book;
  }

  /** GET /api/book-skill/:id/chapters — chapters list */
  @Get(':id/chapters')
  async chapters(@Param('id') id: string, @Query('withContent') withContent?: string) {
    return this.bookSkillService.getChapters(parseInt(id, 10), withContent === 'true');
  }

  /** GET /api/book-skill/:id/chapters/:index — single chapter */
  @Get(':id/chapters/:index')
  async chapter(@Param('id') id: string, @Param('index') index: string) {
    return this.bookSkillService.getChapter(parseInt(id, 10), parseInt(index, 10));
  }

  /** GET /api/book-skill/:id/terms — terms list */
  @Get(':id/terms')
  async terms(@Param('id') id: string) {
    return this.bookSkillService.getTerms(parseInt(id, 10));
  }

  /** GET /api/book-skill/:id/patterns — patterns list */
  @Get(':id/patterns')
  async patterns(@Param('id') id: string) {
    return this.bookSkillService.getPatterns(parseInt(id, 10));
  }

  /** GET /api/book-skill/search?q=xxx — full-text search */
  @Get('search')
  async search(
    @Query('q') q: string,
    @Query('bookId') bookId?: string,
    @Query('ageGroup') ageGroup?: string,
  ) {
    if (!q?.trim()) throw new BadRequestException('搜索关键词不能为空');
    return this.bookSkillService.search(q, {
      bookId: bookId ? parseInt(bookId, 10) : undefined,
      ageGroup,
    });
  }

  /** DELETE /api/book-skill/:id — delete a book */
  @Delete(':id')
  async delete(@Req() req: any, @Param('id') id: string) {
    await this.bookSkillService.delete(parseInt(id, 10), req.user.sub);
    return { deleted: true };
  }
}
