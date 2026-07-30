import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { BentoFileGenerator } from './generators/bento-file.generator';
import { BentoJsonGenerator } from './generators/bento-json.generator';
import { ReportWeeklyTemplate } from './templates/report-weekly';
import { ReportMonthlyTemplate } from './templates/report-monthly';
import { PoetryTemplate } from './templates/poetry';
import { LessonPackTemplate } from './templates/lesson-pack';
import { AchievementTemplate } from './templates/achievement';
import { SemesterReportTemplate } from './templates/semester-report';
import {
  ReportData,
  PoetryData,
  ContentSlideData,
  AchievementData,
  SemesterData,
} from './interfaces/bento-template.interface';
import { Slide, Theme } from './interfaces/bento-document.interface';

const OUTPUT_DIR = path.resolve(process.cwd(), 'bento-output');
const INDEX_PATH = path.resolve(OUTPUT_DIR, '.index.json');
/** 文件保留时间：7 天 */
const FILE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

interface FileRecord {
  fileId: string;
  fileName: string;
  path: string;
  createdAt: string; // ISO string
}

interface ContentHashEntry {
  hash: string;
  fileId: string;
  template: string;
  createdAt: string;
}

@Injectable()
export class BentoService implements OnModuleDestroy {
  private readonly logger = new Logger(BentoService.name);
  private readonly fileRegistry = new Map<string, FileRecord>();
  /** contentHash → fileId */
  private readonly cacheIndex = new Map<string, ContentHashEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private indexLoaded = false;

