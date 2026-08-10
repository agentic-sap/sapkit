/**
 * Tier gate — the server-side floor under every SAP-touching tool call.
 *
 * This is the layer that fires even when no client hook is installed, so it is
 * the one that has to be right. It is **fail-closed and positive**: on any tier
 * that is not DEV a call is allowed only when it can be positively classified
 * as harmless. Anything else — a mutation, an execution, an unrecognised class
 * — is refused.
 *
 *   class                                        DEV   QA   PRD   UNKNOWN
 *   read / row-data                               ok    ok   ok    ok
 *   server-control (ReloadProfile)                ok    ok   ok    ok
 *   unit-test execution                           ok    ok   no    no
 *   other execution (profiling runs)              ok    no   no    no
 *   mutation, and anything unclassified           ok    no   no    no
 *
 * `UNKNOWN` is the sentinel for "a connection exists but its tier could not be
 * resolved". It is neither DEV nor QA, so it lands in the most restrictive
 * column — an untagged system is treated as production until proven otherwise.
 *
 * A denylist of mutating name prefixes was tried once and was not enough
 * (Activate/Lock/Patch/Write all slipped past a Create/Update/Delete check), so
 * the decision is driven by the class the registry declares. The name check
 * that remains is a **cross-check, not the rule**: a tool whose name is plainly
 * mutating but whose declared class says otherwise is refused, so one wrong
 * line in a registry cannot smuggle a write onto a production system.
 */

import type { SapTier, ToolPolicyKind } from '../contracts';

/** The minimum the gate needs about a tool. */
export interface TierGatedTool {
  readonly name: string;
  readonly kind: ToolPolicyKind;
}

export type TierDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

/**
 * Tools that run ABAP unit tests. Running tests is what a QA system is for, so
 * these are the one execution family QA keeps; PRD and UNKNOWN still refuse.
 */
export const UNIT_TEST_EXECUTION_TOOLS: ReadonlySet<string> = new Set([
  'RunUnitTest',
  'RunClassUnitTestsLow',
  'HandlerUnitTestRun',
]);

/**
 * Names that change or run something, whatever the registry claims. Used only
 * to catch a mis-declared entry — never as the primary classification.
 */
const DANGEROUS_NAME_RE =
  /^(Create|Update|Delete|Activate|Release|Patch|Write|Install|RuntimeRun|RuntimeCreate)/;

const ALLOWED: TierDecision = { allowed: true };

export function checkTierAllowed(tool: TierGatedTool, tier: SapTier): TierDecision {
  // ReloadProfile is how an operator escapes a bad profile: it reads profile
  // files, touches no SAP object, and must stay reachable from inside the very
  // state it exists to repair.
  if (tool.kind === 'server-control') return ALLOWED;

  if (tier === 'DEV') return ALLOWED;

  switch (tool.kind) {
    case 'read':
    case 'row-data':
      if (DANGEROUS_NAME_RE.test(tool.name)) {
        return {
          allowed: false,
          reason: `${tool.name} is declared "${tool.kind}" but its name is that of a mutating or executing tool; refusing on a ${tier} profile (fail-closed).`,
        };
      }
      return ALLOWED;

    case 'execution':
      if (UNIT_TEST_EXECUTION_TOOLS.has(tool.name) && tier === 'QA') return ALLOWED;
      return {
        allowed: false,
        reason: `${tool.name} executes ABAP code on the server and is blocked on ${tier} profiles.`,
      };

    case 'mutation':
      return {
        allowed: false,
        reason: `${tool.name} mutates SAP objects; only DEV profiles may run it.`,
      };

    default:
      // Unreachable through the type, deliberately not unreachable at runtime:
      // a future or malformed class must fail closed rather than fall through.
      return {
        allowed: false,
        reason: `${tool.name} could not be classified; only DEV profiles may run it (fail-closed).`,
      };
  }
}

/** Thrown by {@link assertTierAllowed}. Carries the refusal vocabulary. */
export class TierBlockedError extends Error {
  readonly code = 'ERR_READONLY_TIER';

  constructor(
    readonly toolName: string,
    readonly tier: SapTier,
    reason: string,
  ) {
    super(
      `ERR_READONLY_TIER: ${reason} Active profile tier=${tier}. Switch to a DEV profile to perform this operation.`,
    );
    this.name = 'TierBlockedError';
  }
}

/** Throwing form, for the single chokepoint in front of every tool handler. */
export function assertTierAllowed(tool: TierGatedTool, tier: SapTier): void {
  const decision = checkTierAllowed(tool, tier);
  if (decision.allowed) return;
  throw new TierBlockedError(tool.name, tier, decision.reason);
}
