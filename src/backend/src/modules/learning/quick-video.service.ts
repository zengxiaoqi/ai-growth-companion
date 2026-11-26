import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Content } from '../../database/entities/content.entity';
import { LessonVideoQueueService } from './lesson-video-queue.service';
import { LlmClientService } from '../../agent-framework/llm/llm-client.service';
import type { VideoRenderEngine } from '../../database/entities/video-generation-task.entity';
import {
  assertTopicSpecificScienceFacts,
  findTopicSpecificScienceIssues,
} from './science-fact-guards';

@Injectable()
export class QuickVideoService {
  private readonly logger = new Logger(QuickVideoService.name);

  constructor(
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    private readonly llmClient: LlmClientService,
    private readonly lessonVideoQueue: LessonVideoQueueService,
  ) {}

  /**
   * 根据 topic + ageGroup 生成完整课程内容
   * 返回可直接用于 VideoGenerationAgent 的 payload
   */
  async generateLessonContent(params: {
    topic: string;
    ageGroup: string;
    durationSec?: number;
    style?: string;
  }): Promise<Record<string, any>> {
    const duration = params.durationSec || 60;
    const targetScenes = Math.max(3, Math.min(8, Math.floor(duration / 8)));

    const domain = this.resolveDomain(params.topic, params.style);
    const prompt = this.buildContentPrompt(
      params.topic,
      params.ageGroup,
      targetScenes,
      params.style,
      domain,
    );

    const result = await this.requestLessonContent(prompt);

    const parsed = this.parseAiResult(result);
    const lesson = this.normalizeLessonPayload(parsed, params.topic, params.style);
    if (lesson.domain !== 'science') return lesson;

    let reviewed = await this.reviewScienceFacts(lesson, params.topic, params.ageGroup);
    let revisionCount = reviewed.scienceFactCheck.revisionCount as number;
    const remainingIssues = findTopicSpecificScienceIssues(reviewed, params.topic);
    if (remainingIssues.length > 0) {
      const corrected = await this.reviewScienceFacts(
        reviewed,
        params.topic,
        params.ageGroup,
        remainingIssues,
      );
      revisionCount += corrected.scienceFactCheck.revisionCount as number;
      reviewed = {
        ...corrected,
        scienceFactCheck: { reviewed: true, revisionCount },
      };
    }
    assertTopicSpecificScienceFacts(reviewed, params.topic);
    return reviewed;
  }

  private async requestLessonContent(prompt: string): Promise<any> {
    const configured = Number(process.env.LLM_LESSON_MAX_TOKENS);
    const maxTokens =
      Number.isFinite(configured) && configured >= 8192 && configured <= 65536 ? configured : 32768;
    const first = await this.llmClient.chatCompletion(
      [{ role: 'user', content: prompt }],
      undefined,
      maxTokens,
    );
    if (first?.finishReason !== 'length') return first;

    this.logger.warn('AI lesson output hit the token limit; retrying with a compact JSON contract');
    const retry = await this.llmClient.chatCompletion(
      [
        {
          role: 'user',
          content: `${prompt}

上一次回答因输出上限被截断。本次请直接输出完整 JSON，不要解释。
保留主题与核心科学知识，压缩为 3-5 个场景；每幕只保留 title、narration、
visualDescription、onScreenText、durationSec。省略 performance、props、figure、
sceneGraph 和 beats，这些视觉结构会由后续分镜代理重新生成。`,
        },
      ],
      undefined,
      maxTokens,
    );
    if (retry?.finishReason === 'length') {
      throw new Error('AI lesson content was truncated by the output token limit after retry');
    }
    return retry;
  }

