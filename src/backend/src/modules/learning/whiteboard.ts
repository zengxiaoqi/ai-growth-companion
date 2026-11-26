import * as path from 'path';
import type { SubtitlePageCue } from './subtitle-timing';

export const WHITEBOARD_TEMPLATE_ID = 'language.whiteboard-story';
export const WHITEBOARD_RENDERER_VERSION = 'whiteboard-v1';

export type WhiteboardRect = { x: number; y: number; width: number; height: number };

export type WhiteboardRegion = {
  id: string;
  label?: string;
  sequence: number;
  narrativeRole?: string;
  subtitle?: string;
  region: WhiteboardRect;
  startMs?: number;
  durationMs?: number;
  protectedRegions?: WhiteboardRect[];
  cueIndex?: number;
  reveal?: {
    direction?: 'left_to_right' | 'right_to_left' | 'top_to_bottom' | 'bottom_to_top';
    maskPaddingPx?: number;
    protectedRegions?: WhiteboardRect[];
  };
};

export type WhiteboardConfig = {
  sourceImage: string;
  paper?: string;
  inkPath?: 'grid';
  colorFill?: 'contour-wipe' | 'brush';
  canvas: { width: number; height: number };
  regions: WhiteboardRegion[];
};

export type ResolvedWhiteboardRegion = WhiteboardRegion & {
  startFrame: number;
  durationFrames: number;
  inkFrames: number;
  colorFrames: number;
};

export type ResolvedWhiteboardConfig = Omit<WhiteboardConfig, 'regions'> & {
  regions: ResolvedWhiteboardRegion[];
  timingSource: 'subtitlePages' | 'authored' | 'estimated';
};

export type WhiteboardTimingOptions = {
  subtitlePages?: SubtitlePageCue[];
  durationFrames: number;
  fps: number;
};

type ParseResult = { config: WhiteboardConfig; error?: never } | { config?: never; error: string };

const isRecord = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const finiteInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);

function parseRect(value: unknown, canvas: { width: number; height: number }): WhiteboardRect | null {
  if (!isRecord(value)) return null;
  const { x, y, width, height } = value;
  if (![x, y, width, height].every(finiteInt)) return null;
  if (width <= 0 || height <= 0 || x < 0 || y < 0) return null;
  if (x + width > canvas.width || y + height > canvas.height) return null;
  return { x, y, width, height };
}

