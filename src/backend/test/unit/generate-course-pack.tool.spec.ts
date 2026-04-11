import { GenerateCoursePackTool } from '../../src/modules/ai/agent/tools/generate-course-pack';
import { getCoursePackCurriculumSeed } from '../../src/modules/learning/course-curriculum-fallback';

jest.mock('../../src/modules/learning/course-curriculum-fallback', () => ({
  getCoursePackCurriculumSeed: jest.fn(),
}));

describe('GenerateCoursePackTool', () => {
  let tool: GenerateCoursePackTool;
  let llmClient: { generate: jest.Mock };
  let generateActivityTool: { execute: jest.Mock };
  let mockedGetCoursePackCurriculumSeed: jest.MockedFunction<typeof getCoursePackCurriculumSeed>;

  beforeEach(() => {
    llmClient = {
      generate: jest.fn(),
    };
    generateActivityTool = {
      execute: jest.fn(),
    };
    mockedGetCoursePackCurriculumSeed = getCoursePackCurriculumSeed as jest.MockedFunction<typeof getCoursePackCurriculumSeed>;
    mockedGetCoursePackCurriculumSeed.mockReset();
    mockedGetCoursePackCurriculumSeed.mockReturnValue(null);
    tool = new GenerateCoursePackTool(llmClient as any, generateActivityTool as any);
  });

  it('returns structured course pack and embeds generated game payload', async () => {
    generateActivityTool.execute.mockResolvedValueOnce(JSON.stringify({
      type: 'quiz',
      title: 'Math Game',
      topic: '10以内加法',
      ageGroup: '5-6',
      questions: [
        { question: '2+3=?', options: ['4', '5', '6'], correctIndex: 1, explanation: '2+3=5' },
        { question: '1+4=?', options: ['5', '6', '4'], correctIndex: 0, explanation: '1+4=5' },
        { question: '3+3=?', options: ['6', '7', '8'], correctIndex: 0, explanation: '3+3=6' },
      ],
    }));

    llmClient.generate.mockResolvedValueOnce(JSON.stringify({
      title: '加法探险课',
      summary: '通过故事和练习学习10以内加法。',
      outcomes: ['会口算', '会表达解题过程', '会书写算式'],
      modules: {
        listening: {
          goal: '听懂加法故事',
          audioScript: [{ segment: 'part1', narration: '小兔子有2个苹果。', soundCue: 'bell', durationSec: 10 }],
          questions: ['小兔子有几个苹果？', '后来发生了什么？'],
        },
        speaking: {
          goal: '说出算式',
          warmup: '请大声读出算式',
          prompts: [{ prompt: '2+3等于几？', sampleAnswer: '等于5', coachTip: '鼓励完整表达' }],
        },
        reading: {
          goal: '读懂算式',
          text: '今天学习2+3=5',
          keywords: ['2', '+', '5'],
          questions: ['你看到什么符号？', '答案是多少？'],
        },
        writing: {
          goal: '会写算式',
          tracingItems: ['2+3=5', '1+4=5'],
          practiceTasks: ['抄写三遍', '口述一次'],
          checklist: ['数字清晰', '等号正确'],
        },
      },
      visualStory: {
        style: 'cartoon',
        scenes: [
          { scene: 's1', imagePrompt: 'rabbit with apples', narration: '开始', onScreenText: '开始', durationSec: 8 },
          { scene: 's2', imagePrompt: 'counting apples', narration: '讲解', onScreenText: '讲解', durationSec: 10 },
          { scene: 's3', imagePrompt: 'interactive question', narration: '提问', onScreenText: '提问', durationSec: 10 },
          { scene: 's4', imagePrompt: 'celebration', narration: '总结', onScreenText: '总结', durationSec: 8 },
        ],
      },
      videoLesson: {
        title: '加法小课堂',
        durationSec: 180,
        shots: [
          { shot: '1', visualPrompt: 'opening', narration: '欢迎', caption: '欢迎', durationSec: 12 },
          { shot: '2', visualPrompt: 'teaching', narration: '讲解', caption: '讲解', durationSec: 18 },
          { shot: '3', visualPrompt: 'practice', narration: '练习', caption: '练习', durationSec: 20 },
          { shot: '4', visualPrompt: 'summary', narration: '总结', caption: '总结', durationSec: 12 },
        ],
        renderGuide: { aspectRatio: '16:9', voiceStyle: 'friendly', musicStyle: 'light' },
      },
      parentGuide: {
        beforeClass: ['准备纸笔', '打开音频'],
        duringClass: ['多鼓励', '多提问'],
        afterClass: ['复盘错题', '夸奖孩子'],
        assessmentChecklist: ['能听懂', '能说出', '能写出'],
      },
    }));

    const result = JSON.parse(await tool.execute({
      topic: '10以内加法',
      ageGroup: '5-6',
      focus: 'math',
      durationMinutes: 20,
      parentPrompt: '给我一套10以内加法课程',
    }));

    expect(result.type).toBe('course_pack');
    expect(result.topic).toBe('10以内加法');
    expect(result.modules?.listening).toBeTruthy();
    expect(result.modules?.speaking).toBeTruthy();
    expect(result.modules?.reading).toBeTruthy();
    expect(result.modules?.writing).toBeTruthy();
    expect(result.game?.activityData?.type).toBe('quiz');
    expect(generateActivityTool.execute).toHaveBeenCalledTimes(1);
  });

  it('defaults ageGroup to 5-6 and falls back when llm keeps returning invalid JSON', async () => {
    generateActivityTool.execute.mockResolvedValueOnce(JSON.stringify({
      type: 'matching',
      topic: '汉字故事',
      ageGroup: '5-6',
      pairs: [
        { id: 'p1', left: '日', right: '太阳' },
        { id: 'p2', left: '月', right: '月亮' },
        { id: 'p3', left: '山', right: '大山' },
      ],
    }));
    llmClient.generate.mockResolvedValue('not-json');

    const result = JSON.parse(await tool.execute({
      topic: '汉字故事',
      focus: 'literacy',
    }));

    expect(result.type).toBe('course_pack');
    expect(result.ageGroup).toBe('5-6');
    expect(result.visualStory?.scenes?.length).toBeGreaterThanOrEqual(4);
    expect(result.videoLesson?.shots?.length).toBeGreaterThanOrEqual(4);
    expect(result.modules?.listening?.audioScript?.length).toBeGreaterThanOrEqual(3);
    expect(result.videoLesson?.shots?.some((shot: any) => /opening|concept|practice|wrap-?up|shot\s*\d+/i.test(String(shot.shot)))).toBe(false);
    expect(result.modules?.listening?.audioScript?.some((item: any) => /part\s*\d+/i.test(String(item.segment)))).toBe(false);
    expect(generateActivityTool.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        ageGroup: '5-6',
      }),
    );
    expect(llmClient.generate).toHaveBeenCalledTimes(3);
  });

  it('expands explicit literacy units into per-item teaching shots', async () => {
    generateActivityTool.execute.mockResolvedValueOnce(JSON.stringify({
      type: 'matching',
      topic: '认识汉字：天、地、人',
      ageGroup: '5-6',
      pairs: [
        { id: 'p1', left: '天', right: '天空' },
        { id: 'p2', left: '地', right: '大地' },
        { id: 'p3', left: '人', right: '人物' },
      ],
    }));
    llmClient.generate.mockResolvedValue('not-json');

    const result = JSON.parse(await tool.execute({
      topic: '认识汉字：天、地、人',
      focus: 'literacy',
    }));

    const shotNames = result.videoLesson?.shots?.map((shot: any) => String(shot.shot)) || [];
    const narrations = result.videoLesson?.shots?.map((shot: any) => String(shot.narration)) || [];
    const audioSegments = result.modules?.listening?.audioScript?.map((item: any) => String(item.segment)) || [];

    expect(shotNames).toEqual(
      expect.arrayContaining(['天字讲解', '地字讲解', '人字讲解']),
    );
    expect(narrations.some((text: string) => text.includes('“天”字') || text.includes('”天”字'))).toBe(true);
    expect(narrations.some((text: string) => text.includes('“地”字') || text.includes('”地”字'))).toBe(true);
    expect(narrations.some((text: string) => text.includes('“人”字') || text.includes('”人”字'))).toBe(true);
    expect(audioSegments).toEqual(
      expect.arrayContaining(['天字讲解', '地字讲解', '人字讲解']),
    );
  });

  it('uses curriculum seed for fallback summary and review narration', async () => {
    generateActivityTool.execute.mockResolvedValueOnce(JSON.stringify({
      type: 'matching',
      topic: '四季变化',
      ageGroup: '5-6',
      pairs: [
        { id: 'p1', left: '春', right: '春天' },
        { id: 'p2', left: '夏', right: '夏天' },
      ],
    }));
    llmClient.generate.mockResolvedValue('not-json');

    mockedGetCoursePackCurriculumSeed.mockReturnValue({
      summary: '了解春夏秋冬四个季节的特点和变化',
      outcomes: ['认识四季名称', '了解每个季节的特征'],
      teachingUnits: ['春', '夏', '秋', '冬'],
      unitFacts: {
        '春': '万物复苏、花朵开放的季节',
        '夏': '天气炎热、可以吃冰淇淋的季节',
        '秋': '树叶变黄、果实成熟的季节',
        '冬': '天气寒冷、会下雪的季节',
      },
      readingText: '一年有春、夏、秋、冬四个季节。',
      readingKeywords: ['春', '夏', '秋', '冬', '季节'],
      listeningQuestions: ['一年有几个季节？', '冬天有什么特点？'],
      tracingItems: ['春', '夏'],
      practiceTasks: ['说说你最喜欢的季节'],
      matchingPairs: [
        { left: '春', right: '花朵开放' },
        { left: '冬', right: '天气寒冷' },
      ],
      quizItems: [
        { question: '一年有几个季节？', options: ['两个', '三个', '四个'], answer: '四个' },
      ],
    });

    const result = JSON.parse(await tool.execute({
      topic: '四季变化',
      ageGroup: '5-6',
      focus: 'science',
      includeGame: false,
    }));

    expect(result.type).toBe('course_pack');

    // Summary uses seed
    expect(result.summary).toContain('季节');

    // Scenes use curriculum-grounded units
    const sceneNarrations = result.visualStory?.scenes?.map((s: any) => String(s.narration)) || [];
    const hasSpringNarration = sceneNarrations.some((t: string) => t.includes('春'));
    expect(hasSpringNarration).toBe(true);

    // Shots include per-unit teaching
    const shotNames = result.videoLesson?.shots?.map((s: any) => String(s.shot)) || [];
    expect(shotNames.some((name: string) => name.includes('春'))).toBe(true);
    expect(shotNames.some((name: string) => name.includes('冬'))).toBe(true);

    // Audio script uses unit narration with facts
    const audioNarrations = result.modules?.listening?.audioScript?.map((a: any) => String(a.narration)) || [];
    expect(audioNarrations.some((t: string) => t.includes('春'))).toBe(true);

    // Review narration mentions units and facts
    const reviewScene = result.visualStory?.scenes?.find((s: any) => String(s.scene).includes('总结'));
    if (reviewScene) {
      expect(String(reviewScene.narration)).toContain('春');
    }
  });

  it('uses curriculum seed for fallback reading text and writing items', async () => {
    generateActivityTool.execute.mockResolvedValueOnce(JSON.stringify({
      type: 'matching',
      topic: '认识动物',
      ageGroup: '5-6',
      pairs: [
        { id: 'p1', left: '猫', right: '小猫' },
        { id: 'p2', left: '狗', right: '小狗' },
      ],
    }));
    llmClient.generate.mockResolvedValue('not-json');

    mockedGetCoursePackCurriculumSeed.mockReturnValue({
      summary: '认识常见的动物朋友',
      outcomes: ['认识猫、狗、兔的特征', '了解它们的生活习性'],
      teachingUnits: ['猫', '狗', '兔'],
      unitFacts: {
        '猫': '会捉老鼠的家养动物',
        '狗': '人类最忠诚的朋友',
        '兔': '爱吃胡萝卜的小动物',
      },
      readingText: '猫、狗和兔都是我们的好朋友。',
      readingKeywords: ['猫', '狗', '兔', '动物'],
      listeningQuestions: ['小猫喜欢吃什么？', '小狗会做什么？'],
      tracingItems: ['猫', '狗'],
      practiceTasks: ['画一画你喜欢的动物'],
      matchingPairs: [
        { left: '猫', right: '捉老鼠' },
        { left: '狗', right: '看家护院' },
      ],
      quizItems: [
        { question: '谁爱吃胡萝卜？', options: ['猫', '狗', '兔'], answer: '兔' },
      ],
    });

    const result = JSON.parse(await tool.execute({
      topic: '认识动物',
      ageGroup: '5-6',
      focus: 'science',
      includeGame: false,
    }));

    // Reading text from seed
    expect(result.modules?.reading?.text).toContain('猫');

    // Writing tracing items from seed
    const tracingItems: string[] = result.modules?.writing?.tracingItems || [];
    expect(tracingItems.some((item: string) => item.includes('猫'))).toBe(true);

    // Reading keywords include seed keywords
    const keywords: string[] = result.modules?.reading?.keywords || [];
    expect(keywords.some((k: string) => k.includes('猫') || k.includes('狗'))).toBe(true);
  });
});
