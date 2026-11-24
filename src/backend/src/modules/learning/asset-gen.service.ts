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
import { stripThinking } from '../../agent-framework/core/utils/thinking-parser';

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
/**
 * 层1 最多画几轮。
 *
 * 2 = 首画 + 一轮带拒绝原因的重画。只加一轮是有代价的：单次 90s 超时，最坏
 * 2 倍耗时。通过率的最大杀手其实不在模型"不听话"，而在输出预算（见
 * SVG_MAX_TOKENS）——预算修好后，同一批 12 个名字一次重画都没触发。
 * 保留它的价值是兜底"说清楚就能改对"的那类失败（多写了 text、元素超量、
 * 画得不像主体）；第三轮起收益趋近于零，同一个提示词反复问只会得到同样的答案。
 */
const MAX_DRAW_ROUNDS = 2;
/** 上次内容回灌给模型时的字数上限：够它认出自己画了啥，又不会把上下文撑爆 */
const FEEDBACK_SVG_LIMIT = 4000;
/**
 * 单次绘制的输出预算。
 *
 * 这个数字是实测出来的，不是拍的：原来写 4096，思考型模型（deepseek-v4.1-flash）
 * 把 4096 全用在 reasoning 上——`finishReason=length`、`completionTokens` 正好
 * 4096、`content` 空串，正文一个字都没开始写。表现就是"6 个名字只画出 1 个"，
 * 而日志里只能看到"没有 <svg>"，很容易误判成模型在写说明文。
 *
 * 换成 8192 后同一个词思考用 5845、正文约 300，正常出图；这里取 16384 是给
 * 复杂主体留余量——上限只是天花板，模型不会因为上限高就思考得更久。
 */
const SVG_MAX_TOKENS = 16384;
/**
 * vision 验收的输出预算。
 *
 * 和层1 是同一类病：2026-11-25 切到 sensenova-6.8-flash 后实测，只给 2048
 * 时模型思考 26s 把预算顶满，`finishReason=length`、`content` 空串；
 * visionAccept 解析不到 JSON 就判不通过，好图被误杀成占位件。
 * 一句 JSON 的正文很短，但思考型模型的 reasoning 不受正文长度影响，
 * 所以这里要和绘制预算同一量级。
 */
const VISION_MAX_TOKENS = 8192;

/**
 * 结构校验的 reason → 模型能照着改的话。
 *
 * 直接把 `forbidden tag (text/script/...)` 喂回去，模型经常理解成"少用点"，
 * 下一版照样带 text。所以逐条翻译成"要什么"而不是"禁什么"。
 */
const DRAW_REASON_HINTS: Record<string, string> = {
  'empty or too large': '上一版内容为空或超过 32KB，只输出一个精简的 <svg>',
  'no <svg> root': '上一次回复里没有 <svg> 标签——只输出 SVG 本体，不要任何说明文字',
  'no viewBox/width': '必须带 viewBox="0 0 256 256"',
  'forbidden tag (text/script/external ref/filter)':
    '不允许 text/tspan/script/image/use/filter/style/animate 标签；需要"字"就用图形拼，或者干脆不画文字',
  'forbidden attribute (href/on*/url()/data:)':
    '不允许 href/xlink/on*/url()/data: 属性；填充写死色值如 fill="#FFB020"',
  'fewer than 2 shape elements': '至少要有 2 个图形元素（path/circle/ellipse/rect/line/polygon）',
  'too many elements': '元素总数压到 40 个以内，用更少的形状表达同样的东西',
};

/**
 * 一次绘制的结论：`ok` 时给 `svg`，否则给"为什么不能用"（`reason` 已翻成人话，
 * `sample` 是回灌给模型的上一版片段）。
 *
 * `fatal` 表示"重画也不会变好"——目前只有一种：输出预算被思考过程吃光
 * （`finishReason=length`），第二轮只会同样截断，白等 30s。
 *
 * 写成可选字段而不是判别联合，是因为后端 `strictNullChecks` 关闭，
 * `if (attempt.ok)` 不窄化到失败分支——判别联合在这里只是噪声。
 */
