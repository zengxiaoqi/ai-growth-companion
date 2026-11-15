import { Injectable, Logger } from '@nestjs/common';
import { LlmClientService } from '../../agent-framework/llm/llm-client.service';
import { extractJsonObject } from '../../agent-framework/core';
import { normalizeSceneGraph } from './video/scene-graph';
import { describeChoreographyGrammar, sanitizeBeats, splitSentences, type Beat } from './video/choreography';
import type { VisualQaVerdict } from './visual-qa.service';

type RepairableScene = {
  title?: string;
  narration?: string;
  onScreenText?: string;
  beats?: Beat[];
  sceneGraph?: unknown;
  figure?: { labels?: Array<{ text?: string }> };
  backgroundStyle?: string;
  accentColor?: string;
  durationSec?: number;
};

type ScenePatch = {
  index: number;
  beats?: unknown;
  backgroundStyle?: string;
  accentColor?: string;
};

const ACCENT_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * 确定性路径的参数级修复：QA 不达标时，把 verdict 回喂一次 LLM，
 * 只允许改 beats / backgroundStyle / accentColor 这三类参数（不改几何、不改代码）。
 * 产出过 sanitizeBeats / normalizeSceneGraph 校验后才合并；任何一步失败返回 null，
 * 调用方保留原片放行并记录 qaScore——修复是增益，不是新的失败点。
 */
@Injectable()
export class VideoParamRepairService {
  private readonly logger = new Logger(VideoParamRepairService.name);

  constructor(private readonly llmClient: LlmClientService) {}

  async repair(
    storyboard: { scenes?: RepairableScene[] },
    verdict: VisualQaVerdict,
    ageGroup: string,
  ): Promise<{ scenes: RepairableScene[] } | null> {
    const scenes = storyboard?.scenes;
    if (!Array.isArray(scenes) || scenes.length === 0) return null;

    // code 类问题留给创作引擎的代码修复轮；参数轮只接 dsl/asset
    const actionable = verdict.issues.filter(
      (i) => (i.severity === 'blocker' || i.severity === 'major') && i.fixTarget !== 'code',
    );
    if (actionable.length === 0) return null;

    const patched = await this.llmPatch(scenes, actionable, ageGroup);
    const next = scenes.map((s) => ({ ...s }));
    let changed = false;

    for (const patch of patched) {
      const scene = next[patch.index];
      if (!scene) continue;
      if (patch.beats !== undefined) {
        const beats = sanitizeBeats(
          patch.beats,
          {
            narration: scene.narration || '',
            graph: normalizeSceneGraph(scene.sceneGraph),
            figureLabels: (scene.figure?.labels || [])
              .map((l) => l.text || '')
              .filter(Boolean)
              .slice(0, 12),
          },
          ageGroup,
        );
        if (beats.length) {
          scene.beats = beats;
          changed = true;
        }
      }
      if (
        patch.backgroundStyle === 'neutral' ||
        patch.backgroundStyle === 'environment' ||
        patch.backgroundStyle === 'plain'
      ) {
        if (scene.backgroundStyle !== patch.backgroundStyle) {
          scene.backgroundStyle = patch.backgroundStyle;
          changed = true;
        }
      }
      if (typeof patch.accentColor === 'string' && ACCENT_RE.test(patch.accentColor)) {
        if (scene.accentColor !== patch.accentColor) {
          scene.accentColor = patch.accentColor;
          changed = true;
        }
      }
    }

    // 兜底网：有关系图却没被任何拍点名的节点，补一拍 focus-ring。
    // "主体未成为视觉焦点"是 QA 最常见的 blocker，这条不依赖 LLM 是否听话。
    // sanitizeBeats 按 sentenceIndex 去重，所以每个补拍必须占不同的句位。
    for (const scene of next) {
      const graph = normalizeSceneGraph(scene.sceneGraph);
      if (!graph || !Array.isArray(scene.beats) || scene.beats.length === 0) continue;
      const covered = new Set<string>();
      for (const b of scene.beats) {
        for (const name of [b.focus, ...(b.reveal || [])]) {
          const node = graph.nodes.find(
            (n) => n.id === name || n.label === name || n.subject === name,
          );
          if (node) covered.add(node.id);
        }
      }
      const missing = graph.nodes.filter((n) => !covered.has(n.id));
      if (missing.length === 0) continue;

      const sentences = splitSentences(scene.narration || '');
      const used = new Set(scene.beats.map((b) => b.sentenceIndex));
      const extra: Beat[] = [];
      const overflow: string[] = [];
      for (const n of missing) {
        const names = [n.label, n.subject, n.id];
        let idx = sentences.findIndex(
          (s, i) => !used.has(i) && names.some((nm) => nm && s.includes(nm)),
        );
        if (idx < 0) idx = sentences.findIndex((_, i) => !used.has(i));
        if (idx >= 0) {
          used.add(idx);
          extra.push({ sentenceIndex: idx, focus: n.id, motion: 'focus-ring' });
        } else {
          overflow.push(n.id);
        }
      }
      const combined = scene.beats.map((b) => ({ ...b }));
      let oi = 0;
      const revealCap = ageGroup === '3-4' ? 1 : 6;
      for (const b of combined) {
        if (oi >= overflow.length) break;
        const cur = b.reveal || [];
        if (cur.length < revealCap) b.reveal = [...cur, overflow[oi++]];
      }
      scene.beats = sanitizeBeats(
        [...combined, ...extra],
        { narration: scene.narration || '', graph },
        ageGroup,
      );
      changed = true;
    }

    if (!changed) return null;
    this.logger.log(
      `[ParamRepair] patched ${patched.length} scene(s) from ${actionable.length} actionable issue(s)`,
    );
    return { scenes: next };
  }

