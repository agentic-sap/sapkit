/**
 * Tool exposure — which tools appear in `tools/list` at all.
 *
 * Two filters run in series, and the pair is what produces the "only visible
 * when connected" behaviour:
 *
 *  1. **Handler sets** — `--exposition` names a comma-separated set of handler
 *     groups. A tool appears when one of its declared sets is active.
 *  2. **Deployment axis** — a tool that declares `availableIn` appears only on
 *     a matching `SAP_SYSTEM_TYPE` (unset means `cloud`).
 *
 * ## Inherited
 *
 * Measured from `engine/src/lib/config/ServerConfigManager.ts` and kept:
 *
 *  - **Exposure is not a safety gate.** The two row-returning tools sit in the
 *    read-only surface, so `--exposition=readonly` does not hide them; the
 *    table blocklist is what gates them. Likewise the read-only surface is not
 *    execution-free.
 *  - **An empty `--exposition` means "unset".** `--exposition=` therefore falls
 *    back to the default `readonly,high`, which is why a launcher that means
 *    "read-only" has to say so explicitly.
 *  - **The FIRST occurrence on the command line wins** (see
 *    {@link expositionFromArgv}).
 *
 * ## Deliberately different
 *
 * These are departures, not inheritance, and are recorded as such:
 *
 *  - **A value that names only unknown sets does not fall back.** The old
 *    parser (`ServerConfigManager.ts:166-177`) filtered the tokens down to
 *    `readonly|high|low|compact`, and its caller (`:113`) then replaced an
 *    empty result with `['readonly','high']` — so `--exposition=bogus` opened
 *    the write surface. That is fail-open, and a single typo must not be able
 *    to open write tools, so here the filtered result stands: an unrecognised
 *    value yields a near-empty surface instead. The safety floor may not be
 *    lowered to match a measured behaviour.
 *  - **Unknown tokens are reported, not swallowed.** The narrow surface is only
 *    defensible if the operator can find out why, so
 *    {@link parseExpositionDetailed} returns diagnostics naming what it
 *    dropped. Nothing here writes to stderr — diagnostics go back to the
 *    caller, which owns the process's output streams, the same rule the
 *    blocklist follows.
 *  - **`system` and `search` are accepted as requested tokens.** The old filter
 *    rejected both even though the server registered those groups internally.
 *  - **Whitespace separates as well as a comma.** The old parser split on `,`
 *    only. This can only widen recognition of names already on the known list;
 *    it cannot admit an unknown one.
 */

import type { DeploymentType, HandlerSet, ToolExposure, ToolPolicyKind } from '../contracts';

/** What the server exposes when no `--exposition` argument reaches it. */
export const DEFAULT_EXPOSITION: readonly HandlerSet[] = ['readonly', 'high'];

const KNOWN_SETS: readonly HandlerSet[] = [
  'readonly',
  'high',
  'compact',
  'low',
  'system',
  'search',
];

/** The minimum a tool must declare for exposure to be decided. */
export interface ExposableTool {
  readonly name: string;
  readonly exposure: ToolExposure;
  readonly kind: ToolPolicyKind;
}

export interface ExposureQuery {
  readonly sets: readonly HandlerSet[];
  readonly systemType: DeploymentType;
}

/** A parsed `--exposition` value together with anything it could not use. */
export interface ExpositionResolution {
  readonly sets: HandlerSet[];
  /** Human-readable lines the caller should surface. Empty when all is well. */
  readonly diagnostics: string[];
}

/**
 * Parse an `--exposition` value. An absent or blank value means "unset" and
 * yields the default; a value that names only unknown sets yields an empty
 * list rather than the default.
 */
export function parseExposition(raw: string | null | undefined): HandlerSet[] {
  return parseExpositionDetailed(raw).sets;
}

/**
 * {@link parseExposition} plus the reason the result is what it is.
 *
 * Because an unrecognised value does not fall back (see the module header), a
 * mistyped flag produces a server with almost no tools on it. Saying so is the
 * difference between a defensible narrow surface and one that just looks
 * broken.
 */
export function parseExpositionDetailed(raw: string | null | undefined): ExpositionResolution {
  const text = (raw ?? '').trim();
  if (!text) return { sets: [...DEFAULT_EXPOSITION], diagnostics: [] };

  const sets: HandlerSet[] = [];
  const dropped: string[] = [];
  for (const token of text.split(/[,\s]+/)) {
    const value = token.trim().toLowerCase();
    if (!value) continue;
    const known = KNOWN_SETS.find((set) => set === value);
    if (!known) {
      dropped.push(token.trim());
      continue;
    }
    if (!sets.includes(known)) sets.push(known);
  }

  const diagnostics: string[] = [];
  if (dropped.length > 0) {
    diagnostics.push(
      `EXPOSITION_UNKNOWN: --exposition named ${dropped
        .map((token) => `"${token}"`)
        .join(', ')}, which no handler set is called. Known sets: ${KNOWN_SETS.join(
        ', ',
      )}. Unrecognised names are dropped and do NOT fall back to the default (${DEFAULT_EXPOSITION.join(
        ',',
      )}), so a typo narrows the surface rather than opening the write tools.`,
    );
  }
  if (sets.length === 0) {
    diagnostics.push(
      'EXPOSITION_EMPTY: no handler set in this value was recognised, so only the always-on search group is exposed and the server will look nearly empty. Pass --exposition=readonly for the read-only surface or --exposition=readonly,high for the full one.',
    );
  }
  return { sets, diagnostics };
}

/**
 * Read the exposition out of an argv tail. The FIRST occurrence wins, matching
 * the parser this contract came from — which is why a launcher that wants to
 * decide the surface has to strip every other occurrence before appending its
 * own.
 */
export function expositionFromArgv(argv: readonly string[]): HandlerSet[] {
  return expositionFromArgvDetailed(argv).sets;
}

/** {@link expositionFromArgv} plus the diagnostics of the occurrence it used. */
export function expositionFromArgvDetailed(argv: readonly string[]): ExpositionResolution {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg.startsWith('--exposition=')) {
      return parseExpositionDetailed(arg.slice('--exposition='.length));
    }
    if (arg === '--exposition') return parseExpositionDetailed(argv[i + 1] ?? '');
  }
  return { sets: [...DEFAULT_EXPOSITION], diagnostics: [] };
}

/**
 * Expand requested sets into the sets that are actually active.
 *
 * Two expansions are inherited: `readonly` also activates `system` (the two
 * groups have always been registered together), and `search` is always active
 * regardless of what was requested.
 */
export function resolveActiveSets(requested: readonly HandlerSet[]): ReadonlySet<HandlerSet> {
  const active = new Set<HandlerSet>(['search']);
  for (const set of requested) {
    active.add(set);
    if (set === 'readonly') active.add('system');
  }
  return active;
}

/** Filter a catalogue down to the tools that should appear in `tools/list`. */
export function selectExposedTools<T extends ExposableTool>(
  tools: readonly T[],
  query: ExposureQuery,
): T[] {
  const active = resolveActiveSets(query.sets);
  return tools.filter(
    (tool) =>
      tool.exposure.sets.some((set) => active.has(set)) &&
      isAvailableOn(tool.exposure.availableIn, query.systemType),
  );
}

/** A tool that declares no deployment axis exists everywhere. */
function isAvailableOn(
  availableIn: readonly DeploymentType[],
  systemType: DeploymentType,
): boolean {
  return availableIn.length === 0 || availableIn.includes(systemType);
}
