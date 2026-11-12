/**
 * Intent registry — the single source of truth mapping each intent to the tools
 * it may call. The classifier, the orchestrator gate, and the executor slot
 * binding all read from here so the taxonomy never drifts across layers.
 *
 * `tools: null` (open) deliberately preserves the status quo: composite, course,
 * video and assignment flows keep the agent's full filtered tool list.
 */

import type { IntentKind, IntentDescriptor } from './intent.types';

export const INTENT_CATALOG: Record<IntentKind, IntentDescriptor> = {
  play_music: {
    label: '点歌 / 播放音乐',
    tools: ['playMusic'],
    slot: 'song_title',
  },
  play_story: {
    label: '讲故事',
    tools: ['playStory', 'loadSkill'],
    skills: ['story-generation'],
    slot: 'topic',
  },
  translate: {
    label: '翻译词或短句',
    tools: ['translate'],
    slot: 'text',
  },
  do_activity: {
    label: '做题 / 练习 / 测验 / 小游戏',
    tools: ['generateActivity', 'generateQuiz', 'loadSkill'],
    skills: ['quiz-generation'],
  },
  learn_explore: {
    label: '知识问答 / 内容推荐（只读，不含生成）',
    tools: [
      'searchContent',
      'getRecommendations',
      'getUserProfile',
      'getAbilities',
      'getLearningHistory',
      'loadSkill',
    ],
  },
  plain_chat: {
    label: '纯聊天 / 打招呼 / 抒发情绪（无工具）',
    tools: [],
  },
  parent_report: {
    label: '家长查看学习报告 / 学情 / 能力',
    tools: ['viewReport', 'viewAbilities', 'listChildren'],
  },
  parent_control: {
    label: '家长管控 / 学习设置',
    tools: ['getParentControl', 'updateParentControl', 'listChildren'],
  },
  open: {
    label: '复合 / 课程 / 视频 / 作业 / 兜底（不闸门）',
    tools: null,
  },
};

/**
 * Verbatim slot binding: which tool argument is filled from which captured slot.
 * Only the card-style tools bind a verbatim user substring; activity generation
 * keeps its structured args (topic/count/type) chosen by the model.
 */
export const INTENT_SLOT_BINDINGS: Record<string, { arg: string; slot: string }> = {
  playMusic: { arg: 'query', slot: 'song_title' },
  playStory: { arg: 'topic', slot: 'topic' },
  translate: { arg: 'text', slot: 'text' },
};

/** Tools allowed for an intent (null = ungated). */
export function intentTools(intent: IntentKind): string[] | null {
  return INTENT_CATALOG[intent].tools;
}