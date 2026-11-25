/**
 * 角色交互语法层（Scene Interaction）
 *
 * 为什么需要这一层：
 * "小熊把皮球递给小兔"这句话里，画面真正要表达的不是"有熊、有球、有兔"，
 * 而是"递"这个动作及其方向。旧的渲染层只做关键词匹配，得到
 * assetKey=bear + props=[ball]，于是画成"熊站中间、球摆旁边"——角色和道具
 * 都有了，关系却丢了，这正是"画面和台词对不上"的根因。
 *
 * 设计沿用 scene-graph 的封闭语法思路：关系是封闭的（儿童教学里翻来覆去
 * 就是递/接/一起抬/说话/指这几种），角色和道具是开放的（数据里填什么名就
 * 画什么）。LLM 或文案提取只负责"选关系 + 填角色/道具 id"，不决定坐标；
 * 坐标和动作姿态由渲染层的确定性布局算，保证同一份输入每帧都一致。
 *
 * 两种入口：
 *  - normalizeSceneInteraction(raw)：校验 LLM 未来可能直接写出的结构化关系；
 *  - deriveInteractionFromText(text, props)：从现有 imagePrompt 文案确定性提取，
 *    让「学会分享」这类已生成的旧课程无需重跑 LLM 也能演出关系（本次样板走这条）。
 */

/** 封闭的交互动词——儿童教学场景里反复出现的几种"谁对谁做什么" */
export const INTERACTION_VERBS = [
  'handover',
  'lift-together',
  'speak',
  'point',
  'hold',
  'slide',
  'dribble',
  // 单人连续动作。原先 interaction 只描述"角色之间"的动作，导致"小熊一步一步
  // 爬上滑梯"这种句子没有字段承载，整幕静默降级成一张 emoji 卡片。这两个动词
  // 把单人动作纳入语法，语义仍是"这一幕在演什么动作"，不再是"谁对谁做"。
  'climb',
  'walk',
  // 情绪与状态：renderer 早就能演（pose.ts 的 cheer/sit），但契约里一直没有对应
  // 动词，于是模型写"高兴地欢呼"只能落回静态构图。补上动词而不是让 prompt 绕开——
  // 能力表的意义就是"渲染器会的，模型也能选"。
  'cheer',
  'sit',
  // 打招呼类：契约里一直没有"挥手"，模型写"小熊朝小兔挥挥手"只能退回静态构图。
  // 补动词而不是让 prompt 绕开——能力表缺格，模型就只能绕道。
  'wave',
  'clap',
  'hips',
] as const;
export type InteractionVerb = (typeof INTERACTION_VERBS)[number];

/**
 * 需要三维演出的动作。为什么单列一层：
 * "沿斜面滑下"和"手掌在某帧拍到球、球再弹起"是连续的三维接触关系，
 * 二维贴图只能表达"角色在移动"，无法表达"身体贴着滑面""掌球同帧接触"。
 * 这里只描述意图（谁、在什么道具上、做什么），具体几何与坐标由渲染层的
 * action3d-registry 决定，LLM 不碰数字。
 */
export const ACTION3D_RENDERERS = ['3d-procedural', '3d-glb'] as const;
export type Action3DRenderer = (typeof ACTION3D_RENDERERS)[number];

export const ACTION3D_MOTIONS = ['slide', 'dribble'] as const;
export type Action3DMotion = (typeof ACTION3D_MOTIONS)[number];

/**
 * 二维全身角色能演的动作原语。
 *
 * 这份清单是"能力表"的一半：渲染器声明自己能演什么，选择器按"这一幕需要的
 * 原语 ⊆ 渲染器能力"来挑。加原语不该改选择逻辑，也不该改渲染器——
 * 姿态在 video-remotion/src/character/pose.ts 里写一次，2D 与 3D 同时获得。
 *
 * 这里只列"2D 独占"的部分：walk/enter/climb 没有 3D 实现（也不需要，
 * 2D 骨架足够且更便宜），slide/dribble 走 3D 舞台。
 */
