/**
 * TranslateTool — wraps PublicApiService.translate (MyMemory) as an agent tool.
 * Enabled by default in 碎碎念 casual mode so a child can ask "X 用英语怎么说".
 */

import { Injectable } from '@nestjs/common';
import { PublicApiService } from '../../../modules/public-api/public-api.service';
import { BaseTool } from '../base-tool';
import { RegisterTool } from '../decorators/register-tool';
import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../../core';

type TranslateInput = { text: string; source?: string; target?: string };

@Injectable()
@RegisterTool()
export class TranslateTool extends BaseTool<TranslateInput> {
  readonly metadata: ToolMetadata = {
    name: 'translate',
    description:
      '翻译一小段文本（默认英译中）。孩子问"这个词是什么意思""XX用英语/中文怎么说"时调用。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要翻译的词或短句' },
        source: { type: 'string', description: '源语言代码，如 en/zh/ja，默认 en' },
        target: { type: 'string', description: '目标语言代码，如 zh/en/ja，默认 zh' },
      },
      required: ['text'],
    },
    concurrencySafe: true,
    readOnly: true,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  constructor(private readonly publicApiService: PublicApiService) {
    super();
  }

  async execute(args: TranslateInput, _context: ToolExecutionContext): Promise<ToolResult> {
    const text = args?.text?.trim();
    if (!text) return this.fail('没有要翻译的内容');
    const source = args.source?.trim() || 'en';
    const target = args.target?.trim() || 'zh';
    try {
      const res = await this.publicApiService.translate(text, source, target);
      const translated = res?.responseData?.translatedText;
      if (!translated) return this.fail('暂时翻译不出来，换个说法试试呀');
      return this.ok({ text, translated, source, target });
    } catch (error: any) {
      return this.fail(`翻译失败: ${error.message}`);
    }
  }
}