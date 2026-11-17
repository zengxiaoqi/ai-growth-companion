/**
 * AssetGenService — 两层按需素材生成。
 *
 * 素材库只搜不生成是"画面讲的不是那个东西"的根源之一：关系图节点（青草、
 * 石头、树根）miss 之后只能退化成首字占位。这里在 miss 时补两层：
 *   层1：LLM 现画 SVG —— 简单主体，结构可校验、风格统一、零边际成本；
 *   层2：文生图 API（IMAGE_GEN_*，未配置则整层关闭）—— 复杂角色/场景。
 * 两层产物都过 vision 验收（主体在、风格符、无文字垃圾），按 subject+style
 * 哈希缓存进 generated manifest（license/provider='generated'），失败回退矢量库。
 *
 * 边界：所有失败都返回 null 并日志记因（调用方回退占位/矢量），不静默吞错，
 * 也不让素材生成拖垮出片——单次调用有超时，并发有上限，逐调用有预算。
 */

import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { LlmClientService } from '../../agent-framework/llm/llm-client.service';
import { extractJsonObject } from '../../agent-framework/core';

export type GeneratedIcon = {
  /** public 相对路径，Remotion staticFile 可直接解析 */
  staticPath: string;
  filePath: string;
  subject: string;
  layer: 'svg' | 'image';
  provider: 'generated';
  license: 'generated';
  /** vision 未配置时为 undefined（只过了结构校验） */
  visionPassed?: boolean;
};

export type SvgValidation = { ok: true } | { ok: false; reason: string };

/** 风格版本进缓存键：改 prompt/校验规则时 +1，旧缓存自然失效 */
const STYLE_VERSION = 'v1';
const MAX_SVG_BYTES = 32 * 1024;
const MAX_SVG_ELEMENTS = 60;
const MIN_SVG_SHAPES = 2;
const ICON_CANVAS = 256;
/** 同一进程内并发生成上限：素材是出片的加分项，不是排队理由 */
const MAX_CONCURRENT = 3;
const LLM_TIMEOUT_MS = 90_000;
const IMAGE_TIMEOUT_MS = 120_000;

const FORBIDDEN_SVG_TAGS =
  /<\s*(script|foreignObject|image|use|text|tspan|textPath|animate|animateTransform|animateMotion|set|filter|style|iframe|embed|object)\b/i;
