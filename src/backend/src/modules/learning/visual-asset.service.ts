import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  type AnimalSubjectConfig,
  ANIMAL_SUBJECTS,
  inferAnimalFromText,
} from './animal-subjects.config';
import type { SceneGraph } from './video/scene-graph';
import type { FigureSpec } from './video/figure-spec';
import { AssetGenService, type SvgContentBox } from './asset-gen.service';

export type VisualAssetKind = 'character' | 'background' | 'overlay';

/**
 * 素材缺失的三种归因。三者对应三种完全不同的动作，混在一起就只能靠猜：
 * 补素材 / 修匹配器 / 接受降级。
 */
export type AssetMissReason =
  /** 库里真的没有（青草、石头、树根）：只能补素材，任何算法都救不了 */
  | 'not-in-library'
  /** 库里有弱相关项（松树→大树、桃花→花朵）：能用，但语义会失真，得人来定 */
  | 'degraded-candidate'
  /** 库里有强相关项却没命中（叫法不同）：匹配器的问题 */
  | 'no-match';

export type AssetMissVerdict = {
  reason: AssetMissReason;
  nearestRole?: string;
  nearestAlias?: string;
  /** 去掉虚词后能对上的最长连续字数，1=弱相关，≥2=强相关 */
  overlap: number;
};

/**
 * 算相似度时跳过的字。它们几乎出现在任何词组里，算进相似度只会误判：
 * 「小燕子」和「小鸟」共用一个「小」就判成"有相关项"，实际上库里根本没有燕子。
 */
const NEUTRAL_CHARS = new Set('的了在是我有和就不都一个上也很到小大子们这那什么着会开出来去'.split(''));

const stripNeutral = (s: string) =>
  s
    .split('')
    .filter((c) => !NEUTRAL_CHARS.has(c))
    .join('');