  /**
   * 科学课只回传文字修订，不重新生成动作、道具或分镜，避免事实复核把
   * 已经合格的视觉结构改坏。复核失败时不保存课程，更不能进入出片队列。
   */
  private async reviewScienceFacts(
    lesson: Record<string, any>,
    topic: string,
    ageGroup: string,
    focusIssues: string[] = [],
  ): Promise<Record<string, any>> {
    const focusedReview = focusIssues.length
      ? [
          '上一轮复核仍遗漏了以下高风险结论。本轮必须逐条修正，不能再次原样保留：',
          ...focusIssues.map((issue) => `- ${issue}`),
          '如果无法确认，请把结论改成观察事实或“有些/可能/有一定帮助”等审慎表述。',
        ].join('\n')
      : '';
    const prompt = `你是儿童科学课程的事实复核编辑。请复核主题「${topic}」、年龄段 ${ageGroup} 的课程文字。

${focusedReview}
重点检查：
- 每个科学结论都要有依据，不编造机制、因果关系或绝对规律；儿童类比不能替代事实。
- 不要把花纹数量、颜色或体型当作动物年龄、大小的可靠判断。
- 蜗牛壳不是年轮：禁止“长一岁多一圈”“圈圈越多说明越老/越大”这类推断；蜗牛壳在壳口边缘逐渐形成。
- 描述动物生长时，区分身体长大、已有结构扩大和新结构在生长边缘形成；例如蜗牛的新壳在壳口边缘形成，不是整个壳从里向外长。
- 有壳只表示有一定保护作用，不说“绝对安全”“不怕被天敌啄咬”等保证。
- 保护色、食性、习性等不要泛化到所有动物；不确定时用“有些”“常常”等准确表述。
- 画面示例必须与讲述对象一致；讲蜗牛壳花纹时不要用斑马、瓢虫冒充蜗牛壳，除非明确标注为类比。

只返回需要修改的文字，严格按以下 JSON 格式输出，不要解释：
{
  "revisions": [
    {
      "sceneIndex": 1,
      "title": "可选，修改后的本幕标题",
      "narration": "可选，修改后的本幕旁白",
      "visualDescription": "可选，修改后的视觉描述",
      "onScreenText": "可选，修改后的屏幕文字"
    }
  ]
}
sceneIndex 从 1 开始；没有问题时返回 {"revisions": []}。不要返回 performance、props、beats 等结构字段。

待复核课程：
${JSON.stringify(lesson)}`;

    const result = await this.llmClient.chatCompletion(
      [{ role: 'user', content: prompt }],
      undefined,
      8192,
    );
    const audit = this.parseAiResult(result);
    if (!Array.isArray(audit.revisions)) {
      throw new Error('AI science review did not return a revisions array');
    }

    const reviewed = JSON.parse(JSON.stringify(lesson)) as Record<string, any>;
    const shots = reviewed.videoLesson.shots as Record<string, any>[];
    const scenes = reviewed.visualStory.scenes as Record<string, any>[];
    const seen = new Set<number>();
    let revisionCount = 0;
    for (const revision of audit.revisions) {
      const sceneIndex = Number(revision?.sceneIndex);
      if (!Number.isInteger(sceneIndex) || sceneIndex < 1 || sceneIndex > shots.length) {
        throw new Error(`AI science review returned invalid sceneIndex=${sceneIndex}`);
      }
      if (seen.has(sceneIndex)) {
        throw new Error(`AI science review returned duplicate sceneIndex=${sceneIndex}`);
      }
      seen.add(sceneIndex);
      const fields = ['title', 'narration', 'visualDescription', 'onScreenText'] as const;
      let changed = false;
      for (const field of fields) {
        if (revision[field] === undefined) continue;
        const value = this.toText(revision[field]);
        if (!value) throw new Error(`AI science review returned empty ${field}`);
        shots[sceneIndex - 1][field] = value;
        scenes[sceneIndex - 1][field] = value;
        changed = true;
      }
      if (changed) revisionCount += 1;
    }
    return { ...reviewed, scienceFactCheck: { reviewed: true, revisionCount } };
  }

