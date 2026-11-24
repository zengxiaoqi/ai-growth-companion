/**
 * 道具解析：把分镜声明的**名字**变成可渲染的**几何**（装配期，一次）。
 *
 * 三件事，责任分开：
 *  1. `prop-contract.ts` 决定"这一幕声明了哪些道具"（去重、限量、限长）；
 *  2. 这里决定"每个名字怎么画出来"（内置 → 现画 → 占位件）；
 *  3. 渲染层 `character/prop-glyph.tsx` 只负责把几何按尺寸摆到世界坐标里。
 *
 * 为什么不在渲染帧里生成：Remotion 逐帧渲染、多进程并行、要求确定性。帧内调
 * 模型会得到"同一帧不同 worker 不同图"（画面抖动）、"某一帧失败整片重渲"、
 * 以及"缓存键算不出来"。所以生成在装配期做一次，几何随 props JSON 下发，
 * 渲染是纯函数。对使用者来说同样是"分镜写完、出片就有"，只是不在帧循环里。
 *
 * 失败语义（这条最容易被写错）：**画不出来要看得见**。
 * 返回 null 只会让画面安静地少一个东西，1080 帧里没人找得出来；所以这里
 * 一定给出占位件，并带 warn 说明是哪个名字、哪几幕。
 */

import { PROP_LABELS } from './prop-lexicon';
import { PROP_PLACES, propIdOf, type DeclaredProp, type PropPlace } from './prop-contract';

/**
 * 生成产物里"内容高度 / 画布高度"的近似值。
 *
 * `drawSvg` 的提示词要求"主体占画面 60%~85%"，取中值 0.75。这个数只影响
 * **大小**（±15%），不影响位置与内容，所以先用固定值；要精确需要解 PNG 的
 * alpha 包围盒（当前依赖里没有解码库），列为后续项（见文档 §5.4）。
 */
export const PROP_GEN_FILL = 0.75;

/** 装配期算出的绘图参数：渲染层拿它和尺寸算出最终变换 */
export interface PropArtPayload {
  /** 已消毒、不含外层 <svg>；缺失即占位 */
  markup?: string;
  /** 绘图盒边长（内置 160 / 生成按 viewBox） */
  canvas: number;
  /** 内容占盒高的比例（内置 1 / 生成 0.75） */
  fill: number;
  source: 'builtin' | 'library' | 'generated' | 'placeholder';
}

/** 生成通道的抽象：单测传假实现，生产传视觉素材服务 */
export interface PropSvgSource {
  loadSvg(name: string): Promise<{ markup: string; canvas: number } | null>;
}

/**
 * 渲染输入里的一条道具。
 *
 * 尺寸/位置是**可选**的：历史分镜的 props 只有 {id,label}（那时尺寸统一由
 * PROP_SIZE 决定），新的声明式道具才带 heightRatio 与 place。把这两组混在
 * 一个类型里，是为了让渲染层"有没有声明"不影响读取方式——少一个分支，
 * 就少一处"老课走了新路径"的意外。
 */
export interface ScenePropEntry {
  id: string;
  label: string;
  heightRatio?: number;
  place?: PropPlace;
  holder?: string;
  art?: PropArtPayload;
}

/**
 * 内置道具的名字集合：这些**不走生成**，由渲染层用自带几何画。
 *
 * 为什么用 `PROP_LABELS` 的键：后端拿不到渲染层的 `PROP_BUILTIN_MARKUP`
 * （跨工程 import 会把渲染源码拖进 Nest 的编译产物）。这份集合与渲染层是否
 * 一致由 `test/unit/prop-art.spec.ts` 守着——两边漂移 CI 会红，不会静默
 * 变成"苹果也被重新生成一遍"。
 */
const BUILTIN_IDS = new Set(Object.keys(PROP_LABELS));

/** 占位件：画不出来时用它，至少让人看见"这里差一个东西" */
export function placeholderArt(): PropArtPayload {
  return { canvas: 256, fill: PROP_GEN_FILL, source: 'placeholder', markup: undefined };
}

/**
 * 解析一课里所有声明道具的几何。
 *
 * 全部幕一起解析（而不是逐幕）：同一个名字在一节课里只该画一次、只该有一份
 * markup——否则第 1 幕的"水桶"和第 3 幕的"水桶"会长得不一样，孩子会以为是
 * 两个东西。这也是缓存之外的第二道一致性保证。
 */
export async function resolveLessonPropArt(
  scenes: Array<{ props?: ScenePropEntry[] }>,
  source?: PropSvgSource,
): Promise<Map<string, PropArtPayload>> {
  /** id → 首次出现的展示名（生成时用名字，不用 id） */
  const wanted = new Map<string, string>();
  const order: string[] = [];
  for (const scene of scenes) {
    for (const prop of scene.props || []) {
      const id = propIdOf(prop.id || prop.label || '');
      if (!id || wanted.has(id)) continue;
      wanted.set(id, prop.label || id);
      order.push(id);
    }
  }

  const result = new Map<string, PropArtPayload>();
  const pending = order.filter((id) => !BUILTIN_IDS.has(id));

  // 内置的不在这里出图：渲染层有它们（零调用、零时延、且是风格基线）
  const resolved = await Promise.all(
    pending.map(async (id) => {
      const name = wanted.get(id) || id;
      if (!source) return [id, placeholderArt()] as const;
      try {
        const svg = await source.loadSvg(name);
        if (!svg || !svg.markup) return [id, placeholderArt()] as const;
        return [
          id,
          { markup: svg.markup, canvas: svg.canvas, fill: PROP_GEN_FILL, source: 'generated' } as PropArtPayload,
        ] as const;
      } catch {
        return [id, placeholderArt()] as const;
      }
    }),
  );

  for (const [id, art] of resolved) result.set(id, art);

  const missing = resolved.filter(([, art]) => art.source === 'placeholder').map(([id]) => wanted.get(id) || id);
  if (missing.length) {
    // 一条 warn 汇总，不逐条刷屏：运营只需要知道"这一课有哪些名字没画出来"，
    // 想知道细节去看 asset-gen 的层日志（那边记了拒绝原因）。
    // eslint-disable-next-line no-console
    console.warn(
      `[prop-resolver] 占位件 ${missing.length} 个：${missing.join('、')}` +
        `（生成关闭或失败；画面会出现带首字的虚线方块）`,
    );
  }

  return result;
}

/** 把解析结果贴回每一幕的道具声明上（渲染层按 scene.props[].art 取） */
export function attachPropArt(
  scenes: Array<{ props?: ScenePropEntry[] }>,
  art: Map<string, PropArtPayload>,
): void {
  for (const scene of scenes) {
    for (const prop of scene.props || []) {
      const id = propIdOf(prop.id || prop.label || '');
      const payload = art.get(id);
      if (payload) prop.art = payload;
    }
  }
}

/** 供模板与测试共用：place 的合法值来自契约，避免两边各写一份 */
export const PROP_PLACE_VALUES = PROP_PLACES;
