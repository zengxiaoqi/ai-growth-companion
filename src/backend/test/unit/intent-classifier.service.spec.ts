import { IntentClassifierService } from '../../src/agent-framework/intent/intent-classifier.service';
import type { AgentContext, ILlmClient } from '../../src/agent-framework/core';

function childContext(): AgentContext {
  return { ageGroup: '5-6', childId: 2, conversationId: 'c', messages: [], depth: 0, metadata: {} };
}
function parentContext(): AgentContext {
  return { ageGroup: 'parent', parentId: 1, conversationId: 'c', messages: [], depth: 0, metadata: {} };
}

/** ConfigService mock backed by a plain map; unset keys return the default. */
function makeConfig(overrides: Record<string, string> = {}) {
  return {
    get: jest.fn((key: string, def?: any) => (key in overrides ? overrides[key] : def)),
  };
}

function makeLlm(content: string | null = '{"intent":"open"}') {
  return {
    chatCompletion: jest.fn().mockResolvedValue({ content }),
    chatCompletionStream: jest.fn(),
    isConfigured: true,
    casualModel: 'casual-fast',
    englishModel: 'casual-fast',
    generate: jest.fn(),
    estimateTokenCount: jest.fn(),
  };
}

describe('IntentClassifierService — rule pass (no LLM)', () => {
  let llm: ReturnType<typeof makeLlm>;
  let classifier: IntentClassifierService;

  beforeEach(() => {
    llm = makeLlm();
    classifier = new IntentClassifierService(llm as unknown as ILlmClient, makeConfig() as any);
  });

  const musicCases: Array<[string, string | undefined]> = [
    ['播放全部都给你', '全部都给你'],
    ['我想听两只老虎', '两只老虎'],
    ['来一首孤勇者', '孤勇者'],
    ['给我放小星星', '小星星'],
    ['放首歌', undefined],
    ['播放音乐', undefined],
    ['我想听歌', undefined],
  ];
  it.each(musicCases)('classifies %s as play_music with verbatim slot', async (input, slot) => {
    const d = await classifier.classify(input, childContext());
    expect(d.intent).toBe('play_music');
    expect(d.tools).toEqual(['playMusic']);
    expect(d.source).toBe('rule');
    expect(d.slots?.song_title).toBe(slot);
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });

  it('routes 我想听故事 to play_story, not play_music', async () => {
    const d = await classifier.classify('我想听故事', childContext());
    expect(d.intent).toBe('play_story');
    expect(d.tools).toEqual(['playStory', 'loadSkill']);
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });

  it('captures a story topic verbatim', async () => {
    const d = await classifier.classify('讲一个小兔子的故事', childContext());
    expect(d.intent).toBe('play_story');
    expect(d.slots?.topic).toBe('小兔子');
  });

  it('classifies translate requests and captures the text', async () => {
    const a = await classifier.classify('apple用英语怎么说', childContext());
    expect(a.intent).toBe('translate');
    expect(a.tools).toEqual(['translate']);
    expect(a.slots?.text).toBe('apple');

    const b = await classifier.classify('翻译hello', childContext());
    expect(b.intent).toBe('translate');
    expect(b.slots?.text).toBe('hello');
  });

  it('classifies activity requests across phrasings', async () => {
    for (const input of ['出3道数学题', '我要做题', '来个小游戏', '口算练习']) {
      const d = await classifier.classify(input, childContext());
      expect(d.intent).toBe('do_activity');
      expect(d.tools).toEqual(['generateActivity', 'generateQuiz', 'loadSkill']);
    }
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });

  it('classifies greetings and feelings as plain_chat with no tools', async () => {
    for (const input of ['你好', '我今天有点开心', '在吗', '好烦啊']) {
      const d = await classifier.classify(input, childContext());
      expect(d.intent).toBe('plain_chat');
      expect(d.tools).toEqual([]);
    }
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });

  it('classifies knowledge/recommendation as learn_explore (read-only)', async () => {
    const d = await classifier.classify('推荐一个好玩的内容', childContext());
    expect(d.intent).toBe('learn_explore');
    expect(d.tools).toContain('searchContent');
    expect(d.tools).not.toContain('generateActivity');
  });

  it('a specific action outranks a greeting in the same turn', async () => {
    const d = await classifier.classify('你好，我想听小星星', childContext());
    expect(d.intent).toBe('play_music');
    expect(d.slots?.song_title).toBe('小星星');
  });
});

describe('IntentClassifierService — parent intents', () => {
  let llm: ReturnType<typeof makeLlm>;
  let classifier: IntentClassifierService;

  beforeEach(() => {
    llm = makeLlm();
    classifier = new IntentClassifierService(llm as unknown as ILlmClient, makeConfig() as any);
  });

  it('classifies parent report requests', async () => {
    const d = await classifier.classify('看看孩子的学习报告', parentContext());
    expect(d.intent).toBe('parent_report');
    expect(d.tools).toEqual(['viewReport', 'viewAbilities', 'listChildren']);
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });

  it('classifies parent control requests', async () => {
    const d = await classifier.classify('修改屏幕时间设置', parentContext());
    expect(d.intent).toBe('parent_control');
    expect(d.tools).toEqual(['getParentControl', 'updateParentControl', 'listChildren']);
  });

  it('classifies parent small talk as plain_chat (no tools)', async () => {
    const d = await classifier.classify('你好', parentContext());
    expect(d.intent).toBe('plain_chat');
    expect(d.tools).toEqual([]);
  });

  it('parent can still request music', async () => {
    const d = await classifier.classify('播放全部都给你', parentContext());
    expect(d.intent).toBe('play_music');
    expect(d.slots?.song_title).toBe('全部都给你');
  });

  it('does not apply parent-only intents to a child turn', async () => {
    // LLM disabled so a rule miss falls straight through to open.
    const c = new IntentClassifierService(
      llm as unknown as ILlmClient,
      makeConfig({ INTENT_LLM_FALLBACK_ENABLED: 'false' }) as any,
    );
    const d = await c.classify('学习报告', childContext());
    expect(d.intent).not.toBe('parent_report');
    expect(d.intent).toBe('open');
  });
});

