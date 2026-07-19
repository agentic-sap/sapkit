#!/usr/bin/env node
// Final phase gate: AC-8 (gate blocked a machine-green defect, then passed the
// fix), AC-14 (uncovered types listed), AC-15 (server evidence embedded),
// drift demonstrated — all machine-checkable from run state files.
import { readFileSync, readdirSync } from 'node:fs';

const fail = (m) => { console.error('CHECK_FAIL: ' + m); process.exit(1); };
const STATE = 'phases/4-gated-deploy/state';

let st;
try { st = JSON.parse(readFileSync(STATE + '/state.json', 'utf8')); }
catch (e) { fail('state.json unreadable: ' + e.message); }
const passHashes = Object.keys(st.pass_records || {});
if (passHashes.length < 1) fail('no PASS record (AC-8 green half missing)');

const verdictFiles = readdirSync(STATE).filter((f) => /^verdict-.*\.json$/.test(f));
let failVerdicts = 0, passVerdicts = 0, majorB2 = 0;
for (const f of verdictFiles) {
  const v = JSON.parse(readFileSync(STATE + '/' + f, 'utf8'));
  // verdict files use `classification` (review-gate.mjs writeVerdictFile),
  // not `verdict` — fixed mid-run 2026-07-19 after the step-6 worker isolated
  // the field-name mismatch (PLANNING §8); schema pinned by
  // tests/check-phase-evidence.test.mjs.
  if (v.classification === 'FAIL') {
    failVerdicts++;
    for (const fd of v.findings || [])
      if (fd.severity === 'MAJOR' && fd.bucket === 'B2') majorB2++;
  }
  if (v.classification === 'PASS') passVerdicts++;
}
if (failVerdicts < 1) fail('no FAIL verdict recorded (AC-8 red half missing)');
if (majorB2 < 1) fail('no MAJOR/B2 finding in FAIL verdicts (defect class mismatch)');
if (passVerdicts < 1) fail('no PASS verdict recorded');

let ev;
try { ev = JSON.parse(readFileSync(STATE + '/phase3-evidence.json', 'utf8')); }
catch (e) { fail('phase3-evidence.json unreadable: ' + e.message); }
if (!ev.ac8 || ev.ac8.red_capsule_hash === ev.ac8.green_capsule_hash) fail('ac8 hashes must differ');
if (!passHashes.includes(ev.ac8.green_capsule_hash)) fail('ac8.green_capsule_hash not in pass_records');
if (!ev.ac14 || !(ev.ac14.uncovered_count >= 2)) fail('ac14.uncovered_count must be >=2');
if (!ev.ac15 || ev.ac15.server_evidence_embedded !== true) fail('ac15.server_evidence_embedded must be true');
if (!ev.drift || ev.drift.drift_detected !== true) fail('drift.drift_detected must be true');
for (const probe of ['transport_readonly', 'atc_error_exit', 'clas_include_deploy'])
  if (!ev.probes || typeof ev.probes[probe] !== 'string' || ev.probes[probe].length < 5)
    fail('probes.' + probe + ' must record an outcome string');
if (!ev.chain || ev.chain.full_chain_green !== true) fail('chain.full_chain_green must be true');
console.log('CHECK_OK phase3-evidence');
