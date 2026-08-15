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
 *   server-control, named (ReloadProfile)         ok    ok   ok    ok
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
 * line in a registry cannot smuggle a write onto a production system. That
 * cross-check runs on **every** class, `server-control` included — a class that
 * bypasses the tier outright is the one a wrong line would be most valuable to
 * claim, so it gets no shortcut past the check.
 *
 * The QA row for unit tests is **inherited, not invented**: the measured guard
 * (`engine/src/lib/readonlyGuard.ts:80-84, 109-112`) lets its three unit-test
 * runners through on QA and refuses them on PRD. It reads as a departure from
 * the project-level summary "no write or execution on QA/PRD" (CLAUDE.md), and
 * it is the narrower rule underneath that summary: running tests is what a QA
 * system is for. It is also not the only layer — the adapter permission
 * allowlist and the PreToolUse hook sit above this gate and can refuse a call
 * this table allows.
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
 * Server-control tools that stay reachable on every tier.
 *
 * The measured contract exempts exactly one **name**: the old guard
 * (`engine/src/lib/readonlyGuard.ts:130-133`) short-circuits on
 * `toolName === 'ReloadProfile'` and on nothing else. ReloadProfile is how an
 * operator escapes a bad profile — it reads profile files, touches no SAP
 * object, and must stay reachable from inside the very state it exists to
 * repair. The exemption is therefore this list of names, never the declared
 * class on its own: a registry line that merely says `server-control` cannot
 * mint a new bypass.
 */
export const SERVER_CONTROL_TOOLS: ReadonlySet<string> = new Set(['ReloadProfile']);

/**
 * Names that change or run something, whatever the registry claims. Used only
 * to catch a mis-declared entry — never as the primary classification.
 *
 * **`Run(?!time)` is deliberate, and the negative lookahead is the whole point.**
 * The old guard classified by *name*, so `RunUnitTest` was fail-closed simply by
 * not being a read prefix (`engine/src/lib/readonlyGuard.ts:42-54`). This engine
 * classifies by *declaration*, so a registry line reading `kind: 'read'` would
 * have carried `RunUnitTest` straight through PRD — measured by sabotage while
 * the unit-test bundle was built, and strictly weaker than the engine it
 * replaces. Adding the name to this cross-check restores the old floor.
 *
 * A bare `^Run` would over-block: the twelve `Runtime*` tools are dump and
 * profiler **reads** that the old guard allowed on QA/PRD, and blocking them
 * would be a regression in the other direction. The two `Runtime*` names that
 * really do run or create stay listed explicitly.
 */
const DANGEROUS_NAME_RE =
  /^(Create|Update|Delete|Activate|Release|Patch|Write|Install|Run(?!time)|RuntimeRun|RuntimeCreate)/;

const ALLOWED: TierDecision = { allowed: true };

/** The cross-check refusal: declared class and name disagree, so refuse. */
function misdeclared(tool: TierGatedTool, tier: SapTier): TierDecision {
  return {
    allowed: false,
    reason: `${tool.name} is declared "${tool.kind}" but its name is that of a mutating or executing tool; refusing on a ${tier} profile (fail-closed).`,
  };
}

export function checkTierAllowed(tool: TierGatedTool, tier: SapTier): TierDecision {
  if (tier === 'DEV') return ALLOWED;

  switch (tool.kind) {
    case 'server-control':
      if (DANGEROUS_NAME_RE.test(tool.name)) return misdeclared(tool, tier);
      if (SERVER_CONTROL_TOOLS.has(tool.name)) return ALLOWED;
      return {
        allowed: false,
        reason: `${tool.name} is declared "server-control", but that exemption covers only ${[
          ...SERVER_CONTROL_TOOLS,
        ].join(', ')}; refusing on a ${tier} profile (fail-closed).`,
      };

    case 'read':
    case 'row-data':
      if (DANGEROUS_NAME_RE.test(tool.name)) return misdeclared(tool, tier);
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
