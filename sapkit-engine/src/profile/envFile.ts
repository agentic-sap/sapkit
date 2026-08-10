/**
 * `sap.env` reader.
 *
 * Deliberately not a dotenv dependency: this runs before anything else in the
 * process and the profile layer must stay dependency-free so a broken
 * node_modules can never be the reason a connection silently fails to resolve.
 *
 * The accepted shape is the one the shipped profiles actually use:
 * `KEY=VALUE`, one per line, `#` comment lines, an optional `export ` prefix,
 * and optional matching quotes around the value. A duplicated key keeps its
 * last assignment, which is what object assignment does and therefore what
 * every reader of these files has always done.
 *
 * Inline `#` is NOT treated as a comment — a password or a URL fragment may
 * legitimately contain one, and guessing wrong there costs a connection.
 */

import * as fs from 'node:fs';

/** Parse the text of an env file into a plain record. Never throws. */
export function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq < 0) continue;

    let key = line.slice(0, eq).trim();
    if (key.startsWith('export ')) key = key.slice('export '.length).trim();
    if (!key) continue;

    out[key] = unquote(line.slice(eq + 1).trim());
  }
  return out;
}

/** Strip one matching pair of surrounding quotes, then re-trim. */
function unquote(value: string): string {
  const first = value.charAt(0);
  const last = value.charAt(value.length - 1);
  if ((first === '"' || first === "'") && value.length >= 2 && last === first) {
    return value.slice(1, -1).trim();
  }
  return value;
}

/**
 * Read and parse an env file. Returns `null` — never throws — when the file is
 * absent or unreadable, so an unreadable profile degrades to "no connection"
 * instead of taking the server down.
 */
export function readEnvFile(file: string): Record<string, string> | null {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  return parseEnvText(text);
}
