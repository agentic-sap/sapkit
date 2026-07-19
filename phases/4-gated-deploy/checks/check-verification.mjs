#!/usr/bin/env node
// Machine gate for phases/4-gated-deploy verification.json (AC-14/AC-15 shape)
// usage: node check-verification.mjs red|green
import { readFileSync } from 'node:fs';

const mode = process.argv[2];
if (mode !== 'red' && mode !== 'green') { console.error('usage: red|green'); process.exit(2); }
const fail = (m) => { console.error('CHECK_FAIL: ' + m); process.exit(1); };

let v;
try { v = JSON.parse(readFileSync('phases/4-gated-deploy/state/verification.json', 'utf8')); }
catch (e) { fail('verification.json unreadable: ' + e.message); }

const mc = v.machine_checks || {};
for (const k of ['offline_lint', 'deploy_activation', 'unit_test', 'atc']) {
  if (!mc[k] || mc[k].exit !== 0) fail('machine_checks.' + k + ' missing or exit!=0');
}
if (mc.unit_test.failed !== 0) fail('unit_test.failed != 0');
if (!Array.isArray(v.uncovered_by_machine) || v.uncovered_by_machine.length < 2)
  fail('uncovered_by_machine must list >=2 entries (AC-14)');
const src = (v.server_evidence && v.server_evidence.vsp_source_read && v.server_evidence.vsp_source_read.content) || '';
if (src.length < 200) fail('server_evidence.vsp_source_read.content too short (AC-15)');
if (!src.includes('F_SKA1_KTP')) fail('server source lacks AUTHORITY-CHECK F_SKA1_KTP (spec req 2)');
const inner = /\bINNER\s+JOIN\b/i.test(src);
const left = /\bLEFT\s+OUTER\s+JOIN\b/i.test(src);
if (mode === 'red' && !(inner && !left)) fail('red expects INNER JOIN (and no LEFT OUTER JOIN) in server source');
if (mode === 'green' && !(left && !inner)) fail('green expects LEFT OUTER JOIN (and no INNER JOIN) in server source');
console.log('CHECK_OK verification(' + mode + ')');
