import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmClientService } from '../../agent-framework/llm/llm-client.service';
import { PoetryService } from './poetry.service';

/**
 * 诗词注解/翻译服务
 *
 * 使用 LLM 为古诗词生成：
 * - translation: 白话文翻译
 * - notes: 关键字词注解 [{term, explanation}]
 * - appreciation: 简短赏析
 *
 * 带 in-memory LRU 缓存（最多 500 首诗词），避免对同一首诗重复调用 LLM。
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

interface LRUNode {
  key: number;
  value: PoemAnnotation;
  prev: LRUNode | null;
  next: LRUNode | null;
}

class LRUCache {
  private capacity: number;
  private size = 0;
  private head: LRUNode | null = null; // most recent
  private tail: LRUNode | null = null; // least recent
  private map = new Map<number, LRUNode>();

  constructor(capacity = 500) {
    this.capacity = capacity;
  }

  get(key: number): PoemAnnotation | null {
    const node = this.map.get(key);
    if (!node) return null;
    this.moveToFront(node);
    return node.value;
  }

  set(key: number, value: PoemAnnotation): void {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      this.moveToFront(existing);
      return;
    }
    const node: LRUNode = { key, value, prev: null, next: null };
    this.map.set(key, node);
    if (this.head) {
      node.next = this.head;
      this.head.prev = node;
      this.head = node;
    } else {
      this.head = node;
      this.tail = node;
    }
    this.size++;
    if (this.size > this.capacity && this.tail) {
      const evict = this.tail;
      this.tail = evict.prev;
      if (this.tail) this.tail.next = null;
      else this.head = null;
      this.map.delete(evict.key);
      this.size--;
    }
  }

  private moveToFront(node: LRUNode): void {
    if (node === this.head) return;
    // detach
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this.tail) this.tail = node.prev;
    // front
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
  }
}

@Injectable()
export class PoetryAnnotationService {
  private readonly logger = new Logger(PoetryAnnotationService.name);
  private readonly cache = new LRUCache(500);

  constructor(
    private readonly poetryService: PoetryService,
    @Optional() private readonly llmClient?: LlmClientService,
  ) {}

  /**
   * 获取诗词注解（命中缓存则直接返回，否则调用 LLM 生成）
   */
  async getAnnotation(poemId: number, lang = 'zh-Hans'): Promise<PoemAnnotation | null> {
    // 缓存 key 不区分 lang —— 注解始终用简体中文生成（适合儿童阅读）
    const cached = this.cache.get(poemId);
    if (cached) {
      this.logger.debug(`getAnnotation(${poemId}) cache hit`);
      return cached;
    }

    const poem = await this.poetryService.findById(poemId, lang);
    if (!poem) return null;

    if (!this.llmClient || !this.llmClient.isConfigured) {
      const fallback = this.buildFallback(poemId, poem);
      this.cache.set(poemId, fallback);
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
      this.cache.set(poemId, annotation);
      return annotation;
    } catch (err: any) {
      this.logger.warn(`getAnnotation(${poemId}) LLM failed, using fallback: ${err.message}`);
      const fallback = this.buildFallback(poemId, poem);
      this.cache.set(poemId, fallback);
      return fallback;
    }
  }

  private async generateViaLlm(
    poemId: number,
    title: string,
    content: string,
    authorName?: string | null,
    dynastyName?: string | null,
  ): Promise<PoemAnnotation> {
    const systemPrompt = `你是一位资深语文老师，擅长用儿童易懂的语言讲解古诗词。你的回答必须是纯JSON格式，不要使用Markdown代码块、不要使用<think>标签。`;

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

    const raw = await this.llmClient!.generate(userPrompt, systemPrompt);
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
