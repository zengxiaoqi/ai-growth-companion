import {
  stripThinking,
  extractThinking,
  hasThinkingBlock,
} from '../../src/agent-framework/core/utils/thinking-parser';

/**
 * Unit tests for thinking-parser.ts — pure-function utility
 * that strips, extracts, and detects <think> reasoning blocks
 * produced by various LLM providers.
 */
describe('stripThinking', () => {
  it('removes standard <think>...</think> block and trims', () => {
    const input = '<think>Let me think about this.</think>The answer is 42.';
    expect(stripThinking(input)).toBe('The answer is 42.');
  });

  it('handles empty string input', () => {
    expect(stripThinking('')).toBe('');
  });

  it('handles null-like falsy values', () => {
    expect(stripThinking(null as any)).toBe('');
    expect(stripThinking(undefined as any)).toBe('');
  });

  it('handles no think block at all', () => {
    expect(stripThinking('hello world')).toBe('hello world');
  });

  it('handles MiniMax-style thinking block with newlines', () => {
    const input = `<think\nlet me reason through this step by step\n\nthis is important\n</think->\n\nThe final answer is 42.`;
    const result = stripThinking(input);
    // Should contain the answer but not the reasoning
    expect(result).not.toContain('step by step');
    expect(result).toContain('42');
  });

  it('handles unopened/closed think block', () => {
    const input = '<think some attr="value">reasoning here</think>\nAnswer!';
    expect(stripThinking(input)).toBe('Answer!');
  });

  it('trims extra whitespace left after stripping', () => {
    const input = '\n\n<think>reasoning</think>   \n\n  ';
    expect(stripThinking(input)).toBe('');
  });
});

describe('extractThinking', () => {
  it('extracts reasoning from standard block', () => {
    const input = '<think>Let me think about this problem.</think>The answer is 42.';
    expect(extractThinking(input)).toBe('Let me think about this problem.');
  });

  it('extracts reasoning from MiniMax-style block', () => {
    const input = `<think\nstep 1: read the question\nstep 2: compute the answer\n</think->\nThe answer is 42.`;
    expect(extractThinking(input)).toBe('step 1: read the question\nstep 2: compute the answer');
  });

  it('extracts reasoning from unclosed think block', () => {
    const input = 'Some intro\n<think\nHere is my reasoning\nand more reasoning';
    expect(extractThinking(input)).toBe('Here is my reasoning\nand more reasoning');
  });

  it('returns empty string when no think block exists', () => {
    expect(extractThinking('just plain text')).toBe('');
  });

  it('returns empty string for empty/undefined input', () => {
    expect(extractThinking('')).toBe('');
    expect(extractThinking(undefined as any)).toBe('');
  });

  it('trims leading/trailing whitespace from extracted reasoning', () => {
    const input = '<think>\n\n  lots of whitespace  \n\n</think>answer';
    expect(extractThinking(input)).toBe('lots of whitespace');
  });
});

describe('hasThinkingBlock', () => {
  it('returns true for standard think block', () => {
    expect(hasThinkingBlock('<think>reasoning</think>answer')).toBe(true);
  });

  it('returns true for unclosed think', () => {
    expect(hasThinkingBlock('<think\nsome reasoning')).toBe(true);
  });

  it('returns false when no think block exists', () => {
    expect(hasThinkingBlock('just regular text')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasThinkingBlock('')).toBe(false);
  });

  it('is case-sensitive for <think keyword', () => {
    // Only <think with lowercase t should match per the source regex /<think\\b/
    expect(hasThinkingBlock('<THINK>reasoning</THINK>')).toBe(false);
  });
});