  private buildContentPrompt(
    topic: string,
    ageGroup: string,
    targetScenes: number,
    style?: string,
    domain = 'language',
  ): string {
    // Guide the model toward a complete, render-ready lesson document.
    const styleText =
      style === 'science'
        ? '科学探索'
        : style === 'song'
          ? '音乐儿歌'
          : style === 'story'
            ? '故事讲述'
            : '活泼有趣的卡通风格';

    return `你是一个儿童教育内容创作专家。请为 ${ageGroup} 岁的孩子创作一个关于「${topic}」的教学视频内容。

要求：
- 生成 ${targetScenes} 个场景（shots）
- 每个场景包含：标题、旁白文字（中文，适合儿童，每段30-60字）、视觉描述（英文，用于生成动画场景图）、屏幕文字
- 整体时长约 ${targetScenes * 8} 秒
- 风格：${styleText}
- 科学事实必须准确：不要编造生长机制或因果关系；描述生长时区分身体长大和结构在边缘新增，儿童类比不能替代事实。

动作（写在 visualStory.scenes 的 performance 里，可选但很重要）：
- 只要这一幕里角色真的在动（而不是站着被讲解），就必须写 performance。
  它是一个**按时间排序的动作列表**，孩子看到的顺序就是数组顺序。
- 只动一次就写 1 个动作；如果是"走过去 → 指着滑梯 → 说一句话"这样连续的两三下，
  就把它们按顺序写进同一个 actions 数组，**不要拆成三幕**——拆开就是三次镜头切换，
  孩子刚跟上动作画面就跳走了。一幕最多 3 个动作。
- 能演的动作只有下面这些，不要发明新动词：
  · 单人：walk 走过去/跑过去、climb 爬上去、point 指着某物、speak 对着镜头说话、
    cheer 欢呼、sit 坐下、hold 举着某物、slide 从滑梯滑下来、dribble 拍皮球
  · 双人：handover 把东西递给别人（role 写 giver + receiver）、
    lift-together 两人一起抬（role 写 helper + helper）
- climb / slide / dribble 只能放在最后一个（它们结束时角色已在高处或滑行终点，
  后面再接别的动作会瞬移）。
- actors 只在 performance 层写一次，后续动作省略并自动继承；不要每个动作都重抄一遍。
- actors 的 id 用英文小写名词（bear / rabbit / tiger），label 用旁白里的中文叫法（小熊 / 小兔）。
- 道具分两件事：**先声明，再引用**。
  · 声明写在 visualStory.scenes 的 props 数组里，名字用中文自由字符串，最多 3 个：
    {"name":"洒水壶","place":"hand","heightRatio":0.22}
    -place 只能是 hand（拿在手里）/ floor（放在地上）/ worn（穿在身上）；
    -heightRatio 是这个东西相对角色的高度（0.08~0.9），参考：苹果 0.1、杯子 0.12、
     皮球 0.22、水桶 0.22、椅子 0.35、桌子 0.55；
    -只声明旁白里真的用到的实物（"提着洒水壶" → 洒水壶），不要列角色、天气、抽象概念。
  · 动作要指向某个道具时，propId 写 props 里那个名字（propId 用 "洒水壶"），
    或者内置道具 id：ball / cookie / apple / banana / book / block / table / slide / star / heart。
    指向声明过的名字时，画面会画出那个道具并挂到手上/摆在地上；指向内置 id 用现成图形。
- 只写意图，不要写坐标、高度、帧数、时长——画面几何与动作时长由渲染层决定，写了也会被忽略。
- 这一幕没有明显动作（纯讲知识）就省略 performance，不要硬凑。

请严格按照以下 JSON 格式输出（不要包含其他文字）：

{
  "title": "课程标题（中文，10字以内）",
  "summary": "课程简介（30字以内）",
  "domain": "${domain}",
  "videoLesson": {
    "shots": [
      {
        "title": "场景标题",
        "narration": "旁白文字（中文）",
        "visualDescription": "visual description in English for animation scene",
        "onScreenText": "屏幕显示文字",
        "durationSec": 8
      }
    ]
  },
  "visualStory": {
    "scenes": [
      {
        "title": "场景标题（同 shots）",
        "narration": "旁白文字",
        "visualDescription": "visual description for animation",
        "onScreenText": "屏幕文字",
        "durationSec": 8,
        "props": [{ "name": "洒水壶", "place": "hand", "heightRatio": 0.22 }],
        "animationTemplate": { "id": "dynamic.story-scene" },
        "performance": {
          "actors": [{ "id": "bear", "label": "小熊", "role": "helper" }],
          "actions": [
            { "verb": "walk" },
            { "verb": "point", "propId": "slide" },
            { "verb": "speak", "speech": "看，这就是滑梯" }
          ]
        }
      }
    ]
  }
}`;
  }

