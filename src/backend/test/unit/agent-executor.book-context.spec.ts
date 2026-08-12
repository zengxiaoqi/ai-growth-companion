import { AgentExecutor } from '../../src/modules/ai/agent/agent-executor';
import type { AgeGroup } from '../../src/modules/ai/ai.types';

/**
 * Unit tests for bookId/bookTitle context injection into system prompts.
 *
 * Verifies:
 * 1. buildSystemPrompt includes book context when bookId + bookTitle provided
 * 2. buildSystemPrompt includes bookId-only context when bookTitle is null
 * 3. buildSystemPrompt does NOT include book context when neither is provided
 * 4. Book context is appended for all age groups (parent, 3-4, 5-6)
 */
describe('AgentExecutor bookId/bookTitle context', () => {
  let executor: AgentExecutor;

  beforeEach(() => {
    // buildSystemPrompt only uses childName and age group prompts — no LLM deps needed
    executor = new AgentExecutor(null as any, null as any, null as any, null as any);
  });

  // ─── bookId + bookTitle present ──────────────────────────────────
  describe('buildSystemPrompt with bookId + bookTitle', () => {
    it('includes "当前知识书上下文" section', () => {
      const prompt = executor.buildSystemPrompt(
        '5-6' as AgeGroup,
        '小明',
        { childId: 2 },
        5,
        '小王子',
      );

      expect(prompt).toContain('当前知识书上下文');
    });

    it('contains the book title "小王子"', () => {
      const prompt = executor.buildSystemPrompt(
        '5-6' as AgeGroup,
        '小明',
        { childId: 2 },
        5,
        '小王子',
      );

      expect(prompt).toContain('小王子');
    });

    it('contains "bookId: 5"', () => {
      const prompt = executor.buildSystemPrompt(
        '5-6' as AgeGroup,
        '小明',
        { childId: 2 },
        5,
        '小王子',
      );

      expect(prompt).toContain('bookId: 5');
    });
  });

  // ─── bookId present, bookTitle null ──────────────────────────────
  describe('buildSystemPrompt with bookId only', () => {
    it('includes "当前知识书上下文" section', () => {
      const prompt = executor.buildSystemPrompt(
        '3-4' as AgeGroup,
        '小红',
        { childId: 3 },
        5,
        undefined,
      );

      expect(prompt).toContain('当前知识书上下文');
    });

    it('does NOT contain the word "小王子"', () => {
      const prompt = executor.buildSystemPrompt(
        '3-4' as AgeGroup,
        '小红',
        { childId: 3 },
        5,
        undefined,
      );

      expect(prompt).not.toContain('小王子');
    });

    it('still contains "bookId: 5"', () => {
      const prompt = executor.buildSystemPrompt(
        '3-4' as AgeGroup,
        '小红',
        { childId: 3 },
        5,
        undefined,
      );

      expect(prompt).toContain('bookId: 5');
    });
  });

  // ─── no book context at all ──────────────────────────────────────
  describe('buildSystemPrompt without book context', () => {
    it('does NOT contain "当前知识书上下文" when bookId=null and bookTitle=null', () => {
      const prompt = executor.buildSystemPrompt(
        '5-6' as AgeGroup,
        '小明',
        { childId: 2 },
        undefined,
        undefined,
      );

      expect(prompt).not.toContain('当前知识书上下文');
    });

    it('does NOT contain "当前知识书上下文" when both args are omitted', () => {
      const prompt = executor.buildSystemPrompt('5-6' as AgeGroup, '小明', { childId: 2 });

      expect(prompt).not.toContain('当前知识书上下文');
    });

    it('does NOT contain "queryBookSkill" hint when no book context', () => {
      const prompt = executor.buildSystemPrompt(
        '5-6' as AgeGroup,
        '小明',
        { childId: 2 },
        undefined,
        undefined,
      );

      expect(prompt).not.toContain('queryBookSkill');
    });
  });

  // ─── age group coverage ──────────────────────────────────────────
  describe('book context across all age groups', () => {
    const ageGroups: Array<{ name: string | AgeGroup; label: string }> = [
      { name: 'parent', label: 'parent' },
      { name: '3-4', label: '3-4' },
      { name: '5-6', label: '5-6' },
    ];

    ageGroups.forEach(({ name, label }) => {
      it(`appends book context for ${label} age group`, () => {
        const prompt = executor.buildSystemPrompt(
          name as AgeGroup | 'parent',
          '小明',
          { childId: 2 },
          10,
          '西游记',
        );

        expect(prompt).toContain('当前知识书上下文');
        expect(prompt).toContain('西游记');
        expect(prompt).toContain('bookId: 10');
      });
    });

    it('still appends book context for unknown age group (default to 5-6)', () => {
      const prompt = executor.buildSystemPrompt(
        'unknown' as AgeGroup,
        '小明',
        { childId: 2 },
        7,
        '三国演义',
      );

      expect(prompt).toContain('当前知识书上下文');
      expect(prompt).toContain('三国演义');
    });
  });

  // ─── pass-through in execute() / executeStream() ─────────────────
  describe('execute() passes bookId/bookTitle to buildSystemPrompt', () => {
    it('calls buildSystemPrompt with bookId and bookTitle args', async () => {
      const llmClient = {
        chatCompletion: jest.fn().mockResolvedValue({ content: 'ok', toolCalls: undefined }),
      };
      const toolRegistry = {
        getToolDefinitions: jest.fn().mockReturnValue([]),
        execute: jest.fn(),
      };
      const conversationManager = {
        addMessage: jest.fn().mockResolvedValue(undefined),
        buildMessageArray: jest.fn().mockResolvedValue([]),
      };
      const safety = {
        filterContent: jest.fn().mockReturnValue({ content: 'ok', wasFiltered: false }),
      };
      const exec = new AgentExecutor(
        llmClient as any,
        toolRegistry as any,
        conversationManager as any,
        safety as any,
      );

      const spyBuildSystemPrompt = jest.spyOn(exec, 'buildSystemPrompt');

      await exec.execute(
        'sess-1',
        '问个书里的问题',
        '5-6' as AgeGroup,
        '小明',
        { childId: 2 },
        123,
        '安徒生童话',
      );

      expect(spyBuildSystemPrompt).toHaveBeenCalledWith(
        '5-6',
        '小明',
        { childId: 2 },
        123,
        '安徒生童话',
      );
    });
  });

  describe('executeStream() passes bookId/bookTitle to buildSystemPrompt', () => {
    it('calls buildSystemPrompt with bookId and bookTitle args', async () => {
      const llmClient = {
        chatCompletion: jest.fn().mockResolvedValue({ content: '你好呀！', toolCalls: undefined }),
      };
      const toolRegistry = {
        getToolDefinitions: jest.fn().mockReturnValue([]),
        execute: jest.fn(),
      };
      const conversationManager = {
        addMessage: jest.fn().mockResolvedValue(undefined),
        buildMessageArray: jest.fn().mockResolvedValue([]),
      };
      const safety = {
        filterContent: jest.fn().mockReturnValue({ content: '你好呀！', wasFiltered: false }),
      };
      const exec = new AgentExecutor(
        llmClient as any,
        toolRegistry as any,
        conversationManager as any,
        safety as any,
      );

      const spyBuildSystemPrompt = jest.spyOn(exec, 'buildSystemPrompt');

      const events: any[] = [];
      for await (const event of exec.executeStream(
        'sess-2',
        '读了这本书的哪一章？',
        '3-4' as AgeGroup,
        '小红',
        { childId: 5 },
        99,
        '小猪佩奇',
      )) {
        events.push(event);
      }

      expect(spyBuildSystemPrompt).toHaveBeenCalledWith(
        '3-4',
        '小红',
        { childId: 5 },
        99,
        '小猪佩奇',
      );
      // Should have collected a 'done' event
      expect(events.some((e) => e.type === 'done')).toBe(true);
    });
  });
});
