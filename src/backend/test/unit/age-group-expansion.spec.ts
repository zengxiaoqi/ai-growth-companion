/**
 * Regression coverage for the 3-12 age expansion.
 *
 * The product used to talk to a 9-year-old with the 5-6 preschool prompt.
 * These tests pin the whole chain: numeric age -> group -> real group
 * survives AiService -> both prompt selectors -> content bucket mapping.
 * Preschool behaviour is asserted too, so the expansion cannot silently
 * change the 3-4 / 5-6 experience.
 */

import {
  ALL_AGE_GROUPS,
  CONTENT_AGE_GROUPS,
  SCHOOL_AGE_GROUPS,
  classifyAge,
  normalizeAgeGroup,
  contentAgeGroup,
  difficultyForAge,
  ageGroupLabel,
} from '../../src/agent-framework/core/types/age-group';
import { selectPrompt } from '../../src/agent-framework/prompts/age-adaptive';
import { childCompanionDefinition } from '../../src/agent-framework/agents/definitions/child-companion.agent';
import { AgentExecutor } from '../../src/modules/ai/agent/agent-executor';
import { AgentExecutorService } from '../../src/agent-framework/agents/agent-executor.service';
import { BaseAgent } from '../../src/agent-framework/agents/base-agent';
import { comfortLine } from '../../src/modules/safety/safety.service';

describe('classifyAge', () => {
  it.each([
    [2, '3-4'],
    [3, '3-4'],
    [4, '3-4'],
    [5, '5-6'],
    [6, '5-6'],
    [7, '7-9'],
    [9, '7-9'],
    [10, '10-12'],
    [12, '10-12'],
    [15, '10-12'],
  ] as const)('maps age %i to %s', (age, expected) => {
    expect(classifyAge(age)).toBe(expected);
  });

  it('keeps the historical default when age is missing or invalid', () => {
    expect(classifyAge(null)).toBe('5-6');
    expect(classifyAge(undefined)).toBe('5-6');
    expect(classifyAge(Number.NaN)).toBe('5-6');
  });

  it('exposes four real groups but only two content buckets', () => {
    expect(ALL_AGE_GROUPS).toEqual(['3-4', '5-6', '7-9', '10-12']);
    expect(SCHOOL_AGE_GROUPS).toEqual(['7-9', '10-12']);
    expect(CONTENT_AGE_GROUPS).toEqual(['3-4', '5-6']);
  });
});

describe('content compatibility mapping', () => {
  it('maps school-age groups onto the 5-6 content bucket', () => {
    expect(contentAgeGroup('3-4')).toBe('3-4');
    expect(contentAgeGroup('5-6')).toBe('5-6');
    expect(contentAgeGroup('7-9')).toBe('5-6');
    expect(contentAgeGroup('10-12')).toBe('5-6');
    expect(contentAgeGroup('parent')).toBe('5-6');
  });

  it('normalises every real group and rejects unknown values', () => {
    for (const group of ALL_AGE_GROUPS) {
      expect(normalizeAgeGroup(group)).toBe(group);
    }
    expect(normalizeAgeGroup('7-9')).toBe('7-9');
    expect(normalizeAgeGroup('unknown')).toBe('5-6');
    expect(normalizeAgeGroup(undefined)).toBe('5-6');
    expect(normalizeAgeGroup(9)).toBe('5-6');
  });

  it('scales difficulty and labels with the real group', () => {
    expect(ALL_AGE_GROUPS.map(difficultyForAge)).toEqual([1, 2, 3, 4]);
    expect(ALL_AGE_GROUPS.map(ageGroupLabel)).toEqual(['3-4岁', '5-6岁', '7-9岁', '10-12岁']);
  });
});

describe('framework prompt selector', () => {
  it.each(['7-9', '10-12'] as const)('uses a school-age style for %s', (group) => {
    const prompt = selectPrompt(group, 'child', '小明');
    expect(prompt).toContain(`和一个${group}岁的孩子小明聊天`);
    expect(prompt).toMatch(/叠词/);
    expect(prompt).not.toContain('和一个3-4岁的孩子');
    expect(prompt).not.toContain('和一个5-6岁的孩子');
  });

  it('leaves the preschool prompts untouched', () => {
    expect(selectPrompt('3-4', 'child', '小明')).toContain('和一个3-4岁的孩子');
    expect(selectPrompt('5-6', 'child', '小明')).toContain('和一个5-6岁的孩子');
    expect(selectPrompt('7-9', 'parent', '家长')).toContain('家长');
  });
});

