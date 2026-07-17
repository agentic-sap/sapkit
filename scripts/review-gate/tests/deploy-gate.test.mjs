import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCapsule } from '../capsule.mjs';
import { loadState, recordPass } from '../state.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEPLOY_GATE_MJS = path.join(__dirname, '..', 'deploy-gate.mjs');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function readRecords(recordFilePath) {
  if (!fs.existsSync(recordFilePath)) return [];
  return fs.readFileSync(recordFilePath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// Builds a unit.json + working-tree source, and — mirroring what
// review-gate.mjs (step 3) produces after a PASS verdict — a capsule plus a
// matching PASS record in state.json. deploy-gate.mjs only consumes these
// two artifacts, so tests construct them directly instead of spawning a full
// reviewer round-trip (Forbidden: no real vsp/reviewer here — mock-first,
// PLANNING §1-3).
function setupPassedUnit(dir, { sourceContent = 'REPORT z_test.\n' } = {}) {
  const srcPath = path.join(dir, 'src.abap');
  fs.writeFileSync(srcPath, sourceContent, 'utf8');
  const specPath = path.join(dir, 'spec.md');
  fs.writeFileSync(specPath, '# spec\n', 'utf8');

  const unit = {
    unit_id: 'unit-1',
    files: [srcPath],
    spec_path: specPath,
    verification_path: null,
    target_system: 'DEV',
  };
  const unitPath = path.join(dir, 'unit.json');
  fs.writeFileSync(unitPath, JSON.stringify(unit, null, 2), 'utf8');

  const capsuleDir = path.join(dir, 'capsule');
  const { capsuleHash } = createCapsule({
    ...unit,
    policy_version: '1.0',
    schema_version: 'trackB-review-result-v1',
    reviewer_model: 'opus',
  }, capsuleDir);

  const state = loadState(dir);
  recordPass(dir, state, capsuleHash, {
    verdict_file: path.join(dir, `verdict-${capsuleHash}.json`),
    model: 'opus',
    policy_version: '1.0',
    schema_version: 'trackB-review-result-v1',
    duration_ms: 42,
    at: new Date().toISOString(),
  });

  return { unitPath, capsuleDir, stateDir: dir, srcPath };
}

// deploy-cmd templates below reference the mock via a path relative to
// deploy-gate.mjs's own directory (scripts/review-gate) — deploy-gate.mjs
// spawns the deploy command with that directory as cwd. This keeps every
// token in the template space-free even though the repo root itself
// ("...\AI PROJECT\...") contains a space, which a naive shell-style
// re-parse of an absolute path would break.
function deployCmdFor(recordFile, extraArg) {
  const base = `node tests/mocks/deploy-recorder.mjs ${recordFile} {file}`;
  return extraArg ? `${base} ${extraArg}` : base;
}

function runDeployGate({ unitPath, stateDir, capsuleDir, deployCmd }) {
  return spawnSync(
    process.execPath,
    [DEPLOY_GATE_MJS, '--unit', unitPath, '--state', stateDir, '--capsule', capsuleDir, '--deploy-cmd', deployCmd],
    { encoding: 'utf8', timeout: 15000 },
  );
}

test('normal: PASS record + intact capsule + matching worktree -> exit 0, recorder receives the capsule-internal path with a matching content hash', () => {
  const dir = tmpDir('deploy-ok-');
  const { unitPath, capsuleDir, stateDir, srcPath } = setupPassedUnit(dir);
  const recordFile = path.join(dir, 'record.jsonl');

  const result = runDeployGate({ unitPath, stateDir, capsuleDir, deployCmd: deployCmdFor(recordFile) });
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

  const records = readRecords(recordFile);
  assert.strictEqual(records.length, 1);
  const capsuleFilePath = path.join(capsuleDir, 'files', '0', 'content');
  assert.strictEqual(records[0].fileArg, capsuleFilePath);
  assert.notStrictEqual(records[0].fileArg, srcPath, 'must deploy the capsule copy, not the working-tree path');
  assert.strictEqual(records[0].fileSha256, sha256(fs.readFileSync(srcPath)));

  cleanup(dir);
});

test('AC-4: worktree file changed by 1 byte after PASS -> exit 1 WORKTREE_DRIFT, recorder never runs', () => {
  const dir = tmpDir('deploy-drift-');
  const { unitPath, capsuleDir, stateDir, srcPath } = setupPassedUnit(dir);
  const recordFile = path.join(dir, 'record.jsonl');

  fs.appendFileSync(srcPath, 'X', 'utf8'); // 1-byte drift after the capsule was sealed

  const result = runDeployGate({ unitPath, stateDir, capsuleDir, deployCmd: deployCmdFor(recordFile) });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /WORKTREE_DRIFT/);
  assert.ok(!fs.existsSync(recordFile), 'deploy command must not run on drift');

  cleanup(dir);
});

