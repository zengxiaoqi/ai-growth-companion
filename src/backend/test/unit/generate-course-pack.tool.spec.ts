import { GenerateCoursePackTool } from '../../src/modules/ai/agent/tools/generate-course-pack';

describe('GenerateCoursePackTool', () => {
  let tool: GenerateCoursePackTool;
  let llmClient: { generate: jest.Mock };
  let generateActivityTool: { execute: jest.Mock };

  beforeEach(() => {
    llmClient = {
      generate: jest.fn(),
    };
    generateActivityTool = {
      execute: jest.fn(),
    };
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
    expect(result.videoLesson?.shots?.length).toBeGreaterThanOrEqual(5);
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
});