/** Validate the authoring contract before a lesson reaches Remotion. */
export function parseWhiteboardConfig(value: unknown): ParseResult {
  if (!isRecord(value)) return { error: 'whiteboard 必须是对象' };
  const sourceImage = typeof value.sourceImage === 'string' ? value.sourceImage.trim() : '';
  if (!sourceImage || sourceImage.length > 2048) {
    return { error: 'whiteboard.sourceImage 必填，且必须是静态资源路径' };
  }
  if (
    /^(?:https?:|data:|javascript:)/i.test(sourceImage) ||
    /^[a-z]:[\\/]/i.test(sourceImage) ||
    sourceImage.startsWith('\\\\') ||
    sourceImage.includes('..') ||
    sourceImage.includes('\0')
  ) {
    return { error: 'whiteboard.sourceImage 只接受 public/uploads 或 Remotion public 下的静态图片' };
  }
  if (!isRecord(value.canvas)) return { error: 'whiteboard.canvas 必填' };
  const canvas = {
    width: Number(value.canvas.width),
    height: Number(value.canvas.height),
  };
  if (!finiteInt(canvas.width) || !finiteInt(canvas.height)) {
    return { error: 'whiteboard.canvas 宽高必须是整数' };
  }
  if (canvas.width < 64 || canvas.height < 64 || canvas.width > 4096 || canvas.height > 4096) {
    return { error: 'whiteboard.canvas 宽高必须在 64–4096 像素之间' };
  }
  if (value.paper !== undefined && !/^#[0-9a-f]{6}$/i.test(String(value.paper))) {
    return { error: 'whiteboard.paper 必须是 #RRGGBB' };
  }
  if (value.inkPath !== undefined && value.inkPath !== 'grid') {
    return { error: 'Remotion 原生白板当前只支持 inkPath=grid；骨架笔迹请走离线 Skill' };
  }
  if (
    value.colorFill !== undefined &&
    value.colorFill !== 'contour-wipe' &&
    value.colorFill !== 'brush'
  ) {
    return { error: 'whiteboard.colorFill 只支持 contour-wipe 或 brush' };
  }
  if (!Array.isArray(value.regions) || value.regions.length < 1 || value.regions.length > 8) {
    return { error: 'whiteboard.regions 必须包含 1–8 个分区' };
  }

  const ids = new Set<string>();
  const regions: WhiteboardRegion[] = [];
  for (const [index, raw] of value.regions.entries()) {
    if (!isRecord(raw)) return { error: `whiteboard.regions[${index}] 必须是对象` };
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id || id.length > 64 || ids.has(id)) return { error: `whiteboard.regions[${index}].id 缺失、过长或重复` };
    ids.add(id);
    if (raw.sequence !== index + 1) {
      return { error: 'whiteboard.regions 必须按 sequence 1..N 连续排列' };
    }
    const region = parseRect(raw.region, canvas);
    if (!region) return { error: `whiteboard.regions[${index}].region 超出画布或不是正整数像素` };
    if (raw.startMs !== undefined && (!finiteInt(raw.startMs) || raw.startMs < 0)) {
      return { error: `whiteboard.regions[${index}].startMs 必须是非负整数` };
    }
    if (raw.durationMs !== undefined && (!finiteInt(raw.durationMs) || raw.durationMs <= 0)) {
      return { error: `whiteboard.regions[${index}].durationMs 必须是正整数` };
    }
    if (raw.cueIndex !== undefined && (!finiteInt(raw.cueIndex) || raw.cueIndex < 0)) {
      return { error: `whiteboard.regions[${index}].cueIndex 必须是非负整数` };
    }
    const protectedRegions: WhiteboardRect[] = [];
    const rawProtected = Array.isArray(raw.protectedRegions)
      ? raw.protectedRegions
      : isRecord(raw.reveal) && Array.isArray(raw.reveal.protectedRegions)
        ? raw.reveal.protectedRegions
        : [];
    for (const rect of rawProtected) {
      const parsed = parseRect(rect, canvas);
      if (!parsed) return { error: `whiteboard.regions[${index}].protectedRegions 含非法矩形` };
      protectedRegions.push(parsed);
    }
    const direction = isRecord(raw.reveal) ? raw.reveal.direction : undefined;
    if (
      direction !== undefined &&
      !['left_to_right', 'right_to_left', 'top_to_bottom', 'bottom_to_top'].includes(direction)
    ) {
      return { error: `whiteboard.regions[${index}].reveal.direction 非法` };
    }
    const maskPaddingPx = isRecord(raw.reveal) ? raw.reveal.maskPaddingPx : undefined;
    if (
      maskPaddingPx !== undefined &&
      (!finiteInt(maskPaddingPx) || maskPaddingPx < 0 || maskPaddingPx > 128)
    ) {
      return { error: `whiteboard.regions[${index}].reveal.maskPaddingPx 必须是 0–128 的整数` };
    }
    regions.push({
      id,
      label: typeof raw.label === 'string' ? raw.label.slice(0, 80) : undefined,
      sequence: index + 1,
      narrativeRole: typeof raw.narrativeRole === 'string' ? raw.narrativeRole.slice(0, 80) : undefined,
      subtitle: typeof raw.subtitle === 'string' ? raw.subtitle.slice(0, 300) : undefined,
      region,
      ...(raw.startMs !== undefined ? { startMs: raw.startMs } : {}),
      ...(raw.durationMs !== undefined ? { durationMs: raw.durationMs } : {}),
      ...(raw.cueIndex !== undefined ? { cueIndex: raw.cueIndex } : {}),
      protectedRegions,
      ...(isRecord(raw.reveal)
        ? {
            reveal: {
              direction,
              maskPaddingPx,
            },
          }
        : {}),
    });
  }

  return {
    config: {
      sourceImage,
      paper: typeof value.paper === 'string' ? value.paper : '#F6F1E3',
      inkPath: value.inkPath || 'grid',
      colorFill: value.colorFill || 'contour-wipe',
      canvas,
      regions,
    },
  };
}

const speechText = (value: string) => value.replace(/[\s\p{P}\p{S}]/gu, '');

function validSubtitlePages(pages: SubtitlePageCue[] | undefined): SubtitlePageCue[] {
  if (!Array.isArray(pages)) return [];
  return pages.filter(
    (page) =>
      Array.isArray(page?.tokens) &&
      page.tokens.length > 0 &&
      Array.isArray(page.starts) &&
      page.starts.length === page.tokens.length &&
      page.starts.every((start) => finiteInt(start) && start >= 0),
  );
}

function cueIndexForRegion(region: WhiteboardRegion, pages: SubtitlePageCue[]): number | undefined {
  if (region.cueIndex !== undefined && region.cueIndex < pages.length) return region.cueIndex;
  const subtitle = speechText(region.subtitle || '');
  if (!subtitle) return undefined;
  const exact = pages.findIndex((page) => speechText(page.tokens.join('')) === subtitle);
  if (exact >= 0) return exact;
  return pages.findIndex((page) => {
    const text = speechText(page.tokens.join(''));
    return text.includes(subtitle) || subtitle.includes(text);
  });
}

