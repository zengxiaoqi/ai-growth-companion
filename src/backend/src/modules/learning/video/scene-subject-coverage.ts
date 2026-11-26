import {
  findAnimalMentions,
  inferAnimalFromText,
} from '../animal-subjects.config';
import {
  GRAPH_NODE_BOUNDS,
  type GraphRelationType,
} from './scene-graph';
import {
  MAX_PROPS_PER_SCENE,
  normalizePropName,
  propIdOf,
} from './prop-contract';

export interface SubjectCoverageRepair {
  kind: 'prop' | 'graph-node' | 'graph-subject';
  label: string;
  reason: string;
}

export interface SubjectCoverageResult {
  scene: any;
  repairs: SubjectCoverageRepair[];
  unresolved: string[];
}

const ACTION_CUE =
  /爬|走|跑|跳|游|飞|吃|喝|睡|缩|伸|看|听|说|叫|拿|递|抱|举|指|发现|打招呼|crawl|walk|run|jump|swim|fly|eat|drink|sleep|retract|hide|carry|hold|point|find|meet/i;

const ENVIRONMENT_ANCHORS: Array<{ label: string; pattern: RegExp }> = [
  { label: '树叶', pattern: /树叶|叶片|叶子|\bleaves?\b/i },
  { label: '花朵', pattern: /花朵|鲜花|\bflowers?\b/i },
  { label: '河流', pattern: /河流|河面|\briver\b/i },
  { label: '水面', pattern: /水面|\bwater\b/i },
  { label: '云朵', pattern: /云朵|\bclouds?\b/i },
  { label: '太阳', pattern: /太阳|\bsun\b/i },
];

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function propLabel(value: unknown): string {
  if (typeof value === 'string') return normalizePropName(value);
  if (!value || typeof value !== 'object') return '';
  return normalizePropName(
    (value as Record<string, unknown>).name ??
      (value as Record<string, unknown>).label ??
      (value as Record<string, unknown>).subject ??
      (value as Record<string, unknown>).id,
  );
}

function nearbyText(source: string, index: number, length: number): string {
  const from = Math.max(0, index - 20);
  const to = Math.min(source.length, index + length + 30);
  return source.slice(from, to);
}

function hasActionNear(source: string, index: number, length: number): boolean {
  return ACTION_CUE.test(nearbyText(source, index, length));
}

function actionCuesNear(source: string, index: number, length: number): string[] {
  const matches = nearbyText(source, index, length).matchAll(
    new RegExp(ACTION_CUE.source, 'gi'),
  );
  return Array.from(matches, (match) => String(match[0]).toLowerCase());
}

/**
 * "蜗牛壳" 能证明有壳，不能证明画面里有蜗牛。
 * 关系图/道具只写部件时，不能把它当作完整角色已经出现。
 */
function isFullAnimal(subject: string, animalId: string): boolean {
  if (!subject || inferAnimalFromText(subject)?.id !== animalId) return false;
  if (animalId === 'snail' && /壳/.test(subject)) return false;
  return true;
}

function graphLimit(relation: unknown): number {
  const key = text(relation).toLowerCase() as GraphRelationType;
  return GRAPH_NODE_BOUNDS[key]?.max ?? 0;
}

/**
 * 补全"台词确实在演、但分镜没有画出来"的教学主体。
 *
 * 这不是道具词表，也不从主题里猜画面：只有视觉描述/旁白中靠近动作线索的动物
 * 才进入修复。已有演员、完整动物图标或专用教学舞台优先，绝不覆盖原分镜。
 */
