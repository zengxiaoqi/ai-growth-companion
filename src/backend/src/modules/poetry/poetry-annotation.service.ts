import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmClientService } from '../../agent-framework/llm/llm-client.service';
import { PoetryService } from './poetry.service';
import { PoemAnnotationRecord } from './entities/poem-annotation.entity';

/**
 * 诗词注解/翻译服务
 *
 * 使用 LLM 为古诗词生成：
 * - translation: 白话文翻译
 * - notes: 关键字词注解 [{term, explanation}]
 * - appreciation: 简短赏析
 *
 * 持久化到 lingxi.db 的 poem_annotations 表：
 * - 首次请求调 LLM 生成，写入 DB，永久保存
 * - 后续请求直接读 DB，不消耗 token
 * - refresh=true 时重新调 LLM 覆盖更新
 */

export interface PoemNote {
  term: string;
  explanation: string;
}

export interface PoemAnnotation {
  poemId: number;
  translation: string;
  notes: PoemNote[];
  appreciation: string;
  /** 注解生成方式：llm / fallback */
  source: 'llm' | 'fallback';
}

@Injectable()
export class PoetryAnnotationService implements OnModuleInit {
  private readonly logger = new Logger(PoetryAnnotationService.name);

  constructor(
    @InjectRepository(PoemAnnotationRecord)
    private readonly annotationRepo: Repository<PoemAnnotationRecord>,
    private readonly poetryService: PoetryService,
    private readonly configService: ConfigService,
    @Optional() private readonly llmClient?: LlmClientService,
  ) {}

  onModuleInit() {
    if (this.llmClient?.isConfigured) {
      this.logger.log('Poetry annotation using LlmClientService (pi-ai unified path)');
    } else {
      this.logger.warn(
        'LlmClientService not configured — will fall back to placeholder annotation',
      );
    }
  }

  /**
   * 获取诗词注解
   *
   * - 先查 DB，命中则直接返回（不消耗 token）
   * - refresh=true 或未命中时调 LLM 生成，写入 DB 持久化
   */
  async getAnnotation(
    poemId: number,
    lang = 'zh-Hans',
    refresh = false,
  ): Promise<PoemAnnotation | null> {
    // 查 DB 持久化缓存
    if (!refresh) {
      const record = await this.annotationRepo.findOne({ where: { poemId } });
      if (record) {
        this.logger.debug(`getAnnotation(${poemId}) DB hit`);
        return this.recordToAnnotation(record);
      }
    }

    const poem = await this.poetryService.findById(poemId, lang);
    if (!poem) return null;

    if (!this.llmClient || !this.llmClient.isConfigured) {
      const fallback = this.buildFallback(poemId, poem);
      await this.saveAnnotation(poemId, fallback);
      return fallback;
    }

    try {
      const annotation = await this.generateViaLlm(
        poemId,
        poem.title,
        poem.content,
        poem.author?.name,
        poem.dynasty?.name,
      );
      await this.saveAnnotation(poemId, annotation);
      this.logger.log(`getAnnotation(${poemId}) ${refresh ? 'refreshed' : 'generated'} & saved`);
      return annotation;
    } catch (err: any) {
      this.logger.warn(`getAnnotation(${poemId}) LLM failed, using fallback: ${err.message}`);
      const fallback = this.buildFallback(poemId, poem);
      // fallback 不覆盖已有的有效注解
      const existing = await this.annotationRepo.findOne({ where: { poemId } });
      if (!existing) {
        await this.saveAnnotation(poemId, fallback);
      }
      return existing ? this.recordToAnnotation(existing) : fallback;
    }
  }

  /** 将 DB record 转为 API 返回格式 */
  private recordToAnnotation(record: PoemAnnotationRecord): PoemAnnotation {
    let notes: PoemNote[] = [];
    try {
      notes = JSON.parse(record.notes);
    } catch {
      this.logger.warn(`recordToAnnotation(${record.poemId}) notes JSON parse failed`);
    }
    return {
      poemId: record.poemId,
      translation: record.translation,
      notes,
      appreciation: record.appreciation,
      source: record.source as 'llm' | 'fallback',
    };
  }