/** 最长公共连续子串长度（去掉虚词后）。只用于归因，不参与匹配决策 */
export function longestCommonRun(a: string, b: string): number {
  const x = stripNeutral(a);
  const y = stripNeutral(b);
  if (!x || !y) return 0;
  let prev = new Array(y.length + 1).fill(0) as number[];
  let cur = new Array(y.length + 1).fill(0) as number[];
  let best = 0;
  for (let i = 1; i <= x.length; i += 1) {
    for (let j = 1; j <= y.length; j += 1) {
      cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : 0;
      if (cur[j] > best) best = cur[j];
    }
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return best;
}

/**
 * 给一次素材缺失归因。
 *
 * 只做判定，不做映射——匹配器不该"猜最近的"，那是另一件事（降级映射），
 * 要单独开关、单独验收。这里只回答"这次 miss 该记到哪一栏"。
 *
 * 判据要收得很紧，否则中文单字会把所有东西串成一团：
 * 第一版只看"有没有公共字"，于是「荷花」撞上「梅花鹿」、「稻草人」撞上「草莓」、
 * 「水蒸气」撞上「水稻」，全被误判成"库里有近似项"。
 * 现在：两字以上连续重叠，或者去掉虚词后完全相等，才算"库里有"；
 * 单个字的别名（花/树/鸟/雪）只能当降级候选，而且要覆盖一半以上才算。
 */
export function classifyAssetMiss(
  subject: string,
  aliases: Array<{ role: string; alias: string }>,
): AssetMissVerdict {
  const q = stripNeutral(subject);
  if (!q) return { reason: 'not-in-library', overlap: 0 };

  let bestRank = 0;
  let bestCoverage = 0;
  let bestRun = 0;
  let nearestRole: string | undefined;
  let nearestAlias: string | undefined;

  for (const item of aliases) {
    const a = stripNeutral(item.alias);
    if (!a) continue;
    const run = longestCommonRun(subject, item.alias);
    if (run === 0) continue;
    const coverage = run / Math.max(q.length, a.length);
    let rank = 0;
    if (q === a || run >= 2) rank = 2;
    else if (a.length <= 2 && coverage >= 0.5) rank = 1;
    if (rank === 0) continue;
    if (rank > bestRank || (rank === bestRank && coverage > bestCoverage)) {
      bestRank = rank;
      bestCoverage = coverage;
      bestRun = run;
      nearestRole = item.role;
      nearestAlias = item.alias;
    }
  }

  if (bestRank === 2) return { reason: 'no-match', nearestRole, nearestAlias, overlap: bestRun };
  if (bestRank === 1) {
    return { reason: 'degraded-candidate', nearestRole, nearestAlias, overlap: bestRun };
  }
  return { reason: 'not-in-library', overlap: 0 };
}

export type VisualAssetLicense = {
  license: string;
  licenseUrl?: string;
  creator?: string;
  sourceUrl?: string;
  landingUrl?: string;
};

export type VisualAsset = VisualAssetLicense & {
  id: string;
  kind: VisualAssetKind;
  role: string;
  staticPath: string;
  provider: 'local' | 'vector' | 'openverse' | 'wikimedia' | 'kenney' | 'svgFallback' | 'generated';
  width?: number;
  height?: number;
  qualityScore: number;
};

export type SceneVisualAssetPlan = {
  mainCharacter?: VisualAsset;
  background?: VisualAsset;
  overlays: VisualAsset[];
  sourceProvider: string;
  licenseInfo?: VisualAssetLicense;
  qualityScore: number;
};

type ResolveSceneInput = {
  id?: string;
  title?: string;
  narration?: string;
  visualDescription?: string;
  assetKey?: string;
  assetTags?: string[];
  action?: string;
  habitat?: string;
};

type LocalManifest = {
  version?: number;
  assets?: VisualAsset[];
};

type AssetRequest = {
  kind: VisualAssetKind;
  role: string;
  query: string;
  tags: string[];
  minWidth: number;
  minHeight: number;
  /** 用于在素材库里做语义检索的原始文本（中文主题句），不参与网络查询 */
  searchText?: string;
  /**
   * exact=true：query 本身就是一个具体名词（关系图节点），要求别名精确命中。
   * 关闭单字别名过滤，否则「雨」「云」「火」这类单字概念永远检索不到；
   * 同时禁止长别名做子串匹配，避免「水蒸气」被匹配成「水」。
   */
  exact?: boolean;
};

type VectorManifestAsset = {
  id: string;
  kind: VisualAssetKind;
  role: string;
  category?: string;
  staticPath: string;
  provider?: string;
  license?: string;
  licenseUrl?: string;
  creator?: string;
  sourceUrl?: string;
  aliases?: string[];
  tags?: string[];
  width?: number;
  height?: number;
  qualityScore?: number;
};

type VectorManifest = {
  version?: number;
  license?: VisualAssetLicense;
  assets?: VectorManifestAsset[];
};

type AnimalSubject = string;

/** 单次场景解析（一张关系图/一份画板）里允许的素材生成次数上限 */
const MAX_GEN_PER_CALL = 6;

@Injectable()
export class VisualAssetService {
  private readonly logger = new Logger(VisualAssetService.name);
  private readonly publicDir = path.resolve(__dirname, '../../../../video-remotion/public');
  private readonly localManifestPath = path.join(
    this.publicDir,
    'assets',
    'lesson',
    'manifest.json',
  );
  private readonly generatedAssetDir = path.join(this.publicDir, '.generated', 'assets');
  private readonly vectorManifestPath = path.join(this.publicDir, 'assets', 'vector', 'manifest.json');
  private readonly assetMissLogPath = path.resolve(
    __dirname,
    '../../../storage',
    'asset-misses.jsonl',
  );
  private localManifestCache: LocalManifest | null | undefined;
  private vectorManifestCache: VectorManifest | null | undefined;

  /** assetGen 可选：单测直接 new VisualAssetService() 时不启用生成层 */
  constructor(private readonly assetGen?: AssetGenService) {}

  async resolveSceneVisualAssets(
    scene: ResolveSceneInput,
    topic: string,
  ): Promise<SceneVisualAssetPlan> {
    const requests = this.buildAssetRequests(scene, topic);
    const resolved = await Promise.all(requests.map((request) => this.resolveAsset(request)));
    const assets = resolved.filter(Boolean) as VisualAsset[];
    const mainCharacter = assets.find((asset) => asset.kind === 'character');
    const background = assets.find((asset) => asset.kind === 'background');
    const overlays = assets.filter((asset) => asset.kind === 'overlay');
    const requiresCharacter = requests.some(
      (request) => request.kind === 'character' && request.role !== 'vector-subject',
    );
    const primary = mainCharacter || (!requiresCharacter ? background : undefined) || overlays[0];
    const provider = primary?.provider || 'svgFallback';
    const resolvedQualityScore = Math.max(
      ...assets.map((asset) => asset.qualityScore),
      provider === 'svgFallback' ? 35 : 0,
    );
    const qualityScore = requiresCharacter && !mainCharacter ? 35 : resolvedQualityScore;

    return {
      mainCharacter,
      background,
      overlays,
      sourceProvider: provider,
      licenseInfo: primary
        ? {
            license: primary.license,
            licenseUrl: primary.licenseUrl,
            creator: primary.creator,
            sourceUrl: primary.sourceUrl,
            landingUrl: primary.landingUrl,
          }
        : undefined,
      qualityScore,
    };
  }

  private buildAssetRequests(scene: ResolveSceneInput, topic: string): AssetRequest[] {
    const source = `${topic} ${scene.title || ''} ${scene.narration || ''} ${
      scene.visualDescription || ''
    } ${(scene.assetTags || []).join(' ')}`;
    const animal = this.inferAnimalSubject(source, scene.assetKey);
    const action = scene.action || 'explore';
    const habitat = scene.habitat || 'forest';
    const requests: AssetRequest[] = [];

    if (animal) {
      const role = this.roleForAnimalAction(animal, action);
      requests.push({
        kind: 'character',
        role,
        query: this.queryForRole(role),
        searchText: source,
        tags: [animal, role, action, 'animal'],
        minWidth: 256,
        minHeight: 200,
      });
    } else {
      // 非动物主题（水果、器物、交通工具、植物…）也从矢量库取一个具体主体，
      // 让画面讲的是「那个东西」而不是几何图形；抽象主题匹配不到时会返回 null，
      // 仍然回落到代码绘制的示意图，因此不会把「水循环」硬贴成一张表情图。
      requests.push({
        kind: 'character',
        role: 'vector-subject',
        query: source,
        searchText: source,
        tags: [scene.assetKey || 'topic', ...(scene.assetTags || [])],
        minWidth: 256,
        minHeight: 200,
      });
    }

    const backgroundRole =
      habitat === 'river' || action === 'swim'
        ? 'river'
        : habitat === 'night'
          ? 'forest-night'
          : habitat === 'grassland'
            ? 'grassland'
            : 'forest-day';
    requests.push({
      kind: 'background',
      role: backgroundRole,
      query: this.queryForRole(backgroundRole),
      tags: [backgroundRole, 'forest', 'nature', habitat],
      minWidth: 1280,
      minHeight: 720,
    });

    if (action === 'swim') {
      requests.push({
        kind: 'overlay',
        role: 'water-splash',
        query: 'water splash transparent cc0',
        tags: ['water', 'splash', 'overlay'],
        minWidth: 256,
        minHeight: 128,
      });
    }

    return requests;
  }

  private async resolveAsset(request: AssetRequest): Promise<VisualAsset | null> {
    // 主体优先走统一矢量库：同一套作者、同一套配色，跨场景形象天然一致。
    // 背景仍走带版式的本地场景图，网络素材只作为最后的补充。
    if (request.kind === 'character') {
      const vector = await this.resolveVectorAsset(request);
      if (vector) return vector;
      // 非动物主题是「先在矢量库里找具体主体」，找不到就交给代码示意图。
      // 这里不再去 Openverse/Wikimedia 拿实拍照片：一次中文长句检索既不可控，
      // 也会让每个抽象场景白等两次网络超时。
      if (request.role === 'vector-subject') return null;
    }

    const local = await this.findLocalAsset(request);
    if (local) {
      this.logger.log(
        `[resolveAsset] role="${request.role}" resolved via local: ${local.staticPath}`,
      );
      return local;
    }

    if (request.kind !== 'character') {
      const vector = await this.resolveVectorAsset(request);
      if (vector) return vector;
    }

    this.logger.debug(`[resolveAsset] role="${request.role}" not found locally, trying Openverse`);

    const openverse = await this.resolveOpenverseAsset(request);
    if (openverse) return openverse;

    const wikimedia = await this.resolveWikimediaAsset(request);
    if (wikimedia) return wikimedia;

    const kenney = await this.resolveKenneyAsset(request);
    if (kenney) return kenney;

    this.logger.warn(
      `[resolveAsset] role="${request.role}" unresolved: all providers returned null`,
    );
    return null;
  }

  private async findLocalAsset(request: AssetRequest): Promise<VisualAsset | null> {
    const manifest = await this.loadLocalManifest();
    const assets = manifest?.assets || [];

    const matchCriteria = (asset: VisualAsset) =>
      asset.kind === request.kind &&
      (!asset.provider || asset.provider === 'local') &&
      this.isAllowedLicense(asset.license) &&
      this.meetsMinimumSize(asset, request);

    const exactMatch = assets.find((asset) => matchCriteria(asset) && asset.role === request.role);
    if (exactMatch) {
      return {
        ...exactMatch,
        provider: exactMatch.provider || 'local',
        qualityScore: exactMatch.qualityScore || 88,
      };
    }

    const animalPrefix = request.role.split('-')[0];
    if (animalPrefix && animalPrefix !== request.role) {
      const prefixMatch = assets.find(
        (asset) => matchCriteria(asset) && asset.role.startsWith(animalPrefix + '-'),
      );
      if (prefixMatch) {
        this.logger.log(
          `[findLocalAsset] 请求 "${request.role}" 未精确匹配，使用前缀兜底 "${prefixMatch.role}"`,
        );
        return {
          ...prefixMatch,
          provider: prefixMatch.provider || 'local',
          qualityScore: (prefixMatch.qualityScore || 88) - 2,
        };
      }
    }

    return null;
  }

  private async resolveKenneyAsset(request: AssetRequest): Promise<VisualAsset | null> {
    const manifest = await this.loadLocalManifest();
    const assets = manifest?.assets || [];
    const match = assets.find(
      (asset) =>
        asset.kind === request.kind &&
        asset.role === request.role &&
        asset.provider === 'kenney' &&
        this.isAllowedLicense(asset.license) &&
        this.meetsMinimumSize(asset, request),
    );
    if (!match) return null;
    return {
      ...match,
      provider: 'kenney',
      qualityScore: match.qualityScore || 74,
    };
  }

  /**
   * 在本地矢量库里按语义找主体。
   *
   * 只接受长度 >= 2 的别名，避免「一」「心」这类单字在任意句子里误命中；
   * 打分用别名长度加权，长别名更具体，因此「大老虎」会赢过「老虎」。
   * 匹配不到返回 null，由调用方决定回落策略，不做「最相近」的强行兜底。
   */
  /**
   * 给关系图的每个节点找图标。找不到不是错误——渲染器会用占位形状顶上，
   * 画面结构（关系、箭头、标签）依然成立，只是图标退化成首字。
   * 但每次 miss 都记一笔，这是素材库该往哪儿扩的唯一依据。
   */
  async resolveGraphIcons(graph: SceneGraph, topic: string): Promise<Record<string, string>> {
    const icons: Record<string, string> = {};
    const budget = { left: MAX_GEN_PER_CALL };
    await Promise.all(
      graph.nodes.map(async (node) => {
        const resolved = await this.resolveSubjectIcon(node.subject, topic, budget);
        if (resolved) {
          icons[node.id] = resolved.src;
          // 生成救回的 miss 仍记一笔（带 rescued 标记）：这是素材库该往哪儿扩的依据
          if (resolved.generated) await this.recordAssetMiss(node.subject, topic, true);
          return;
        }
        await this.recordAssetMiss(node.subject, topic, false);
      }),
    );
    return icons;
  }

  /**
   * 受控画板的 subjectIcon 解析：与关系图节点同一条查找链
   * （矢量库精确命中 → 生成层），解析结果写回 shape.iconSrc。
   * 解析不到不报错——渲染器画占位圆，几何结构依然成立。
   */
  async resolveFigureIcons(figure: FigureSpec, topic: string): Promise<void> {
    const icons = figure.shapes.filter((s) => s.kind === 'subjectIcon');
    if (icons.length === 0) return;
    const budget = { left: MAX_GEN_PER_CALL };
    const subjects = [...new Set(icons.map((s) => (s.kind === 'subjectIcon' ? s.subject : '')))].filter(Boolean);
    const resolved = new Map<string, string>();
    await Promise.all(
      subjects.map(async (subject) => {
        const hit = await this.resolveSubjectIcon(subject, topic, budget);
        if (hit) {
          resolved.set(subject, hit.src);
          if (hit.generated) await this.recordAssetMiss(subject, topic, true);
        } else {
          await this.recordAssetMiss(subject, topic, false);
        }
      }),
    );
    for (const shape of icons) {
      if (shape.kind !== 'subjectIcon') continue;
      const src = resolved.get(shape.subject);
      if (src) shape.iconSrc = src;
    }
  }

  /**
   * 道具用的内联几何（不是文件路径）。
   *
   * 走的是和关系图节点同一条生成链（矢量库→LLM 现画→验收→磁盘缓存），
   * 区别只有两点：只接受层1（矢量）——文生图产物是白底位图，贴到草地上
   * 就是一块白方块；返回内联 markup——道具画在 `Puppet2D` 的 `<svg>` 里，
   * 世界坐标中塞不进 HTML `<Img>`，也没有异步加载的余地。
   *
   * 返回的 `box` 是光栅化后量出来的真实占位（内容高度/底边/水平中心），
   * 渲染层据此定尺寸与落点；缺省时渲染层退回"居中占七成"的老假设。
   *
   * 与 `resolveSubjectIcon` 一样：生成不可用/失败返回 null，调用方回退占位件。
   */
  async loadPropSvg(
    subject: string,
  ): Promise<{ markup: string; canvas: number; box?: SvgContentBox } | null> {
    if (!this.assetGen?.isEnabled) return null;
    return this.assetGen.loadSubjectSvg(subject);
  }

  /**
   * 单个具体主体的图标查找：先矢量库（character/overlay 两栏精确命中），
   * miss 再走生成层。budget 限制单次场景解析里的生成次数——素材生成是
   * 加分项，不能让一张 20 节点的图把出片拖进分钟级等待。
   */
  private async resolveSubjectIcon(
    subject: string,
    topic: string,
    budget: { left: number },
  ): Promise<{ src: string; generated: boolean } | null> {
    const base: AssetRequest = {
      kind: 'character',
      role: 'graph-node',
      query: subject,
      tags: [subject],
      minWidth: 0,
      minHeight: 0,
      searchText: subject,
      exact: true,
    };
    const hit =
      (await this.resolveVectorAsset(base)) ||
      (await this.resolveVectorAsset({ ...base, kind: 'overlay' }));
    if (hit) return { src: hit.staticPath, generated: false };

    if (this.assetGen?.isEnabled && budget.left > 0) {
      budget.left -= 1;
      const generated = await this.assetGen.generateSubjectIcon(subject);
      if (generated) return { src: generated.staticPath, generated: true };
    } else if (this.assetGen?.isEnabled && budget.left <= 0) {
      this.logger.warn(
        `[resolveSubjectIcon] "${subject}" (topic=${topic}) generation budget exhausted — placeholder fallback`,
      );
    }
    return null;
  }

  private async recordAssetMiss(subject: string, topic: string, rescued = false): Promise<void> {
    const verdict = await this.classifyMiss(subject);
    const line = `${JSON.stringify({
      at: new Date().toISOString(),
      subject,
      topic,
      reason: verdict.reason,
      ...(verdict.nearestRole ? { nearest: verdict.nearestRole } : {}),
      ...(verdict.nearestAlias ? { nearestAlias: verdict.nearestAlias } : {}),
      overlap: verdict.overlap,
      rescued,
    })}\n`;
    try {
      await fs.mkdir(path.dirname(this.assetMissLogPath), { recursive: true });
      await fs.appendFile(this.assetMissLogPath, line, 'utf-8');
    } catch (error: any) {
      // 缺失记录是运营信号，不是出片依赖，写不进去不能拖垮渲染
      this.logger.debug(`[recordAssetMiss] failed to append: ${error?.message || 'unknown'}`);
    }
  }

  /** 把整个矢量库的别名摊平，交给纯函数归因 */
  private async classifyMiss(subject: string): Promise<AssetMissVerdict> {
    const manifest = await this.loadVectorManifest();
    const aliases: Array<{ role: string; alias: string }> = [];
    for (const asset of manifest?.assets || []) {
      for (const alias of asset.aliases || asset.tags || []) {
        aliases.push({ role: asset.role, alias: String(alias) });
      }
    }
    return classifyAssetMiss(subject, aliases);
  }

  private async resolveVectorAsset(request: AssetRequest): Promise<VisualAsset | null> {
    const manifest = await this.loadVectorManifest();
    const assets = (manifest?.assets || []).filter((asset) => asset.kind === request.kind);
    if (assets.length === 0) return null;

    const query = String(request.query || '')
      .toLowerCase()
      .trim();
    const haystack = [request.searchText || '', request.query, ...request.tags]
      .join(' ')
      .toLowerCase();
    if (!haystack.trim()) return null;

    let best: VectorManifestAsset | null = null;
    let bestScore = 0;
    let bestAlias = '';

    for (const asset of assets) {
      const aliases = asset.aliases || asset.tags || [];
      let score = 0;
      let hitAlias = '';
      for (const alias of aliases) {
        const needle = String(alias).toLowerCase().trim();
        if (!needle) continue;
        const exactHit = request.exact && query === needle;
        if (!exactHit) {
          // 单字别名只在完全相等时才算命中：否则「水蒸气」会被判成「水」
          if (needle.length < 2) continue;
          if (!haystack.includes(needle)) continue;
        }
        const weighted = needle.length;
        if (weighted > score) {
          score = weighted;
          hitAlias = needle;
        }
      }
      if (score > bestScore) {
        best = asset;
        bestScore = score;
        bestAlias = hitAlias;
      }
    }

    if (!best) return null;

    this.logger.log(
      `[resolveVectorAsset] role="${request.role}" matched "${best.role}" via alias "${bestAlias}" (${best.staticPath})`,
    );

    return {
      id: best.id,
      kind: best.kind,
      role: best.role,
      staticPath: best.staticPath,
      provider: 'vector',
      license: best.license || manifest?.license?.license || 'mit',
      licenseUrl: best.licenseUrl || manifest?.license?.licenseUrl,
      creator: best.creator || manifest?.license?.creator,
      sourceUrl: best.sourceUrl || manifest?.license?.sourceUrl,
      width: best.width || 1024,
      height: best.height || 1024,
      qualityScore: best.qualityScore || 90,
    };
  }

  private async loadVectorManifest(): Promise<VectorManifest | null> {
    if (this.vectorManifestCache !== undefined) return this.vectorManifestCache;
    try {
      const raw = await fs.readFile(this.vectorManifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as VectorManifest;
      this.vectorManifestCache = parsed;
      return parsed;
    } catch {
      this.vectorManifestCache = null;
      return null;
    }
  }

  private async loadLocalManifest(): Promise<LocalManifest | null> {
    if (this.localManifestCache !== undefined) return this.localManifestCache;
    try {
      const raw = await fs.readFile(this.localManifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as LocalManifest;
      this.localManifestCache = parsed;
      return parsed;
    } catch {
      this.localManifestCache = null;
      return null;
    }
  }

  private async resolveOpenverseAsset(request: AssetRequest): Promise<VisualAsset | null> {
    const endpoint =
      process.env.OPENVERSE_IMAGE_API_URL || 'https://api.openverse.engineering/v1/images/';
    const url = new URL(endpoint);
    url.searchParams.set('q', request.query);
    url.searchParams.set('license', 'cc0');
    url.searchParams.set('page_size', '12');
    url.searchParams.set('mature', 'false');

    try {
      let response: Response;
      try {
        response = await fetch(url);
      } catch (fetchError: any) {
        throw new Error(
          `network request failed: ${fetchError?.message || 'unknown'}${
            fetchError?.cause ? ` (cause: ${fetchError.cause})` : ''
          }`,
        );
      }
      if (!response.ok) throw new Error(`status ${response.status}`);
      const payload = (await response.json()) as any;
      const candidate = (payload?.results || []).find((item: any) => {
        const width = Number(item?.width) || 0;
        const height = Number(item?.height) || 0;
        return (
          this.isAllowedLicense(item?.license) &&
          item?.mature !== true &&
          width >= request.minWidth &&
          height >= request.minHeight &&
          typeof item?.url === 'string'
        );
      });
      if (!candidate) return null;

      return await this.downloadAndCacheAsset(request, {
        provider: 'openverse',
        url: candidate.url,
        landingUrl: candidate.foreign_landing_url,
        sourceUrl: candidate.url,
        license: candidate.license,
        licenseUrl: candidate.license_url,
        creator: candidate.creator,
        width: Number(candidate.width),
        height: Number(candidate.height),
      });
    } catch (error: any) {
      this.logger.warn(
        `[VisualAssetService] Openverse lookup failed for ${request.role}: ${
          error?.message || 'unknown'
        }`,
      );
      return null;
    }
  }

  private async resolveWikimediaAsset(request: AssetRequest): Promise<VisualAsset | null> {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrnamespace', '6');
    url.searchParams.set('gsrsearch', request.query);
    url.searchParams.set('gsrlimit', '10');
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url|mime|size|extmetadata');

    try {
      let response: Response;
      try {
        response = await fetch(url);
      } catch (fetchError: any) {
        throw new Error(
          `network request failed: ${fetchError?.message || 'unknown'}${
            fetchError?.cause ? ` (cause: ${fetchError.cause})` : ''
          }`,
        );
      }
      if (!response.ok) throw new Error(`status ${response.status}`);
      const payload = (await response.json()) as any;
      const pages = Object.values(payload?.query?.pages || {}) as any[];
      for (const page of pages) {
        const info = page?.imageinfo?.[0];
        const metadata = info?.extmetadata || {};
        const license = String(metadata?.LicenseShortName?.value || metadata?.License?.value || '');
        if (!this.isAllowedLicense(license)) continue;
        const width = Number(info?.width) || 0;
        const height = Number(info?.height) || 0;
        if (width < request.minWidth || height < request.minHeight) continue;
        if (!String(info?.mime || '').startsWith('image/')) continue;
        if (!info?.url || typeof info.url !== 'string') continue;

        return await this.downloadAndCacheAsset(request, {
          provider: 'wikimedia',
          url: info.url,
          landingUrl: metadata?.ObjectURL?.value,
          sourceUrl: info.url,
          license,
          licenseUrl: metadata?.LicenseUrl?.value,
          creator: metadata?.Artist?.value,
          width,
          height,
        });
      }
      return null;
    } catch (error: any) {
      this.logger.warn(
        `[VisualAssetService] Wikimedia lookup failed for ${request.role}: ${
          error?.message || 'unknown'
        }`,
      );
      return null;
    }
  }

  private async downloadAndCacheAsset(
    request: AssetRequest,
    source: {
      provider: 'openverse' | 'wikimedia';
      url: string;
      landingUrl?: string;
      sourceUrl?: string;
      license: string;
      licenseUrl?: string;
      creator?: string;
      width?: number;
      height?: number;
    },
  ): Promise<VisualAsset | null> {
    if (!this.isAllowedLicense(source.license)) return null;

    // Guard against missing/invalid URL early to avoid TypeError in inferExtension
    if (!source.url || typeof source.url !== 'string') {
      this.logger.warn(
        `[VisualAssetService] skipping download for ${request.role}: missing or invalid source URL`,
      );
      return null;
    }

    let key: string;
    let extension: string;
    let relativePath: string;
    let outputDir: string;
    let outputPath: string;

    try {
      key = createHash('sha1')
        .update(`${source.provider}:${source.url}:${request.role}`)
        .digest('hex')
        .slice(0, 16);
      extension = this.inferExtension(source.url);
      relativePath = `.generated/assets/${key}/${request.role}${extension}`;
      outputDir = path.join(this.generatedAssetDir, key);
      outputPath = path.join(outputDir, `${request.role}${extension}`);
    } catch (setupError: any) {
      this.logger.warn(
        `[VisualAssetService] failed to prepare download paths for ${request.role}: ${
          setupError?.message || 'unknown'
        }`,
      );
      return null;
    }

    try {
      await fs.access(outputPath);
      const existing = await this.readGeneratedManifestEntry(relativePath);
      if (existing) return existing;
    } catch {
      // download below
    }

    try {
      let response: Response;
      try {
        response = await fetch(source.url);
      } catch (fetchError: any) {
        // Network errors (ECONNREFUSED, ENOTFOUND, DNS failures, etc.)
        // often surface as TypeError from undici/fetch
        throw new Error(
          `network request failed: ${fetchError?.message || 'unknown'}${
            fetchError?.cause ? ` (cause: ${fetchError.cause})` : ''
          }`,
        );
      }

      if (!response.ok) {
        throw new Error(`download status ${response.status}`);
      }
      const contentType = response.headers?.get?.('content-type') || '';
      if (!contentType.startsWith('image/') && !source.url.match(/\.(svg|png|jpe?g|webp)(\?|$)/i)) {
        throw new Error(`non-image content type ${contentType || 'unknown'}`);
      }

      let buffer: Buffer;
      try {
        buffer = Buffer.from(await response.arrayBuffer());
      } catch (bodyError: any) {
        throw new Error(`failed to read response body: ${bodyError?.message || 'unknown'}`);
      }

      if (buffer.length < 512) throw new Error('image payload too small');

      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(outputPath, buffer);

      const asset: VisualAsset = {
        id: `${source.provider}-${key}`,
        kind: request.kind,
        role: request.role,
        staticPath: relativePath,
        provider: source.provider,
        license: String(source.license).toLowerCase(),
        licenseUrl: source.licenseUrl,
        creator: this.stripHtml(source.creator),
        sourceUrl: source.sourceUrl || source.url,
        landingUrl: source.landingUrl,
        width: source.width,
        height: source.height,
        qualityScore: request.kind === 'background' ? 78 : 82,
      };
      await this.appendGeneratedManifest(asset);
      this.logger.log(
        `[VisualAssetService] cached ${request.role} from ${source.provider}, license=${asset.license}, path=${asset.staticPath}`,
      );
      return asset;
    } catch (error: any) {
      this.logger.warn(
        `[VisualAssetService] asset download failed for ${request.role} (${source.url}): ${
          error?.message || 'unknown'
        }`,
      );
      return null;
    }
  }

  private async readGeneratedManifestEntry(staticPath: string): Promise<VisualAsset | null> {
    try {
      const manifest = await this.readGeneratedManifest();
      return manifest.assets.find((asset) => asset.staticPath === staticPath) || null;
    } catch {
      return null;
    }
  }

  private async appendGeneratedManifest(asset: VisualAsset): Promise<void> {
    const manifest = await this.readGeneratedManifest();
    const assets = manifest.assets.filter((item) => item.staticPath !== asset.staticPath);
    assets.push({ ...asset, downloadedAt: new Date().toISOString() } as any);
    await fs.mkdir(this.generatedAssetDir, { recursive: true });
    await fs.writeFile(
      path.join(this.generatedAssetDir, 'asset-manifest.json'),
      JSON.stringify({ version: 1, assets }, null, 2),
      'utf-8',
    );
  }

  private async readGeneratedManifest(): Promise<{ assets: VisualAsset[] }> {
    try {
      const raw = await fs.readFile(
        path.join(this.generatedAssetDir, 'asset-manifest.json'),
        'utf-8',
      );
      const parsed = JSON.parse(raw);
      return { assets: Array.isArray(parsed.assets) ? parsed.assets : [] };
    } catch {
      return { assets: [] };
    }
  }

  private queryForRole(role: string): string {
    const queries: Record<string, string> = {
      'tiger-standing': 'tiger standing',
      'tiger-running': 'tiger running',
      'tiger-swimming': 'tiger swimming',
      'tiger-roaring': 'tiger roaring',
      'rabbit-standing': 'rabbit',
      'rabbit-eating': 'rabbit eating',
      'rabbit-jumping': 'rabbit jumping',
      'rabbit-listening': 'rabbit',
      'forest-day': 'sunlit forest landscape',
      'forest-night': 'night forest',
      grassland: 'grassland meadow',
      river: 'forest river',
      'water-splash': 'water splash',
    };
    if (queries[role]) return queries[role];
    // For animal roles not in the hardcoded map, build a better query
    const animalMatch = role.match(
      /^([a-z]+(?:-[a-z]+)?)-(standing|running|swimming|eating|jumping|exploring|roaring|climbing)/,
    );
    if (animalMatch) {
      const animal = animalMatch[1];
      const verb = animalMatch[2] === 'standing' ? 'illustration cartoon' : animalMatch[2];
      return `${animal} animal ${verb} educational`;
    }
    return role.replace(/-/g, ' ');
  }

  private accentColorForAnimal(animalId: string): string | null {
    const config = ANIMAL_SUBJECTS.find((s) => s.id === animalId);
    return config?.accentColor ?? null;
  }

  private inferAnimalSubject(source: string, assetKey?: string): AnimalSubject | null {
    const result = inferAnimalFromText(source, assetKey);
    return result?.id ?? null;
  }

  private findAnimalConfig(animalId: string): AnimalSubjectConfig | undefined {
    return ANIMAL_SUBJECTS.find((s) => s.id === animalId);
  }

  private roleForAnimalAction(animal: AnimalSubject, action: string): string {
    const config = this.findAnimalConfig(animal);
    if (config) {
      return config.actionRoles[action] || config.defaultRole;
    }
    // Generic: "dolphin-jumping", "elephant-running", etc.
    return `${animal}-${action}`;
  }

  private meetsMinimumSize(asset: VisualAsset, request: AssetRequest): boolean {
    const width = Number(asset.width) || 0;
    const height = Number(asset.height) || 0;
    return width >= request.minWidth && height >= request.minHeight;
  }

  private inferExtension(url: string): string {
    if (!url || typeof url !== 'string') return '.jpg';
    const match = url.match(/\.(svg|png|jpe?g|webp)(?:\?|#|$)/i);
    if (!match) return '.jpg';
    const ext = match[1].toLowerCase();
    return ext === 'jpeg' ? '.jpg' : `.${ext}`;
  }

  private isAllowedLicense(value: unknown): boolean {
    const license = String(value || '').toLowerCase();
    return (
      license === 'cc0' ||
      license.includes('cc0') ||
      license.includes('public domain') ||
      license.includes('pdm') ||
      license.includes('cc by') ||
      license.includes('cc-by') ||
      license.includes('cc by-sa') ||
      license.includes('cc-by-sa') ||
      license.includes('attribution')
    );
  }

  private hasAny(source: string, terms: string[]): boolean {
    const lowered = source.toLowerCase();
    return terms.some((term) => lowered.includes(term.toLowerCase()));
  }

  private stripHtml(value?: string): string | undefined {
    if (!value) return undefined;
    return (
      String(value)
        .replace(/<[^>]+>/g, '')
        .trim() || undefined
    );
  }
}
