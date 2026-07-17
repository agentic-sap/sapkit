// Live-spike evidence checker (phase 3-review-gate step 5, Part C).
//
// Usage: node scripts/review-gate/tests/spike.mjs --check <evidence.json>
//   (run from the repo root — relative paths inside the evidence file,
//    e.g. part_a.verdict_file, are resolved against process.cwd())
//
// Machine checks (Task Part C-2 — existence checks alone cannot pass):
//   1. part_a.ok === true AND part_b.ok === true
//   2. part_a.verdict_file exists AND parses AND passes validateResult()
//      against the ported trackB review-result schema
//   3. part_b.refusal_marker is a non-empty string
//   4. the raw evidence file contains no credential patterns
//      (passw / secret / SAP_PASS / Authorization — case-insensitive)
// Any violation -> exit 1 with reasons; all pass -> exit 0.
//
// Node built-ins only — no dependencies (PLANNING §1-1).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateResult } from '../verdict.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, '..', 'schemas', 'review-result.schema.json');

const CREDENTIAL_PATTERNS = [/passw/i, /secret/i, /sap_pass/i, /authorization/i];

function fail(reasons) {
  for (const r of reasons) process.stderr.write(`spike check FAIL: ${r}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const checkIdx = args.indexOf('--check');
if (checkIdx === -1 || !args[checkIdx + 1]) {
  process.stderr.write('usage: spike.mjs --check <evidence.json>\n');
  process.exit(1);
}
const evidencePath = args[checkIdx + 1];

let rawText;
try {
  rawText = fs.readFileSync(evidencePath, 'utf8');
} catch (err) {
  fail([`evidence file unreadable (${evidencePath}): ${err.message}`]);
}

let evidence;
try {
  evidence = JSON.parse(rawText);
} catch (err) {
  fail([`evidence file is not valid JSON: ${err.message}`]);
}

const reasons = [];

// Check 1 — both parts must report ok:true.
if (!evidence.part_a || evidence.part_a.ok !== true) {
  reasons.push('part_a.ok is not true');
}
if (!evidence.part_b || evidence.part_b.ok !== true) {
  reasons.push('part_b.ok is not true');
}

// Check 2 — verdict_file exists and passes the ported result schema.
const verdictFile = evidence.part_a && evidence.part_a.verdict_file;
if (typeof verdictFile !== 'string' || verdictFile.length === 0) {
  reasons.push('part_a.verdict_file missing');
} else {
  const resolved = path.resolve(process.cwd(), verdictFile);
  if (!fs.existsSync(resolved)) {
    reasons.push(`verdict_file does not exist: ${resolved}`);
  } else {
    try {
      const verdictObj = JSON.parse(fs.readFileSync(resolved, 'utf8'));
      const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
      const violations = validateResult(verdictObj, schema);
      if (violations.length > 0) {
        reasons.push(`verdict_file fails schema validation: ${violations.join('; ')}`);
      }
    } catch (err) {
      reasons.push(`verdict_file unreadable/unparsable: ${err.message}`);
    }
  }
}

// Check 3 — refusal marker recorded.
const marker = evidence.part_b && evidence.part_b.refusal_marker;
if (typeof marker !== 'string' || marker.trim().length === 0) {
  reasons.push('part_b.refusal_marker is empty');
}

// Check 4 — no credential patterns anywhere in the evidence file.
for (const pattern of CREDENTIAL_PATTERNS) {
  if (pattern.test(rawText)) {
    reasons.push(`credential pattern found in evidence file: ${pattern}`);
  }
}

if (reasons.length > 0) fail(reasons);
process.stdout.write('spike check PASS\n');
process.exit(0);
