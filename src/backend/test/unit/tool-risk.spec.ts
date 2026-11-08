import { ToolRegistry } from '../../src/modules/ai/agent/tool-registry';
import {
  PARENT_APPROVAL_REQUIRED,
  requiresParentApproval,
  toolRiskOf,
} from '../../src/common/policy/tool-risk';

describe('tool risk policy', () => {
  it('ships a non-empty enforcement list derived from the policy table', () => {
    expect([...PARENT_APPROVAL_REQUIRED].sort()).toEqual([
      'createBehaviorTemplate',
      'createGift',
      'updateParentControl',
    ]);
    // The old bug: this field was set on the policy but read by nobody.
    expect(toolRiskOf('updateParentControl').requiresParentApproval).toBe(true);
  });

  it('blocks parent-side configuration tools for a child', () => {
    expect(requiresParentApproval('updateParentControl')).toBe(true);
    expect(requiresParentApproval('createGift')).toBe(true);
    expect(requiresParentApproval('createBehaviorTemplate')).toBe(true);
  });

  it('treats an omitted context as the strictest actor', () => {
    expect(requiresParentApproval('createGift', {})).toBe(true);
  });

  it('lets a parent account through without an extra flag', () => {
    expect(requiresParentApproval('updateParentControl', { actorType: 'parent' })).toBe(false);
  });

  it('honours a server-issued approval', () => {
    expect(
      requiresParentApproval('updateParentControl', {
        actorType: 'child',
        parentApproved: true,
      }),
    ).toBe(false);
  });

  it('does not disable an ordinary child action', () => {
    // Gating redeemGift without a request/approve/replay flow would simply
    // break gift redemption for every child.
    expect(requiresParentApproval('redeemGift')).toBe(false);
    expect(requiresParentApproval('recallMemory')).toBe(false);
    expect(toolRiskOf('recallMemory').risk).toBe('low');
  });
});

describe('ToolRegistry parent-approval gate', () => {
  function registry(handler: jest.Mock): ToolRegistry {
    const instance = Object.create(ToolRegistry.prototype) as any;
    instance.handlers = new Map([['updateParentControl', handler], ['recallMemory', handler]]);
    instance.logger = {
      debug: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
    };
    return instance as ToolRegistry;
  }

  it('refuses a gated tool on a child conversation', async () => {
    const handler = jest.fn().mockResolvedValue('ok');
    const result = await registry(handler).execute(
      'updateParentControl',
      { limit: 0 },
      { actorType: 'child' },
    );

    expect(JSON.parse(result).reason).toBe('parent_approval_required');
    expect(handler).not.toHaveBeenCalled();
  });

  it('cannot be bypassed by the model setting __parentApproved itself', async () => {
    const handler = jest.fn().mockResolvedValue('ok');
    const result = await registry(handler).execute(
      'updateParentControl',
      { limit: 0, __parentApproved: true },
      { actorType: 'child' },
    );

    expect(JSON.parse(result).reason).toBe('parent_approval_required');
    expect(handler).not.toHaveBeenCalled();
  });

  it('lets a parent through and strips the model-supplied flag', async () => {
    const handler = jest.fn().mockResolvedValue('ok');
    const result = await registry(handler).execute(
      'updateParentControl',
      { limit: 30, __parentApproved: true },
      { actorType: 'parent' },
    );

    expect(result).toBe('ok');
    expect(handler).toHaveBeenCalledWith({ limit: 30 });
  });

  it('leaves low-risk child tools untouched', async () => {
    const handler = jest.fn().mockResolvedValue('ok');
    const result = await registry(handler).execute(
      'recallMemory',
      { query: '恐龙' },
      { actorType: 'child' },
    );

    expect(result).toBe('ok');
    expect(handler).toHaveBeenCalledWith({ query: '恐龙' });
  });
});
