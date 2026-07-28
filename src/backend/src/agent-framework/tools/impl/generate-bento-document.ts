/**
 * GenerateBentoDocumentTool — AI Agent 工具，生成 Bento 幻灯片文档。
 *
 * 让 AI Agent 可以直接生成 Bento 幻灯片，包括：
 * - 周报/月报报告幻灯片
 * - 诗词鉴赏幻灯片
 * - 课程内容幻灯片
 * - 成就展示幻灯片
 * - 自定义 JSON 幻灯片
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';

type GenerateBentoInput = {
  /** 模板类型 */
  template: 'report' | 'poetry' | 'lesson' | 'achievement' | 'custom';
  /** 数据载荷（按模板类型不同） */
  data: Record<string, any>;
  /** 标题（自定义模板必填） */
  title?: string;
  /** 主题色（可选，如 #FFD700） */
  accentColor?: string;
  /** 背景色（可选，如 #0D1117） */
  backgroundColor?: string;
  /** 字体族（可选，默认系统字体栈） */
  fontFamily?: string;
};

@Injectable()
@RegisterTool()
export class GenerateBentoDocumentTool extends BaseTool<GenerateBentoInput> {
  private readonly logger = new Logger(GenerateBentoDocumentTool.name);

  readonly metadata: ToolMetadata = {
    name: 'generateBentoDocument',
    description:
      '生成 Bento 幻灯片文档。支持模板类型: report(周报/月报), poetry(诗词鉴赏), lesson(课程内容), achievement(成就展示), custom(自定义JSON)',
    inputSchema: {
      type: 'object',
      properties: {
        template: {
          type: 'string',
          enum: ['report', 'poetry', 'lesson', 'achievement', 'custom'],
          description: '模板类型',
        },
        data: {
          type: 'object',
          description:
            '数据载荷。report: {childName, period, startDate, endDate, totalLearningTime, totalLessonsCompleted, averageScore, dailyStats, skillProgress, achievements, insights, streak, encouragement}。poetry: {poemId, title, author, dynasty, type, lines, translation, notes, appreciation, background}。lesson: {title, subtitle, ageRange, domain, sections, summary}。achievement: {childName, achievements: [{id, name, description, category, tier, unlocked, unlockedAt, progress, totalRequired}]}。custom: {slides: [{id, background, elements, transition}]}',
        },
        title: { type: 'string', description: '文档标题（自定义模板必填）' },
        accentColor: { type: 'string', description: '主题色（可选，如 #FFD700）' },
        backgroundColor: { type: 'string', description: '背景色（可选，如 #0D1117）' },
        fontFamily: { type: 'string', description: '字体族（可选，默认系统字体栈）' },
      },
      required: ['template', 'data'],
    },
    concurrencySafe: true,
    readOnly: false,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(@Optional() private readonly bentoService: any) {
    super();
  }

  async execute(args: GenerateBentoInput, _context: ToolExecutionContext): Promise<ToolResult> {
    if (!this.bentoService) {
      return this.fail('BentoService 不可用 — 请确保 BentoModule 已导入');
    }

    try {
      const { template, data, title, accentColor, backgroundColor, fontFamily } = args;

      let fileId: string;

      switch (template) {
        case 'report': {
          const period = data.period || 'weekly';
          const childId = data.childId || 0;
          fileId = await this.bentoService.generateReport(childId, period, {
            ...data,
            childName: data.childName || '未知',
            period,
            startDate: data.startDate || '',
            endDate: data.endDate || '',
          });
          break;
        }
        case 'poetry': {
          fileId = await this.bentoService.generatePoetrySlide({
            poemId: data.poemId || 0,
            title: data.title || '诗词',
            author: data.author || '',
            dynasty: data.dynasty || '',
            type: data.type || '',
            lines: data.lines || [],
            translation: data.translation || '',
            notes: data.notes || [],
            appreciation: data.appreciation || '',
            background: data.background,
          });
          break;
        }
        case 'lesson': {
          fileId = await this.bentoService.generateContentSlide({
            title: data.title || '课程内容',
            subtitle: data.subtitle,
            ageRange: data.ageRange || '5-6',
            domain: data.domain || 'language',
            sections: data.sections || [],
            summary: data.summary,
          });
          break;
        }
        case 'achievement': {
          fileId = await this.bentoService.generateAchievementSlide({
            childName: data.childName || '未知',
            achievements: data.achievements || [],
          });
          break;
        }
        case 'custom': {
          const theme = {
            background: backgroundColor || '#FFFFFF',
            color: '#333333',
            accent: accentColor || '#3498DB',
            fontFamily: fontFamily || 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
          };
          fileId = await this.bentoService.generateFromTemplate(
            title || '自定义幻灯片',
            data.slides || [],
            theme,
            { readonly: true, meta: { subject: '自定义' } },
          );
          break;
        }
        default:
          return this.fail(`未知模板类型: ${template}`);
      }

      this.logger.log(`Bento document generated: ${fileId} (template: ${template})`);
      return this.ok({
        fileId,
        url: `/api/bento/${fileId}`,
        template,
      });
    } catch (error: any) {
      this.logger.error(`generateBentoDocument failed: ${error.message}`);
      return this.fail(`生成 Bento 文档失败: ${error.message}`);
    }
  }
}
