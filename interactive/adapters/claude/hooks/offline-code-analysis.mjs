#!/usr/bin/env node
/**
 * sapkit PostToolUse hook — Offline ABAP Code Analysis (warn-only, D-049)
 *
 * After ABAP source lands (local .abap file via Edit/Write, or SAP via an MCP
 * source-writing tool), runs the bundled offline 13-rule analyzer
 * (`sapkit analyze`: security/performance/robustness/quality) and feeds
 * findings back to the model as additionalContext. Never blocks — none of the
 * 13 rules implies the code cannot run on SAP; syntax authority stays with
 * server-side CheckSyntax.
 *
 * Triggers on:
 * - Edit/Write/MultiEdit where tool_input.file_path ends in .abap
 *   (file is re-read from disk — covers the abapGit local-source flow)
 * - MCP ABAP Create/Update calls carrying a tool_input.source_code string
 *
 * Checker resolution: the single-file bundle shipped inside this plugin,
 * ../../../checker/sapkit-checker.bundle.cjs, run with the same node that runs
 * this hook (process.execPath). Nothing is downloaded, nothing is installed,
 * and no environment variable takes part — the analyzer is present exactly
 * when the plugin is (interactive/checker/UPDATE-RUNBOOK.md).
 *
 * Failure mode: fails OPEN (silent pass). A missing bundle, spawn error,
 * timeout, or parse failure must never break the write flow. The analyzer is
 * an early filter, not a gate (D-049).
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);
const ANALYZE_TIMEOUT_MS = 15000;
const MAX_SOURCE_BYTES = 500 * 1024; // analyzer input limit (analyze surface)
const MAX_FINDINGS_SHOWN = 20;

// adapters/claude/hooks → interactive → checker. Resolved from this file so the
// hook works wherever the plugin is installed (marketplace cache or repo).
const CHECKER_BUNDLE = join(
  dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'checker', 'sapkit-checker.bundle.cjs',
);

function silentPass() {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
}

// The bundle ships with the plugin, so this normally exists. It fails open all
// the same — an absent bundle is a silent no-op, never a broken write flow.
function checkerBundle() {
  return existsSync(CHECKER_BUNDLE) ? CHECKER_BUNDLE : null;
}

// Extract { source, objectName } from the hook payload, or null when this call
// carries no ABAP source to analyze. objectName only labels the message — the
// analyzer's 13 rules are source-based and take no object identity.
function extractSource(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;

  if (FILE_TOOLS.has(toolName)) {
    const fp = toolInput.file_path || '';
    if (!/\.abap$/i.test(fp) || !existsSync(fp)) return null;
    let source;
    try {
      source = readFileSync(fp, 'utf8');
    } catch {
      return null;
    }
    return { source, objectName: fp.replace(/\\/g, '/').split('/').pop() };
  }

  // MCP ABAP source-writing tools (UpdateProgram/UpdateClass/UpdateInclude/...)
  const sep = toolName.lastIndexOf('__');
  if (!toolName.startsWith('mcp__') || sep <= 5) return null;
  if (!/sap|abap/i.test(toolName.slice(5, sep))) return null;
  const action = toolName.slice(sep + 2);
  if (!/^(Create|Update)/.test(action)) return null;
  if (typeof toolInput.source_code !== 'string' || !toolInput.source_code.trim()) return null;
  return {
    source: toolInput.source_code,
    objectName:
      toolInput.program_name || toolInput.class_name || toolInput.include_name ||
      toolInput.function_name || toolInput.interface_name || toolInput.name || 'UNKNOWN',
  };
}

// One-shot child process: `node <bundle> analyze --stdin --format json`.
// The source goes in on stdin, the JSON verdict comes back on stdout. Only the
// source travels — the analyzer takes no object identity, so objectName stays
// here and only labels the message below.
function analyze(bundle, { source }) {
  return new Promise((resolveP) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        try { child.kill(); } catch {}
        resolveP(v);
      }
    };

    const child = spawn(process.execPath, [bundle, 'analyze', '--stdin', '--format', 'json'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });
    child.on('error', () => done(null));
    const timer = setTimeout(() => done(null), ANALYZE_TIMEOUT_MS);
    timer.unref?.();

    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.on('close', (code) => {
      if (code !== 0) return done(null);
      try {
        done(JSON.parse(out));
      } catch {
        done(null);
      }
    });

    // stdin may already be gone if spawn failed — the 'error' handler owns that.
    child.stdin.on('error', () => {});
    child.stdin.end(source, 'utf8');
  });
}

function formatFindings(result, objectName) {
  const findings = Array.isArray(result?.findings) ? result.findings : [];
  if (findings.length === 0) return null;

  const order = { high: 0, medium: 1, low: 2, info: 3 };
  const sorted = [...findings].sort(
    (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || (a.line ?? 0) - (b.line ?? 0),
  );
  const lines = sorted.slice(0, MAX_FINDINGS_SHOWN).map(
    (f) => `- [${f.severity}/${f.category}] L${f.line} ${f.rule}: ${f.description}`,
  );
  const more = findings.length > MAX_FINDINGS_SHOWN
    ? `\n(+${findings.length - MAX_FINDINGS_SHOWN} more)` : '';
  const high = findings.filter((f) => f.severity === 'high').length;

  return (
    `[SAPKIT OFFLINE CODE ANALYSIS] sapkit analyze found ${findings.length} issue(s)` +
    `${high ? ` (${high} high)` : ''} in ${objectName}:\n${lines.join('\n')}${more}\n` +
    'Advisory only (D-049) — the write already succeeded and none of these block SAP execution. ' +
    'Fix what applies (high severity first), then re-upload. ' +
    'Syntax/activation authority remains server-side CheckSyntax + ActivateObjects.'
  );
}

async function main() {
  try {
    const input = await new Promise((res) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => (data += c));
      process.stdin.on('end', () => res(data));
      process.stdin.on('error', () => res(data));
    });
    const data = JSON.parse(input);

    const extracted = extractSource(data.tool_name || '', data.tool_input || {});
    if (!extracted || Buffer.byteLength(extracted.source, 'utf8') > MAX_SOURCE_BYTES) {
      return silentPass();
    }

    const bundle = checkerBundle();
    if (!bundle) return silentPass(); // absent bundle — degrade silently

    const result = await analyze(bundle, extracted);
    const message = result && formatFindings(result, extracted.objectName);
    if (!message) return silentPass();

    console.log(JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: message,
      },
    }));
  } catch {
    silentPass(); // fail open — never break the write flow
  }
}

main();
