#!/usr/bin/env node
/**
 * Engine bundle integrity guard.
 *
 * The MCP engine ships inside the plugin as a single pre-built file
 * (interactive/server/server.bundle.cjs) built in-repo from `sapkit-engine/` —
 * the repo's own engine, which took over the product bundle slot on 2026-08-19
 * (D-095, ladder step ⑴). Before that the source was the `engine/` fork
 * absorbed on 2026-07-11 (D-017); that tree stays in the repo as the rollback
 * source until it retires in 판7.5. interactive/server/VERSION records
 * provenance as free text; interactive/server/integrity.json pins the exact
 * bytes. This script keeps the three in agreement — the same model
 * interactive/server/bundle-keyring.mjs applies to the keyring bundle
 * (procedure: interactive/server/UPDATE-RUNBOOK.md).
 *
 * This file asks only "do VERSION, integrity.json and the shipped bytes agree".
 * Whether those bytes actually came from the pinned source commit is a
 * different axis, and interactive/scripts/check-engine-provenance.mjs owns it.
 *
 * Usage:
 *   node interactive/server/verify-engine.mjs            # verify (CI gate), exit 0/1
 *   node interactive/server/verify-engine.mjs --refresh  # re-pin after an engine bump
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE_PATH = join(ROOT, 'server', 'server.bundle.cjs');
const VERSION_PATH = join(ROOT, 'server', 'VERSION');
const INTEGRITY_PATH = join(ROOT, 'server', 'integrity.json');

function fail(msg) {
  console.error(`[verify-engine] FAIL: ${msg}`);
  process.exit(1);
}

function parseVersionFile() {
  const text = readFileSync(VERSION_PATH, 'utf8');
  // Line 1: "<package> <semver>", line 2 contains "commit <sha>".
  const head = text.match(/^(\S+)\s+(\d+\.\d+\.\d+)/);
  const commit = text.match(/commit\s+([0-9a-f]{7,40})/);
  if (!head) fail(`interactive/server/VERSION line 1 is not "<package> <semver>": ${text.split('\n')[0]}`);
  return { name: head[1], version: head[2], sourceCommit: commit ? commit[1] : null };
}

function currentState() {
  if (!existsSync(BUNDLE_PATH)) fail('interactive/server/server.bundle.cjs is missing');
  const bytes = readFileSync(BUNDLE_PATH);
  return {
    ...parseVersionFile(),
    file: 'interactive/server/server.bundle.cjs',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  };
}

const mode = process.argv.includes('--refresh') ? 'refresh' : 'verify';
const state = currentState();

if (mode === 'refresh') {
  writeFileSync(INTEGRITY_PATH, `${JSON.stringify(state, null, 2)}\n`);
  console.log(`[verify-engine] pinned ${state.name}@${state.version} (${state.sha256.slice(0, 12)}…, ${state.bytes} bytes)`);
  process.exit(0);
}

if (!existsSync(INTEGRITY_PATH)) {
  fail('interactive/server/integrity.json is missing — run: node interactive/server/verify-engine.mjs --refresh');
}
const pinned = JSON.parse(readFileSync(INTEGRITY_PATH, 'utf8'));
for (const key of ['name', 'version', 'sourceCommit', 'sha256', 'bytes']) {
  if (String(pinned[key]) !== String(state[key])) {
    fail(
      `${key} mismatch — integrity.json has "${pinned[key]}", the shipped bundle has "${state[key]}". ` +
        'After an intentional engine bump, re-pin with --refresh.',
    );
  }
}
console.log(`[verify-engine] OK: ${state.name}@${state.version} (${state.sha256.slice(0, 12)}…)`);