describe('IntentClassifierService — LLM fallback', () => {
  it('uses the LLM when rules miss and parses a valid verdict', async () => {
    const llm = makeLlm('{"intent":"plain_chat"}');
    const c = new IntentClassifierService(llm as unknown as ILlmClient, makeConfig() as any);
    const d = await c.classify('嗯嗯', childContext());
    expect(d.intent).toBe('plain_chat');
    expect(d.source).toBe('llm');
    expect(llm.chatCompletion).toHaveBeenCalledTimes(1);
    // Cheap casual model + bounded tokens.
    expect(llm.chatCompletion.mock.calls[0][4]).toBe('casual-fast');
    expect(llm.chatCompletion.mock.calls[0][2]).toBe(256);
  });

  it('binds an LLM slot only when it is a verbatim substring', async () => {
    const llm = makeLlm('{"intent":"play_music","slot":"晴天"}');
    const c = new IntentClassifierService(llm as unknown as ILlmClient, makeConfig() as any);
    const d = await c.classify('晴天', childContext());
    expect(d.intent).toBe('play_music');
    expect(d.slots?.song_title).toBe('晴天');
  });

  it('drops an LLM slot that is not in the user text (fidelity guard)', async () => {
    const llm = makeLlm('{"intent":"play_music","slot":"小星星"}');
    const c = new IntentClassifierService(llm as unknown as ILlmClient, makeConfig() as any);
    const d = await c.classify('放点好听的', childContext());
    expect(d.intent).toBe('play_music');
    expect(d.slots).toBeUndefined();
  });

  it('honours LLM_MODEL_INTENT over the casual model', async () => {
    const llm = makeLlm('{"intent":"open"}');
    const c = new IntentClassifierService(
      llm as unknown as ILlmClient,
      makeConfig({ LLM_MODEL_INTENT: 'intent-model' }) as any,
    );
    await c.classify('嗯嗯', childContext());
    expect(llm.chatCompletion.mock.calls[0][4]).toBe('intent-model');
  });

  it('falls back to open on unparseable output', async () => {
    const llm = makeLlm('this is not json');
    const c = new IntentClassifierService(llm as unknown as ILlmClient, makeConfig() as any);
    const d = await c.classify('嗯嗯', childContext());
    expect(d).toEqual({ intent: 'open', tools: null, source: 'fallback' });
  });

  it('falls back to open on an unknown intent', async () => {
    const llm = makeLlm('{"intent":"banana"}');
    const c = new IntentClassifierService(llm as unknown as ILlmClient, makeConfig() as any);
    const d = await c.classify('嗯嗯', childContext());
    expect(d.intent).toBe('open');
    expect(d.tools).toBeNull();
  });

  it('falls back to open when the LLM throws', async () => {
    const llm = makeLlm();
    llm.chatCompletion.mockRejectedValue(new Error('boom'));
    const c = new IntentClassifierService(llm as unknown as ILlmClient, makeConfig() as any);
    const d = await c.classify('嗯嗯', childContext());
    expect(d).toEqual({ intent: 'open', tools: null, source: 'fallback' });
  });

  it('skips the LLM when isConfigured is false', async () => {
    const llm = makeLlm();
    (llm as any).isConfigured = false;
    const c = new IntentClassifierService(llm as unknown as ILlmClient, makeConfig() as any);
    const d = await c.classify('嗯嗯', childContext());
    expect(d.intent).toBe('open');
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });
});

describe('IntentClassifierService — kill switches', () => {
  it('INTENT_CLASSIFIER_ENABLED=false disables the whole layer', async () => {
    const llm = makeLlm();
    const c = new IntentClassifierService(
      llm as unknown as ILlmClient,
      makeConfig({ INTENT_CLASSIFIER_ENABLED: 'false' }) as any,
    );
    const d = await c.classify('播放全部都给你', childContext());
    expect(d).toEqual({ intent: 'open', tools: null, source: 'fallback' });
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });

  it('INTENT_LLM_FALLBACK_ENABLED=false keeps rules but skips the LLM', async () => {
    const llm = makeLlm();
    const c = new IntentClassifierService(
      llm as unknown as ILlmClient,
      makeConfig({ INTENT_LLM_FALLBACK_ENABLED: 'false' }) as any,
    );
    const hit = await c.classify('播放全部都给你', childContext());
    expect(hit.intent).toBe('play_music');
    const miss = await c.classify('嗯嗯', childContext());
    expect(miss.intent).toBe('open');
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns open for empty input', async () => {
    const llm = makeLlm();
    const c = new IntentClassifierService(llm as unknown as ILlmClient, makeConfig() as any);
    const d = await c.classify('   ', childContext());
    expect(d.intent).toBe('open');
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });
});