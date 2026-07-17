// Reviewer spawn: runs the configured reviewer command against a capsule
// with a clean, allowlist-only environment (spec §5-3, PLANNING §3, Task
// §1). The caller (review-gate.mjs) decides what stdout/exitCode mean — this
// module only reports what happened to the process.
//
// Node built-ins only — no dependencies (PLANNING §1-1).

import { spawn } from 'node:child_process';

/**
 * @param {{capsuleDir: string, config: {reviewer: {command: string[], timeout_ms: number}, env_allowlist: string[]}}} args
 * @returns {Promise<{type: 'ok'|'timeout'|'spawn_error', stdout: string, stderr: string, exitCode: number|null}>}
 */
export function runReviewer({ capsuleDir, config }) {
  return new Promise((resolve) => {
    const [command, ...args] = config.reviewer.command;

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

    try {
      child = spawn(command, args, { cwd: capsuleDir, env });
    } catch (err) {
      resolve({ type: 'spawn_error', stdout: '', stderr: String((err && err.message) || err), exitCode: null });
      return;
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ type: 'timeout', stdout, stderr, exitCode: null });
    }, config.reviewer.timeout_ms);

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ type: 'spawn_error', stdout, stderr: stderr || String((err && err.message) || err), exitCode: null });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ type: 'ok', stdout, stderr, exitCode: code });
    });
  });
}
