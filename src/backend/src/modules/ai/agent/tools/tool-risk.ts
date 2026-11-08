/**
 * Tool risk grading.
 *
 * Ported from 碎碎念 `agent/tools/policy.py`: every tool declares how much
 * damage a wrong call can do, and the caller decides what that means for
 * the current actor. The memory tools are deliberately `low` — storing or
 * recalling a memory cannot change a child's points, gifts or permissions,
 * so they never need a parent confirmation.
 *
 * The enforcement set ships **empty on purpose**. Turning a tool into
 * "needs parent approval" changes what a child can do, which is a product
 * decision, not a port; the mechanism is here so that decision is a
 * one-line edit rather than a refactor.
 */
export type ToolRisk = 'low' | 'medium' | 'high';

export interface ToolRiskPolicy {
  risk: ToolRisk;
  /** True when the tool must not run without an explicit parent action. */
  requiresParentApproval: boolean;
}

const LOW: ToolRiskPolicy = { risk: 'low', requiresParentApproval: false };
const MEDIUM: ToolRiskPolicy = { risk: 'medium', requiresParentApproval: false };

/**
 * Tools whose wrong call costs something the child notices: points,
 * gifts, parent settings, generated media. Everything absent from this
 * map is treated as `low`.
 */
const POLICIES: Record<string, ToolRiskPolicy> = {
  // ── memory: read-only or append-only, and fully gated ──────────────
  recallMemory: LOW,
  saveMemory: LOW,

  // ── reward ledger: a wrong call moves real points ──────────────────
  recordPoints: MEDIUM,
  redeemGift: MEDIUM,
  createGift: MEDIUM,
  createBehaviorTemplate: MEDIUM,

  // ── parent controls: changes what the child is allowed to do ───────
  updateParentControl: { risk: 'high', requiresParentApproval: true },

  // ── expensive / slow side effects ──────────────────────────────────
  generateCoursePack: MEDIUM,
  enqueueTeachingVideo: MEDIUM,
  generateVideoData: MEDIUM,
};

/**
 * Tools that must not run without an explicit parent action.
 *
 * Intentionally empty: see the module comment. Add a name here to enable
 * enforcement for it.
 */
const PARENT_APPROVAL_REQUIRED = new Set<string>();

export function toolRiskOf(toolName: string): ToolRiskPolicy {
  return POLICIES[toolName] ?? LOW;
}

/** Whether this specific tool is gated behind a parent action today. */
export function requiresParentApproval(toolName: string): boolean {
  return PARENT_APPROVAL_REQUIRED.has(toolName);
}
