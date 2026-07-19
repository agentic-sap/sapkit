// Pins the verdict-file schema contract the phase checker depends on:
// review-gate.mjs writeVerdictFile emits `classification` (never `verdict`).
// Written mid-run 2026-07-19 after the field-name mismatch blocked step 6
// (PLANNING §8 동반 발견 3) — this test fails if either the real verdict
// files stop carrying `classification` or the checker regresses to exit!=0
// against the real run state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');
const stateDir = resolve(repoRoot, 'phases/4-gated-deploy/state');

test('verdict files use classification, not verdict', () => {
  const verdictFiles = readdirSync(stateDir).filter((f) => /^verdict-.*\.json$/.test(f));
  assert.ok(verdictFiles.length >= 2, 'expected red FAIL + green PASS verdict files');
  for (const f of verdictFiles) {
    const v = JSON.parse(readFileSync(resolve(stateDir, f), 'utf8'));
    assert.ok(typeof v.classification === 'string', f + ' must carry classification');
    assert.ok(!('verdict' in v), f + ' must not carry a verdict field (schema contract)');
  }
});

test('check-phase-evidence exits 0 against the real run state', () => {
  const r = spawnSync('node', ['phases/4-gated-deploy/checks/check-phase-evidence.mjs'], {
    cwd: repoRoot, encoding: 'utf8',
  });
  assert.equal(r.status, 0, 'checker must pass: ' + (r.stderr || r.stdout));
});