export const PUPPET_MOTIONS = [
  'idle',
  'speak',
  'point',
  'walk',
  'enter',
  'climb',
  'cheer',
  'sit',
  /**
   * 双手在身前托着东西。双人动词（递给 / 一起抬）的每个角色都用它：
   * 手的位置就是道具的挂点，两个人各托一侧，东西才落在两只手中间，
   * 而不是沿一条写死的屏幕弧线飞过去。
   */
  'hold',
  // 数据式动作（motion-clips.ts 的关键帧表）。加进这张表就能演，不需要写函数。
  'wave',
  'clap',
  'hips',
] as const;
export type PuppetMotion = (typeof PUPPET_MOTIONS)[number];

/**
 * 动词 → 二维动作原语。
 *
 * 放在契约层而不是装配层，因为它回答的是"这个 verb 渲染器能不能演"，
 * 属于能力表。以前这张表写在装配层，generate-video-content 的白名单又另抄
 * 一份，两处一漂移就会出现"提示词允许 jump、渲染器不认识 jump"。
 * 这张表只覆盖"一个角色就能演"的动词。handover / lift-together 不在表里，
 * 但它们不再落到徽章分支：那两种动词的边界不是"骨架演不了"，而是"骨架只有一个人"。
 * 骨架扩成能演两个人之后（PuppetAction.partner），它们由一对 hold 演，
 * 人物语言与单人幕同一套。真正的降级（徽章）只留给未知动词与 3D 不可用时的滑梯。
 */
export const VERB_AS_MOTION: Partial<Record<InteractionVerb, PuppetMotion>> = {
  /**
   * 单人手持也是全身动作，不是徽章分支的专利。
   *
   * 漏掉这一条时，`hold` 被 composePerformance 判成"骨架演不了的动作"，
   * 整幕掉进 ActionStage——而只有 Puppet2D 会把声明为 place:hand 的道具
   * 挂到手上（GeneratedLesson 的 carry 分支）。表现是资产画好了、几何也
   * 对，成片里角色却空着手，且没有任何报错。双人 hold 本来就在用这个
   * 姿态（见 PUPPET_MOTIONS 的注释），单人漏映射只是表抄漏了一行。
   */
  hold: 'hold',
  point: 'point',
  speak: 'speak',
  climb: 'climb',
  walk: 'walk',
  cheer: 'cheer',
  sit: 'sit',
  wave: 'wave',
  clap: 'clap',
  hips: 'hips',
};

export interface PuppetAction {
  motion: PuppetMotion;
  actorId: string;
  /** climb 的阶梯数；其余动作忽略 */
  steps?: number;
  /**
   * 双人幕的第二个角色（递给 / 一起抬）。
   *
   * 为什么放在 puppet 里而不是新开一个 `duo` 字段：双人幕与单人幕的区别只有
   * "多一份播放表"，渲染器、取景、场地全是同一套。新字段会让模板分叉成两条
   * 渲染路径，而分叉正是"双人幕画成另一种人物语言"的起点。
   */
  partner?: {
    motion: PuppetMotion;
    actorId: string;
    label?: string;
    /** 造型参数由装配层解析（渲染层的 ActorRig），契约层不认识它的形状 */
    rig?: any;
  };
  /**
   * 道具在哪只手里（配合 partner）：
   *  - `handover`：从主角色的手移到副角色的手；
   *  - `shared`：两人各托一侧，停在两手之间。
   */
  carryBy?: 'self' | 'coStar' | 'shared' | 'handover';
}

export type Vec3 = [number, number, number];

export interface Action3DBounce {
  /** 拍球一个来回的帧数（接触帧固定在周期边界） */
  periodFrames: number;
  /** 球离手最高点的高度，场景单位 */
  height: number;
}

export interface Action3D {
  /** 渲染器：procedural=纯代码几何体，glb=骨骼动画 + 烘焙轨迹 */
  renderer: Action3DRenderer;
  /** 动作类型，与 verb 对齐 */
  motion: Action3DMotion;
  /** 主角 id，来自角色表（bear / rabbit …） */
  actorId: string;
  /** 场景道具 id（slide / ball） */
  propId?: string;
  /** GLB 动画片段名，仅 glb 渲染器使用 */
  clip?: string;
  /** 世界坐标起止点（左/上右手系，y 向上）；缺省由注册表按 motion 补 */
  start?: Vec3;
  end?: Vec3;
  /** 拍球周期与高度 */
  bounce?: Action3DBounce;
}

export const ACTOR_ROLES = ['giver', 'receiver', 'speaker', 'helper', 'target'] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

