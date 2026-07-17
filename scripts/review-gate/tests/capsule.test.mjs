import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCapsule, verifyCapsule, CapsuleError } from '../capsule.mjs';

function writeFile(dir, name, content) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

function makeBaseUnit(dir, overrides = {}) {
  const srcPath = writeFile(dir, 'src.abap', 'REPORT z_test.\n');
  const specPath = writeFile(dir, 'spec.md', '# spec\n');
  return {
    unit_id: 'unit-1',
    files: [srcPath],
    spec_path: specPath,
    verification_path: null,
    policy_version: '1.0',
    schema_version: 'trackB-review-result-v1',
    reviewer_model: 'opus',
    target_system: 'DEV',
    ...overrides,
  };
}

function tmpBase(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('determinism: same input twice produces the same capsuleHash', () => {
  const base = tmpBase('capsule-det-');
  const unit = makeBaseUnit(base);
  const r1 = createCapsule(unit, path.join(base, 'capsule-a'));
  const r2 = createCapsule(unit, path.join(base, 'capsule-b'));
  assert.strictEqual(r1.capsuleHash, r2.capsuleHash);
  fs.rmSync(base, { recursive: true, force: true });
});

test('change detection: a 1-byte source change produces a different capsuleHash', () => {
  const base = tmpBase('capsule-chg-');
  const unit = makeBaseUnit(base);
  const r1 = createCapsule(unit, path.join(base, 'capsule-a'));
  fs.writeFileSync(unit.files[0], 'REPORT z_test2.\n');
  const r2 = createCapsule(unit, path.join(base, 'capsule-b'));
  assert.notStrictEqual(r1.capsuleHash, r2.capsuleHash);
  fs.rmSync(base, { recursive: true, force: true });
});

test('meta detection: policy_version-only change produces a different capsuleHash', () => {
  const base = tmpBase('capsule-meta-');
  const unit = makeBaseUnit(base);
  const r1 = createCapsule(unit, path.join(base, 'capsule-a'));
  const unit2 = { ...unit, policy_version: '2.0' };
  const r2 = createCapsule(unit2, path.join(base, 'capsule-b'));
  assert.notStrictEqual(r1.capsuleHash, r2.capsuleHash);
  fs.rmSync(base, { recursive: true, force: true });
});

test('AC-12: a missing file in files[] throws CapsuleError(INCOMPLETE)', () => {
  const base = tmpBase('capsule-missing-');
  const unit = makeBaseUnit(base, { files: [path.join(base, 'does-not-exist.abap')] });
  assert.throws(
    () => createCapsule(unit, path.join(base, 'capsule-a')),
    (err) => err instanceof CapsuleError && err.code === 'INCOMPLETE',
  );
  fs.rmSync(base, { recursive: true, force: true });
});

test('AC-12: an empty (0-byte) file in files[] throws CapsuleError(INCOMPLETE)', () => {
  const base = tmpBase('capsule-empty-');
  const emptyPath = writeFile(base, 'empty.abap', '');
  const unit = makeBaseUnit(base, { files: [emptyPath] });
  assert.throws(
    () => createCapsule(unit, path.join(base, 'capsule-a')),
    (err) => err instanceof CapsuleError && err.code === 'INCOMPLETE',
  );
  fs.rmSync(base, { recursive: true, force: true });
});

test('tamper detection: editing a capsule copy makes verifyCapsule().ok === false', () => {
  const base = tmpBase('capsule-tamper-');
  const unit = makeBaseUnit(base);
  const capsuleDir = path.join(base, 'capsule-a');
  const created = createCapsule(unit, capsuleDir);

  const before = verifyCapsule(capsuleDir);
  assert.strictEqual(before.ok, true);
  assert.strictEqual(before.capsuleHash, created.capsuleHash);

  const copyPath = path.join(capsuleDir, 'files', '0', 'content');
  fs.writeFileSync(copyPath, 'TAMPERED\n');

  const after = verifyCapsule(capsuleDir);
  assert.strictEqual(after.ok, false);
  assert.ok(after.mismatches.length > 0);
  fs.rmSync(base, { recursive: true, force: true });
});

test('manifest contains all required fields (spec §3.4), including a non-null verification slot', () => {
  const base = tmpBase('capsule-fields-');
  const verificationPath = writeFile(base, 'verification.json', '{"result":"PASS"}');
  const unit = makeBaseUnit(base, { verification_path: verificationPath });
  const { manifest } = createCapsule(unit, path.join(base, 'capsule-a'));

  const requiredKeys = [
    'unit_id', 'files', 'spec_path', 'spec_sha256',
    'verification_path', 'verification_sha256',
    'policy_version', 'schema_version', 'reviewer_model', 'target_system',
  ];
  for (const key of requiredKeys) {
    assert.ok(Object.prototype.hasOwnProperty.call(manifest, key), `missing key: ${key}`);
  }
  assert.ok(Array.isArray(manifest.files));
  assert.strictEqual(manifest.files.length, 1);
  assert.ok('path' in manifest.files[0]);
  assert.ok('sha256' in manifest.files[0]);
  assert.strictEqual(manifest.verification_path, verificationPath);
  assert.strictEqual(typeof manifest.verification_sha256, 'string');
  fs.rmSync(base, { recursive: true, force: true });
});
