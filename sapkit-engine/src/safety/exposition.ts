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
 * Two properties are inherited deliberately and must not be "improved" away:
 *
 *  - **Exposure is not a safety gate.** The two row-returning tools sit in the
 *    read-only surface, so `--exposition=readonly` does not hide them; the
 *    table blocklist is what gates them. Likewise the read-only surface is not
 *    execution-free.
 *  - **An empty `--exposition` means "unset".** `--exposition=` therefore falls
 *    back to the default `readonly,high`, which is why a launcher that means
 *    "read-only" has to say so explicitly. A value that is present but names
 *    nothing recognisable does NOT fall back — it yields a near-empty surface,
 *    so a typo cannot quietly open the write tools.
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

/**
 * Parse an `--exposition` value. An absent or blank value means "unset" and
 * yields the default; a value that names only unknown sets yields an empty
 * list rather than the default.
 */
export function parseExposition(raw: string | null | undefined): HandlerSet[] {
  const text = (raw ?? '').trim();
  if (!text) return [...DEFAULT_EXPOSITION];

  const out: HandlerSet[] = [];
  for (const token of text.split(/[,\s]+/)) {
    const value = token.trim().toLowerCase();
    if (!value) continue;
    const known = KNOWN_SETS.find((set) => set === value);
    if (known && !out.includes(known)) out.push(known);
  }
  return out;
}

/**
 * Read the exposition out of an argv tail. The FIRST occurrence wins, matching
 * the parser this contract came from — which is why a launcher that wants to
 * decide the surface has to strip every other occurrence before appending its
 * own.
 */
export function expositionFromArgv(argv: readonly string[]): HandlerSet[] {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg.startsWith('--exposition=')) return parseExposition(arg.slice('--exposition='.length));
    if (arg === '--exposition') return parseExposition(argv[i + 1] ?? '');
  }
  return [...DEFAULT_EXPOSITION];
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
