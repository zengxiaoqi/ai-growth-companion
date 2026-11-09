import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * The optional semantic channel.
 *
 * Recall works without this: the literal channel needs no network and is
 * what answers 「我上次说的霸王龙」. An embedding backend only adds
 * paraphrase coverage, so its absence is a missing channel, not a broken
 * feature — and a *slow* backend must not take the literal channel down
 * with it, which is why every call here takes an explicit deadline and
 * returns null on any failure.
 *
 * Configure with `MEMORY_EMBED_MODEL` (plus `LLM_BASE_URL` / `LLM_API_KEY`
 * for an OpenAI-compatible `/embeddings` endpoint). Unset means the
 * semantic channel is simply absent.
 */
@Injectable()
export class MemoryVectorService {
  private readonly logger = new Logger(MemoryVectorService.name);
  private readonly endpoint: string | null;
  private readonly apiKey: string;
  readonly model: string;
  private warnedOnce = false;

  constructor(private readonly configService: ConfigService) {
    this.model = this.configService.get<string>('MEMORY_EMBED_MODEL', '').trim();
    const baseUrl = this.configService.get<string>('LLM_BASE_URL', '').trim().replace(/\/+$/, '');
    this.apiKey = this.configService.get<string>('LLM_API_KEY', 'unused');
    this.endpoint =
      this.model && baseUrl && baseUrl.startsWith('http') ? `${baseUrl}/embeddings` : null;
  }

  get enabled(): boolean {
    return this.endpoint != null;
  }

  /**
   * Embed one text, giving up quietly on timeout or any transport error.
   *
   * Returns null rather than throwing: the caller's contract is "a
   * missing vector is a missing channel", never a failed recall.
   */
  async embed(text: string, timeoutMs: number): Promise<number[] | null> {
    if (!this.endpoint || !text?.trim()) return null;
    if (typeof fetch !== 'function') return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs, 1));
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: text }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.warnOnce(`embed endpoint returned ${response.status}`);
        return null;
      }
      const payload = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };
      const vector = payload?.data?.[0]?.embedding;
      return Array.isArray(vector) && vector.length > 0 ? vector : null;
    } catch (err) {
      this.warnOnce(`embed call failed: ${(err as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private warnOnce(message: string): void {
    if (this.warnedOnce) return;
    this.warnedOnce = true;
    this.logger.warn(`${message} — semantic channel disabled for this process`);
  }
}

/**
 * Cosine similarity in [-1, 1]; 0 for unusable inputs.
 *
 * A truncated vector or a width from another model is skipped, not
 * thrown: one bad row must not fail the whole recall.
 */
export function cosine(a: number[] | null, b: number[] | null): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
