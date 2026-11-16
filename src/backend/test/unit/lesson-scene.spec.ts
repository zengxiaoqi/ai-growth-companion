import {
  deriveWatchSceneDocument,
  deriveWriteSceneDocument,
  normalizeTracingItems,
  sanitizeSceneDocument,
} from '../../src/modules/learning/lesson-scene';

describe('lesson-scene helpers', () => {
  it('sanitizes scene documents with allowed timeline and interaction fields only', () => {
    const scene = sanitizeSceneDocument(
      {
        stepType: 'not-valid',
        mode: 'also-invalid',
        completionPolicy: {
          type: 'unknown',
          passingScore: 999,
          minCoverage: 2,
        },
        scenes: [
          {
            title: 'Intro',
            durationSec: 1,
            visual: {
              background: { type: 'day' },
              templateId: 'science.seasons-cycle',
              extra: 'drop-me',
            },
            timeline: [
              { type: 'caption', value: 'hello', atSec: 0 },
              { type: 'unknown', value: 'ignore-me' },
            ],
            interaction: {
              type: 'trace_path',
              minCoverage: 4,
              targets: [
                { id: 'g1', kind: 'glyph', text: 'A', fontSize: 999 },
                {
                  id: 'p1',
                  kind: 'polyline',
                  points: [
                    { x: -1, y: 0.2 },
                    { x: 2, y: 0.8 },
                  ],
                },
              ],
            },
          },
        ],
      },
      'watch',
      'playback',
    );

    expect(scene).not.toBeNull();
    expect(scene?.stepType).toBe('watch');
    expect(scene?.mode).toBe('playback');
    expect(scene?.completionPolicy).toEqual({
      type: 'all_scenes',
      passingScore: 100,
      minCoverage: 1,
    });
    expect(scene?.scenes).toHaveLength(1);
    expect(scene?.scenes[0].durationSec).toBe(3);
    expect(scene?.scenes[0].timeline).toEqual([
      {
        type: 'caption',
        value: 'hello',
        atSec: 0,
        target: undefined,
        durationSec: undefined,
      },
    ]);
    expect(scene?.scenes[0].interaction?.type).toBe('trace_path');
    if (scene?.scenes[0].interaction?.type === 'trace_path') {
      expect(scene.scenes[0].interaction.minCoverage).toBe(1);
      expect(scene.scenes[0].interaction.targets[0]).toMatchObject({
        id: 'g1',
        kind: 'glyph',
        text: 'A',
        fontSize: 140,
      });
      expect(scene.scenes[0].interaction.targets[1]).toMatchObject({
        id: 'p1',
        kind: 'polyline',
        points: [
          { x: 0, y: 0.2 },
          { x: 1, y: 0.8 },
        ],
      });
    }
  });

  it('derives watch scenes from legacy visual story data and keeps template hints', () => {
    const scene = deriveWatchSceneDocument(
      {
        visualStory: {
          scenes: [
            {
              scene: 'Season intro',
              narration: 'Look at the changing seasons',
              onScreenText: 'Seasons',
              animationTemplate: 'science.seasons-cycle',
              animationParams: { focusSeason: 1, showLabels: true },
            },
          ],
        },
      },
      'seasons',
    );

    expect(scene.stepType).toBe('watch');
    expect(scene.mode).toBe('playback');
    expect(scene.scenes[0].visual?.templateId).toBe('science.seasons-cycle');
    expect(scene.scenes[0].visual?.templateParams).toEqual({
      focusSeason: 1,
      showLabels: true,
    });
  });

  it('infers character stroke templates for watch scenes when legacy data omits them', () => {
    const scene = deriveWatchSceneDocument(
      {
        visualStory: {
          scenes: [
            {
              scene: '河字讲解',
              narration: '先看一看河字。',
              onScreenText: '认识“河”字',
            },
          ],
        },
      },
      '山河湖海',
    );

    expect(scene.scenes[0].visual?.templateId).toBe('language.character-stroke');
    expect(scene.scenes[0].visual?.templateParams).toEqual({
      character: '河',
      showGrid: true,
    });
  });

  it('derives write scenes as guided trace targets from legacy writing data', () => {
    const scene = deriveWriteSceneDocument(
      {
        goal: 'Trace the number',
        tracingItems: ['8'],
        practiceTasks: ['Trace carefully'],
        checklist: ['follow the line'],
      },
      'numbers',
    );

    expect(scene.stepType).toBe('write');
    expect(scene.mode).toBe('guided_trace');
    expect(scene.completionPolicy).toEqual({
      type: 'all_scenes',
      minCoverage: 0.9,
      passingScore: 80,
    });
    expect(scene.scenes[0].interaction?.type).toBe('trace_path');
    if (scene.scenes[0].interaction?.type === 'trace_path') {
      expect(scene.scenes[0].interaction.targets[0]).toMatchObject({
        kind: 'glyph',
        text: '8',
      });
    }
  });
});

describe('normalizeTracingItems', () => {
  it('keeps 1-2 character words whole', () => {
    expect(normalizeTracingItems(['蓝鲸', '海龟'], '海洋动物')).toEqual(['蓝鲸', '海龟']);
  });

  it('splits long topic words into single traceable characters', () => {
    expect(normalizeTracingItems(['海洋动物'], '海洋动物')).toEqual(['海', '洋', '动', '物']);
  });

  it('strips non-glyph symbols from arithmetic strings', () => {
    expect(normalizeTracingItems(['2+3=5'], '10以内加法')).toEqual(['2', '3', '5']);
  });

  it('falls back to topic characters when items are empty or invalid', () => {
    expect(normalizeTracingItems([], '海洋动物')).toEqual(['海', '洋', '动', '物']);
    expect(normalizeTracingItems(['🐱'], '猫')).toEqual(['猫']);
  });

  it('deduplicates and caps at 4 targets', () => {
    expect(normalizeTracingItems(['鱼', '鱼', '鲸'], '鱼')).toEqual(['鱼', '鲸']);
    expect(normalizeTracingItems(['a', 'b', 'c', 'd', 'e'], 'abcde')).toHaveLength(4);
  });

  it('deriveWriteSceneDocument never emits multi-character glyph targets', () => {
    const scene = deriveWriteSceneDocument({ tracingItems: ['海洋动物'] }, '海洋动物');
    for (const s of scene.scenes) {
      if (s.interaction?.type === 'trace_path') {
        for (const target of s.interaction.targets) {
          if (target.kind === 'glyph') {
            expect(Array.from(target.text).length).toBeLessThanOrEqual(2);
          }
        }
      }
    }
    expect(scene.scenes.length).toBe(4);
  });
});
