#!/usr/bin/env node
/**
 * sc4sap PostToolUse hook — Offline ABAP Code Analysis (warn-only, D-049)
 *
 * After ABAP source lands (local .abap file via Edit/Write, or SAP via an MCP
 * source-writing tool), runs vsp's offline 13-rule analyzer (AnalyzeABAPCode:
 * security/performance/robustness/quality) and feeds findings back to the
 * model as additionalContext. Never blocks — none of the 13 rules implies the
 * code cannot run on SAP; syntax authority stays with server-side CheckSyntax.
 *
 * Triggers on:
 * - Edit/Write/MultiEdit where tool_input.file_path ends in .abap
 *   (file is re-read from disk — covers the abapGit local-source flow)
 * - MCP ABAP Create/Update calls carrying a tool_input.source_code string
 *
 * vsp resolution: $SC4SAP_HOME_DIR/bin/vsp(.exe), falling back to
 * ~/.sc4sap/bin/vsp(.exe) — same home resolution as tier-readonly-guard.
 *
 * Failure mode: fails OPEN (silent pass). vsp is an optional dependency;
 * a missing binary, spawn error, timeout, or parse failure must never break
 * the write flow. The analyzer is an early filter, not a gate (D-049).
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);
const ANALYZE_TIMEOUT_MS = 15000;
const MAX_SOURCE_BYTES = 500 * 1024; // analyzer input limit (codeanalysis.go)
const MAX_FINDINGS_SHOWN = 20;

function silentPass() {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
}

function vspBinary() {
  const home = process.env.SC4SAP_HOME_DIR || join(homedir(), '.sc4sap');
  const name = process.platform === 'win32' ? 'vsp.exe' : 'vsp';
  const p = join(home, 'bin', name);
  return existsSync(p) ? p : null;
}

// Best-effort ADT object type for the analyzer (rules are source-based; the
// type only labels the result).
function inferType(toolName, filePath) {
  const s = `${toolName} ${filePath}`.toLowerCase();
  if (s.includes('class') || s.includes('.clas.')) return 'CLAS';
  if (s.includes('interface') || s.includes('.intf.')) return 'INTF';
  if (s.includes('function') || s.includes('.fugr.')) return 'FUGR';
  return 'PROG';
}

// Extract { source, objectType, objectName } from the hook payload, or null
// when this call carries no ABAP source to analyze.
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
    return {
      source,
      objectType: inferType('', fp),
      objectName: fp.replace(/\\/g, '/').split('/').pop(),
    };
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
    objectType: inferType(action, ''),
    objectName:
      toolInput.program_name || toolInput.class_name || toolInput.include_name ||
      toolInput.function_name || toolInput.interface_name || toolInput.name || 'UNKNOWN',
  };
}

// One-shot MCP stdio round-trip: initialize → tools/call AnalyzeABAPCode.
function analyze(bin, { source, objectType, objectName }) {
  return new Promise((resolveP) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        try { child.kill(); } catch {}
        resolveP(v);
      }
    };

    const child = spawn(bin, ['--offline'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });
    child.on('error', () => done(null));
    const timer = setTimeout(() => done(null), ANALYZE_TIMEOUT_MS);
    timer.unref?.();

    let buf = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 2) {
          try {
            done(JSON.parse(msg.result.content[0].text));
          } catch {
            done(null);
          }
        }
      }
    });

    const send = (obj) => child.stdin.write(`${JSON.stringify(obj)}\n`);
    send({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05', capabilities: {},
        clientInfo: { name: 'offline-code-analysis-hook', version: '1' },
      },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'AnalyzeABAPCode', arguments: { objectType, objectName, source } },
    });
  });
}

function formatFindings(result, objectName) {
  const findings = Array.isArray(result?.findings) ? result.findings : [];
  if (findings.length === 0) return null;

  const order = { high: 0, medium: 1, low: 2 };
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
    `[OFFLINE CODE ANALYSIS] vsp AnalyzeABAPCode found ${findings.length} issue(s)` +
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

    const bin = vspBinary();
    if (!bin) return silentPass(); // optional dependency — degrade silently

    const result = await analyze(bin, extracted);
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