export interface InteractionActor {
  /** 稳定 id：bear / rabbit / tiger …（来自 animal-subjects 的角色表） */
  id: string;
  /** 屏幕标签：用文案里的叫法，如「小熊」「兔兔」 */
  label: string;
  role: ActorRole;
}

export interface SceneInteraction {
  verb: InteractionVerb;
  caption?: string;
  actors: InteractionActor[];
  /** 道具 id：ball / cookie / table …（与 PropArt 的 id 对齐） */
  propId?: string;
  /** 说话气泡里的文字（verb=speak 或 handover 附带"谢谢你"时用） */
  speech?: string;
  /** 三维动作描述；缺失时渲染层按 verb 推导或退回 2D 演出 */
  action3d?: Action3D;
  /**
   * 二维全身角色的动作（与 action3d 互斥，先判 action3d）。
   * 它承载"单人连续动作"：爬、走、入场——这些原先没有归属字段，
   * 只能落到"白卡片 + emoji"的兜底分支。
   */
  puppet?: PuppetAction;
}

const VERB_SET = new Set<string>(INTERACTION_VERBS);
const ROLE_SET = new Set<string>(ACTOR_ROLES);

function clean(input: unknown): string {
  return String(input ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeVerb(input: unknown): InteractionVerb | null {
  const value = clean(input).toLowerCase();
  // 中文直填也认，方便 LLM 少转一层
  const zh: Record<string, InteractionVerb> = {
    递: 'handover',
    递给: 'handover',
    交给: 'handover',
    给: 'handover',
    接过: 'handover',
    一起抬: 'lift-together',
    一起搬: 'lift-together',
    合作: 'lift-together',
    说话: 'speak',
    对话: 'speak',
    指: 'point',
    拿着: 'hold',
    滑滑梯: 'slide',
    滑下来: 'slide',
    滑下: 'slide',
    拍球: 'dribble',
    拍皮球: 'dribble',
    运球: 'dribble',
    欢呼: 'cheer',
    高兴: 'cheer',
    坐下: 'sit',
    坐着: 'sit',
    挥手: 'wave',
    招手: 'wave',
    打招呼: 'wave',
    拍手: 'clap',
    鼓掌: 'clap',
    叉腰: 'hips',
    神气: 'hips',
  };
  if (zh[value]) return zh[value];
  return VERB_SET.has(value) ? (value as InteractionVerb) : null;
}

function normalizeRole(input: unknown): ActorRole {
  const value = clean(input).toLowerCase();
  const zh: Record<string, ActorRole> = {
    递出者: 'giver',
    给的人: 'giver',
    接收者: 'receiver',
    接过的人: 'receiver',
    说话者: 'speaker',
    帮手: 'helper',
    被指对象: 'target',
  };
  if (zh[value]) return zh[value];
  return ROLE_SET.has(value) ? (value as ActorRole) : 'helper';
}

/**
 * 校验三维动作描述。只做字段级白名单，不做业务回落——角色/道具是否真的有
 * 3D 资产由 action3d-registry 决定，这里保证"带进渲染器的每个值都是干净的"。
 * 任一必需项不合法就整份丢弃，让渲染层退回 2D 演出，而不是带着 NaN 坐标去建几何体。
 */
/**
 * 校验从 LLM 结构化输出里读到的二维动作。
 * actorId 必须给（决定画哪种动物），motion 必须在白名单内——
 * 未知动作一律丢弃并让上层退回"入场 + idle"，绝不把渲染器不认识的 op 传下去。
 */
export function normalizePuppet(raw: unknown): PuppetAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  // 中文动词也认：模型常直接写「挥手」「拍手」。先查动作表，再走动词别名，
  // 两步都要求结果落在 PUPPET_MOTIONS 内——降级仍由白名单兜住，不放宽。
  const rawMotion = clean(source.motion).toLowerCase();
  const alias = normalizeVerb(rawMotion);
  const motion = (PUPPET_MOTIONS as readonly string[]).includes(rawMotion)
    ? rawMotion
    : alias && (PUPPET_MOTIONS as readonly string[]).includes(alias)
      ? alias
      : '';
  if (!motion) return null;
  const actorId = clean(source.actorId).toLowerCase();
  if (!actorId) return null;
  const steps = Math.round(Number(source.steps));
  return {
    motion: motion as PuppetMotion,
    actorId,
    ...(Number.isFinite(steps) && steps >= 2 && steps <= 8 ? { steps } : {}),
  };
}

export function normalizeAction3D(raw: unknown): Action3D | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const motion = clean(source.motion).toLowerCase();
  if (!(ACTION3D_MOTIONS as readonly string[]).includes(motion)) return null;

  const actorId = clean(source.actorId).toLowerCase();
  if (!actorId) return null;

  const rendererRaw = clean(source.renderer).toLowerCase();
  const renderer: Action3DRenderer = (ACTION3D_RENDERERS as readonly string[]).includes(rendererRaw)
    ? (rendererRaw as Action3DRenderer)
    : '3d-procedural';

  const propId = clean(source.propId).toLowerCase() || undefined;
  const clip = clean(source.clip).slice(0, 48) || undefined;
  const start = toVec3(source.start);
  const end = toVec3(source.end);
  const bounce = toBounce(source.bounce);

  return {
    renderer,
    motion: motion as Action3DMotion,
    actorId,
    ...(propId ? { propId } : {}),
    ...(clip ? { clip } : {}),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(bounce ? { bounce } : {}),
  };
}

