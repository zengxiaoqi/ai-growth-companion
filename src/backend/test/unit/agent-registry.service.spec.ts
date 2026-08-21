/**
 * AgentRegistryService unit tests — pure in-memory, no NestJS injection.
 */

import { AgentRegistryService } from '../../src/agent-framework/agents/agent-registry.service';
import type { IAgent, AgentDefinition, AgentContext } from '../../src/agent-framework/core';

/* ── helpers ─────────────────────────────────────────────────────────── */

function makeFactory(definition: AgentDefinition): () => IAgent {
  return (() => ({
    definition,
    execute: jest.fn().mockResolvedValue({ response: 'ok', toolCalls: [] }),
  })) as any;
}

function makeDefinition(overrides: Partial<AgentDefinition>): AgentDefinition {
  return {
    type: overrides.type || 'default',
    name: overrides.name || 'Default',
    description: overrides.description || 'A default agent.',
    keywords: overrides.keywords,
    buildSystemPrompt: () => '',
    maxIterations: 10,
    canSpawnSubAgents: false,
    maxSubAgentDepth: 0,
    ...overrides,
  };
}

function makeContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    ageGroup: '5-6' as any,
    childName: 'Test Child',
    conversationId: 'conv-1',
    messages: [],
    depth: 0,
    metadata: {},
    ...overrides,
  };
}

/* ── describe blocks ─────────────────────────────────────────────────── */

describe('AgentRegistryService', () => {
  let registry: AgentRegistryService;

  beforeEach(() => {
    registry = new AgentRegistryService();
  });

  /* ── register / get / getAll ──────────────────────────────────────── */

  describe('register(), get(), getAll()', () => {
    it('registers an agent and returns it via get(type)', () => {
      const def = makeDefinition({ type: 'parent-advisor', name: 'Parent Advisor' });
      const factory = makeFactory(def);
      registry.register(def, factory);

      const agent = registry.get('parent-advisor');
      expect(agent).toBeDefined();
      expect(agent!.definition.name).toBe('Parent Advisor');
    });

    it('get returns undefined for unregistered type', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('getAll lists all registered agents', () => {
      const def1 = makeDefinition({ type: 'child-companion', name: 'Child Companion' });
      const def2 = makeDefinition({ type: 'parent-advisor', name: 'Parent Advisor' });
      registry.register(def1, makeFactory(def1));
      registry.register(def2, makeFactory(def2));

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      const types = all.map((a) => a.definition.type);
      expect(types).toContain('child-companion');
      expect(types).toContain('parent-advisor');
    });
  });

  /* ── select() with context.ageGroup === 'parent' ─────────────────── */

  describe('select() — parent routing', () => {
    it("routes to parent-advisor when context.ageGroup is 'parent'", () => {
      const childDef = makeDefinition({ type: 'child-companion', name: 'Child' });
      const advisorDef = makeDefinition({ type: 'parent-advisor', name: 'Advisor' });
      registry.register(childDef, makeFactory(childDef));
      registry.register(advisorDef, makeFactory(advisorDef));

      const ctx = makeContext({ ageGroup: 'parent' });
      const agent = registry.select('any input', ctx);

      expect(agent!.definition.type).toBe('parent-advisor');
    });
  });

  /* ── keyword routing ──────────────────────────────────────────────── */

  describe('select() — keyword routing', () => {
    it('selects agent whose keywords match the input', () => {
      // Register a generic one first (lower score)
      registry.register(
        makeDefinition({ type: 'generic-agent', name: 'Generic', keywords: ['help'] }),
        makeFactory(makeDefinition({ type: 'generic-agent', name: 'Generic' })),
      );
      // Then the high-score one
      registry.register(
        makeDefinition({ type: 'course-specialist', name: 'Course Spec', keywords: ['课程'] }),
        makeFactory(makeDefinition({ type: 'course-specialist', name: 'Course Spec' })),
      );

      const ctx = makeContext();
      const agent = registry.select('我需要一些课程指导', ctx);

      expect(agent!.definition.type).toBe('course-specialist');
    });

    it('selects agent by Chinese keyword', () => {
      registry.register(
        makeDefinition({ type: 'chinese-keyword', name: 'Chinese Key', keywords: ['游戏'] }),
        makeFactory(makeDefinition({ type: 'chinese-keyword', name: 'Chinese Key' })),
      );

      const ctx = makeContext();
      const agent = registry.select('帮我设计一个游戏', ctx);

      expect(agent!.definition.type).toBe('chinese-keyword');
    });
  });

  /* ── boost tests — course-designer ────────────────────────────────── */

  describe('boost — course-designer', () => {
    it("selects course-designer when input mentions '课程包'", () => {
      // Register agents with different scores so we can verify boost works
      registry.register(
        makeDefinition({ type: 'generic', name: 'Generic', keywords: ['东西'] }),
        makeFactory(makeDefinition({ type: 'generic', name: 'Generic' })),
      );
      registry.register(
        makeDefinition({ type: 'course-designer', name: 'Course Designer', keywords: ['课程'] }),
        makeFactory(
          makeDefinition({ type: 'course-designer', name: 'Course Designer', keywords: ['课程'] }),
        ),
      );

      const ctx = makeContext();
      const agent = registry.select('帮我生成课程包', ctx);

      expect(agent!.definition.type).toBe('course-designer');
    });
  });

  /* ── boost tests — activity-generator ─────────────────────────────── */

  describe('boost — activity-generator', () => {
    it("selects activity-generator when input mentions '活动'", () => {
      registry.register(
        makeDefinition({ type: 'activity-generator', name: 'Activity Gen', keywords: ['活动'] }),
        makeFactory(makeDefinition({ type: 'activity-generator', name: 'Activity Gen' })),
      );
      registry.register(
        makeDefinition({ type: 'generic', name: 'Generic' }),
        makeFactory(makeDefinition({ type: 'generic', name: 'Generic' })),
      );

      const ctx = makeContext();
      const agent = registry.select('生成一个游戏活动', ctx);

      expect(agent!.definition.type).toBe('activity-generator');
    });
  });

  /* ── boost tests — video-generator ────────────────────────────────── */

  describe('boost — video-generator', () => {
    it("selects video-generator when input mentions '视频'", () => {
      registry.register(
        makeDefinition({ type: 'video-generator', name: 'Video Gen', keywords: ['视频'] }),
        makeFactory(makeDefinition({ type: 'video-generator', name: 'Video Gen' })),
      );
      registry.register(
        makeDefinition({ type: 'generic', name: 'Generic' }),
        makeFactory(makeDefinition({ type: 'generic', name: 'Generic' })),
      );

      const ctx = makeContext();
      const agent = registry.select('生成视频', ctx);

      expect(agent!.definition.type).toBe('video-generator');
    });
  });

  /* ── fallback behavior ────────────────────────────────────────────── */

  describe('fallback behavior', () => {
    it('falls back to child-companion when no other agent matches', () => {
      registry.register(
        makeDefinition({ type: 'child-companion', name: 'Child' }),
        makeFactory(makeDefinition({ type: 'child-companion', name: 'Child' })),
      );
      registry.register(
        makeDefinition({ type: 'other', name: 'Other' }),
        makeFactory(makeDefinition({ type: 'other', name: 'Other' })),
      );

      const ctx = makeContext();
      const agent = registry.select('something unrelated xyz999', ctx);

      expect(agent!.definition.type).toBe('child-companion');
    });

    it('throws when no agents are registered at all', () => {
      const ctx = makeContext();
      expect(() => registry.select('anything', ctx)).toThrow(
        'No agents registered in the agent registry',
      );
    });
  });
});
