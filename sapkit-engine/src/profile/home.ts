/**
 * Profile-home resolution.
 *
 * The home is the directory that holds `profiles/<alias>/sap.env`. It is
 * `$SAPKIT_HOME_DIR` when that variable is set, otherwise `~/.sapkit`.
 *
 * **A `SAPKIT_HOME_DIR` that is set but does not exist is an error, not a
 * hint.** The operator pinned a home; the pin is broken; nothing may stand in
 * for it — not `~/.sapkit`, and not a project-local `sap.env` either.
 * Substituting one would connect to a system the operator never selected, so
 * the resolution is terminal and the server starts with no connection at all.
 * That is a safety property, not a convenience, and it is why this returns a
 * distinct `env-invalid` result instead of a plain "nothing found".
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** The one runtime directory name, in the project and under the home alike. */
export const RUNTIME_DIR_NAME = '.sapkit';

export type HomeResolution =
  | { readonly kind: 'ok'; readonly dir: string; readonly source: 'env' | 'default' }
  | { readonly kind: 'env-invalid'; readonly dir: string };

export interface HomeLookup {
  /** Environment to read `SAPKIT_HOME_DIR` from. Defaults to `process.env`. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** User home directory. Defaults to `os.homedir()`. Injected by tests. */
  readonly homedir?: string;
}

export function resolveHomeDir(lookup: HomeLookup = {}): HomeResolution {
  const env = lookup.env ?? process.env;
  const pinned = (env.SAPKIT_HOME_DIR ?? '').trim();

  if (pinned) {
    if (!fs.existsSync(pinned)) return { kind: 'env-invalid', dir: pinned };
    return { kind: 'ok', dir: pinned, source: 'env' };
  }

  const home = lookup.homedir ?? os.homedir();
  return { kind: 'ok', dir: path.join(home, RUNTIME_DIR_NAME), source: 'default' };
}

/**
 * Names the aliases that DO exist under a home. A project's pointer travels
 * with the project while the profile stays on the machine, so pointing at a
 * profile that is not here is routine; naming the real ones turns a misleading
 * auth error into a one-line fix. Never throws — a diagnostic must not be able
 * to break resolution.
 */
export function listProfileAliases(home: string): string[] {
  try {
    return fs
      .readdirSync(path.join(home, 'profiles'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}