/** 坐标只接受三个有限数，且夹在场景量级内——LLM 偶尔会写 "left" 或 1e9 */
function toVec3(input: unknown): Vec3 | null {
  if (!Array.isArray(input) || input.length !== 3) return null;
  const nums = input.map((n) => Number(n));
  if (nums.some((n) => !Number.isFinite(n) || Math.abs(n) > 100)) return null;
  return [nums[0], nums[1], nums[2]] as Vec3;
}

function toBounce(input: unknown): Action3DBounce | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Record<string, unknown>;
  const periodFrames = Math.round(Number(source.periodFrames));
  const height = Number(source.height);
  if (!Number.isFinite(periodFrames) || periodFrames < 6 || periodFrames > 90) return null;
  if (!Number.isFinite(height) || height < 0.2 || height > 6) return null;
  return { periodFrames, height };
}

/**
 * 校验 LLM 输出的结构化关系。任何必需项不合法就整份丢弃，
 * 让上层退回普通构图，绝不把半截数据带进渲染器。
 */
export function normalizeSceneInteraction(raw: unknown): SceneInteraction | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const verb = normalizeVerb(source.verb);
  if (!verb) return null;
  if (!Array.isArray(source.actors) || source.actors.length === 0) return null;

  const actors: InteractionActor[] = [];
  for (const item of source.actors) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const id = clean(entry.id).toLowerCase();
    const label = clean(entry.label).slice(0, 12);
    if (!id || !label) continue;
    actors.push({ id, label, role: normalizeRole(entry.role) });
  }
  if (actors.length === 0 || actors.length > 3) return null;

  const puppet = normalizePuppet(source.puppet);
  const propId = clean(source.propId).toLowerCase() || undefined;
  const speech = clean(source.speech).slice(0, 32) || undefined;
  const caption = clean(source.caption).slice(0, 20) || undefined;
  const action3d = normalizeAction3D(source.action3d);
  return {
    verb,
    actors,
    ...(propId ? { propId } : {}),
    ...(puppet ? { puppet } : {}),
    ...(speech ? { speech } : {}),
    ...(caption ? { caption } : {}),
    ...(action3d ? { action3d } : {}),
  };
}

/**
 * 一幕的演出：**按时间排序**的动作序列。
 *
 * 为什么不是继续扩展 interaction：interaction 的语义是"谁对谁做什么"，
 * 是**一个关系**。但孩子看到的一组动作常常是"走过来 → 指着滑梯 → 说一句话"，
 * 这是三个动作。以前只能拆成三幕，代价是三次镜头切换——孩子刚跟上动作就跳走了。
 *
 * 契约形态刻意做成"动作数组 + 继承的 actors"：
 *  - actions 的顺序就是播放顺序，渲染层不需要再猜时间；
 *  - actors 写在 performance 层，各 action 可省略并继承，模型少写很多重复字段
 *    （重复字段一多，模型就开始漏写 label 或写错 role）。
 *
 * 与 interaction 的关系：**performance 优先，interaction 只作兼容读**。
 * 旧分镜（含已缓存的）没有 performance，走 interaction 或文案兜底，
 * 画面与改动前一致——这是"换契约不换画面"的边界。
 */
