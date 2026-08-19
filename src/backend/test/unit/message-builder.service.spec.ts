import {
  MessageBuilderService,
  FlatMessageRecord,
} from '../../src/agent-framework/conversation/message-builder.service';

// ── Helper to build flat messages easily ────────────────────────────────

// Build helper — no TypeScript argument conflicts; all calls go through spread
const msg = (role: string, content: string, ...rest: unknown[]): FlatMessageRecord => ({
  role,
  content: content ?? '',
  toolCalls: Array.isArray(rest[0]) ? rest[0] : undefined,
  toolCallId:
    typeof rest[0] === 'string' ? rest[0] : typeof rest[1] === 'string' ? rest[1] : undefined,
});

describe('MessageBuilderService', () => {
  let service: MessageBuilderService;

  beforeEach(() => {
    service = new MessageBuilderService();
  });

  // ── Empty / basic ─────────────────────────────────────────────────────

  it('should return empty array for empty input', () => {
    const result = service.buildMessageArray([]);
    expect(result).toEqual([]);
  });

  it('should keep all messages when count is under default maxMessages (20)', () => {
    const m = Array.from({ length: 5 }, (_, i) => msg('user', `msg ${i}`));
    const result = service.buildMessageArray(m);
    expect(result).toHaveLength(5);
    result.forEach((r, i) => expect(r.content).toBe(`msg ${i}`));
  });

  // ── Pass-through: system, user, simple assistant ──────────────────────

  it('should pass through system messages atomically', () => {
    const input = [msg('system', 'You are helpful.')];
    const result = service.buildMessageArray(input);
    expect(result).toEqual([{ role: 'system', content: 'You are helpful.' }]);
  });

  it('should pass through user messages atomically', () => {
    const input = [msg('user', 'Hello')];
    const result = service.buildMessageArray(input);
    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('should pass through assistant messages without toolCalls', () => {
    const input = [msg('assistant', 'I am here')];
    const result = service.buildMessageArray(input);
    expect(result).toEqual([{ role: 'assistant', content: 'I am here' }]);
  });

  it('should treat assistant with empty toolCalls array as normal assistant', () => {
    const input = [msg('assistant', 'hello', [])];
    const result = service.buildMessageArray(input);
    expect(result).toEqual([{ role: 'assistant', content: 'hello' }]);
  });

  // ── Assistant with tool_calls + matching tool results ─────────────────

  it('should group assistant(tool_calls) with matching tool result into one block', () => {
    const callId = 'call_abc';
    const input: FlatMessageRecord[] = [
      msg('assistant', 'Calling tool.', [
        { id: callId, function: { name: 'get_weather' }, index: 0 },
      ]),
      msg('tool', 'Sunny today.', callId),
    ];
    const result = service.buildMessageArray(input);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('assistant');
    expect((result[0] as any).tool_calls).toHaveLength(1);
    expect((result[0] as any).tool_calls[0].id).toBe(callId);
    expect(result[1].role).toBe('tool');
    expect((result[1] as any).tool_call_id).toBe(callId);
  });

  it('should handle multiple tool calls in one assistant message with both matched', () => {
    const id1 = 'call_1';
    const id2 = 'call_2';
    const input: FlatMessageRecord[] = [
      msg('assistant', 'Two calls.', [
        { id: id1, function: { name: 'a' } },
        { id: id2, function: { name: 'b' } },
      ]),
      msg('tool', 'Result A.', id1),
      msg('tool', 'Result B.', id2),
    ];
    const result = service.buildMessageArray(input);
    expect(result).toHaveLength(3);
    expect(result[0].role).toBe('assistant');
    expect((result[0] as any).tool_calls).toHaveLength(2);
    expect(result[1].role).toBe('tool');
    expect((result[1] as any).tool_call_id).toBe(id1);
    expect(result[2].role).toBe('tool');
    expect((result[2] as any).tool_call_id).toBe(id2);
  });

  // ── Incomplete tool block → dropped ───────────────────────────────────

  it('should drop an assistant(block) whose pending tool ids are never matched', () => {
    const input: FlatMessageRecord[] = [
      msg('assistant', 'Tool!', [{ id: 'call_x', function: { name: 'foo' } }]),
    ];
    const result = service.buildMessageArray(input);
    expect(result).toHaveLength(0);
  });

  // ── Dangling tool message → dropped silently ──────────────────────────

  it('should drop a tool message with no preceding assistant(tool_calls)', () => {
    const input: FlatMessageRecord[] = [
      msg('user', 'Hi'),
      msg('tool', 'orphan result.', 'orphan_id'),
      msg('assistant', 'Ok'),
    ];
    const result = service.buildMessageArray(input);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('assistant');
  });

  // ── Non-matching toolCallId skipped but matching found ────────────────

  it('should skip non-matching tool messages and find the matching one', () => {
    const id1 = 'call_ok';
    const input: FlatMessageRecord[] = [
      msg('assistant', 'Call.', [{ id: id1, function: { name: 'ok_tool' } }]),
      msg('tool', 'Nope.', 'fake_id'),
      msg('tool', 'Match.', id1),
    ];
    const result = service.buildMessageArray(input);
    expect(result).toHaveLength(2);
    expect(result[1].role).toBe('tool');
    expect((result[1] as any).tool_call_id).toBe(id1);
  });

  // ── Scan stops at non-tool role ──────────────────────────────────────

  it('should stop scanning tool messages when hitting a non-tool role (user between assistant-toolcalls and tool result)', () => {
    const input: FlatMessageRecord[] = [
      msg('assistant', 'Tool!', [{ id: 'call_x', function: { name: 't' } }]),
      msg('user', 'Interrupted!'),
      msg('tool', 'Result X.', 'call_x'),
    ];
    const result = service.buildMessageArray(input);
    // Incomplete tool block is dropped (scan stopped at 'user'), but the
    // interrupting user message is kept and the orphaned tool result is dropped.
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'user', content: 'Interrupted!' });
  });

  // ── Oversized single tail block still included ────────────────────────

  it('should include an oversized first block even if it alone exceeds maxMessages', () => {
    // One assistant message with 5 tool calls, each matched by a tool result → block of 6
    const toolCalls = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`,
      function: { name: 'x' },
    }));
    const input: FlatMessageRecord[] = [
      msg('assistant', 'Big block.', toolCalls),
      ...toolCalls.map((tc) => msg('tool', `result_${tc.id}`, tc.id)),
    ];
    // All 6 messages > maxMessages=2 → must still be included (never split a block)
    const result = service.buildMessageArray(input, 2);
    expect(result).toHaveLength(6);
  });

  // ── maxMessages truncation keeps tail blocks whole without splitting atomic ──

  it('should truncate oldest blocks while keeping the entire last atomic block together', () => {
    const callId = 'c1';
    const input: FlatMessageRecord[] = [
      msg('system', 'Sys'), // block size 1
      msg('user', 'U1'), // block size 1
      msg('user', 'U2'), // block size 1
      msg('assistant', 'Call.', [{ id: callId, function: { name: 't' } }]),
      msg('tool', 'Res.', callId), // block size 2 (atomic)
    ];
    const result = service.buildMessageArray(input, 3);
    // Starting from end: block(size2) selectedCount=2, then U2(1)→3, U1(1)→4 > 3 → stop
    // Result: [block(2), U1, U2] or actually [...U2, block(2)] in order
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('should respect explicit maxMessages cutoff keeping most recent messages', () => {
    const input: FlatMessageRecord[] = Array.from({ length: 8 }, (_, i) => msg('user', `m${i}`));
    const result = service.buildMessageArray(input, 4);
    // Only last 4 messages should remain
    expect(result).toHaveLength(4);
    expect(result[0].content).toBe('m4');
    expect(result[3].content).toBe('m7');
  });
});
