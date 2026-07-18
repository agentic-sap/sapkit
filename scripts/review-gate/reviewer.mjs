// Reviewer spawn: runs the configured reviewer command against a capsule
// with a clean, allowlist-only environment (spec §5-3, PLANNING §3, Task
// §1). The caller (review-gate.mjs) decides what stdout/exitCode mean — this
// module only reports what happened to the process.
//
// Node built-ins only — no dependencies (PLANNING §1-1).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * @param {{capsuleDir: string, config: {reviewer: {command: string[], timeout_ms: number}, env_allowlist: string[]}, cwd?: string}} args
 * @returns {Promise<{type: 'ok'|'timeout'|'spawn_error', stdout: string, stderr: string, exitCode: number|null}>}
 */
export function runReviewer({ capsuleDir, config, cwd }) {
  return new Promise((resolve) => {
    // Spawn cwd MUST be outside the capsule so the reviewer's own session
    // logs / scratch never land inside the immutable capsule snapshot (spec
    // §4.0). review-gate.mjs passes a run-scoped scratch dir under stateDir; a
    // direct caller that omits `cwd` gets an ephemeral temp dir we remove once
    // the child settles.
    let spawnCwd = cwd;
    let ephemeral = false;
    if (!spawnCwd) {
      spawnCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'review-gate-cwd-'));
      ephemeral = true;
    } else {
      fs.mkdirSync(spawnCwd, { recursive: true });
    }

    // Because the reviewer no longer runs from inside the capsule, it cannot
    // reach it via a relative path. Substitute the literal token {capsule} in
    // every command token with the capsule's absolute path (spec §5-3 clean-env
    // spawn leaves no ambient hint of the capsule location, so it is passed in
    // explicitly through the command).
    const capsuleAbs = path.resolve(capsuleDir);
    const [command, ...args] = config.reviewer.command.map(
      (token) => token.replaceAll('{capsule}', capsuleAbs),
    );

    // env is allowlist-only — everything else (SAP_*, MCP_ENV_PATH, ...) is
    // simply never copied into the child's env (spec §5-3, AC-7).
    const env = {};
    for (const key of config.env_allowlist || []) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }

    let settled = false;
    let stdout = '';
    let stderr = '';
    let child;

    const done = (result) => {
      if (ephemeral) {
        try { fs.rmSync(spawnCwd, { recursive: true, force: true }); } catch { /* best effort */ }
      }
      resolve(result);
    };

    try {
      child = spawn(command, args, { cwd: spawnCwd, env });
    } catch (err) {
      done({ type: 'spawn_error', stdout: '', stderr: String((err && err.message) || err), exitCode: null });
      return;
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      done({ type: 'timeout', stdout, stderr, exitCode: null });
    }, config.reviewer.timeout_ms);

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done({ type: 'spawn_error', stdout, stderr: stderr || String((err && err.message) || err), exitCode: null });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done({ type: 'ok', stdout, stderr, exitCode: code });
    });
  });
}
