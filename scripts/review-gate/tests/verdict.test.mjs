import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateResult, evaluate, exitFor } from '../verdict.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'schemas', 'review-result.schema.json'), 'utf8'),
);

const SHA = '0123456789abcdef'.repeat(4); // 64 lowercase hex chars — fixture stand-in

function finding(overrides = {}) {
  return {
    bucket: 'B2',
    severity: 'MAJOR',
    object: 'ZFOO',
    finding: 'INNER JOIN used where spec requires LEFT JOIN',
    ...overrides,
  };
}

function result(overrides = {}) {
  return {
    reviewed_spec_sha256: SHA,
    verdict: 'PASS',
    findings: [],
    ...overrides,
  };
}

// AC-1: MAJOR (and BLOCKER, same severity-or-above rule) -> FAIL, exit 1.
test('AC-1: a MAJOR finding classifies FAIL, exitFor 1', () => {
  const r = evaluate(JSON.stringify(result({ verdict: 'FAIL', findings: [finding({ severity: 'MAJOR' })] })), schema);
  assert.strictEqual(r.classification, 'FAIL');
  assert.strictEqual(r.maxSeverity, 'MAJOR');
  assert.strictEqual(exitFor(r.classification), 1);
});

test('AC-1: a BLOCKER finding also classifies FAIL (same as MAJOR-or-above)', () => {
  const r = evaluate(JSON.stringify(result({ verdict: 'FAIL', findings: [finding({ severity: 'BLOCKER' })] })), schema);
  assert.strictEqual(r.classification, 'FAIL');
  assert.strictEqual(r.maxSeverity, 'BLOCKER');
  assert.strictEqual(exitFor(r.classification), 1);
});

// AC-2: MINOR only -> PASS, exit 0, findings preserved in the return value.
test('AC-2: MINOR-only findings classify PASS, exitFor 0, findings preserved', () => {
  const minorFinding = finding({ severity: 'MINOR', finding: 'naming convention deviation' });
  const r = evaluate(JSON.stringify(result({ verdict: 'PASS', findings: [minorFinding] })), schema);
  assert.strictEqual(r.classification, 'PASS');
  assert.strictEqual(exitFor(r.classification), 0);
  assert.deepStrictEqual(r.findings, [minorFinding]);
});

test('AC-2: zero findings also classifies PASS', () => {
  const r = evaluate(JSON.stringify(result({ verdict: 'PASS', findings: [] })), schema);
  assert.strictEqual(r.classification, 'PASS');
  assert.strictEqual(exitFor(r.classification), 0);
});

// AC-3: empty string / non-JSON / missing required field -> MALFORMED, exit 2.
test('AC-3: empty string input is MALFORMED, exitFor 2', () => {
  const r = evaluate('', schema);
  assert.strictEqual(r.classification, 'MALFORMED');
  assert.strictEqual(exitFor(r.classification), 2);
});

test('AC-3: non-JSON text input is MALFORMED, exitFor 2', () => {
  const r = evaluate('this is not { json', schema);
  assert.strictEqual(r.classification, 'MALFORMED');
  assert.strictEqual(exitFor(r.classification), 2);
});

test('AC-3: JSON missing a required field (findings) is MALFORMED, exitFor 2', () => {
  const bad = { reviewed_spec_sha256: SHA, verdict: 'PASS' }; // no findings
  const r = evaluate(JSON.stringify(bad), schema);
  assert.strictEqual(r.classification, 'MALFORMED');
  assert.strictEqual(exitFor(r.classification), 2);
});

// AC-11: reviewer's own verdict field contradicts the computed classification.
test('AC-11: verdict=PASS with a MAJOR finding is MALFORMED (deterministic calc wins)', () => {
  const r = evaluate(JSON.stringify(result({ verdict: 'PASS', findings: [finding({ severity: 'MAJOR' })] })), schema);
  assert.strictEqual(r.classification, 'MALFORMED');
  assert.strictEqual(exitFor(r.classification), 2);
});

// Unknown severity value -> MALFORMED (not silently ignored, not crashed on).
test('unknown severity value is MALFORMED, exitFor 2', () => {
  const r = evaluate(JSON.stringify(result({ verdict: 'FAIL', findings: [finding({ severity: 'CRITICAL-ISH' })] })), schema);
  assert.strictEqual(r.classification, 'MALFORMED');
  assert.strictEqual(exitFor(r.classification), 2);
});

// insufficient_context declaration short-circuits severity-based classification.
test('insufficient_context: true classifies INSUFFICIENT_CONTEXT, exitFor 3', () => {
  const withCtx = result({ verdict: 'FAIL', findings: [finding({ severity: 'MAJOR' })], insufficient_context: true });
  const r = evaluate(JSON.stringify(withCtx), schema);
  assert.strictEqual(r.classification, 'INSUFFICIENT_CONTEXT');
  assert.strictEqual(exitFor(r.classification), 3);
});

// exitFor: full §3.1 mapping, including classifications evaluate() itself never produces.
test('exitFor maps the full §3.1 table', () => {
  assert.strictEqual(exitFor('PASS'), 0);
  assert.strictEqual(exitFor('FAIL'), 1);
  assert.strictEqual(exitFor('MALFORMED'), 2);
  assert.strictEqual(exitFor('INSUFFICIENT_CONTEXT'), 3);
  assert.strictEqual(exitFor('TIMEOUT'), 4);
  assert.strictEqual(exitFor('INFRA_ERROR'), 5);
  assert.strictEqual(exitFor('INTERNAL_ERROR'), 6);
  assert.strictEqual(exitFor('BLOCKED'), 7);
  assert.throws(() => exitFor('NOT_A_REAL_CLASSIFICATION'));
});

// validateResult: exercised directly too, since evaluate() only exposes it indirectly.
test('validateResult: valid object against the ported schema has zero violations', () => {
  const violations = validateResult(result({ findings: [finding()] }), schema);
  assert.deepStrictEqual(violations, []);
});

test('validateResult: missing required top-level field is reported', () => {
  const violations = validateResult({ verdict: 'PASS', findings: [] }, schema);
  assert.ok(violations.some((v) => v.includes('reviewed_spec_sha256')));
});

test('validateResult: unknown bucket value is reported', () => {
  const violations = validateResult(result({ findings: [finding({ bucket: 'B99' })] }), schema);
  assert.ok(violations.some((v) => v.includes('bucket')));
});
