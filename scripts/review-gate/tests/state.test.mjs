import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadState,
  saveState,
  getCachedVerdict,
  recordVerdict,
  revisionCount,
  isBlocked,
  markBlocked,
  recordPass,
  InternalError,
} from '../state.mjs';

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('AC-5: FAIL recorded then cache hit; re-recording the same hash does not grow revisionCount', () => {
  const dir = tmpDir('state-ac5-');
  let state = loadState(dir);

  state = recordVerdict(dir, state, 'hash-a', 'FAIL');
  const cached = getCachedVerdict(state, 'hash-a');
  assert.strictEqual(cached.classification, 'FAIL');
  assert.strictEqual(typeof cached.at, 'string');
  assert.strictEqual(revisionCount(state), 1);

  state = recordVerdict(dir, state, 'hash-a', 'FAIL');
  assert.strictEqual(revisionCount(state), 1);

  cleanup(dir);
});

test('AC-6: three distinct FAIL hashes trip isBlocked at limit 3; two do not', () => {
  const dir = tmpDir('state-ac6-');
  const limits = { revision_limit: 3 };
  let state = loadState(dir);

  state = recordVerdict(dir, state, 'h1', 'FAIL');
  state = recordVerdict(dir, state, 'h2', 'FAIL');
  assert.strictEqual(isBlocked(state, limits), false);

  state = recordVerdict(dir, state, 'h3', 'FAIL');
  assert.strictEqual(isBlocked(state, limits), true);

  cleanup(dir);
});

test('AC-9: TIMEOUT/INFRA_ERROR/INTERNAL_ERROR do not count as revisions, only bump infra_retries', () => {
  const dir = tmpDir('state-ac9-');
  let state = loadState(dir);

  state = recordVerdict(dir, state, 'h1', 'TIMEOUT');
  state = recordVerdict(dir, state, 'h2', 'INFRA_ERROR');
  state = recordVerdict(dir, state, 'h3', 'INTERNAL_ERROR');

  assert.strictEqual(revisionCount(state), 0);
  assert.strictEqual(state.infra_retries, 3);
  assert.deepStrictEqual(state.fail_revisions, []);

  cleanup(dir);
});

test('AC-13: corrupt state.json makes loadState throw InternalError (fail-closed, no silent reset)', () => {
  const dir = tmpDir('state-ac13-');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json'), '{ not valid json', 'utf8');

  assert.throws(
    () => loadState(dir),
    (err) => err instanceof InternalError && err.code === 'INTERNAL_ERROR',
  );

  cleanup(dir);
});

test('run-scoped: records written to stateDir A are not visible from stateDir B', () => {
  const dirA = tmpDir('state-scope-a-');
  const dirB = tmpDir('state-scope-b-');

  let stateA = loadState(dirA);
  stateA = recordVerdict(dirA, stateA, 'hash-x', 'FAIL');

  const stateB = loadState(dirB);
  assert.strictEqual(getCachedVerdict(stateB, 'hash-x'), null);
  assert.strictEqual(revisionCount(stateB), 0);

  cleanup(dirA);
  cleanup(dirB);
});

test('atomicity: saveState leaves no leftover tmp file, and a reload matches the saved content', () => {
  const dir = tmpDir('state-atomic-');
  let state = loadState(dir);
  state = recordVerdict(dir, state, 'hash-a', 'FAIL');
  state = markBlocked(dir, state);

  const entries = fs.readdirSync(dir);
  const leftovers = entries.filter((f) => f.includes('.tmp'));
  assert.deepStrictEqual(leftovers, []);
  assert.ok(entries.includes('state.json'));

  const reloaded = loadState(dir);
  assert.deepStrictEqual(reloaded, state);

  cleanup(dir);
});

test('PASS record round trip: recordPass then reload preserves all record fields', () => {
  const dir = tmpDir('state-pass-');
  let state = loadState(dir);
  const record = {
    verdict_file: 'verdict.json',
    model: 'opus',
    policy_version: '1.0',
    schema_version: 'trackB-review-result-v1',
    duration_ms: 4321,
    at: '2026-07-17T12:00:00.000Z',
  };

  state = recordPass(dir, state, 'hash-pass', record);
  const reloaded = loadState(dir);
  assert.deepStrictEqual(reloaded.pass_records['hash-pass'], record);

  cleanup(dir);
});