export interface ScenePerformance {
  actions: SceneInteraction[];
}

/** 一屏最多串三个动作：再多就不是"一个镜头里的连贯动作"，而是该拆幕了 */
export const PERFORMANCE_MAX_ACTIONS = 3;

/**
 * 串演会撞上的"终态动作"：做完它，角色已经在高处或滑行终点，
 * 再接一个从地面站姿开始的动作就会瞬移。所以它必须是最后一个。
 */
export const TERMINAL_MOTIONS: ReadonlySet<PuppetMotion> = new Set<PuppetMotion>(['climb']);

/** 该动作需要三维舞台（接触关系）或双人舞台？ */
function requiresOtherStage(action: SceneInteraction): boolean {
  if (action.action3d) return true;
  if (action.verb === 'slide' || action.verb === 'dribble') return true;
  return false;
}

function motionOf(action: SceneInteraction): PuppetMotion | null {
  return action.puppet?.motion ?? VERB_AS_MOTION[action.verb] ?? null;
}

/**
 * 校验 LLM 输出的演出序列。
 *
 * 两种写法都收：`{ actions: [...] }` 与裸数组。前者能带共享的 actors，
 * 后者是模型偷懒时的常见形态——两种都拒绝会白白丢掉一幕的动作。
 */
export function normalizeScenePerformance(raw: unknown): ScenePerformance | null {
  if (!raw) return null;
  const source = raw as Record<string, unknown>;
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(source.actions)
      ? (source.actions as unknown[])
      : null;
  if (!list || list.length === 0) return null;

  // performance.actors 是默认演员表，各 action 没写 actors 时继承
  const defaults = Array.isArray(source.actors) ? source.actors : null;

  const actions: SceneInteraction[] = [];
  for (const item of list.slice(0, PERFORMANCE_MAX_ACTIONS)) {
    const merged =
      defaults && item && typeof item === 'object' && !Array.isArray((item as Record<string, unknown>).actors)
        ? { actors: defaults, ...(item as Record<string, unknown>) }
        : item;
    const action = normalizeSceneInteraction(merged);
    if (!action) continue;
    // 模型偶尔把同一个动作写两遍（"walk, walk"）：重复动作只会让画面卡住
    const prev = actions[actions.length - 1];
    if (prev && prev.verb === action.verb && (prev.propId || '') === (action.propId || '')) continue;
    actions.push(action);
  }
  return actions.length ? { actions } : null;
}

export interface ComposedPerformance {
  /** 这一幕的主动作：决定用哪个渲染器（3D / 双人舞台 / 2D 骨架） */
  primary: SceneInteraction;
  /**
   * 可串演的动作原语（长度 1 表示只有 primary 一个动作）。
   * 只有地面动作能串：攀爬/滑降是终态，后面不能再接。
   */
  motions: PuppetMotion[];
  /** 被丢掉的动作，供上层记 warn——静默丢动作用于排查"这一幕怎么没动" */
  dropped: InteractionVerb[];
}

/**
 * 把演出序列压成"一个主动作 + 一条可播放的动作串"。
 *
 * 取舍顺序（不是随便定的）：
 *  1. 有需要三维/双人舞台的动作 → 以它为主，其余全丢。语义上它是这一幕的核心，
 *     换成"先走两步"当主动作会把真正要演的关系演丢。
 *  2. 否则按顺序串地面动作；遇到终态动作（climb）就收尾。
 *  3. 串不动的一律进 dropped，由上层记录，不静默。
 */
export function composePerformance(performance: ScenePerformance): ComposedPerformance {
  const actions = performance.actions;

  const stageAction = actions.find((a) => requiresOtherStage(a) || !motionOf(a));
  if (stageAction) {
    return {
      primary: stageAction,
      motions: [],
      dropped: actions.filter((a) => a !== stageAction).map((a) => a.verb),
    };
  }

  const kept: SceneInteraction[] = [];
  const motions: PuppetMotion[] = [];
  const dropped: InteractionVerb[] = [];

  for (let i = 0; i < actions.length; i += 1) {
    const action = actions[i];
    const motion = motionOf(action);
    if (!motion) {
      dropped.push(action.verb);
      continue;
    }
    kept.push(action);
    motions.push(motion);
    // 终态动作：演完就到这一幕的结尾，后面的动作接不上。
    // 注意不能只是"跳过这一个"——那会让画面演成"先指一下，再爬上去"，
    // 顺序反了，比不演更糟。
    if (TERMINAL_MOTIONS.has(motion)) {
      dropped.push(...actions.slice(i + 1).map((a) => a.verb));
      break;
    }
  }

  // 主动作必须是**第一个真正会播的**动作：它是 interaction 契约里 verb 的来源。
  // 若它和序列首项不一致，渲染层会出现"契约说 climb、播放表从 point 开始"的分裂。
  return { primary: kept[0] ?? actions[0], motions, dropped };
}

