import { Injectable, Logger } from '@nestjs/common';
import { MemoryService } from '../../../memory/memory.service';

/**
 * `recallMemory` — the read half of long-term memory, as a tool.
 *
 * Why a tool and not a pipeline step: memory should cost nothing on a
 * turn that does not need it. A child asking for a story must not pay for
 * an embedding and three channels of retrieval, and the model is the only
 * component that knows whether the current sentence refers to the past.
 *
 * The tool returns **structure, not sentences**. `hint` says what kind of
 * answer the situation calls for; the wording comes from whichever
 * age-group prompt is active. That is the whole trick behind keeping this
 * capability independent of age: add a new age band by adding a prompt,
 * not by editing memory code.
 */
@Injectable()
export class RecallMemoryTool {
  private readonly logger = new Logger(RecallMemoryTool.name);

  constructor(private readonly memoryService: MemoryService) {}

  async execute(args: {
    childId: number;
    query: string;
    limit?: number;
    since?: string;
    sessionId?: string;
  }): Promise<string> {
    if (!args?.childId || !args?.query?.trim()) {
      return JSON.stringify({
        outcome: 'miss',
        hits: [],
        hint: '查询条件不足，不要向孩子提起工具或参数。',
      });
    }

    try {
      const result = await this.memoryService.recallMemory({
        childId: args.childId,
        query: args.query,
        limit: args.limit,
        since: args.since,
      });

      return JSON.stringify({
        outcome: result.outcome,
        hits: result.hits.map((memory) => ({
          // Only the child's own words may be quoted back. `content` is a
          // third-person summary for ranking, never something to read out.
          quote: memory.verbatimQuote,
          content: memory.content,
          kind: memory.kind,
          occurredAt: memory.occurredAt,
        })),
        hint: HINTS[result.outcome],
      });
    } catch (err) {
      // A database timeout must reach the child as "my head went blank",
      // never as a technical error, and never as a tool failure string.
      this.logger.error(`recallMemory tool failed: ${(err as Error).message}`);
      return JSON.stringify({
        outcome: 'degraded',
        hits: [],
        hint: HINTS.degraded,
      });
    }
  }
}

/**
 * What the situation calls for, not what to say.
 *
 * `miss` and `degraded` are first-class branches: honest forgetting and a
 * blank moment are both better than a confident wrong memory.
 */
const HINTS: Record<string, string> = {
  hit: '可以自然地把这些回忆接进对话，引用孩子自己的原话最有说服力；不要逐条罗列，也不要一次讲太多。',
  miss: '你确实不记得这件事。诚实地说不记得，不要编造细节来圆场。',
  degraded: '你一时想不起来（不要说数据库、系统、工具或出错这类词）。自然地表示脑袋有点空白，把话题接回孩子身上。',
  first_day: '这是你们之间最初的记忆，还很少。开心地接住，不要提"第一次""还没有记录"这类机械说法。',
};