/**
 * Resolve one timing source per scene. WordBoundary cues win; authored ms are
 * used only when the whole cue track is unavailable; otherwise split evenly.
 * The result always leaves at least 0.5s for the completed drawing to be seen.
 */
export function resolveWhiteboardTiming(
  config: WhiteboardConfig,
  options: WhiteboardTimingOptions,
): ResolvedWhiteboardConfig {
  const fps = Math.max(1, Math.trunc(options.fps || 30));
  const durationFrames = Math.max(1, Math.trunc(options.durationFrames || 180));
  const gazeFrames = Math.max(1, Math.ceil(fps * 0.5));
  const drawingEnd = Math.max(1, durationFrames - gazeFrames);
  const gapFrames = Math.max(1, Math.round(fps * 0.12));
  const pages = validSubtitlePages(options.subtitlePages);
  const regions = [...config.regions].sort((a, b) => a.sequence - b.sequence);
  const weights = regions.map((region) => Math.max(1, speechText(region.subtitle || '').length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  let timingSource: ResolvedWhiteboardConfig['timingSource'] = 'estimated';
  const windows: Array<{ start: number; end: number }> = [];

  if (pages.length > 0) {
    timingSource = 'subtitlePages';
    const pageStarts = pages.map((page) => Math.min(drawingEnd, Math.max(0, page.starts[0] || 0)));
    const matches = regions.map((region) => cueIndexForRegion(region, pages));
    const allMatched =
      matches.every((match) => match !== undefined) &&
      matches.every((match, index) => index === 0 || (match as number) >= (matches[index - 1] as number));

    regions.forEach((_region, index) => {
      const pageIndex = allMatched
        ? (matches[index] as number)
        : Math.min(pages.length - 1, Math.floor((index * pages.length) / regions.length));
      const start = pageStarts[pageIndex] || 0;
      const nextPageStart =
        pageIndex + 1 < pageStarts.length ? pageStarts[pageIndex + 1] : drawingEnd;
      const samePageCount = allMatched
        ? matches.filter((match) => match === pageIndex).length
        : 1;
      const samePageIndex = allMatched
        ? matches.slice(0, index + 1).filter((match) => match === pageIndex).length
        : 1;
      const slice = (nextPageStart - start) / samePageCount;
      windows.push({
        start: Math.round(start + (samePageIndex - 1) * slice),
        end: Math.round(start + samePageIndex * slice),
      });
    });
  } else if (regions.every((region) => region.startMs !== undefined && region.durationMs !== undefined)) {
    timingSource = 'authored';
    regions.forEach((region) => {
      const start = Math.min(drawingEnd - 1, Math.round(((region.startMs as number) / 1000) * fps));
      const duration = Math.max(1, Math.round(((region.durationMs as number) / 1000) * fps));
      windows.push({ start, end: Math.min(drawingEnd, start + duration) });
    });
  } else {
    let cursor = 0;
    regions.forEach((_region, index) => {
      const end = Math.round((drawingEnd * weights.slice(0, index + 1).reduce((a, b) => a + b, 0)) / totalWeight);
      windows.push({ start: cursor, end: Math.max(cursor + 1, end) });
      cursor = end;
    });
  }

  let cursor = 0;
  const resolved = regions.map((region, index) => {
    const requested = windows[index] || { start: cursor, end: drawingEnd };
    const remaining = regions.length - index - 1;
    const maxEnd = drawingEnd - remaining * (gapFrames + 1);
    const latestStart = Math.max(cursor, maxEnd - 1);
    const startFrame = Math.max(cursor, Math.min(requested.start, latestStart));
    const endFrame = Math.max(startFrame + 1, Math.min(requested.end, maxEnd, drawingEnd));
    const duration = endFrame - startFrame;
    cursor = endFrame + (remaining > 0 ? gapFrames : 0);
    const inkFrames = Math.max(1, Math.min(duration - 1, Math.round(duration * 0.62)));
    return {
      ...region,
      startFrame,
      durationFrames: duration,
      inkFrames,
      colorFrames: Math.max(1, duration - inkFrames),
    };
  });

  return { ...config, regions: resolved, timingSource };
}

/** Resolve an authoring path to a file inside one of the two allowed public roots. */
export function resolveWhiteboardSourcePath(
  sourceImage: string,
  remotionDir: string,
  backendPublicDir: string,
): string {
  const relative = sourceImage
    .replace(/^\/+/, '')
    .replace(/^public\//, '')
    .replace(/\\/g, '/');
  const publicRoot = relative.startsWith('uploads/') ? backendPublicDir : path.join(remotionDir, 'public');
  const sourcePath = path.resolve(publicRoot, relative);
  if (!sourcePath.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error('sourceImage 路径越界');
  }
  return sourcePath;
}

/** Read PNG/JPEG dimensions without adding a native image dependency. */
export function readRasterDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      const isSof = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
      if (isSof && length >= 7) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return null;
}