  private async llmPatch(
    scenes: RepairableScene[],
    issues: VisualQaVerdict['issues'],
    ageGroup: string,
  ): Promise<ScenePatch[]> {
    const dsl = scenes.map((s, index) => ({
      index,
      title: s.title,
      narration: s.narration,
      beats: s.beats,
      sceneGraph: s.sceneGraph,
      figureLabels: (s.figure?.labels || []).map((l) => l.text),
      backgroundStyle: s.backgroundStyle,
      accentColor: s.accentColor,
      durationSec: s.durationSec,
    }));
    const prompt = [
      '以下教学视频分镜的视觉质检未达标。只允许修改参数：beats、backgroundStyle、accentColor。',
      '禁止改 sceneGraph 节点、figure 几何、旁白文字。',
      '',
      '## 质检问题（blocker/major）',
      ...issues.map(
        (i) => `- [${i.severity}] ${i.sceneId}: ${i.issue} | 修复建议: ${i.fixHint} (${i.fixTarget})`,
      ),
      '',
      '## 当前分镜 DSL',
      JSON.stringify(dsl),
      '',
      describeChoreographyGrammar(ageGroup),
      '',
      '输出严格 JSON：{"scenes":[{"index":0,"beats":[...],"backgroundStyle":"neutral","accentColor":"#RRGGBB"}]}',
      '只输出需要改的场景；beats 必须覆盖该场景关系图的每个节点（focus 或 reveal）。',
    ].join('\n');

    try {
      const raw = await this.llmClient.generateJson(prompt, undefined, {
        temperature: 0.2,
        maxTokens: 6000,
      });
      const parsed = extractJsonObject(raw) as { scenes?: unknown } | null;
      if (!parsed || !Array.isArray(parsed.scenes)) return [];
      const out: ScenePatch[] = [];
      for (const entry of parsed.scenes) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as Record<string, unknown>;
        const index = Number(e.index);
        if (!Number.isInteger(index) || index < 0 || index >= scenes.length) continue;
        out.push({
          index,
          beats: e.beats,
          backgroundStyle: typeof e.backgroundStyle === 'string' ? e.backgroundStyle : undefined,
          accentColor: typeof e.accentColor === 'string' ? e.accentColor : undefined,
        });
      }
      return out;
    } catch (error: any) {
      // 修复调用失败不阻断出片：保留原片，qaScore 照记
      this.logger.warn(`[ParamRepair] LLM patch failed: ${error?.message || error}`);
      return [];
    }
  }
}