  /** 将注解写入 DB（upsert） */
  private async saveAnnotation(poemId: number, ann: PoemAnnotation): Promise<void> {
    const record: Partial<PoemAnnotationRecord> = {
      poemId,
      translation: ann.translation,
      notes: JSON.stringify(ann.notes),
      appreciation: ann.appreciation,
      source: ann.source,
      model: 'global',
      updatedAt: new Date(),
    };
    await this.annotationRepo.save(record);
  }

  private async generateViaLlm(
    poemId: number,
    title: string,
    content: string,
    authorName?: string | null,
    dynastyName?: string | null,
  ): Promise<PoemAnnotation> {
    const systemPrompt = `你是一位资深语文老师，擅长用儿童易懂的语言讲解古诗词。你的回答必须是纯JSON格式，不要使用Markdown代码块、不要使用< /think>标签。`;

    const poemDesc = `《${title}》${dynastyName ? `·${dynastyName}` : ''}${authorName ? ` ${authorName}` : ''}\n${content}`;

    const userPrompt = `请为下面这首古诗词生成注解。要求适合 3-6 年级儿童理解。

诗词：
${poemDesc}

请严格按照以下JSON格式返回（不要任何额外文字，不要Markdown代码块）：
{
  "translation": "白话文翻译，完整通顺，不分句号",
  "notes": [
    {"term": "字词1", "explanation": "简短解释"},
    {"term": "字词2", "explanation": "简短解释"}
  ],
  "appreciation": "简短赏析（50-100字），讲清意境与作者情感"
}

注意：
- translation 为完整白话文翻译，不要逐句分开
- notes 数组最多 5 条，只挑真正难懂的字词
- 全部用简体中文
- 输出必须是合法JSON`;

    // 通过 LlmClientService 统一路由（pi-ai 多 provider 支持、超时、重试）
    if (!this.llmClient?.isConfigured) {
      throw new Error('No LLM client available for annotation generation');
    }
    const raw = await this.llmClient.generate(userPrompt, systemPrompt);

    const jsonText = this.extractJson(raw);
    const parsed = JSON.parse(jsonText);

    return {
      poemId,
      translation: (parsed.translation ?? '').toString(),
      notes: Array.isArray(parsed.notes)
        ? parsed.notes
            .map((n: any) => ({
              term: (n.term ?? '').toString(),
              explanation: (n.explanation ?? '').toString(),
            }))
            .filter((n: PoemNote) => n.term && n.explanation)
            .slice(0, 5)
        : [],
      appreciation: (parsed.appreciation ?? '').toString(),
      source: 'llm' as const,
    };
  }

  /**
   * LLM 不可用时的降级：返回占位提示
   */
  private buildFallback(
    poemId: number,
    _poem: {
      title: string;
      content: string;
      author?: { name: string } | null;
      dynasty?: { name: string } | null;
    },
  ): PoemAnnotation {
    return {
      poemId,
      translation: '（注解服务暂不可用，请稍后再试）',
      notes: [],
      appreciation: '',
      source: 'fallback' as const,
    };
  }

  /**
   * 从可能包含代码块/前后噪声的字符串中提取首个完整 JSON 对象
   */
  private extractJson(text: string): string {
    if (!text) return '{}';
    let t = text.trim();
    // 去除 ```json / ``` 代码块包裹
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    // 直接找首个 { 到末尾 }
    const start = t.indexOf('{');
    if (start < 0) return '{}';
    // 从末尾找最后一个 } （容忍尾部噪声）
    const end = t.lastIndexOf('}');
    if (end < 0 || end < start) return '{}';
    return t.slice(start, end + 1);
  }
}
