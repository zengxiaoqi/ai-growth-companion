/**
 * 把真实分镜跑一遍**线上同一套推导**，输出渲染脚本要用的 interaction 计划。
 *
 * 为什么不直接渲染：SceneLayer 的分支选择依赖 interaction（含 puppet/action3d），
 * 而这个字段是后端从文案推导出来的。渲染脚本里用正则自己猜会猜错——
 * 实测把"先爬楼梯，再滑滑梯，然后拍皮球"的总结幕猜成 climb，整幕画错。
 * 所以推导只有一份：这里 import 真实的 deriveInteractionFromText /
 * normalizeSceneInteraction / resolvePuppet / resolveAction3D，结果写成 JSON
 * 交给 render-storyboard-lesson.cjs 消费。
 *
 * 用法（src/backend 下）：
 *   npx ts-node scripts/derive-storyboard-plan.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  deriveInteractionFromText,
  normalizeSceneInteraction,
  type SceneInteraction,
} from '../src/modules/learning/video/scene-interaction';
import { resolveAction3D, resolveActorRig, resolvePuppet } from '../src/modules/learning/video/action3d-registry';
import { findAnimalMentions } from '../src/modules/learning/animal-subjects.config';

const fixturePath = join(__dirname, '..', 'test', 'fixtures', 'slide-storyboard.json');
const outPath = join(__dirname, '..', 'test', 'fixtures', 'slide-storyboard.plan.json');
const FPS = 30;

type FixtureScene = {
  title: string;
  narration: string;
  onScreenText: string;
  visualDescription: string;
  durationSec: number;
};

const storyboard = JSON.parse(readFileSync(fixturePath, 'utf8')) as { scenes: FixtureScene[] };

const plan = storyboard.scenes.map((scene) => {
  const durationFrames = scene.durationSec * FPS;
  const text = `${scene.visualDescription} ${scene.narration} ${scene.onScreenText}`;
  const mentions = findAnimalMentions(`${scene.visualDescription} ${scene.narration} ${scene.title}`);

  const interaction: SceneInteraction | null =
    normalizeSceneInteraction((scene as any).interaction) ||
    deriveInteractionFromText({
      visualDescription: scene.visualDescription,
      narration: scene.narration,
      onScreenText: scene.onScreenText,
      mentions,
      propIds: ['slide', 'ball'],
    });

  if (!interaction) {
    return { title: scene.title, durationFrames, interaction: null };
  }

  // 与 SceneLayer 完全相同的优先级：3D 动作 > 2D 全身 > 其余
  const action3d = resolveAction3D(interaction.action3d, {
    verb: interaction.verb,
    actorId: interaction.actors[0]?.id,
    propId: interaction.propId,
    sceneDurationFrames: durationFrames,
  });
  const puppetMotion =
    interaction.puppet?.motion ??
    (interaction.actors.length === 1 &&
    (interaction.verb === 'point' || interaction.verb === 'speak')
      ? interaction.verb
      : null);
  const puppet =
    !action3d && puppetMotion
      ? resolvePuppet(puppetMotion, {
          actorId: interaction.puppet?.actorId || interaction.actors[0]?.id,
          steps: interaction.puppet?.steps,
          sceneDurationFrames: durationFrames,
        })
      : null;

  return {
    title: scene.title,
    durationFrames,
    interaction: {
      verb: interaction.verb,
      actors: interaction.actors,
      ...(interaction.propId ? { propId: interaction.propId } : {}),
      ...(interaction.speech ? { speech: interaction.speech } : {}),
      ...(action3d ? { action3d: { ...action3d, rig: resolveActorRig(action3d.actorId) } } : {}),
      ...(puppet ? { puppet: { ...puppet, rig: resolveActorRig(puppet.actorId) } } : {}),
    },
    branch: action3d ? `3d:${action3d.motion}` : puppet ? `2d:${puppet.motion}` : `other:${interaction.verb}`,
    matchedText: text.slice(0, 40),
  };
});

writeFileSync(outPath, JSON.stringify(plan, null, 2), 'utf8');
for (const [i, item] of plan.entries()) {
  console.log(
    `${i + 1}. ${item.title} → ${'branch' in item ? item.branch : 'none'} ` +
      `${'interaction' in item && item.interaction ? '' : '(no interaction)'}`,
  );
}
console.log(`[plan] wrote ${outPath}`);