const FORBIDDEN_SVG_ATTRS =
  /(\son\w+\s*=)|(href\s*=|xlink:|url\s*\(|@import|data:|<!ENTITY|<!DOCTYPE)/i;
const SHAPE_TAG = /<\s*(path|circle|ellipse|rect|line|polygon|polyline)\b/gi;

/**
 * 结构校验：LLM 画的 SVG 只允许"纯图形"。
 * 禁文字（文字垃圾是文生图/LLM 画最常见的翻车）、禁外部引用与脚本（安全）、
 * 禁滤镜/渐变外的装饰（风格统一 + resvg 兼容）。数量上限防刷屏。
 */
export function validateGeneratedSvg(svg: string): SvgValidation {
  if (!svg || svg.length > MAX_SVG_BYTES) return { ok: false, reason: 'empty or too large' };
  if (!/<svg[\s>]/i.test(svg)) return { ok: false, reason: 'no <svg> root' };
  if (!/viewBox\s*=|width\s*=/i.test(svg)) return { ok: false, reason: 'no viewBox/width' };
  if (FORBIDDEN_SVG_TAGS.test(svg)) return { ok: false, reason: 'forbidden tag (text/script/external ref/filter)' };
  if (FORBIDDEN_SVG_ATTRS.test(svg)) return { ok: false, reason: 'forbidden attribute (href/on*/url()/data:)' };
  const shapes = svg.match(SHAPE_TAG) || [];
  if (shapes.length < MIN_SVG_SHAPES) return { ok: false, reason: 'fewer than 2 shape elements' };
  const elements = svg.match(/<\s*[a-zA-Z]/g) || [];
  if (elements.length > MAX_SVG_ELEMENTS) return { ok: false, reason: 'too many elements' };
  return { ok: true };
}

/** 从模型回复里取 SVG：容忍 ```svg 围栏与前后废话 */
export function extractSvg(content: string): string | null {
  const fenced = content.match(/```(?:svg|xml)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : content;
  const start = body.search(/<svg[\s>]/i);
  if (start < 0) return null;
  const end = body.lastIndexOf('</svg>');
  if (end < 0 || end < start) return null;
  return body.slice(start, end + '</svg>'.length).trim();
}

@Injectable()
export class AssetGenService {
  private readonly logger = new Logger(AssetGenService.name);
  private readonly publicDir = path.resolve(__dirname, '../../../../video-remotion/public');
  private readonly generatedDir = path.join(this.publicDir, '.generated', 'assets', 'generated');
  private readonly manifestPath = path.join(this.publicDir, '.generated', 'assets', 'asset-manifest.json');
  /** 同 subject 的并发生成共享一个 Promise，避免重复花钱 */
  private readonly inFlight = new Map<string, Promise<GeneratedIcon | null>>();
  private running = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(private readonly llmClient: LlmClientService) {}

  get isEnabled(): boolean {
    return process.env.ASSET_GEN !== 'off' && this.llmClient.isConfigured;
  }

  get imageGenConfigured(): boolean {
    return Boolean(process.env.IMAGE_GEN_API_URL && process.env.IMAGE_GEN_API_KEY);
  }

  cacheKey(subject: string): string {
    return createHash('sha1').update(`subject-icon:${STYLE_VERSION}:${subject}`).digest('hex').slice(0, 16);
  }

  /**
   * 幼儿游戏 tap_target 的情景图：按主体词生成/命中缓存后，返回文件字节与
   * MIME 供控制器直接吐给前端。生成失败返回 null，前端回退 emoji。
   * 复用 generateSubjectIcon 的磁盘缓存与并发/预算控制，不额外开销。
   */
  async loadActivityImage(subject: string): Promise<{ body: Buffer; mimeType: string } | null> {
    const icon = await this.generateSubjectIcon(subject);
    if (!icon) return null;
    try {
      const body = await fs.readFile(icon.filePath);
      const mimeType = icon.staticPath.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
      return { body, mimeType };
    } catch (error: any) {
      this.logger.warn(`[AssetGen] activity image read failed for "${subject}": ${error?.message || 'unknown'}`);
      return null;
    }
  }

  /**
   * 为一个具体主体生成图标。命中缓存直接返回；未命中走 层1→层2。
   * 任何一层失败都日志记因并继续下一层，全部失败返回 null（调用方回退）。
   */
  async generateSubjectIcon(subjectRaw: string): Promise<GeneratedIcon | null> {
    const subject = String(subjectRaw || '').trim().slice(0, 12);
    if (!subject) return null;
    if (!this.isEnabled) {
      this.logger.debug(`[AssetGen] disabled (ASSET_GEN=off or LLM unconfigured), skip "${subject}"`);
      return null;
    }

    const key = this.cacheKey(subject);
    const cached = await this.readCache(key, subject);
    if (cached) return cached;

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const job = this.withSlot(() => this.generate(key, subject));
    this.inFlight.set(key, job);
    try {
      return await job;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async generate(key: string, subject: string): Promise<GeneratedIcon | null> {
    // 层1：LLM 现画 SVG
    const svg = await this.drawSvg(subject);
    if (svg) {
      const png = this.rasterize(svg);
      if (png) {
        const verdict = await this.visionAccept(png, subject);
        if (verdict.pass) {
          const saved = await this.save(key, subject, 'svg', Buffer.from(svg, 'utf-8'), verdict.passed);
          if (saved) return saved;
        } else {
          this.logger.warn(`[AssetGen] "${subject}" layer1 SVG rejected by vision: ${verdict.reason}`);
        }
      }
    }

    // 层2：文生图（未配置则整层关闭）
    if (this.imageGenConfigured) {
      const image = await this.generateImage(subject);
      if (image) {
        const verdict = await this.visionAccept(image, subject);
        if (verdict.pass) {
          const saved = await this.save(key, subject, 'image', image, verdict.passed);
          if (saved) return saved;
        } else {
          this.logger.warn(`[AssetGen] "${subject}" layer2 image rejected by vision: ${verdict.reason}`);
        }
      }
    }

    this.logger.warn(`[AssetGen] "${subject}" all layers failed — caller falls back to vector/placeholder`);
    return null;
  }

  private async drawSvg(subject: string): Promise<string | null> {
    const prompt = [
      `为「${subject}」画一个单独的扁平矢量儿童插画图标。`,
      '要求：',
      `- 只输出一个 <svg>，viewBox="0 0 ${ICON_CANVAS} ${ICON_CANVAS}"，不要输出任何其他文字`,
      '- 扁平儿童插画风格：粗深色轮廓、圆润造型、纯色填充，颜色 ≤ 6 种',
      `- 主体居中、占画面 60%~85%，一眼能认出是「${subject}」`,
      '- 背景透明（不要画背景矩形）',
      '- 禁止：文字/字母/数字、渐变、滤镜、阴影、外部引用（image/use/href）、脚本、动画',
      '- 元素总数 ≤ 40，只用 path/circle/ellipse/rect/line/polygon/polyline/g',
    ].join('\n');
    try {
      const model = process.env.LLM_AUTHOR_MODEL || undefined;
      const response = await this.withTimeout(
        this.llmClient.chatCompletion(
          [{ role: 'user', content: prompt }],
          undefined,
          4096,
          undefined,
          model,
          { temperature: 0.4 },
        ),
        LLM_TIMEOUT_MS,
        'svg draw',
      );
      const svg = extractSvg(response.content ?? '');
      if (!svg) {
        this.logger.warn(`[AssetGen] "${subject}" layer1 returned no SVG`);
        return null;
      }
      const validation = validateGeneratedSvg(svg);
      if (!validation.ok) {
        this.logger.warn(
          `[AssetGen] "${subject}" layer1 SVG invalid: ${(validation as { reason?: string }).reason || 'invalid'}`,
        );
        return null;
      }
      return svg;
    } catch (error: any) {
      this.logger.warn(`[AssetGen] "${subject}" layer1 draw failed: ${error?.message || 'unknown'}`);
      return null;
    }
  }

  private rasterize(svg: string): Buffer | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Resvg } = require('@resvg/resvg-js');
      const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: ICON_CANVAS } });
      const png: Buffer = resvg.render().asPng();
      return png.length > 0 ? png : null;
    } catch (error: any) {
      this.logger.warn(`[AssetGen] rasterize failed: ${error?.message || 'unknown'}`);
      return null;
    }
  }

  private async generateImage(subject: string): Promise<Buffer | null> {
    const endpoint = String(process.env.IMAGE_GEN_API_URL);
    const model = process.env.IMAGE_GEN_MODEL || 'gpt-image-1';
    const size = process.env.IMAGE_GEN_SIZE || '1024x1024';
    const prompt =
      `Flat vector children's illustration of ${subject}, for a preschool educational video. ` +
      'Simple rounded shapes, bold dark outlines, solid bright colors (max 6), single centered subject ' +
      'on a pure white background. No text, no letters, no numbers, no watermark, no border.';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.IMAGE_GEN_API_KEY}`,
        },
        body: JSON.stringify({ model, prompt, n: 1, size, response_format: 'b64_json' }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`image API status ${response.status}`);
      const payload = (await response.json()) as any;
      const item = payload?.data?.[0];
      if (item?.b64_json) {
        const buffer = Buffer.from(String(item.b64_json), 'base64');
        if (buffer.length < 512) throw new Error('image payload too small');
        return buffer;
      }
      if (item?.url) {
        const download = await fetch(String(item.url), { signal: controller.signal });
        if (!download.ok) throw new Error(`image download status ${download.status}`);
        const buffer = Buffer.from(await download.arrayBuffer());
        if (buffer.length < 512) throw new Error('image payload too small');
        return buffer;
      }
      throw new Error('image API returned neither b64_json nor url');
    } catch (error: any) {
      this.logger.warn(`[AssetGen] "${subject}" layer2 image gen failed: ${error?.message || 'unknown'}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** vision 验收：主体可辨认 + 扁平风格 + 无文字垃圾。未配置 vision 时只信结构校验。 */
  private async visionAccept(
    png: Buffer,
    subject: string,
  ): Promise<{ pass: boolean; passed?: boolean; reason: string }> {
    const model = this.llmClient.visionModel;
    if (!model) return { pass: true, reason: 'vision not configured — structural validation only' };
    try {
      const response = await this.withTimeout(
        this.llmClient.chatCompletion(
          [
            {
              role: 'system',
              content: [
                '你是儿童教学素材验收员。输入一张图标和它应该表现的主体。',
                '判定四条：1) 主体在场且可辨认；2) 扁平矢量儿童插画风格（不是照片/3D）；',
                '3) 无文字/字母/数字/水印/乱码；4) 单一主体、背景干净。',
                '只输出严格 JSON：{"pass":true|false,"reason":"一句话"}',
              ].join('\n'),
            },
            {
              role: 'user',
              content: `主体：${subject}`,
              images: [{ data: png.toString('base64'), mimeType: 'image/png' }],
            },
          ],
          undefined,
          1024,
          undefined,
          model,
          { temperature: 0 },
        ),
        LLM_TIMEOUT_MS,
        'vision accept',
      );
      const parsed = extractJsonObject<{ pass?: boolean; reason?: string }>(response.content ?? '');
      if (!parsed || typeof parsed.pass !== 'boolean') {
        return { pass: false, passed: false, reason: 'vision returned no JSON verdict' };
      }
      return { pass: parsed.pass, passed: parsed.pass, reason: String(parsed.reason || '').slice(0, 200) };
    } catch (error: any) {
      // 验收通道自己挂了不等于素材合格——按不通过处理，落下一层/回退
      return { pass: false, passed: false, reason: `vision call failed: ${error?.message || 'unknown'}` };
    }
  }

  private async save(
    key: string,
    subject: string,
    layer: 'svg' | 'image',
    data: Buffer,
    visionPassed?: boolean,
  ): Promise<GeneratedIcon | null> {
    const ext = layer === 'svg' ? '.svg' : '.png';
    const filePath = path.join(this.generatedDir, `${key}${ext}`);
    const staticPath = `.generated/assets/generated/${key}${ext}`;
    try {
      await fs.mkdir(this.generatedDir, { recursive: true });
      await fs.writeFile(filePath, data);
      await this.appendManifest({
        id: `generated-${key}`,
        kind: 'character',
        role: 'generated-icon',
        staticPath,
        provider: 'generated',
        license: 'generated',
        width: layer === 'svg' ? ICON_CANVAS : 1024,
        height: layer === 'svg' ? ICON_CANVAS : 1024,
        qualityScore: 84,
        subject,
        layer,
        visionPassed,
      });
      this.logger.log(
        `[AssetGen] "${subject}" generated via layer${layer === 'svg' ? 1 : 2} → ${staticPath} (vision=${visionPassed ?? 'n/a'})`,
      );
      return { staticPath, filePath, subject, layer, provider: 'generated', license: 'generated', visionPassed };
    } catch (error: any) {
      this.logger.warn(`[AssetGen] "${subject}" save failed: ${error?.message || 'unknown'}`);
      return null;
    }
  }

  private async readCache(key: string, subject: string): Promise<GeneratedIcon | null> {
    for (const layer of ['svg', 'image'] as const) {
      const ext = layer === 'svg' ? '.svg' : '.png';
      const filePath = path.join(this.generatedDir, `${key}${ext}`);
      try {
        await fs.access(filePath);
        return {
          staticPath: `.generated/assets/generated/${key}${ext}`,
          filePath,
          subject,
          layer,
          provider: 'generated',
          license: 'generated',
        };
      } catch {
        // try next layer
      }
    }
    return null;
  }

  /** 与 VisualAssetService 的下载缓存共用一份 generated manifest（同格式同文件） */
  private async appendManifest(entry: Record<string, unknown>): Promise<void> {
    let assets: any[] = [];
    try {
      const raw = await fs.readFile(this.manifestPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.assets)) assets = parsed.assets;
    } catch {
      // first entry
    }
    assets = assets.filter((a) => a?.staticPath !== entry.staticPath);
    assets.push({ ...entry, downloadedAt: new Date().toISOString() });
    await fs.mkdir(path.dirname(this.manifestPath), { recursive: true });
    await fs.writeFile(this.manifestPath, JSON.stringify({ version: 1, assets }, null, 2), 'utf-8');
  }

  private async withSlot<T>(job: () => Promise<T>): Promise<T> {
    if (this.running >= MAX_CONCURRENT) {
      await new Promise<void>((resolve) => this.waitQueue.push(resolve));
    }
    this.running += 1;
    try {
      return await job();
    } finally {
      this.running -= 1;
      const next = this.waitQueue.shift();
      if (next) next();
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}