import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runReviewer } from '../reviewer.mjs';
import { loadState } from '../state.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVIEW_GATE_MJS = path.join(__dirname, '..', 'review-gate.mjs');
const MOCKS_DIR = path.join(__dirname, 'mocks');
const BASE_CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function mockPath(name) {
  return path.join(MOCKS_DIR, name);
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function loadBaseConfig() {
  return JSON.parse(fs.readFileSync(BASE_CONFIG_PATH, 'utf8'));
}

// Writes a config.json copy with reviewer.command (and optionally
// timeout_ms) replaced by a mock, per Task §4: "임시 stateDir·config 사본
// (reviewer.command를 mock으로 교체)".
function writeConfig(dir, { command, timeoutMs } = {}) {
  const base = loadBaseConfig();
  const config = {
    ...base,
    reviewer: {
      ...base.reviewer,
      command: command || base.reviewer.command,
      timeout_ms: timeoutMs || base.reviewer.timeout_ms,
    },
  };
  const configPath = path.join(dir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return configPath;
}

// Writes/overwrites a unit.json + its source file. Reusing the same dir/path
// across calls with different sourceContent produces different capsule
// hashes (spec §4.0) without needing a fresh unit.json each time.
function writeUnit(dir, { sourceContent = 'REPORT z_test.\n', unitId = 'unit-1' } = {}) {
  const srcPath = path.join(dir, 'src.abap');
  fs.writeFileSync(srcPath, sourceContent, 'utf8');
  const specPath = path.join(dir, 'spec.md');
  if (!fs.existsSync(specPath)) fs.writeFileSync(specPath, '# spec\n', 'utf8');
  const unit = {
    unit_id: unitId,
    files: [srcPath],
    spec_path: specPath,
    verification_path: null,
    target_system: 'DEV',
  };
  const unitPath = path.join(dir, 'unit.json');
  fs.writeFileSync(unitPath, JSON.stringify(unit, null, 2), 'utf8');
  return unitPath;
}

function runGate({ unitPath, stateDir, configPath }) {
  return spawnSync(
    process.execPath,
    [REVIEW_GATE_MJS, '--unit', unitPath, '--state', stateDir, '--config', configPath],
    { encoding: 'utf8', timeout: 15000 },
  );
}

function readMarker(markerPath) {
  try {
    return parseInt(fs.readFileSync(markerPath, 'utf8'), 10);
  } catch {
    return 0;
  }
}

test('PASS cycle: exit 0, pass_records holds a record with model/versions/duration', () => {
  const dir = tmpDir('gate-pass-');
  const unitPath = writeUnit(dir);
  const configPath = writeConfig(dir, { command: ['node', mockPath('reviewer-pass.mjs')] });

  const result = runGate({ unitPath, stateDir: dir, configPath });
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

  const state = loadState(dir);
  const hashes = Object.keys(state.pass_records);
  assert.strictEqual(hashes.length, 1);
  const record = state.pass_records[hashes[0]];
  assert.strictEqual(record.model, 'opus');
  assert.strictEqual(record.policy_version, '1.0');
  assert.strictEqual(record.schema_version, 'trackB-review-result-v1');
  assert.strictEqual(typeof record.duration_ms, 'number');
  assert.strictEqual(typeof record.at, 'string');
  assert.ok(fs.existsSync(record.verdict_file));

  cleanup(dir);
});

test('FAIL cycle: exit 1, verdict file saved with finding coordinates', () => {
  const dir = tmpDir('gate-fail-');
  const unitPath = writeUnit(dir, { sourceContent: 'FAIL scenario source\n' });
  const configPath = writeConfig(dir, { command: ['node', mockPath('reviewer-major.mjs')] });

  const result = runGate({ unitPath, stateDir: dir, configPath });
  assert.strictEqual(result.status, 1, `stderr: ${result.stderr}`);

  const verdictFiles = fs.readdirSync(dir).filter((f) => f.startsWith('verdict-') && f.endsWith('.json'));
  assert.strictEqual(verdictFiles.length, 1);
  const verdict = JSON.parse(fs.readFileSync(path.join(dir, verdictFiles[0]), 'utf8'));
  assert.strictEqual(verdict.classification, 'FAIL');
  assert.strictEqual(verdict.findings.length, 1);
  assert.strictEqual(verdict.findings[0].bucket, 'B2');
  assert.strictEqual(verdict.findings[0].object, 'ZFOO');
  assert.strictEqual(typeof verdict.findings[0].finding, 'string');

  cleanup(dir);
});

test('cache: same unit re-run does not respawn the reviewer, exit unchanged', () => {
  const dir = tmpDir('gate-cache-');
  const markerPath = path.join(dir, 'marker.txt');
  const unitPath = writeUnit(dir, { sourceContent: 'cache scenario source\n' });
  const configPath = writeConfig(dir, { command: ['node', mockPath('reviewer-pass.mjs'), markerPath] });

  const first = runGate({ unitPath, stateDir: dir, configPath });
  assert.strictEqual(first.status, 0, `stderr: ${first.stderr}`);
  assert.strictEqual(readMarker(markerPath), 1);

  const second = runGate({ unitPath, stateDir: dir, configPath });
  assert.strictEqual(second.status, 0, `stderr: ${second.stderr}`);
  assert.strictEqual(readMarker(markerPath), 1, 'reviewer must not be respawned on a cache hit');

  cleanup(dir);
});

test('3-revision BLOCKED: three distinct-hash FAILs block, the 4th call short-circuits without spawning', () => {
  const dir = tmpDir('gate-blocked-');
  const markerPath = path.join(dir, 'marker.txt');
  const configPath = writeConfig(dir, { command: ['node', mockPath('reviewer-major.mjs'), markerPath] });

  const r1 = runGate({ unitPath: writeUnit(dir, { sourceContent: 'FAIL v1\n' }), stateDir: dir, configPath });
  assert.strictEqual(r1.status, 1, `stderr: ${r1.stderr}`);
  assert.strictEqual(readMarker(markerPath), 1);

  const r2 = runGate({ unitPath: writeUnit(dir, { sourceContent: 'FAIL v2\n' }), stateDir: dir, configPath });
  assert.strictEqual(r2.status, 1, `stderr: ${r2.stderr}`);
  assert.strictEqual(readMarker(markerPath), 2);

  const r3 = runGate({ unitPath: writeUnit(dir, { sourceContent: 'FAIL v3\n' }), stateDir: dir, configPath });
  assert.strictEqual(r3.status, 7, `stderr: ${r3.stderr}`);
  assert.strictEqual(readMarker(markerPath), 3);

  const r4 = runGate({ unitPath: writeUnit(dir, { sourceContent: 'FAIL v4\n' }), stateDir: dir, configPath });
  assert.strictEqual(r4.status, 7, `stderr: ${r4.stderr}`);
  assert.strictEqual(readMarker(markerPath), 3, 'blocked fail-fast must not spawn the reviewer again');

  const state = loadState(dir);
  assert.strictEqual(state.blocked, true);
  assert.strictEqual(state.fail_revisions.length, 3);

  cleanup(dir);
});

test('MALFORMED: non-JSON reviewer stdout -> exit 2', () => {
  const dir = tmpDir('gate-malformed-');
  const unitPath = writeUnit(dir, { sourceContent: 'malformed scenario source\n' });
  const configPath = writeConfig(dir, { command: ['node', mockPath('reviewer-invalid.mjs')] });

  const result = runGate({ unitPath, stateDir: dir, configPath });
  assert.strictEqual(result.status, 2, `stderr: ${result.stderr}`);

  cleanup(dir);
});

test('TIMEOUT: reviewer exceeding timeout_ms -> exit 4, revision not incremented', () => {
  const dir = tmpDir('gate-timeout-');
  const unitPath = writeUnit(dir, { sourceContent: 'timeout scenario source\n' });
  const configPath = writeConfig(dir, { command: ['node', mockPath('reviewer-sleep.mjs')], timeoutMs: 300 });

  const result = runGate({ unitPath, stateDir: dir, configPath });
  assert.strictEqual(result.status, 4, `stderr: ${result.stderr}`);

  const state = loadState(dir);
  assert.strictEqual(state.fail_revisions.length, 0);
  assert.strictEqual(state.infra_retries, 1);

  cleanup(dir);
});

test('AC-7: reviewer spawn env is allowlist-only — no SAP_* keys, no MCP_ENV_PATH', async () => {
  const config = loadBaseConfig();
  const capsuleDir = tmpDir('gate-env-');
  const prevSap = process.env.SAP_PASSWORD;
  const prevMcp = process.env.MCP_ENV_PATH;
  process.env.SAP_PASSWORD = 'dummy';
  process.env.MCP_ENV_PATH = 'C:\\fake\\sap.env';

  try {
    const outcome = await runReviewer({
      capsuleDir,
      config: {
        ...config,
        reviewer: { ...config.reviewer, command: ['node', mockPath('reviewer-envdump.mjs')] },
      },
    });
    assert.strictEqual(outcome.type, 'ok');
    const keys = JSON.parse(outcome.stdout);
    assert.ok(!keys.some((k) => k.toUpperCase().startsWith('SAP_')), `leaked SAP_* key(s): ${keys}`);
    assert.ok(!keys.some((k) => k.toUpperCase() === 'MCP_ENV_PATH'), `leaked MCP_ENV_PATH: ${keys}`);
  } finally {
    if (prevSap === undefined) delete process.env.SAP_PASSWORD; else process.env.SAP_PASSWORD = prevSap;
    if (prevMcp === undefined) delete process.env.MCP_ENV_PATH; else process.env.MCP_ENV_PATH = prevMcp;
    cleanup(capsuleDir);
  }
});

test('reviewer.mjs: an unresolvable command surfaces as spawn_error, not a thrown exception', async () => {
  const capsuleDir = tmpDir('gate-spawnerror-');
  const outcome = await runReviewer({
    capsuleDir,
    config: {
      reviewer: { command: ['sap-agentic-harness-nonexistent-binary-xyz'], timeout_ms: 5000 },
      env_allowlist: ['PATH', 'SYSTEMROOT', 'COMSPEC'],
    },
  });
  assert.strictEqual(outcome.type, 'spawn_error');
  cleanup(capsuleDir);
});