test('no PASS record for this capsule hash -> exit 1 NO_PASS_RECORD, recorder never runs', () => {
  const dir = tmpDir('deploy-nopass-');
  const srcPath = path.join(dir, 'src.abap');
  fs.writeFileSync(srcPath, 'REPORT z_test.\n', 'utf8');
  const specPath = path.join(dir, 'spec.md');
  fs.writeFileSync(specPath, '# spec\n', 'utf8');
  const unit = {
    unit_id: 'unit-1', files: [srcPath], spec_path: specPath, verification_path: null, target_system: 'DEV',
  };
  const unitPath = path.join(dir, 'unit.json');
  fs.writeFileSync(unitPath, JSON.stringify(unit, null, 2), 'utf8');

  // Capsule exists (integrity intact) but recordPass() was never called for it.
  const capsuleDir = path.join(dir, 'capsule');
  createCapsule({
    ...unit, policy_version: '1.0', schema_version: 'trackB-review-result-v1', reviewer_model: 'opus',
  }, capsuleDir);

  const recordFile = path.join(dir, 'record.jsonl');
  const result = runDeployGate({ unitPath, stateDir: dir, capsuleDir, deployCmd: deployCmdFor(recordFile) });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /NO_PASS_RECORD/);
  assert.ok(!fs.existsSync(recordFile));

  cleanup(dir);
});

test('capsule copy tampered after PASS -> exit 1 CAPSULE_TAMPERED, recorder never runs', () => {
  const dir = tmpDir('deploy-tamper-');
  const { unitPath, capsuleDir, stateDir } = setupPassedUnit(dir);
  const recordFile = path.join(dir, 'record.jsonl');

  // Corrupt the capsule's own copy (not the working tree) after the PASS record was issued.
  fs.writeFileSync(path.join(capsuleDir, 'files', '0', 'content'), 'TAMPERED', 'utf8');

  const result = runDeployGate({ unitPath, stateDir, capsuleDir, deployCmd: deployCmdFor(recordFile) });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /CAPSULE_TAMPERED/);
  assert.ok(!fs.existsSync(recordFile));

  cleanup(dir);
});

test('state.json corrupt -> exit 6, recorder never runs', () => {
  const dir = tmpDir('deploy-statecorrupt-');
  const { unitPath, capsuleDir, stateDir } = setupPassedUnit(dir);
  const recordFile = path.join(dir, 'record.jsonl');

  fs.writeFileSync(path.join(stateDir, 'state.json'), '{ not json', 'utf8');

  const result = runDeployGate({ unitPath, stateDir, capsuleDir, deployCmd: deployCmdFor(recordFile) });
  assert.strictEqual(result.status, 6);
  assert.ok(!fs.existsSync(recordFile));

  cleanup(dir);
});

test('deploy command returns exit 3 -> deploy-gate propagates exit 3 unchanged', () => {
  const dir = tmpDir('deploy-cmdfail-');
  const { unitPath, capsuleDir, stateDir } = setupPassedUnit(dir);
  const recordFile = path.join(dir, 'record.jsonl');

  const result = runDeployGate({ unitPath, stateDir, capsuleDir, deployCmd: deployCmdFor(recordFile, '3') });
  assert.strictEqual(result.status, 3, `stderr: ${result.stderr}`);
  assert.ok(fs.existsSync(recordFile), 'the deploy command did run before returning its own non-zero exit');

  cleanup(dir);
});
