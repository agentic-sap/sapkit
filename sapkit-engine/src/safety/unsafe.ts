/**
 * `MCP_UNSAFE` / `--unsafe`, inherited with its measured meaning and nothing
 * more.
 *
 * What it actually does in the engine this contract was measured from: it
 * switches the auth broker's session store from the in-memory one to a
 * **file-backed store on disk**. That is the whole effect. The name is
 * unfortunate — it reads like a master switch — so the important half of this
 * module is the half that is not here:
 *
 *   it does **not** relax the tier gate,
 *   it does **not** disable or widen the table blocklist,
 *   it does **not** change which tools are exposed.
 *
 * The comparison is against the exact string `true`, as measured; `TRUE` and
 * `1` leave it off.
 *
 * M1's self-authored client has no session store yet, so nothing consumes this
 * flag today. It is resolved here so the contract is carried rather than
 * quietly dropped, and so the negative property above has a place to be tested.
 */

export interface UnsafeFlagInput {
  readonly argv?: readonly string[];
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export function resolveUnsafeFlag(input: UnsafeFlagInput = {}): boolean {
  const argv = input.argv ?? process.argv;
  const env = input.env ?? process.env;
  return argv.includes('--unsafe') || env.MCP_UNSAFE === 'true';
}
