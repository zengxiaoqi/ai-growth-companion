import { PromptProviderService } from '../../src/agent-framework/prompts/prompt-provider.service';
import type { PromptContext, AgeGroup } from '../../src/agent-framework/core';

describe('PromptProviderService', () => {
  let service: PromptProviderService;

  beforeEach(() => {
    service = new PromptProviderService();
  });

  afterEach(() => jest.clearAllMocks());

  // ── Helpers ───────────────────────────────────────────────────────────

  const childCtx = (): PromptContext => ({
    ageGroup: '3-4' as AgeGroup,
    role: 'child',
    childName: '小明',
    availableTools: [],
  });

  const parentCtx = (): PromptContext => ({
    ageGroup: '5-6' as AgeGroup,
    role: 'parent',
    parentName: '妈妈',
    availableTools: [],
  });

  // ── Base only (no runtime, no tools) ─────────────────────────────────

  it('should return just the base prompt when no runtime context or tools', () => {
    service.registerTemplate('3-4', 'child', 'BASE_TEMPLATE');
    const ctx = childCtx();
    const result = service.getSystemPrompt(ctx);

    expect(result.startsWith('BASE_TEMPLATE')).toBe(true);
    // No extra '\n\n' separators since there's only one section
    expect(result.split('\n\n').length).toBe(1);
  });

  // ── Base + runtime section ───────────────────────────────────────────

  it('should include runtime section when runtimeContext has values', () => {
    service.registerTemplate('3-4', 'child', 'BASE');
    const ctx: PromptContext = {
      ...childCtx(),
      runtimeContext: { childId: 42, sessionId: 's1' },
    };
    const result = service.getSystemPrompt(ctx);

    expect(result.startsWith('BASE')).toBe(true);
    expect(result).toContain('## 运行时上下文');
    expect(result).toContain('- childId: 42');
    expect(result).toContain('- sessionId: s1');
  });

  it('should filter out null / undefined values from runtimeContext', () => {
    service.registerTemplate('3-4', 'child', 'BASE');
    const ctx: PromptContext = {
      ...childCtx(),
      runtimeContext: {
        valid: true,
        nullVal: null as unknown as string,
        undef: undefined as unknown as string,
      },
    };
    const result = service.getSystemPrompt(ctx);

    expect(result).toContain('- valid: true');
    expect(result).not.toContain('nullVal');
    expect(result).not.toContain('undef');
  });

  it('should omit runtime section entirely when runtimeContext has zero valid entries', () => {
    service.registerTemplate('3-4', 'child', 'BASE');
    const ctx: PromptContext = {
      ...childCtx(),
      runtimeContext: { bad: null as unknown as string, alsoBad: undefined as unknown as string },
    };
    const result = service.getSystemPrompt(ctx);

    expect(result.startsWith('BASE')).toBe(true);
    expect(result).not.toContain('## 运行时上下文');
    // Should NOT contain a double-newline separator either
    expect(result.split('\n\n').length).toBe(1);
  });

  it('should omit runtime section when runtimeContext is empty object', () => {
    service.registerTemplate('3-4', 'child', 'BASE');
    const result = service.getSystemPrompt({ ...childCtx(), runtimeContext: {} });
    expect(result).not.toContain('## 运行时上下文');
  });

  it('should omit runtime section when runtimeContext is undefined', () => {
    service.registerTemplate('3-4', 'child', 'BASE');
    const result = service.getSystemPrompt(childCtx());
    expect(result).not.toContain('## 运行时上下文');
  });

  // ── Base + tools section ─────────────────────────────────────────────

  it('should include tool section when availableTools has entries', () => {
    service.registerTemplate('3-4', 'child', 'BASE');
    const ctx: PromptContext = { ...childCtx(), availableTools: ['draw_picture', 'play_music'] };
    const result = service.getSystemPrompt(ctx);

    expect(result).toContain('## 当前可用工具');
    expect(result).toContain('- draw_picture');
    expect(result).toContain('- play_music');
  });

  it('should omit tool section when availableTools is empty', () => {
    service.registerTemplate('3-4', 'child', 'BASE');
    const ctx: PromptContext = { ...childCtx(), availableTools: [] };
    const result = service.getSystemPrompt(ctx);

    expect(result).not.toContain('## 当前可用工具');
  });

  // ── All three sections joined with \\n\\n ────────────────────────────

  it('should join base, runtime and tool sections with \\\\n\\\\n in correct order', () => {
    service.registerTemplate('3-4', 'child', 'THE_BASE');
    const ctx: PromptContext = {
      ...childCtx(),
      runtimeContext: { step: 1 },
      availableTools: ['tool_a'],
    };
    const result = service.getSystemPrompt(ctx);

    // Three sections, so exactly two '\n\n' separators
    const parts = result.split('\n\n');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('THE_BASE');
    expect(parts[1]).toContain('## 运行时上下文');
    expect(parts[2]).toContain('## 当前可用工具');
  });

  // ── registerTemplate overrides built-in ──────────────────────────────

  it('should allow registerTemplate to override built-in selectPrompt fallback', () => {
    service.registerTemplate('5-6', 'child', 'OVERRIDE_HERE');
    const ctx: PromptContext = {
      ageGroup: '5-6',
      role: 'child',
      childName: '小红',
      availableTools: [],
    };
    const result = service.getSystemPrompt(ctx);
    expect(result).toBe('OVERRIDE_HERE');
  });

  // ── Different ageGroup keys don't collide ────────────────────────────

  it('should not collide between different ageGroup:role keys', () => {
    service.registerTemplate('3-4', 'child', 'PROMPT_A');
    service.registerTemplate('5-6', 'child', 'PROMPT_B');

    const r1 = service.getSystemPrompt({
      ageGroup: '3-4',
      role: 'child',
      childName: 'A',
      availableTools: [],
    });
    const r2 = service.getSystemPrompt({
      ageGroup: '5-6',
      role: 'child',
      childName: 'B',
      availableTools: [],
    });

    expect(r1).toBe('PROMPT_A');
    expect(r2).toBe('PROMPT_B');
  });

  // ── Parent role fallback names ───────────────────────────────────────

  it('should use parentName or fallback "家长" for parent role', () => {
    // Register nothing — force built-in path. Built-in templates embed the name.
    const named = parentCtx();
    named.parentName = '王爸爸';
    const withName = service.getSystemPrompt(named);
    const withoutName = service.getSystemPrompt({
      ageGroup: '3-4',
      role: 'parent',
      availableTools: [],
    });

    // Both should be non-empty strings containing the respective name/fallback
    expect(withName).toContain('王爸爸');
    expect(withoutName).toContain('家长');
  });

  // ── buildToolInstructions standalone ─────────────────────────────────

  it('buildToolInstructions should return empty string when tools is empty', () => {
    const result = service.buildToolInstructions([]);
    expect(result).toBe('');
  });

  it('buildToolInstructions should format single and multiple tools correctly', () => {
    expect(service.buildToolInstructions(['read'])).toBe('## 当前可用工具\n- read');
    expect(service.buildToolInstructions(['a', 'b', 'c'])).toBe('## 当前可用工具\n- a\n- b\n- c');
  });
});