describe('child companion agent definition (the orchestrator path)', () => {
  function promptFor(group: '3-4' | '5-6' | '7-9' | '10-12') {
    return childCompanionDefinition.buildSystemPrompt({
      ageGroup: group,
      childName: '小明',
      childId: 42,
      parentId: 7,
      conversationId: 'session-1',
      messages: [],
      depth: 0,
      metadata: {},
    });
  }

  it.each(['7-9', '10-12'] as const)(
    'routes %s through the school-age template, not the 5-6 fallback',
    (group) => {
      const prompt = promptFor(group);
      expect(prompt).toContain(`和一个${group}岁的孩子小明聊天`);
      expect(prompt).not.toContain('和一个5-6岁的孩子');
      // Runtime context hints must survive the new branch.
      expect(prompt).toContain('Current childId: 42');
    },
  );

  it('keeps 3-4 and 5-6 on their original templates', () => {
    expect(promptFor('3-4')).toContain('和一个3-4岁的孩子');
    expect(promptFor('5-6')).toContain('和一个5-6岁的孩子');
  });
});

describe('legacy agent executor prompt selector', () => {
  const executor = Object.create(AgentExecutor.prototype) as AgentExecutor;

  it.each(['7-9', '10-12'] as const)('selects the school-age prompt for %s', (group) => {
    const prompt = executor.buildSystemPrompt(group, '小明');
    expect(prompt).toContain(`和一个${group}岁的孩子小明聊天`);
    expect(prompt).toContain('## Runtime Context');
  });

  it('still falls back to 5-6 only for the unknown sentinel', () => {
    expect(executor.buildSystemPrompt('unknown', '小明')).toContain('和一个5-6岁的孩子');
    expect(executor.buildSystemPrompt('3-4', '小明')).toContain('和一个3-4岁的孩子');
  });
});

describe('tool argument normalisation (both framework execution paths)', () => {
  const tool = {
    metadata: { requiresAgeGroup: true, requiresChildId: false, requiresParentId: false },
  };
  const registry = { get: jest.fn(() => tool) };
  const context = (group: string) => ({
    ageGroup: group,
    childId: 1,
    parentId: 2,
    conversationId: 'session-1',
    messages: [],
    depth: 0,
    metadata: {},
  });

  it.each(['7-9', '10-12'])('AgentExecutorService maps %s onto a real content bucket', (group) => {
    const executor = new AgentExecutorService(registry as any, {} as any);
    const normalized = (executor as any).normalizeToolArgs('generateQuiz', {}, context(group));
    expect(normalized.ageGroup).toBe('5-6');
  });

  it.each(['3-4', '5-6', '7-9', '10-12'])(
    'BaseAgent maps %s onto a supported content bucket',
    (group) => {
      const normalize = (BaseAgent.prototype as any).normalizeToolArgs.bind({
        toolRegistry: registry,
      });
      const normalized = normalize('generateQuiz', {}, context(group));
      expect(['3-4', '5-6']).toContain(normalized.ageGroup);
      expect(normalized.ageGroup).toBe(contentAgeGroup(group));
    },
  );

  it('does not inject an age group for a parent conversation', () => {
    const normalize = (BaseAgent.prototype as any).normalizeToolArgs.bind({
      toolRegistry: registry,
    });
    expect(normalize('generateQuiz', {}, context('parent')).ageGroup).toBeUndefined();
  });

  it('overrides a model-supplied school-age bucket', () => {
    const normalize = (BaseAgent.prototype as any).normalizeToolArgs.bind({
      toolRegistry: registry,
    });
    const normalized = normalize('generateQuiz', { ageGroup: '7-9' }, context('10-12'));
    expect(normalized.ageGroup).toBe('5-6');
  });
});

describe('safety comfort lines', () => {
  it('does not talk to older children with the preschool wording', () => {
    expect(comfortLine('7-9')).toContain('老师');
    expect(comfortLine('10-12')).toContain('大人');
    expect(comfortLine('3-4')).toContain('陪着你');
    expect(comfortLine('5-6')).toContain('别怕');
    expect(comfortLine('unknown')).toBe(comfortLine(undefined));
  });
});