type DrawAttempt = {
  ok: boolean;
  svg?: string;
  reason?: string;
  sample?: string;
  fatal?: boolean;
};

/** 回灌给模型的上一版信息 */
type DrawFeedback = { reason: string; sample?: string };

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

/**
 * 去掉外层 `<svg>`，只留可内联的几何；同时读出绘图盒边长。
 *
 * 为什么需要它：道具要画进 `Puppet2D` 的 `<svg>` 世界坐标里，外面不能再套一层
 * `<svg>`（嵌套 viewBox 会把坐标重新解释一遍，位置和大小全乱）。
 *
 * `canvas` 取 viewBox 的宽：PropGlyph 只需要"盒子多大、内容居中"。
 * 非正方形直接放弃——居中的假设不成立，画出来会偏心，而这种偏移
 * 在成片里表现为"这个道具飘在半空"，很难归因。
 */
export function stripSvgOuter(svg: string): { markup: string; canvas: number } | null {
  if (!svg) return null;
  const open = svg.match(/<svg[^>]*>/i);
  if (!open) return null;
  const attrs = open[0];
  const viewBox = attrs.match(/viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)\s*["']/i);
  let canvas = 0;
  if (viewBox) {
    const w = Number(viewBox[3]);
    const h = Number(viewBox[4]);
    if (!(w > 0) || !(h > 0) || Math.abs(w - h) > 0.5) return null;
    canvas = w;
  } else {
    // 没有 viewBox 时退回 width/height（两者都是纯数字才算数）
    const w = attrs.match(/width\s*=\s*["']([\d.]+)["']/i);
    const h = attrs.match(/height\s*=\s*["']([\d.]+)["']/i);
    const wv = w ? Number(w[1]) : 0;
    const hv = h ? Number(h[1]) : 0;
    if (!(wv > 0) || !(hv > 0) || Math.abs(wv - hv) > 0.5) return null;
    canvas = wv;
  }
  const bodyStart = svg.indexOf('>', svg.search(/<svg[\s>]/i)) + 1;
  const bodyEnd = svg.lastIndexOf('</svg>');
  if (bodyStart <= 0 || bodyEnd <= bodyStart) return null;
  const markup = svg.slice(bodyStart, bodyEnd).trim();
  if (!markup) return null;
  return { markup, canvas };
}

/**
 * 生成物在画布里的实际占位，用像素量出来而不是按提示词猜。
 *
 * 三个字段都是**画布坐标**（与 markup 同一套单位），所以调用方不需要知道
 * 光栅化到了多少像素：
 *  - `fill`：内容高度 ÷ 画布高度。PropGlyph 用它把"要高多少"换算成缩放系数；
 *  - `anchorX`：内容水平中心在画布里的 x（道具要"挂"在手上的点）；
 *  - `anchorY`：内容底边在画布里的 y（道具要"站"在地上的点）。
 *
 * 为什么必须有后两个：早先的版本假设"内容在 viewBox 里垂直居中"，于是把底边
 * 算成 `画布/2 + 画布/2 × fill`。模型画的图十张里没有一张是真居中的——留白
 * 全在一边的图会让道具悬空或陷进地里，误差是 `(下留白 − 上留白)/2`，道具越大
 * 越明显。既然为了 fill 已经要量包围盒，顺手把底边和中心一起量出来是零成本。
 */
export type SvgContentBox = {
  fill: number;
  anchorX: number;
  anchorY: number;
};

/** 低于这个 alpha 视为全透明：抗锯齿边缘会带一圈 alpha=1~5 的毛边，算进去会虚大 */
const ALPHA_THRESHOLD = 8;
/**
 * 量出来的高度占比下限。
 *
 * 用来挡"画了一个 3px 的小点"这种退化产物：那样的图画到画面里会被放大成
 * 一团糊。低于 0.15 时按 0.15 算，宁可偏小也不要糊满屏——但要注意这只会
 * 影响大小，底边锚点仍然是真的。
 */
const MIN_MEASURED_FILL = 0.15;

/**
 * 从 RGBA 像素里量内容包围盒（纯函数，单测直接喂合成像素）。
 *
 * 坐标换算：像素行 `r` 覆盖 `[r, r+1)`，所以底边是 `bot + 1` 而不是 `bot`；
 * 少这 1 像素在 256 画布上是 0.4% 的高度误差，量级虽小但会在 gallery 里
 * 表现为"每个道具都往下沉半像素"。
 */
export function measureContentBox(
  pixels: Buffer,
  width: number,
  height: number,
  canvas: number,
): SvgContentBox | null {
  if (!pixels || !pixels.length || width <= 0 || height <= 0 || canvas <= 0) return null;
  if (pixels.length < width * height * 4) return null;
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (pixels[(row + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  // 全透明 = 这张图什么都看不见，交给调用方当失败处理（占位件比空气好）
  if (bottom < 0) return null;
  const kx = canvas / width;
  const ky = canvas / height;
  const rawFill = (bottom - top + 1) / height;
  return {
    fill: Math.min(1, Math.max(MIN_MEASURED_FILL, rawFill)),
    anchorX: ((left + right + 1) / 2) * kx,
    anchorY: (bottom + 1) * ky,
  };
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
   *
   * `svgOnly`：只用层1（矢量）。道具必须用它——层2 是文生图，提示词要求
   * "pure white background"，贴到草地/地板上就是一块白方块；去背又会引入
   * 不确定性，比"没有这个道具"更糟（见 docs/lesson-video-prop-protocol.md §5.3）。
   */
  async generateSubjectIcon(
    subjectRaw: string,
    opts: { svgOnly?: boolean } = {},
  ): Promise<GeneratedIcon | null> {
    const subject = String(subjectRaw || '').trim().slice(0, 12);
    if (!subject) return null;
    if (!this.isEnabled) {
      this.logger.debug(`[AssetGen] disabled (ASSET_GEN=off or LLM unconfigured), skip "${subject}"`);
      return null;
    }

    const key = this.cacheKey(subject);
    const cached = await this.readCache(key, subject, opts.svgOnly);
    if (cached) return cached;

    // 并发去重按模式分开：svgOnly 的任务不会产出位图，让"允许位图"的请求
    // 共用它，会在层1 失败时把本可成功的位图也一起丢掉。
    const flightKey = opts.svgOnly ? `${key}:svg` : key;
    const existing = this.inFlight.get(flightKey);
    if (existing) return existing;

    const job = this.withSlot(() => this.generate(key, subject, opts));
    this.inFlight.set(flightKey, job);
    try {
      return await job;
    } finally {
      this.inFlight.delete(flightKey);
    }
  }

  /**
   * 取一个主体的**内联 SVG 几何**（道具渲染用）。
   *
   * 为什么不返回路径：道具画在 `Puppet2D` 的 `<svg>` 里、世界坐标中，HTML `<Img>`
   * 塞不进去；`<image href>` 要 delayRender，文件一缺就是白图且不报错。所以只要
   * 层1 的矢量内容，去掉外层 `<svg>` 后内联。
   *
   * 返回的 `canvas` 取原 viewBox 的边长：PropGlyph 只需要"盒子多大、内容居中"，
   * 不需要知道这是 256 还是别的尺寸——模型偶尔不按 256 画，按实际值走即可，
   * 强行当 256 会把图形按比例缩小（看起来像"这个道具特别小"）。
   *
   * `box` 是光栅化后量出来的实际占位（见 `measureContentBox`）。量不出来时
   * 返回 undefined，调用方退回"内容居中、占七成"的老假设——宁可尺寸差一点，
   * 也不要因为测量失败让整个道具消失。
   */
  async loadSubjectSvg(
    subjectRaw: string,
  ): Promise<{ markup: string; canvas: number; box?: SvgContentBox } | null> {
    const subject = String(subjectRaw || '').trim().slice(0, 12);
    if (!subject) return null;
    const icon = await this.generateSubjectIcon(subject, { svgOnly: true });
    if (!icon || icon.layer !== 'svg') return null;
    let raw: string;
    try {
      raw = await fs.readFile(icon.filePath, 'utf-8');
    } catch (error: any) {
      this.logger.warn(`[AssetGen] read svg failed for "${subject}": ${error?.message || 'unknown'}`);
      return null;
    }
    // 缓存里的文件可能早于当前校验规则（STYLE_VERSION 变更前生成的），再验一次
    const validation = validateGeneratedSvg(raw);
    if (!validation.ok) {
      this.logger.warn(
        `[AssetGen] cached svg for "${subject}" no longer valid: ${(validation as { reason?: string }).reason || 'invalid'}`,
      );
      return null;
    }
    const inner = stripSvgOuter(raw);
    if (!inner) {
      this.logger.warn(`[AssetGen] svg for "${subject}" has no measurable viewBox`);
      return null;
    }
    const box = this.measureSvgContent(raw, inner.canvas);
    if (!box) {
      this.logger.warn(`[AssetGen] svg for "${subject}" has no visible content — caller falls back to default box`);
    }
    return { ...inner, box: box || undefined };
  }

  /** 光栅化后量内容包围盒；渲染/测量任一步失败都返回 null 而不是抛错 */
  measureSvgContent(svg: string, canvas: number): SvgContentBox | null {
    const rendered = this.renderSvg(svg);
    if (!rendered) return null;
    return measureContentBox(rendered.pixels, rendered.width, rendered.height, canvas);
  }

  private async generate(
    key: string,
    subject: string,
    opts: { svgOnly?: boolean } = {},
  ): Promise<GeneratedIcon | null> {
    // 层1：LLM 现画 SVG（首画 + 最多一轮带拒绝原因的重画）
    const drawn = await this.drawAcceptedSvg(subject);
    if (drawn) {
      const saved = await this.save(
        key,
        subject,
        'svg',
        Buffer.from(drawn.svg, 'utf-8'),
        drawn.visionPassed,
      );
      if (saved) return saved;
    }

    if (opts.svgOnly) {
      this.logger.warn(`[AssetGen] "${subject}" svg-only layer failed — caller falls back to placeholder`);
      return null;
    }

    // 层2：文生图（未配置则整层关闭）。
    // 这一层不做重画：单次 120s、按张计费，且失败多是"提示词表达不到位"，
    // 换一句话重来一遍也未必好——不如直接让调用方回退矢量库。
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

  /**
   * 画到"通过所有闸门"为止，最多 `MAX_DRAW_ROUNDS` 轮。
   *
   * 为什么重画而不是放宽校验：失败里有一类确实是"说清楚就能改对"的——多写了
   * text、元素超量、画得不像主体。放宽结构校验只会让脏 SVG 进画面，而把上次的
   * 拒绝原因连同它自己写的内容一起贴回去，比换提示词、加示例都直接。
   *
   * 另有一类重画无用：输出预算被思考过程吃光（`finishReason=length`）。这类已在
   * drawSvgOnce 里标成 `fatal`，这里直接放弃，不做无谓的第二轮。
   *
   * 闸门顺序与原来一致：结构（便宜）→ 光栅化（验能不能渲染）→ vision（验像不像）。
   * 每个闸门拒绝都转成一句可执行的话，而不是把失败码原样丢回去。
   */
  private async drawAcceptedSvg(
    subject: string,
  ): Promise<{ svg: string; visionPassed?: boolean } | null> {
    let feedback: DrawFeedback | undefined;
    for (let round = 1; round <= MAX_DRAW_ROUNDS; round += 1) {
      const attempt = await this.drawSvgOnce(subject, feedback);
      if (attempt.ok) {
        const svg = attempt.svg || '';
        const png = svg ? this.rasterize(svg) : null;
        if (png) {
          const verdict = await this.visionAccept(png, subject);
          if (verdict.pass) return { svg, visionPassed: verdict.passed };
          // 画面被拒时把它自己画的整段回灌——光说"不像水桶"，它会照着原样再画一遍
          feedback = {
            reason: `画面验收没通过：${verdict.reason || '看不出是这个主体'}`,
            sample: svg,
          };
          this.logger.warn(`[AssetGen] "${subject}" layer1 SVG rejected by vision: ${verdict.reason}`);
        } else {
          // 渲不出图 = 路径/属性语法坏了，重画比留一张空白图强
          feedback = { reason: '画出来的 SVG 渲染不出图像（路径或属性语法有问题）', sample: svg };
        }
      } else {
        feedback = { reason: attempt.reason || '未知原因', sample: attempt.sample };
        // 预算被吃光这类失败重画也不会变好，直接放弃，省掉一次 30s 的空转
        if (attempt.fatal) {
          this.logger.warn(
            `[AssetGen] "${subject}" layer1 give up without redraw: ${feedback.reason}`,
          );
          return null;
        }
      }

      const more = round < MAX_DRAW_ROUNDS;
      this.logger.warn(
        `[AssetGen] "${subject}" layer1 round ${round}/${MAX_DRAW_ROUNDS} rejected: ${feedback.reason}` +
          (more ? ' — redrawing once with feedback' : ''),
      );
      if (!more) return null;
    }
    return null;
  }

  /** 单次绘制：组装提示词 → 调模型 → 抽 SVG → 结构校验。不碰缓存与落盘。 */
  private async drawSvgOnce(subject: string, feedback?: DrawFeedback): Promise<DrawAttempt> {
    const prompt = [
      `为「${subject}」画一个单独的扁平矢量儿童插画图标。`,
      '要求：',
      `- 只输出一个 <svg>，viewBox="0 0 ${ICON_CANVAS} ${ICON_CANVAS}"，不要输出任何其他文字`,
      '- 扁平儿童插画风格：粗深色轮廓、圆润造型、纯色填充，颜色 ≤ 6 种',
      `- 主体居中、占画面 60%~85%，一眼能认出是「${subject}」`,
      '- 背景透明（不要画背景矩形）',
      '- 禁止：文字/字母/数字、渐变、滤镜、阴影、外部引用（image/use/href）、脚本、动画',
      '- 元素总数 ≤ 40，只用 path/circle/ellipse/rect/line/polygon/polyline/g',
      ...(feedback ? ['', this.describeFeedback(feedback)] : []),
    ].join('\n');
    try {
      const model = process.env.LLM_AUTHOR_MODEL || undefined;
      const response = await this.withTimeout(
        this.llmClient.chatCompletion(
          [{ role: 'user', content: prompt }],
          undefined,
          SVG_MAX_TOKENS,
          undefined,
          model,
          { temperature: 0.4 },
        ),
        LLM_TIMEOUT_MS,
        'svg draw',
      );
      // 预算被思考吃光时 content 是空串，`finishReason` 是唯一线索。
      // 不把它当"可修复"：第二轮只会同样截断，白等一次 30s。
      const truncated = response.finishReason === 'length';
      const budgetNote = truncated
        ? '（输出预算全用在思考上、正文被截断；重画只会同样被截断）'
        : '';
      // 思考型模型会把正文放在 think 块里（或干脆只在 reasoning 通道里）。
      // chatCompletion 不做剥离，这里必须先剥再找 <svg>，否则"画得很好但全在
      // 思考块里"会被当成"没画"——实测见过 content 整段是思考、样本为空串。
      const text = stripThinking(response.content ?? '');
      const svg = extractSvg(text);
      if (!svg) {
        // 把回包开头记下来：模型"不按格式返回"是最常见的失败，没有这段样本
        // 只能反复重跑猜它到底写了什么（实测见过整段说明文、也见过空串）。
        const sample = text.replace(/\s+/g, ' ').slice(0, 160);
        this.logger.warn(
          `[AssetGen] "${subject}" layer1 returned no SVG (sample: "${sample}", finish=${response.finishReason || '?'})`,
        );
        return {
          ok: false,
          reason: `上一次回复里没有 <svg> 标签——只输出 SVG 本体，不要任何说明文字${budgetNote}`,
          sample,
          fatal: truncated,
        };
      }
      const validation = validateGeneratedSvg(svg);
      if (!validation.ok) {
        const code = (validation as { reason?: string }).reason || 'invalid';
        this.logger.warn(`[AssetGen] "${subject}" layer1 SVG invalid: ${code}`);
        return {
          ok: false,
          reason: (DRAW_REASON_HINTS[code] || `结构校验未通过：${code}`) + budgetNote,
          sample: svg,
          fatal: truncated,
        };
      }
      return { ok: true, svg };
    } catch (error: any) {
      const message = error?.message || 'unknown';
      this.logger.warn(`[AssetGen] "${subject}" layer1 draw failed: ${message}`);
      return { ok: false, reason: `上一次绘制调用失败（${message}）`, sample: '' };
    }
  }

  /** 把拒绝原因和上一版内容写成"照着改"的一段话；不含反引号，免得模型照着输出围栏。 */
  private describeFeedback(feedback: DrawFeedback): string {
    const lines = ['## 上一版被拒，请修正后重画', `拒绝原因：${feedback.reason}`];
    if (feedback.sample) {
      const clipped =
        feedback.sample.length > FEEDBACK_SVG_LIMIT
          ? `${feedback.sample.slice(0, FEEDBACK_SVG_LIMIT)}…（后略）`
          : feedback.sample;
      lines.push(`上一版内容：${clipped}`);
    }
    lines.push('只输出修正后的 <svg> 本体，不要解释。');
    return lines.join('\n');
  }

  /**
   * 渲一次图，同时给出 PNG 与原始 RGBA。
   *
   * 两个产物各有用途：PNG 给 vision 验收（它要的是图片），RGBA 给包围盒测量
   * （它要的是 alpha 通道）。渲两次会白白多花一倍 CPU，所以一次拿全。
   */
  private renderSvg(svg: string): { png: Buffer; pixels: Buffer; width: number; height: number } | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Resvg } = require('@resvg/resvg-js');
      const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: ICON_CANVAS } });
      const image = resvg.render();
      const png: Buffer = image.asPng();
      if (!png || !png.length) return null;
      return { png, pixels: image.pixels, width: image.width, height: image.height };
    } catch (error: any) {
      this.logger.warn(`[AssetGen] rasterize failed: ${error?.message || 'unknown'}`);
      return null;
    }
  }

  private rasterize(svg: string): Buffer | null {
    return this.renderSvg(svg)?.png || null;
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
          // 正文只有一句 JSON，但思考型模型的 reasoning 会先吃掉预算：
          // 2048 在 sensenova 上实测必截断（见 VISION_MAX_TOKENS）。
          VISION_MAX_TOKENS,
          undefined,
          model,
          { temperature: 0 },
        ),
        LLM_TIMEOUT_MS,
        'vision accept',
      );
      const parsed = extractJsonObject<{ pass?: boolean; reason?: string }>(response.content ?? '');
      if (!parsed || typeof parsed.pass !== 'boolean') {
        return {
          pass: false,
          passed: false,
          reason: `vision returned no JSON verdict (finish=${response.finishReason || '?'})`,
        };
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

  private async readCache(
    key: string,
    subject: string,
    svgOnly = false,
  ): Promise<GeneratedIcon | null> {
    const layers = svgOnly ? (['svg'] as const) : (['svg', 'image'] as const);
    for (const layer of layers) {
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