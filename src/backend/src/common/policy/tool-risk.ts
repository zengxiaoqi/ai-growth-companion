/**
 * Tool risk grading — shared by both tool execution paths.
 *
 * Ported from 碎碎念 `agent/tools/policy.py`: every tool declares how much
 * damage a wrong call can do, and the caller decides what that means for
 * the current actor. The memory tools are deliberately `low` — storing or
 * recalling a memory cannot change a child's points, gifts or permissions.
 *
 * This lives in `common/` on purpose. There are two registries: the legacy
 * one in `modules/ai/agent/` and the discovered one in `agent-framework/`.
 * A policy that only one of them reads is not a policy, so neither layer
 * may import the other — both import this.
 */

export type ToolRisk = 'low' | 'medium' | 'high';

export interface ToolRiskPolicy {
  risk: ToolRisk;
  /** True when a child account must not run this tool on its own. */
  requiresParentApproval: boolean;
}

/**
 * Who is asking, as decided by the server — never by the model.
 *
 * `parentApproved` is reserved for a server-issued approval (e.g. a
 * one-time token minted by a future parent confirmation endpoint). No
 * caller sets it today; it exists so the enforcement point does not need
 * to change when that flow is built.
 */
export interface ToolActorContext {
  actorType?: 'parent' | 'child';
  parentApproved?: boolean;
}

const LOW: ToolRiskPolicy = { risk: 'low', requiresParentApproval: false };
const MEDIUM: ToolRiskPolicy = { risk: 'medium', requiresParentApproval: false };
const HIGH_PARENT: ToolRiskPolicy = { risk: 'high', requiresParentApproval: true };

/**
 * Tools whose wrong call costs something the child notices: points,
 * gifts, parent settings, generated media. Everything absent from this
 * map is treated as `low`.
 *
 * The three `HIGH_PARENT` entries are parent-side configuration tools:
 * a child has no legitimate reason to change screen-time limits, create
 * gifts or add behaviour rules. Blocking them for child accounts is a
 * permission boundary, not a confirmation dialog.
 *
 * Deliberately NOT gated: `redeemGift`. Redeeming a gift is a normal
 * child action; gating it without a real "request → parent approves →
 * replay" state machine would simply disable the feature. Add it here
 * together with that flow, not before.
 */
const POLICIES: Record<string, ToolRiskPolicy> = {
  // ── memory: read-only or append-only, and fully gated ──────────────
  recallMemory: LOW,
  saveMemory: LOW,

  // ── reward ledger: a wrong call moves real points ──────────────────
  recordPoints: MEDIUM,
  redeemGift: MEDIUM,

  // ── parent controls: changes what the child is allowed to do ───────
  updateParentControl: HIGH_PARENT,
  createGift: HIGH_PARENT,
  createBehaviorTemplate: HIGH_PARENT,

  // ── expensive / slow side effects ──────────────────────────────────
  generateCoursePack: MEDIUM,
  enqueueTeachingVideo: MEDIUM,
  generateVideoData: MEDIUM,
};

/**
 * The enforcement list, derived from the policy table so the two can
 * never disagree again. Previously this was a hard-coded empty Set and
 * `POLICIES[...].requiresParentApproval` was read by nobody — a tool
 * marked as protected was, in fact, fully reachable.
 */
export const PARENT_APPROVAL_REQUIRED: ReadonlySet<string> = new Set(
  Object.entries(POLICIES)
    .filter(([, policy]) => policy.requiresParentApproval)
    .map(([name]) => name),
);

export function toolRiskOf(toolName: string): ToolRiskPolicy {
  return POLICIES[toolName] ?? LOW;
}

/**
 * Whether this call must be refused for the current actor.
 *
 * Defaults to the strictest interpretation (`child`) so an omitted
 * context can never widen a permission. A parent account *is* the
 * approval; no extra flag is needed on that path.
 */
export function requiresParentApproval(
  toolName: string,
  ctx: ToolActorContext = {},
): boolean {
  if (ctx.actorType === 'parent') return false;
  if (ctx.parentApproved === true) return false;
  return PARENT_APPROVAL_REQUIRED.has(toolName);
}