export function repairSceneSubjectCoverage(
  input: any,
  options: { preserveSpecializedStage?: boolean } = {},
): SubjectCoverageResult {
  if (!input || typeof input !== 'object') {
    return { scene: input, repairs: [], unresolved: [] };
  }

  const visualDescription = text(input.visualDescription || input.imagePrompt || input.visualPrompt);
  const narration = text(input.narration);
  const source = `${visualDescription}\n${narration}`;
  const mentions = findAnimalMentions(source);
  if (!mentions.length || options.preserveSpecializedStage) {
    return { scene: input, repairs: [], unresolved: [] };
  }

  const rawGraphNodes: any[] = Array.isArray(input.sceneGraph?.nodes)
    ? input.sceneGraph.nodes
    : [];
  const rawProps: any[] = Array.isArray(input.props)
    ? input.props
    : input.props == null
      ? []
      : [input.props];
  const figureSubjects: string[] = Array.isArray(input.figure?.shapes)
    ? input.figure.shapes
        .filter((shape: any) => shape?.kind === 'subjectIcon')
        .map((shape: any) => text(shape.subject))
    : [];
  const actorIds = new Set<string>(
    [
      ...(Array.isArray(input.performance?.actors) ? input.performance.actors : []),
      ...(Array.isArray(input.interaction?.actors) ? input.interaction.actors : []),
    ].map((actor: any) => text(actor?.id).toLowerCase()),
  );
  const structuredSubjects = [
    ...rawGraphNodes.map((node) => text(node?.subject || node?.label || node?.name)),
    ...figureSubjects,
    ...rawProps.map(propLabel),
  ].filter(Boolean);

  const repairs: SubjectCoverageRepair[] = [];
  const unresolved: string[] = [];
  const additions: Array<Record<string, unknown>> = [];
  let graphNodes = rawGraphNodes;
  let nextProps = rawProps;
  let nextPerformance = input.performance;
  let nextInteraction = input.interaction;
  let changed = false;

  for (const mention of mentions) {
    if (!hasActionNear(source, mention.index, mention.label.length)) continue;
    const represented =
      actorIds.has(mention.id) ||
      structuredSubjects.some((subject) => isFullAnimal(subject, mention.id));
    if (represented) continue;

    if (Array.isArray(input.figure?.shapes) && input.figure.shapes.length) {
      unresolved.push(mention.label);
      continue;
    }

    if (rawGraphNodes.length) {
      const componentNodes = graphNodes.filter((node) => {
        const subject = text(node?.subject || node?.label || node?.name);
        return (
          inferAnimalFromText(subject)?.id === mention.id &&
          !isFullAnimal(subject, mention.id) &&
          ACTION_CUE.test(text(node?.label))
        );
      });
      const nearbyActions = actionCuesNear(source, mention.index, mention.label.length);
      const componentNode =
        componentNodes.find((node) => {
          const label = text(node?.label).toLowerCase();
          return nearbyActions.some((cue) => label.includes(cue));
        }) ?? (componentNodes.length === 1 ? componentNodes[0] : undefined);
      if (componentNode) {
        graphNodes = graphNodes.map((node) =>
          node === componentNode
            ? {
                ...node,
                subject: `${text(node.label)}${mention.label}`.slice(0, 20),
                role: 'subject',
              }
            : node,
        );
        repairs.push({
          kind: 'graph-subject',
          label: mention.label,
          reason: '动作节点只画了动物部件，升级为完整动物外观',
        });
        changed = true;
        continue;
      }

      if (graphNodes.length < graphLimit(input.sceneGraph?.relation)) {
        const usedIds = new Set(graphNodes.map((node) => text(node?.id)));
        let id = `subject-${mention.id}`;
        let suffix = 2;
        while (usedIds.has(id)) id = `subject-${mention.id}-${suffix++}`;
        graphNodes = [
          ...graphNodes,
          { id, label: mention.label.slice(0, 8), subject: mention.label, role: 'subject' },
        ];
        repairs.push({
          kind: 'graph-node',
          label: mention.label,
          reason: '旁白中的动作主体没有对应关系图节点',
        });
        changed = true;
        continue;
      }

      unresolved.push(mention.label);
      continue;
    }

    // 纯演出幕里，分镜常用“蜗牛壳”充当被指认对象，但旁白演的是整只蜗牛。
    // 再补一只完整蜗牛会变成两只蜗牛；这里把唯一的部件道具升级成完整主体，
    // 并同步改写动作引用，保证“指向谁”和“画面里是谁”仍是同一个 id。
    if (rawProps.length) {
      const componentProps = rawProps
        .map((prop, index) => ({ prop, index, label: propLabel(prop) }))
        .filter(({ label }) => {
          const subject = text(label);
          return (
            inferAnimalFromText(subject)?.id === mention.id &&
            !isFullAnimal(subject, mention.id)
          );
        });
      const nearbyActions = actionCuesNear(source, mention.index, mention.label.length);
      const component =
        componentProps.find(({ label }) => {
          const normalized = label.toLowerCase();
          return nearbyActions.some((cue) => normalized.includes(cue));
        }) ?? (componentProps.length === 1 ? componentProps[0] : undefined);
      if (component) {
        const oldId = propIdOf(component.label);
        const newId = propIdOf(mention.label);
        nextProps = nextProps.map((prop, index) => {
          if (index !== component.index) return prop;
          const teachingHeight = mention.id === 'snail' ? 0.34 : 0.3;
          if (typeof prop === 'string') {
            return {
              name: mention.label,
              place: 'floor',
              heightRatio: teachingHeight,
            };
          }
          return {
            ...prop,
            id: newId,
            name: mention.label,
            label: mention.label,
            subject: mention.label,
            // 部件道具通常只有 0.10~0.12 高，升级成教学主体后必须恢复到可辨认尺寸，
            // 否则“只画了一只蜗牛”仍然会得到“主体太小、看不清壳”的 QA 结论。
            heightRatio: Math.max(Number(prop.heightRatio) || 0, teachingHeight),
          };
        });
        const remapPropId = (value: unknown) =>
          propIdOf(text(value)) === oldId ? newId : value;
        if (Array.isArray(nextPerformance?.actions)) {
          nextPerformance = {
            ...nextPerformance,
            actions: nextPerformance.actions.map((action: any) =>
              action?.propId !== undefined
                ? { ...action, propId: remapPropId(action.propId) }
                : action,
            ),
          };
        }
        if (nextInteraction?.propId !== undefined) {
          nextInteraction = {
            ...nextInteraction,
            propId: remapPropId(nextInteraction.propId),
            ...(nextInteraction.action3d?.propId !== undefined
              ? {
                  action3d: {
                    ...nextInteraction.action3d,
                    propId: remapPropId(nextInteraction.action3d.propId),
                  },
                }
              : {}),
          };
        }
        repairs.push({
          kind: 'prop',
          label: mention.label,
          reason: '部件道具与动作主体重复，升级为唯一完整动物并同步动作引用',
        });
        changed = true;
        continue;
      }
    }

    additions.push({
      name: mention.label,
      place: 'floor',
      heightRatio: mention.id === 'snail' ? 0.34 : 0.3,
    });
    repairs.push({
      kind: 'prop',
      label: mention.label,
      reason: '动作主体没有演员或结构化图标',
    });
    changed = true;
  }

  // 环境锚点只补确有动物主体修复的纯演出幕：树叶是"蜗牛在哪里"的知识，
  // 不能因为背景有一片森林就假装画出了 narrator 指的那片叶子。
  if (changed && repairs.length && !rawGraphNodes.length && !input.figure?.shapes?.length) {
    const anchor = ENVIRONMENT_ANCHORS.find(({ pattern }) => pattern.test(visualDescription));
    if (
      anchor &&
      !structuredSubjects.some((subject) => anchor.pattern.test(subject)) &&
      !additions.some((prop) => anchor.pattern.test(text(prop.name)))
    ) {
      additions.push({ name: anchor.label, place: 'floor', heightRatio: 0.26 });
      repairs.push({
        kind: 'prop',
        label: anchor.label,
        reason: '视觉描述中的空间锚点没有进入可渲染结构',
      });
    }
  }

  if (!changed) return { scene: input, repairs, unresolved };

  if (additions.length) {
    const requiredIds = new Set<string>();
    for (const action of Array.isArray(nextPerformance?.actions) ? nextPerformance.actions : []) {
      const id = text(action?.propId);
      if (id) requiredIds.add(propIdOf(id));
    }
    const interactionProp = text(nextInteraction?.propId);
    if (interactionProp) requiredIds.add(propIdOf(interactionProp));

    const required = nextProps.filter((prop) => requiredIds.has(propIdOf(propLabel(prop))));
    const optional = nextProps.filter((prop) => !requiredIds.has(propIdOf(propLabel(prop))));
    const addBudget = Math.max(0, MAX_PROPS_PER_SCENE - required.length);
    const selectedAdditions = additions.slice(0, addBudget);
    for (const addition of additions.slice(addBudget)) {
      unresolved.push(text(addition.name));
    }
    nextProps = [...selectedAdditions, ...required, ...optional]
      .filter((prop, index, list) => {
        const id = propIdOf(propLabel(prop));
        return id && list.findIndex((item) => propIdOf(propLabel(item)) === id) === index;
      })
      .slice(0, MAX_PROPS_PER_SCENE);
  }

  return {
    scene: {
      ...input,
      ...(nextProps !== rawProps ? { props: nextProps } : {}),
      ...(nextPerformance !== input.performance ? { performance: nextPerformance } : {}),
      ...(nextInteraction !== input.interaction ? { interaction: nextInteraction } : {}),
      ...(graphNodes !== rawGraphNodes
        ? { sceneGraph: { ...input.sceneGraph, nodes: graphNodes } }
        : {}),
    },
    repairs,
    unresolved,
  };
}
