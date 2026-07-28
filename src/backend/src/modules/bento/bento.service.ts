import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BentoFileGenerator } from './generators/bento-file.generator';
import { ReportWeeklyTemplate } from './templates/report-weekly';
import { ReportData } from './interfaces/bento-template.interface';
import { BentoDoc } from './interfaces/bento-document.interface';

const OUTPUT_DIR = path.resolve(__dirname, '../../../../bento-output');

interface FileRecord {
  fileId: string;
  fileName: string;
  path: string;
  createdAt: Date;
}

@Injectable()
export class BentoService {
  private readonly logger = new Logger(BentoService.name);
  private readonly fileRegistry = new Map<string, FileRecord>();

  constructor(
    private readonly bentoFileGenerator: BentoFileGenerator,
    private readonly reportWeeklyTemplate: ReportWeeklyTemplate,
  ) {}

  async generateReport(
    childId: number,
    period: 'daily' | 'weekly' | 'monthly',
    reportData: ReportData,
  ): Promise<string> {
    const fileId = uuidv4();
    const fileName = `report-${childId}-${period}-${fileId.slice(0, 8)}.bento.html`;

    const theme = this.reportWeeklyTemplate.defaultTheme();
    const slides = this.reportWeeklyTemplate.toSlides(reportData, theme);

    const doc: BentoDoc = {
      format: 'bento',
      version: 1,
      docId: fileId,
      title: `${reportData.childName} 的学习报告 - ${reportData.period}`,
      size: { w: 1280, h: 720 },
      theme,
      slides,
      assets: {},
    };

    const filePath = await this.bentoFileGenerator.generate(doc, fileName);

    this.fileRegistry.set(fileId, {
      fileId,
      fileName,
      path: filePath,
      createdAt: new Date(),
    });

    this.logger.log(`Report generated: ${filePath} (fileId: ${fileId})`);
    return fileId;
  }

  async getBentoFile(fileId: string): Promise<{ path: string; name: string }> {
    const record = this.fileRegistry.get(fileId);
    if (!record) {
      // Check if file exists on disk (e.g., after server restart)
      try {
        const files = await fs.readdir(OUTPUT_DIR);
        const matched = files.find((f) => f.includes(fileId));
        if (matched) {
          return { path: path.join(OUTPUT_DIR, matched), name: matched };
        }
      } catch {
        // ignore
      }
      throw new NotFoundException(`Bento file not found: ${fileId}`);
    }
    return { path: record.path, name: record.fileName };
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
    } else {
      throw new NotFoundException(`Bento file not found: ${fileId}`);
    }
  }
}