  private parseAiResult(result: any): Record<string, any> {
    const text = typeof result?.content === 'string' ? result.content.trim() : '';
    if (result?.finishReason === 'length') {
      throw new Error('AI lesson content was truncated by the output token limit');
    }
    if (!text) {
      throw new Error(
        `AI returned no lesson content (finishReason=${result?.finishReason || 'unknown'})`,
      );
    }

    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const raw = jsonMatch ? jsonMatch[1] : text;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('lesson payload must be a JSON object');
      }
      return parsed;
    } catch (error: any) {
      this.logger.warn(`AI lesson JSON parse failed: ${error?.message || 'invalid JSON'}`);
      throw new Error('AI lesson content was not valid JSON');
    }
  }

  private normalizeLessonPayload(
    payload: Record<string, any>,
    topic: string,
    style?: string,
  ): Record<string, any> {
    const shots = Array.isArray(payload.videoLesson?.shots) ? payload.videoLesson.shots : [];
    const scenes = Array.isArray(payload.visualStory?.scenes) ? payload.visualStory.scenes : [];
    const sceneCount = Math.max(shots.length, scenes.length);
    if (sceneCount === 0) {
      throw new Error('AI lesson content contains no shots or scenes');
    }

    const normalizedShots: Record<string, any>[] = [];
    const normalizedScenes: Record<string, any>[] = [];
    for (let index = 0; index < sceneCount; index += 1) {
      const shot = shots[index];
      const scene = scenes[index];
      const source = scene || shot;
      const narration = this.toText(source?.narration);
      if (!narration) {
        throw new Error(`AI lesson scene ${index + 1} has no narration`);
      }
      const title = this.toText(source?.title || source?.scene || source?.shot, `场景${index + 1}`);
      const visualDescription = this.toText(
        source?.visualDescription || source?.imagePrompt || source?.visualPrompt,
        `${topic} animated teaching scene`,
      );
      const onScreenText = this.toText(source?.onScreenText || source?.caption, title);
      const durationValue = Number(source?.durationSec);
      const durationSec = Number.isFinite(durationValue)
        ? Math.max(4, Math.min(18, Math.round(durationValue)))
        : 8;
      const normalized = {
        title,
        narration,
        visualDescription,
        onScreenText,
        durationSec,
      };

      normalizedShots.push({
        ...(shot || {}),
        ...normalized,
      });
      normalizedScenes.push({
        ...(scene || {}),
        ...normalized,
        animationTemplate:
          scene?.animationTemplate && typeof scene.animationTemplate === 'object'
            ? scene.animationTemplate
            : { id: 'dynamic.story-scene' },
      });
    }

    return {
      ...payload,
      title: this.toText(payload.title, topic).slice(0, 32),
      summary: this.toText(payload.summary).slice(0, 120),
      domain: this.resolveDomain(topic, style, payload.domain),
      videoLesson: {
        ...(payload.videoLesson || {}),
        shots: normalizedShots,
      },
      visualStory: {
        ...(payload.visualStory || {}),
        scenes: normalizedScenes,
      },
    };
  }

  private resolveDomain(topic: string, style?: string, aiDomain?: string): string {
    if (style === 'science') return 'science';
    if (style === 'song') return 'music';
    if (style === 'story') return 'language';

    const inferred = this.inferDomainFromTopic(topic);
    if (inferred) return inferred;

    const normalized = this.toText(aiDomain).toLowerCase();
    return ['science', 'math', 'language', 'music', 'art', 'social'].includes(normalized)
      ? normalized
      : 'language';
  }

  private inferDomainFromTopic(topic: string): string | null {
    const rules: Array<[string, RegExp]> = [
      [
        'science',
        /蜗牛|蚂蚁|影子|冰|蜘蛛|向日葵|树叶|月亮|声音|磁铁|种子|蝴蝶|桥|风|彩虹|太阳|星星|植物|动物|季节|天气|水|火|地球|太空|科学|自然|昆虫|鸟|鱼|身体|健康|花|树/,
      ],
      ['math', /数字|数学|形状|时钟|七巧板|数量|加减|几何|分类|比较|测量|规律/],
      ['language', /汉字|拼音|古诗|诗词|故事|词语|句子|阅读|表达|语言/],
      ['art', /画画|绘画|颜色|手工|舞蹈|美术/],
      ['social', /礼貌|朋友|分享|合作|情绪|安全|规则|家庭|幼儿园/],
    ];
    return rules.find(([, pattern]) => pattern.test(topic))?.[0] || null;
  }

  private toText(value: unknown, fallback = ''): string {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || fallback;
  }

  private hasUsableLessonContent(content: unknown): boolean {
    if (!content || typeof content !== 'object' || Array.isArray(content)) return false;
    const payload = content as Record<string, any>;
    const shots = Array.isArray(payload.videoLesson?.shots) ? payload.videoLesson.shots : [];
    const scenes = Array.isArray(payload.visualStory?.scenes) ? payload.visualStory.scenes : [];
    return (
      (shots.length > 0 || scenes.length > 0) &&
      [...shots, ...scenes].every((scene) => this.toText(scene?.narration).length > 0)
    );
  }

  /**
   * 创建 Content 实体并入队视频生成任务
   */
  async createContentAndEnqueue(params: {
    topic: string;
    ageGroup: string;
    childId: number;
    durationSec?: number;
    style?: string;
    force?: boolean;
    renderEngine?: VideoRenderEngine;
  }) {
    // 1. 检查缓存：同一 topic+ageRange 只生成一次 Content
    const existingContent = await this.contentRepo.findOne({
      where: {
        topic: params.topic,
        ageRange: params.ageGroup,
        childId: params.childId,
        source: 'quick_generate',
      },
      order: { id: 'DESC' },
    } as any);

    let contentId: number;

    if (existingContent && !params.force && this.hasUsableLessonContent(existingContent.content)) {
      this.logger.log(`Reusing existing quick_generate content: id=${existingContent.id}`);
      contentId = existingContent.id;
    } else {
      if (existingContent) {
        this.logger.warn(`Regenerating invalid quick_generate content: id=${existingContent.id}`);
      }
      // 2. AI 生成内容
      const lessonData = await this.generateLessonContent({
        topic: params.topic,
        ageGroup: params.ageGroup,
        durationSec: params.durationSec,
        style: params.style,
      });

      // 3. 创建 Content 实体
      const content = this.contentRepo.create({
        uuid: randomUUID(),
        title: lessonData.title || params.topic,
        topic: params.topic,
        ageRange: params.ageGroup,
        domain: lessonData.domain || 'language',
        subtitle: lessonData.summary || '',
        source: 'quick_generate',
        // 将 AI 生成的完整数据存入 content 字段（JSON 类型）
        content: lessonData,
        status: 'published',
        contentType: 'video_lesson',
        difficulty: 1,
        durationMinutes: Math.ceil((params.durationSec || 60) / 60),
        mediaUrls: [],
        childId: params.childId,
      } as any);

      const saved = await this.contentRepo.save(content);
      contentId = (saved as any).id;
      this.logger.log(
        `Created quick_generate content: id=${contentId}, title="${(saved as any).title}"`,
      );
    }

    // 4. 入队视频任务（复用现有队列）
    // 快速视频生成是家长主动发起 → autoApprove 直接放行给孩子看，无需二次审批。
    const task = await this.lessonVideoQueue.enqueue(
      contentId,
      params.childId,
      params.force || false,
      params.renderEngine || 'auto',
      true,
    );

    return {
      taskId: task.id,
      contentId,
      status: task.status,
    };
  }
}
