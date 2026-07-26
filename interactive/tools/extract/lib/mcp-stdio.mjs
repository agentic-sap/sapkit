// Minimal stdio MCP client for the `tools/extract/` utilities.
//
// TRANSFORM NOTE (sc4sap-custom -> sapkit): the frozen originals talked to the
// MCP server through `@modelcontextprotocol/sdk` (`Client` +
// `StdioClientTransport`). This plugin ships **no npm dependencies** — every
// script under `tools/` and `scripts/` is Node-stdlib only — so the two things
// the extractors actually need (`initialize`, then `tools/call`) are spoken
// directly over newline-delimited JSON-RPC 2.0. That is the same framing the
// in-repo surface gate `scripts/smoke-mcp.mjs` already uses against this exact
// bundle, so the wire format is not a guess.
//
// The server is started through `server/launch.cjs` — the plugin's own
// launcher, which resolves `<cwd>/.sc4sap/active-profile.txt` to the active
// profile's `sap.env` and wires it into the connection broker. Callers must
// therefore pass the **project root** as `cwd`. With no profile resolvable the
// bundle starts in inspection-only mode and every SAP call fails; that is the
// intended fail-closed behaviour, not a silent fallback to another system.

import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const LAUNCHER = join(PLUGIN_ROOT, 'server', 'launch.cjs');
const KEYRING_MODULES = join(PLUGIN_ROOT, 'server', 'runtime-deps', 'keyring', 'node_modules');

const CONNECT_TIMEOUT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 180_000;

/**
 * Start the bundled MCP server and complete the MCP handshake.
 *
 * @param {object}  opts
 * @param {string}  opts.cwd         project root (must hold `.sc4sap/`)
 * @param {string}  opts.exposition  tool exposition passed to the bundle
 * @param {string}  opts.label       client name reported in `initialize`
 * @returns {Promise<{callTool: (req: {name: string, arguments: object}) => Promise<any>, close: () => Promise<void>}>}
 */
export async function connectMcp({ cwd = process.cwd(), exposition = 'readonly', label = 'sapkit-extractor' } = {}) {
  const env = { ...process.env, NODE_PATH: KEYRING_MODULES };
  const child = spawn('node', [LAUNCHER, `--exposition=${exposition}`], { cwd, env });

  const pending = new Map(); // id -> { resolve, reject, timer }
  let nextId = 1;
  let stdoutBuf = '';
  const stderrTail = [];
  let closed = false;

  const failAll = (err) => {
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
  };

  // The server's own stderr carries its audit lines (blocklist refusals,
  // acknowledged-risk logging). Forward it rather than swallow it.
  child.stderr.on('data', (d) => {
    const text = d.toString();
    stderrTail.push(text);
    if (stderrTail.length > 40) stderrTail.shift();
    for (const line of text.split('\n')) {
      if (line.trim()) process.stderr.write(`[server] ${line.trim()}\n`);
    }
  });

  child.on('exit', (code) => {
    closed = true;
    if (pending.size) failAll(new Error(`MCP server exited (code ${code})${stderrTail.length ? `: ${stderrTail.join('').trim().split('\n').pop()}` : ''}`));
  });
  child.on('error', (err) => {
    closed = true;
    failAll(new Error(`failed to start MCP server: ${err.message}`));
  });

  child.stdout.on('data', (d) => {
    stdoutBuf += d.toString();
    let nl;
    while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, nl).trim();
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // non-JSON noise on stdout is ignored, as the SDK does
      }
      const p = msg.id != null ? pending.get(msg.id) : null;
      if (!p) continue;
      clearTimeout(p.timer);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    }
  });

  const request = (method, params, timeoutMs) =>
    new Promise((res, rej) => {
      if (closed) return rej(new Error('MCP server is not running'));
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        rej(new Error(`${method} timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
      pending.set(id, { resolve: res, reject: rej, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });

  await request(
    'initialize',
    {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: label, version: '1.0.0' },
    },
    CONNECT_TIMEOUT_MS
  );
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

  return {
    // Mirrors the SDK's `client.callTool({ name, arguments })`: returns the
    // tool result object (`{ content: [{ type, text }], ... }`). A tool-level
    // failure — including a blocklist refusal — is raised as an exception so
    // callers record it as an error instead of caching it as data.
    async callTool({ name, arguments: args }) {
      const result = await request('tools/call', { name, arguments: args }, REQUEST_TIMEOUT_MS);
      if (result?.isError) {
        const text = result?.content?.[0]?.text ?? 'tool reported an error';
        throw new Error(String(text).split('\n')[0].slice(0, 400));
      }
      return result;
    },
    async close() {
      closed = true;
      failAll(new Error('client closed'));
      child.kill();
    },
  };
}