/**
 * 文案里是否带三维动作线索（滑梯下滑 / 拍球）。
 *
 * 单独抽出来是因为有两个消费方，而它们必须用同一套判据：
 *  - 分镜推导 deriveInteractionFromText（决定这一幕怎么演）；
 *  - 队列排引擎（3D 幕只有内置模板能演，见 lesson-video-queue.service）。
 * 两处各写一份正则迟早会漂移，出现"分镜判成 3D、引擎却走 agent"的空转。
 *
 * 中英双语都要认：脚本里 narration 是中文，但 visualDescription 由生图
 * 提示词那一路产出，几乎恒为英文（"the bear slides down the ramp"）。只认
 * 中文的后果是线上 5 幕滑梯课全部落回 2D——大头像配一个小滑梯图标，看不
 * 出"滑下来"，视觉 QA 直接打回重渲。这类漏判不会报错，只是静默降级，
 * 比崩掉更难发现，所以判据必须覆盖两种语言。
 */
const SLIDE_NOUN = /滑梯|\bslides?\b/i;
const SLIDE_DESCEND =
  /滑下来|滑下去|滑到底|往下滑|溜下来|从[^，。；]{0,8}滑|\bslid(?:e|es|ing)?\s+down\b|\bslid(?:e|es|ing)\b[^.]{0,16}\bdown\b/i;
const DRIBBLE_CUE =
  /(拍|运)[一]?(拍)?[^，。；]{0,2}(皮)?球|\bdribbl\w*|\bpat(?:s|ting)?\b[^.]{0,30}\b(?:ball|bounc\w*)|\bbounc\w*\b[^.]{0,30}\bball\b|\bball\b[^.]{0,30}\bbounc\w*/i;

/** 爬：必须同时有"爬"和向上的方向感，避免"爬行动物"这类名词误判 */
const CLIMB_CUE = /爬(上|到|升|梯|台阶|滑梯)|一级一级|一步一步[^。]{0,3}(上|高)|往上爬|向上爬|\bclimb(?:s|ed|ing)?\b/i;
/** 走/跑：位移类。排除"走神""走廊"这类名词误伤 */
const WALK_CUE = /(走|跑|迈步|溜达)[过来去进出到]|走进|跑进|\bwalk(?:s|ed|ing)?\b|\brun(?:s|ning)?\b/i;

/**
 * 单人动作判定。与 hasThreeMotionCue 分开是因为两者服务的渲染器不同：
 * 3D 幕要改变引擎排序（只有内置模板能演），2D 幕不需要。
 */
export function hasPuppetMotionCue(text: string): PuppetMotion | null {
  const t = String(text || '');
  if (CLIMB_CUE.test(t)) return 'climb';
  if (WALK_CUE.test(t)) return 'walk';
  return null;
}

export function hasThreeMotionCue(text: string): Action3DMotion | null {
  const t = String(text || '');
  // 滑梯存在 + 明确的向下位移动词，缺一不可："爬上滑梯"是站着不动
  if (SLIDE_NOUN.test(t) && SLIDE_DESCEND.test(t)) return 'slide';
  if (DRIBBLE_CUE.test(t)) return 'dribble';
  return null;
}

/**
 * 文案里有没有任何动作线索（三维优先，其次二维）。
 *
 * 存在的意义只有一个：让装配层能判断"这次降级是静默的还是有据可查的"。
 * 有线索却没产出 interaction，说明要么被回顾/列举判据主动拦掉了（合理），
 * 要么是路由漏了（bug）——两者都会记一条 warn，区别只在文案里能不能看到原因。
 * 没有这条，降级就是无声的，只能靠人工抽帧发现。
 */
