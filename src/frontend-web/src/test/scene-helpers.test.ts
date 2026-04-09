import { describe, expect, it } from 'vitest';
import { resolveLessonSceneDocument } from '@/scenes/scene-helpers';

describe('resolveLessonSceneDocument', () => {
  it('prefers native scene documents when module.scene is present', () => {
    const scene = resolveLessonSceneDocument('watch', {
      scene: {
        version: 1,
        stepType: 'watch',
        mode: 'playback',
        scenes: [
          {
            id: 'native-1',
            title: 'Native scene',
            narration: 'Use native scene first',
            durationSec: 9,
          },
        ],
      },
      visualStory: {
        scenes: [
          {
            scene: 'Legacy scene',
            narration: 'legacy',
          },
        ],
      },
    });

    expect(scene?.scenes[0].id).toBe('native-1');
    expect(scene?.scenes[0].title).toBe('Native scene');
  });

  it('fills missing native watch scene templates from legacy watch content', () => {
    const scene = resolveLessonSceneDocument('watch', {
      scene: {
        version: 1,
        stepType: 'watch',
        mode: 'playback',
        scenes: [
          {
            id: 'native-1',
            title: '河字讲解',
            narration: '先看一看河字。',
            onScreenText: '认识“河”字',
            durationSec: 10,
            visual: {
              background: { type: 'indoor' },
            },
          },
        ],
      },
      visualStory: {
        scenes: [
          {
            scene: '河字讲解',
            narration: '先看一看河字。',
            onScreenText: '认识“河”字',
          },
        ],
      },
    });

    expect(scene?.scenes[0].id).toBe('native-1');
    expect(scene?.scenes[0].visual?.templateId).toBe('language.character-stroke');
    expect(scene?.scenes[0].visual?.templateParams).toMatchObject({
      character: '河',
    });
  });

  it('derives seasonal watch scenes from low-information legacy animation templates', () => {
    const scene = resolveLessonSceneDocument('watch', {
      visualStory: {
        scenes: [
          {
            scene: '四季变化',
            narration: '春夏秋冬轮流出现',
            onScreenText: '四季变化',
            animationTemplate: 'language.word-reveal',
            animationParams: {
              words: ['四季'],
            },
          },
          {
            scene: '四季变化',
            narration: '四季会变化',
            onScreenText: '春夏秋冬',
            animationTemplate: 'language.word-reveal',
            animationParams: {
              words: ['四季'],
            },
          },
        ],
      },
    });

    expect(scene?.stepType).toBe('watch');
    expect(scene?.mode).toBe('playback');
    expect(scene?.scenes[0].visual?.templateId).toBe('science.seasons-cycle');
  });

  it('derives guided trace scenes from legacy writing payloads', () => {
    const scene = resolveLessonSceneDocument('write', {
      writing: {
        goal: '描一描数字',
        tracingItems: ['3'],
        practiceTasks: ['沿着虚线描一描'],
      },
    });

    expect(scene?.stepType).toBe('write');
    expect(scene?.mode).toBe('guided_trace');
    expect(scene?.scenes[0].interaction?.type).toBe('trace_path');
    if (scene?.scenes[0].interaction?.type === 'trace_path') {
      expect(scene.scenes[0].interaction.targets[0]).toMatchObject({
        kind: 'glyph',
        text: '3',
      });
    }
  });

  it('derives activity shell scenes from legacy game payloads', () => {
    const scene = resolveLessonSceneDocument('practice', {
      game: {
        activityType: 'quiz',
        activityData: {
          title: 'Season quiz',
          questions: [
            {
              question: 'Which season is cold?',
              options: ['spring', 'winter'],
              correctIndex: 1,
            },
          ],
        },
      },
    });

    expect(scene?.stepType).toBe('practice');
    expect(scene?.mode).toBe('activity_shell');
    expect(scene?.scenes[1].interaction?.type).toBe('launch_activity');
    expect(scene?.scenes[1].fallbackActivity?.activityType).toBe('quiz');
  });
});