  constructor(
    private readonly bentoFileGenerator: BentoFileGenerator,
    private readonly bentoJsonGenerator: BentoJsonGenerator,
    private readonly reportWeeklyTemplate: ReportWeeklyTemplate,
    private readonly reportMonthlyTemplate: ReportMonthlyTemplate,
    private readonly poetryTemplate: PoetryTemplate,
    private readonly lessonPackTemplate: LessonPackTemplate,
    private readonly achievementTemplate: AchievementTemplate,
    private readonly semesterReportTemplate: SemesterReportTemplate,
  ) {
    // 启动时从磁盘恢复索引
    this.restoreRegistry().then(() => {
      // 索引加载后执行首次清理，每小时再执行一次
      this.cleanup();
      this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 60 * 1000);
    });
  }

  // ── 索引持久化 ──

  private async restoreRegistry(): Promise<void> {
    try {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      const raw = await fs.readFile(INDEX_PATH, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.files)) {
        for (const rec of data.files) {
          this.fileRegistry.set(rec.fileId, rec);
        }
      }
      if (Array.isArray(data.cache)) {
        for (const entry of data.cache) {
          this.cacheIndex.set(entry.hash, entry);
        }
      }
      this.logger.log(
        `Restored registry: ${this.fileRegistry.size} files, ${this.cacheIndex.size} cache entries`,
      );
    } catch {
      this.logger.log('No existing index found, starting fresh');
    }
    this.indexLoaded = true;
  }

  private async persistIndex(): Promise<void> {
    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      files: Array.from(this.fileRegistry.values()),
      cache: Array.from(this.cacheIndex.values()),
    };
    await fs.writeFile(INDEX_PATH, JSON.stringify(data, null, 2), 'utf-8');
  }

  // ── 缓存 ──

  private computeContentHash(template: string, data: unknown): string {
    const hash = createHash('sha256');
    hash.update(template);
    hash.update(JSON.stringify(data, Object.keys(data as object).sort()));
    return hash.digest('hex').slice(0, 16);
  }

  private async checkCache(
    template: string,
    data: unknown,
    _childId?: number,
  ): Promise<string | null> {
    const hash = this.computeContentHash(template, data);
    const entry = this.cacheIndex.get(hash);
    if (!entry) return null;

    // 验证文件仍然存在
    const record = this.fileRegistry.get(entry.fileId);
    if (!record) {
      this.cacheIndex.delete(hash);
      return null;
    }
    try {
      await fs.access(record.path);
    } catch {
      this.cacheIndex.delete(hash);
      this.fileRegistry.delete(entry.fileId);
      return null;
    }

    this.logger.debug(`Cache hit for ${template} (hash=${hash}) → ${entry.fileId}`);
    return entry.fileId;
  }

  // ── 报告生成（带缓存） ──

  async generateReport(
    childId: number,
    period: 'daily' | 'weekly' | 'monthly',
    reportData: ReportData,
  ): Promise<string> {
    // 防御性处理：确保 skillProgress 等字段不为空
    if (!reportData.skillProgress) reportData.skillProgress = {};
    if (!reportData.dailyStats) reportData.dailyStats = [];
    if (!reportData.achievements) reportData.achievements = [];
    if (!reportData.insights) reportData.insights = [];
    if (!reportData.encouragement) reportData.encouragement = '继续加油！🌟';
    if (!reportData.childName) reportData.childName = '小朋友';
    if (!reportData.period) reportData.period = period;
    if (!reportData.startDate) reportData.startDate = '';
    if (!reportData.endDate) reportData.endDate = '';
    // 检查缓存
    const cached = await this.checkCache(`report:${period}`, reportData, childId);
    if (cached) return cached;

    const fileId = uuidv4();
    const fileName = `report-${childId}-${period}-${fileId.slice(0, 8)}.bento.html`;

    try {
      const template =
        period === 'monthly' ? this.reportMonthlyTemplate : this.reportWeeklyTemplate;
      const theme = template.defaultTheme();
      const slides = template.toSlides(reportData as any, theme);

      const doc = this.bentoJsonGenerator.assemble(
        fileId,
        `${reportData.childName} 的学习报告 - ${reportData.period}`,
        slides,
        theme,
        { readonly: true },
      );

      const filePath = await this.bentoFileGenerator.generate(doc, fileName);
      await this.registerFile(fileId, fileName, filePath);
      this.cacheIndex.set(this.computeContentHash(`report:${period}`, reportData), {
        hash: this.computeContentHash(`report:${period}`, reportData),
        fileId,
        template: `report:${period}`,
        createdAt: new Date().toISOString(),
      });
      await this.persistIndex();
      return fileId;
    } catch (err: any) {
      this.logger.warn(`Bento generation failed, falling back to plain HTML: ${err.message}`);
      const fallbackPath = await this.generateFallbackHtml(reportData, fileName);
      await this.registerFile(fileId, fileName, fallbackPath);
      await this.persistIndex();
      return fileId;
    }
  }

  async generatePoetrySlide(poetryData: PoetryData): Promise<string> {
    const cached = await this.checkCache('poetry', poetryData);
    if (cached) return cached;

    const fileId = uuidv4();
    const fileName = `poetry-${poetryData.poemId}-${fileId.slice(0, 8)}.bento.html`;

    const theme = this.poetryTemplate.defaultTheme();
    const slides = this.poetryTemplate.toSlides(poetryData, theme);

    const doc = this.bentoJsonGenerator.assemble(
      fileId,
      `${poetryData.title} — ${poetryData.author}`,
      slides,
      theme,
      { readonly: true, meta: { author: poetryData.author, subject: '诗词鉴赏' } },
    );

    const filePath = await this.bentoFileGenerator.generate(doc, fileName);
    await this.registerFile(fileId, fileName, filePath);
    this.cacheIndex.set(this.computeContentHash('poetry', poetryData), {
      hash: this.computeContentHash('poetry', poetryData),
      fileId,
      template: 'poetry',
      createdAt: new Date().toISOString(),
    });
    await this.persistIndex();
    return fileId;
  }

  async generateContentSlide(contentData: ContentSlideData): Promise<string> {
    const cached = await this.checkCache('lesson', contentData);
    if (cached) return cached;

    const fileId = uuidv4();
    const fileName = `lesson-${fileId.slice(0, 8)}.bento.html`;

    const theme = this.lessonPackTemplate.defaultTheme();
    const slides = this.lessonPackTemplate.toSlides(contentData, theme);

    const doc = this.bentoJsonGenerator.assemble(fileId, contentData.title, slides, theme, {
      readonly: true,
    });

    const filePath = await this.bentoFileGenerator.generate(doc, fileName);
    await this.registerFile(fileId, fileName, filePath);
    this.cacheIndex.set(this.computeContentHash('lesson', contentData), {
      hash: this.computeContentHash('lesson', contentData),
      fileId,
      template: 'lesson',
      createdAt: new Date().toISOString(),
    });
    await this.persistIndex();
    return fileId;
  }

  async generateAchievementSlide(
    achievementData: AchievementData,
    options?: {
      accentColor?: string;
      backgroundColor?: string;
      fontFamily?: string;
    },
  ): Promise<string> {
    const cacheKey = { ...achievementData, ...options };
    const cached = await this.checkCache('achievement', cacheKey);
    if (cached) return cached;

    const fileId = uuidv4();
    const fileName = `achievement-${achievementData.childName}-${fileId.slice(0, 8)}.bento.html`;

    const theme = this.achievementTemplate.defaultTheme();
    if (options?.accentColor) theme.accent = options.accentColor;
    if (options?.backgroundColor) theme.background = options.backgroundColor;
    if (options?.fontFamily) theme.fontFamily = options.fontFamily;
    const slides = this.achievementTemplate.toSlides(achievementData, theme);

    const doc = this.bentoJsonGenerator.assemble(
      fileId,
      `${achievementData.childName} 的成就展`,
      slides,
      theme,
      { readonly: true, meta: { subject: '成就展示' } },
    );

    const filePath = await this.bentoFileGenerator.generate(doc, fileName);
    await this.registerFile(fileId, fileName, filePath);
    this.cacheIndex.set(this.computeContentHash('achievement', cacheKey), {
      hash: this.computeContentHash('achievement', cacheKey),
      fileId,
      template: 'achievement',
      createdAt: new Date().toISOString(),
    });
    await this.persistIndex();
    return fileId;
  }

  async generateSemesterReport(
    semesterData: SemesterData,
    options?: {
      accentColor?: string;
      backgroundColor?: string;
      fontFamily?: string;
    },
  ): Promise<string> {
    const cacheKey = { ...semesterData, ...options };
    const cached = await this.checkCache('semester', cacheKey);
    if (cached) return cached;

    const fileId = uuidv4();
    const fileName = `semester-${semesterData.childName}-${fileId.slice(0, 8)}.bento.html`;

    const theme = this.semesterReportTemplate.defaultTheme();
    if (options?.accentColor) theme.accent = options.accentColor;
    if (options?.backgroundColor) theme.background = options.backgroundColor;
    if (options?.fontFamily) theme.fontFamily = options.fontFamily;
    const slides = this.semesterReportTemplate.toSlides(semesterData, theme);

    const doc = this.bentoJsonGenerator.assemble(
      fileId,
      `${semesterData.childName} 的 ${semesterData.semesterLabel} 纪念册`,
      slides,
      theme,
      { readonly: true, meta: { subject: '学期纪念册' } },
    );

    const filePath = await this.bentoFileGenerator.generate(doc, fileName);
    await this.registerFile(fileId, fileName, filePath);
    this.cacheIndex.set(this.computeContentHash('semester', cacheKey), {
      hash: this.computeContentHash('semester', cacheKey),
      fileId,
      template: 'semester',
      createdAt: new Date().toISOString(),
    });
    await this.persistIndex();
    return fileId;
  }

  /** 从任意模板生成 Bento 文档（通用方法，支持主题可配置） */
  async generateFromTemplate(
    title: string,
    slides: Slide[],
    theme: Theme,
    options?: { readonly?: boolean; meta?: { author?: string; subject?: string } },
  ): Promise<string> {
    const fileId = uuidv4();
    const fileName = `bento-${fileId.slice(0, 8)}.bento.html`;

    const doc = this.bentoJsonGenerator.assemble(fileId, title, slides, theme, {
      readonly: options?.readonly,
      meta: options?.meta,
    });

    const filePath = await this.bentoFileGenerator.generate(doc, fileName);
    await this.registerFile(fileId, fileName, filePath);
    await this.persistIndex();
    return fileId;
  }

  /**
   * 降级方案：Bento 生成失败时生成纯 HTML 报告
   */
  private async generateFallbackHtml(reportData: ReportData, fileName: string): Promise<string> {
    const lines = [
      '<!DOCTYPE html><html><head><meta charset="utf-8">',
      `<title>${reportData.childName} 的学习报告</title>`,
      '<style>body{font-family:Noto Sans SC,PingFang SC,Microsoft YaHei,sans-serif;',
      'max-width:800px;margin:40px auto;padding:20px;color:#333;line-height:1.6}',
      'h1{color:#2C3E50;border-bottom:2px solid #3498DB;padding-bottom:10px}',
      'h2{color:#2C3E50;margin-top:30px}',
      '.stat{display:inline-block;padding:15px 25px;margin:10px;background:#f8f9fa;border-radius:12px;min-width:120px}',
      '.stat-label{font-size:14px;color:#7F8C8D}',
      '.stat-value{font-size:28px;font-weight:700;color:#3498DB}',
      '.insight{background:#FFF8E1;padding:15px;border-radius:10px;margin:10px 0}',
      '</style></head><body>',
      `<h1>📊 ${reportData.childName} 的学习报告</h1>`,
      `<p>报告周期: ${reportData.period} | ${reportData.startDate} ~ ${reportData.endDate}</p>`,
      '<div style="text-align:center;margin:20px 0">',
      `<div class="stat"><div class="stat-label">学习时长</div><div class="stat-value">${Math.round(reportData.totalLearningTime / 60)}分</div></div>`,
      `<div class="stat"><div class="stat-label">完成课程</div><div class="stat-value">${reportData.totalLessonsCompleted}</div></div>`,
      `<div class="stat"><div class="stat-label">平均分</div><div class="stat-value">${reportData.averageScore}</div></div>`,
      '</div>',
      '<h2>📈 技能进度</h2><ul>',
    ];
    for (const [domain, score] of Object.entries(reportData.skillProgress)) {
      lines.push(`<li>${domain}: ${score}%</li>`);
    }
    lines.push('</ul>');

    if (reportData.insights.length > 0) {
      lines.push('<h2>💡 学习建议</h2>');
      for (const insight of reportData.insights) {
        lines.push(`<div class="insight">${insight}</div>`);
      }
    }

    lines.push('</body></html>');

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const filePath = path.join(OUTPUT_DIR, fileName);
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
    this.logger.log(`Fallback HTML generated: ${filePath}`);
    return filePath;
  }

  // ── 文件管理 ──

  async getBentoFile(fileId: string): Promise<{ path: string; name: string }> {
    const record = this.fileRegistry.get(fileId);
    if (!record) {
      throw new NotFoundException(`Bento file not found: ${fileId}`);
    }

    // 验证文件仍然存在于磁盘上
    try {
      await fs.access(record.path);
    } catch {
      this.fileRegistry.delete(fileId);
      throw new NotFoundException(`Bento file not found (deleted): ${fileId}`);
    }

    return { path: record.path, name: record.fileName };
  }

  /** 获取文件列表（含分页） */
  async listBentoFiles(
    page = 1,
    limit = 20,
  ): Promise<{
    files: Array<{ fileId: string; fileName: string; createdAt: string }>;
    total: number;
  }> {
    const all = Array.from(this.fileRegistry.values());

    // 过滤掉已删除的文件
    const valid: Array<{ fileId: string; fileName: string; createdAt: string }> = [];
    for (const rec of all) {
      try {
        await fs.access(rec.path);
        valid.push({ fileId: rec.fileId, fileName: rec.fileName, createdAt: rec.createdAt });
      } catch {
        this.fileRegistry.delete(rec.fileId);
      }
    }

    // 按创建时间倒序
    valid.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const start = (page - 1) * limit;
    return {
      files: valid.slice(start, start + limit),
      total: valid.length,
    };
  }

  async deleteBentoFile(fileId: string): Promise<void> {
    const record = this.fileRegistry.get(fileId);
    if (record) {
      try {
        await fs.unlink(record.path);
      } catch (err: any) {
        this.logger.warn(`Failed to delete file ${record.path}: ${err.message}`);
      }
      this.fileRegistry.delete(fileId);

      // 清理缓存索引
      for (const [hash, entry] of this.cacheIndex.entries()) {
        if (entry.fileId === fileId) {
          this.cacheIndex.delete(hash);
          break;
        }
      }

      await this.persistIndex();
    } else {
      throw new NotFoundException(`Bento file not found: ${fileId}`);
    }
  }

  // ── 文件清理策略 ──

  /**
   * 清理超过 7 天的陈旧文件
   * 每小时执行一次
   */
  async cleanup(): Promise<void> {
    try {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      const files = await fs.readdir(OUTPUT_DIR);
      const now = Date.now();
      let cleaned = 0;

      for (const file of files) {
        if (file.startsWith('.index')) continue; // 跳过索引文件
        if (!file.endsWith('.bento.html') && !file.endsWith('.html')) continue;
        const filePath = path.join(OUTPUT_DIR, file);
        try {
          const stats = await fs.stat(filePath);
          if (now - stats.mtimeMs > FILE_RETENTION_MS) {
            await fs.unlink(filePath);
            cleaned++;
            this.logger.debug(`Cleaned old bento file: ${file}`);
          }
        } catch (err: any) {
          this.logger.warn(`Failed to stat/delete ${file}: ${err.message}`);
        }
      }

      // 清理内存注册表中已删除的条目
      for (const [fileId, record] of this.fileRegistry.entries()) {
        try {
          await fs.access(record.path);
        } catch {
          this.fileRegistry.delete(fileId);
        }
      }

      if (cleaned > 0) {
        this.logger.log(`Cleaned ${cleaned} expired bento files`);
        await this.persistIndex();
      }
    } catch (err: any) {
      this.logger.error(`Cleanup failed: ${err.message}`);
    }
  }

  // ── 私有方法 ──

  private async registerFile(fileId: string, fileName: string, filePath: string): Promise<void> {
    this.fileRegistry.set(fileId, {
      fileId,
      fileName,
      path: filePath,
      createdAt: new Date().toISOString(),
    });
  }

  async onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    await this.persistIndex();
  }
}