export function hasAnyMotionCue(text: string): PuppetMotion | Action3DMotion | null {
  return hasThreeMotionCue(text) ?? hasPuppetMotionCue(text);
}

/**
 * 一幕文案里提到了几种**不同**的动作。
 *
 * 用途只有一个：识别"列举/回顾幕"。hasThreeMotionCue 只会返回优先级最高的那一个，
 * 用来判断"这一幕在演什么"没问题，但判断"这一幕是不是在背流程表"就不够——
 * 三个动作都提到时它只会默默挑一个，画面看着合理、内容却是错的。
 */
function countDistinctMotionCues(text: string): number {
  const t = String(text || '');
  let count = 0;
  if (SLIDE_NOUN.test(t) && SLIDE_DESCEND.test(t)) count += 1;
  if (DRIBBLE_CUE.test(t)) count += 1;
  if (CLIMB_CUE.test(t)) count += 1;
  if (WALK_CUE.test(t)) count += 1;
  return count;
}

export interface DeriveInput {
  /** imagePrompt / visualDescription：关系写得最完整的地方，优先用它 */
  visualDescription: string;
  narration?: string;
  onScreenText?: string;
  /** 已识别出的角色（按出现顺序），来自 findAnimalMentions */
  mentions: Array<{ id: string; label: string }>;
  /** 已识别出的道具 id 列表 */
  propIds: string[];
}

/**
 * 从中文画面描述里确定性提取关系。用于已生成课程（分镜里还没有 interaction 字段）
 * 和历史缓存任务的补帧——不依赖再跑一次 LLM。
 *
 * 刻意只认明确的动词句式，宁可返回 null 退回普通构图，也不猜一个错误关系：
 * 画面演错比画面简单更糟。
 */
