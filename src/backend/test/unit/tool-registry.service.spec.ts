import { TOOL_REGISTRY_METADATA } from '../../src/agent-framework/tools/decorators/register-tool';
import { ToolRegistryService } from '../../src/agent-framework/tools/tool-registry.service';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import type { ITool, ToolExecutionContext, ToolMetadata } from '../../src/agent-framework/core';

// ── Fake tool helper ───────────────────────────────────────────────────

class FakeTool {
  metadata: ToolMetadata = {
    name: 'fake_tool',
    description: 'A fake tool for testing',
    inputSchema: { type: 'object', properties: {} },
    concurrencySafe: true,
    readOnly: false,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  async execute(_args: any, _context: ToolExecutionContext) {
    return { success: true, data: { ok: 1 } };
  }
}
Reflect.defineMetadata(TOOL_REGISTRY_METADATA, true, FakeTool);

// ── Mock helpers ────────────────────────────────────────────────────────

function makeMockDiscovery(): any {
  return {
    getProviders: jest.fn().mockReturnValue([] as InstanceWrapper[]),
  };
}

function makeMockModuleRef(): any {
  return {
    get: jest.fn(),
  };
}

// ── Test suite ─────────────────────────────────────────────────────────

describe('ToolRegistryService', () => {
  let service: ToolRegistryService;
  let mockDiscovery: ReturnType<typeof makeMockDiscovery>;
  let mockModuleRef: ReturnType<typeof makeMockModuleRef>;

  beforeEach(() => {
    mockDiscovery = makeMockDiscovery();
    mockModuleRef = makeMockModuleRef();
    service = new ToolRegistryService(mockDiscovery as any, mockModuleRef as any);
  });

  afterEach(() => jest.clearAllMocks());

  // ── register / get / has / getAll ────────────────────────────────────

  it('register stores the tool and get returns it', () => {
    const tool = new FakeTool();
    service.register(tool);

    expect(service.get('fake_tool')).toBe(tool);
  });

  it('has returns true for registered tool', () => {
    service.register(new FakeTool());
    expect(service.has('fake_tool')).toBe(true);
    expect(service.has('nonexistent')).toBe(false);
  });

  it('getAll returns all registered tools', () => {
    const t1 = new FakeTool();
    Reflect.defineProperty(t1.metadata, 'name', { value: 'tool_a' });
    const t2 = new FakeTool();
    Reflect.defineProperty(t2.metadata, 'name', { value: 'tool_b' });
    service.register(t1);
    service.register(t2);

    const all = service.getAll();
    expect(all).toHaveLength(2);
  });

  // ── Duplicate overwrite with warn ────────────────────────────────────

  it('duplicate registration overwrites and logs a warning', () => {
    const original = new FakeTool();
    Reflect.defineProperty(original.metadata, 'name', { value: 'dup_tool' });
    const replacement = new FakeTool();
    Reflect.defineProperty(replacement.metadata, 'name', { value: 'dup_tool' });

    service.register(original);
    const spy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
    service.register(replacement);

    expect(service.get('dup_tool')).toBe(replacement);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('already registered'));
    spy.mockRestore();
  });

  // ── registerAll ──────────────────────────────────────────────────────

  it('registerAll registers multiple tools', () => {
    const t1 = new FakeTool();
    Reflect.defineProperty(t1.metadata, 'name', { value: 'all_1' });
    const t2 = new FakeTool();
    Reflect.defineProperty(t2.metadata, 'name', { value: 'all_2' });
    service.registerAll([t1, t2]);

    expect(service.has('all_1')).toBe(true);
    expect(service.has('all_2')).toBe(true);
  });

  // ── getToolDefinitions ───────────────────────────────────────────────

  it('getToolDefinitions returns definitions for all tools', () => {
    const tool = new FakeTool();
    service.register(tool);

    const defs = service.getToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0]).toEqual({
      type: 'function',
      function: {
        name: 'fake_tool',
        description: 'A fake tool for testing',
        parameters: { type: 'object', properties: {} },
      },
    });
  });

  it('getToolDefinitions filters correctly', () => {
    const t1 = new FakeTool();
    Reflect.defineProperty(t1.metadata, 'name', { value: 'keep' });
    const t2 = new FakeTool();
    Reflect.defineProperty(t2.metadata, 'name', { value: 'drop' });
    service.register(t1);
    service.register(t2);

    const defs = service.getToolDefinitions((t) => t.metadata.name === 'keep');
    expect(defs).toHaveLength(1);
    expect(defs[0].function.name).toBe('keep');
  });

  // ── execute ──────────────────────────────────────────────────────────

  it('execute unknown tool returns structured error', async () => {
    const result = await service.execute('unknown', {}, {} as ToolExecutionContext);
    expect(result).toEqual({ success: false, error: '未知工具: unknown' });
  });

  it('execute success returns tool result with args+context passed through', async () => {
    class PassthroughTool {
      metadata: ToolMetadata = {
        name: 'pass_through',
        description: 'pt',
        inputSchema: { type: 'object' },
        concurrencySafe: true,
        readOnly: false,
        requiresChildId: false,
        requiresParentId: false,
        requiresAgeGroup: false,
      };
      async execute(args: any, ctx: ToolExecutionContext) {
        return { success: true, data: { argsReceived: args, ctxReceived: ctx } };
      }
    }
    service.register(new PassthroughTool());

    const arg = { x: 1 };
    const ctx: ToolExecutionContext = { conversationId: 'conv1', ageGroup: '3-4', extra: {} };
    const result = await service.execute('pass_through', arg, ctx);

    expect(result.success).toBe(true);
    expect((result.data as any)?.argsReceived).toEqual(arg);
    expect((result.data as any)?.ctxReceived).toEqual(ctx);
  });

  it('execute thrown error wraps with "工具执行失败" prefix', async () => {
    class FailingTool {
      metadata: ToolMetadata = {
        name: 'fail_tool',
        description: 'fails',
        inputSchema: { type: 'object' },
        concurrencySafe: true,
        readOnly: false,
        requiresChildId: false,
        requiresParentId: false,
        requiresAgeGroup: false,
      };
      async execute(): Promise<never> {
        throw new Error('boom');
      }
    }
    service.register(new FailingTool() as unknown as ITool);

    const result = await service.execute('fail_tool', {}, {} as ToolExecutionContext);
    expect(result).toEqual({ success: false, error: '工具执行失败: boom' });
  });

  // ── executeToString ──────────────────────────────────────────────────

  it('executeToString returns JSON of data when available', async () => {
    service.register(new FakeTool());
    const str = await service.executeToString('fake_tool', {}, {} as ToolExecutionContext);
    expect(str).toBe('{"ok":1}');
  });

  it('executeToString returns JSON of {error} when no data', async () => {
    class ErrTool {
      metadata: ToolMetadata = {
        name: 'err_tool',
        description: 'e',
        inputSchema: { type: 'object' },
        concurrencySafe: true,
        readOnly: false,
        requiresChildId: false,
        requiresParentId: false,
        requiresAgeGroup: false,
      };
      async execute() {
        return { success: false, error: 'oops' };
      }
    }
    service.register(new ErrTool());
    const str = await service.executeToString('err_tool', {}, {} as ToolExecutionContext);
    expect(str).toBe('{"error":"oops"}');
  });

  // ── onModuleInit ─────────────────────────────────────────────────────

  it('onModuleInit auto-registers a decorated provider from getProviders', async () => {
    const wrapperInstance = new FakeTool();
    const wrapper: InstanceWrapper = {
      metatype: FakeTool,
      token: FakeTool,
      instance: wrapperInstance,
    } as any;
    mockDiscovery.getProviders.mockReturnValue([wrapper]);

    await service.onModuleInit();

    expect(service.has('fake_tool')).toBe(true);
  });

  it('onModuleInit skips wrapper without metadata', async () => {
    const naked: InstanceWrapper = {
      metatype: class NakedClass {
        /* no metadata */
      },
      token: class NakedClass {},
      instance: { foo: 'bar' },
    } as any;
    mockDiscovery.getProviders.mockReturnValue([naked]);

    await service.onModuleInit();

    expect(service.getAll()).toHaveLength(0);
  });

  it('onModuleInit skips instance missing execute method', async () => {
    const noExec: InstanceWrapper = {
      metatype: FakeTool,
      token: FakeTool,
      instance: { metadata: { name: 'broken', description: 'x', inputSchema: {} } },
    } as any;
    mockDiscovery.getProviders.mockReturnValue([noExec]);

    await service.onModuleInit();

    expect(service.getAll()).toHaveLength(0);
  });

  it('onModuleInit resolves via moduleRef.get when instance is missing', async () => {
    const resolvedTool = new FakeTool();
    mockDiscovery.getProviders.mockReturnValue([
      {
        metatype: FakeTool,
        token: FakeTool,
        instance: null, // trigger moduleRef.get path
      } as InstanceWrapper,
    ]);
    mockModuleRef.get.mockReturnValue(resolvedTool);

    await service.onModuleInit();

    expect(service.has('fake_tool')).toBe(true);
  });

  it('onModuleInit handles moduleRef.get throwing gracefully', async () => {
    mockDiscovery.getProviders.mockReturnValue([
      {
        metatype: FakeTool,
        token: FakeTool,
        instance: null,
      } as InstanceWrapper,
    ]);
    mockModuleRef.get.mockImplementation(() => {
      throw new Error('resolution failed');
    });

    await service.onModuleInit();

    // Should not throw; resolved tool will be null
    expect(service.getAll()).toHaveLength(0);
  });
});
