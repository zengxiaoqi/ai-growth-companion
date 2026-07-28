import { Injectable } from '@nestjs/common';
import { BentoDoc, Slide, Theme } from '../interfaces/bento-document.interface';

/**
 * Bento JSON 数据块生成器
 *
 * 职责：将模板生成的 Slide 数组组装成完整的 BentoDoc JSON 对象。
 * 不负责文件读写，只负责 JSON 结构组装。
 */
@Injectable()
export class BentoJsonGenerator {
  /**
   * 从 slides 和 theme 组装完整的 BentoDoc
   */
  assemble(
    docId: string,
    title: string,
    slides: Slide[],
    theme: Theme,
    options?: {
      size?: { width: number; height: number };
      assets?: Record<string, string>;
      present?: { slideNumber?: boolean; controls?: boolean; progress?: boolean };
      readonly?: boolean;
      meta?: { author?: string; subject?: string };
    },
  ): BentoDoc {
    return {
      format: 'bento/slides',
      version: 1,
      docId,
      title,
      size: options?.size ?? { width: 1280, height: 720 },
      theme,
      slides,
      modified: new Date().toISOString(),
      ...(options?.assets ? { assets: options.assets } : {}),
      ...(options?.present ? { present: options.present } : {}),
      ...(options?.readonly !== undefined ? { readonly: options.readonly } : {}),
      ...(options?.meta ? { meta: options.meta } : {}),
    };
  }
}