export function deriveInteractionFromText(input: DeriveInput): SceneInteraction | null {
  const text = `${input.visualDescription || ''} ${input.narration || ''}`.trim();
  const mentions = input.mentions.slice(0, 3);
  if (mentions.length === 0) return null;
  const actor = (index: number, role: ActorRole): InteractionActor => ({
    id: mentions[index].id,
    label: mentions[index].label,
    role,
  });
  const prop = input.propIds.find((id) => id && id !== 'star' && id !== 'heart') || input.propIds[0];

  // 总结/回顾场景（"今天我们学习了…请说一说…"）不做角色动作演出：
  // 它没有单一的"谁对谁做什么"，文案里列举"一起抬桌子"只是在回顾四个画面，
  // 硬套一个 lift-together 只会画错。必须在动作匹配之前拦掉。
  if (/今天我们学习|今天我们|回顾|你记住了什么/.test(text)) return null;
  // 显式的"复述/排序"提示语同样是回顾幕。只认"今天/回顾"会漏掉
  // "它把顺序说清楚啦"这种写法——实测这一幕因此被"拍皮球"抓走，
  // 回顾画面演成了单拍球动作，主次全错。
  if (/说清楚|复述|讲一遍|按顺序|顺序说|总结一下/.test(text)) return null;
  // 一幕里同时出现三种及以上不同动作，说明是在列举而不是正在做某一件事。
  // 两个动作仍允许（"爬到顶上再滑下来"是真实的一幕流程，取更具戏剧性的滑），
  // 三个就一定是在背流程表。
  if (countDistinctMotionCues(text) >= 3) return null;

  // 三维动作优先判定：这两句的动词最具体（"滑"和"拍"），后面 handover/point
  // 的正则都不该抢走它们。判据本身抽到 hasThreeMotionCue，队列排引擎时复用同一份。
  const motion = hasThreeMotionCue(text);
  if (motion === 'slide') {
    return {
      verb: 'slide',
      actors: [actor(0, 'helper')],
      propId: 'slide',
      action3d: { renderer: '3d-procedural', motion: 'slide', actorId: mentions[0].id, propId: 'slide' },
    };
  }
  if (motion === 'dribble') {
    return {
      verb: 'dribble',
      actors: [actor(0, 'helper')],
      propId: 'ball',
      action3d: { renderer: '3d-procedural', motion: 'dribble', actorId: mentions[0].id, propId: 'ball' },
    };
  }

  // "小熊把饼干递给小兔" / "小熊把皮球轻轻递出去" / "小兔双手接过"
  const handover =
    /把[^，。；]{0,10}(?:递|交给|给)/.test(text) ||
    /(?:递|交给)给?[^，。；]{0,8}/.test(text) ||
    /双手接过|接过/.test(text);
  if (handover && mentions.length >= 2) {
    // "把" 字前的角色是递出者；文案里两个角色都有时，另一个就是接收者。
    const giveMatch = text.match(/([^\s，。；]{1,8})把/);
    const giverLabel = giveMatch ? giveMatch[1] : '';
    const giverIndex = mentions.findIndex((m) => giverLabel.includes(m.label));
    const giver = giverIndex >= 0 ? giverIndex : 0;
    const receiver = mentions.length > 1 ? (giver === 0 ? 1 : 0) : 0;
    const speech = extractSpeech(text, input.onScreenText);
    return {
      verb: 'handover',
      actors: [actor(giver, 'giver'), actor(receiver, 'receiver')],
      ...(prop ? { propId: prop } : {}),
      ...(speech ? { speech } : {}),
    };
  }

  // "兔兔走过来一起抬桌子"。注意必须是"一起 + 抬搬拿推提"这类真动作，
  // "一起大声说""一起说"是总结场景的口号，不能误判成抬东西。
  if (/(一起|共同|合力)(抬|搬|拿|推|提)/.test(text) && mentions.length >= 2) {
    return {
      verb: 'lift-together',
      actors: [actor(0, 'helper'), actor(1, 'helper')],
      ...(prop ? { propId: prop } : {}),
    };
  }

  /**
   * 单人位移（爬 / 走）排在"协作动作"之后、"说话/指"之前，位置是刻意的：
   *  - 放在 handover/lift-together 之前，会把"兔兔走过来一起抬桌子"抢成 walk；
   *  - 放在 point/hold 之后，"小熊爬上滑梯，小手扶好"又会被"扶"抢成 hold。
   * 判据本身要求"爬 + 向上"或"走/跑 + 趋向补语"，名词性的"爬行动物""走廊"不命中。
   */
  const puppetMotion = hasPuppetMotionCue(text);
  if (puppetMotion) {
    return {
      verb: puppetMotion === 'climb' ? 'climb' : 'walk',
      actors: [actor(0, 'helper')],
      ...(puppetMotion === 'climb' ? { propId: 'slide' } : {}),
      puppet: { motion: puppetMotion, actorId: mentions[0].id },
    };
  }

  // "嘴巴旁出现对话气泡：可以借我玩吗？" / "小兔看着小熊…"
  const speech = extractSpeech(text, input.onScreenText);
  if (/(对话气泡|气泡|嘴巴旁|大声说|说[：:])/.test(text) && speech) {
    return {
      verb: 'speak',
      actors: [actor(0, 'speaker'), ...(mentions.length > 1 ? [actor(1, 'target')] : [])],
      speech,
    };
  }

  // "请你指一指皮球" / "指一指谁在笑"
  if (/指一指|指给|指向/.test(text) && prop) {
    return {
      verb: 'point',
      actors: [actor(0, 'helper')],
      propId: prop,
      ...(speech ? { speech } : {}),
    };
  }

  return null;
}

/**
 * 提取该幕真正要"说出来"的那句话。优先级：
 * 1) 中文引号里的短句（"谢谢你"、"可以借我玩吗？"）
 * 2) 冒号后到标点前的文字（气泡：可以借我玩吗？）
 * 3) 兜底用 onScreenText（但排除纯提问式提示语，画成气泡会很怪）
 */
function extractSpeech(text: string, onScreenText?: string): string | undefined {
  const quoted = text.match(/[“"']([^”"']{2,20})[”"']/);
  if (quoted && !/^(借|还|分享|一起抬，更省力)$/.test(quoted[1])) {
    return quoted[1];
  }
  const colon = text.match(/(?:气泡|说)[：:]\s*([^，。；！？]{2,20})/);
  if (colon) return colon[1];
  const screen = clean(onScreenText);
  // 提示语（"…有什么？" "指一指…" "找一找：A、B、C"）是给孩子的任务清单，
  // 不是角色说的话，塞进气泡会让小熊"说"出一句考题。宁可不画气泡。
  if (
    screen &&
    !/[？?：:]/.test(screen) &&
    !/指一指|看一看|想一想|说一说|找一找|等一等/.test(screen) &&
    screen.length <= 12
  ) {
    return screen;
  }
  return undefined;
}
