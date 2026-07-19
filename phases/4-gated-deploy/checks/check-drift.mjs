#!/usr/bin/env node
// Drift-demonstration gate: the out-of-band marker must appear in the drifted
// server read, be absent after restore, and the restored source must be green.
// usage: node check-drift.mjs <drifted-read.txt> <restored-read.txt>
import { readFileSync } from 'node:fs';

const fail = (m) => { console.error('CHECK_FAIL: ' + m); process.exit(1); };
const [driftedPath, restoredPath] = process.argv.slice(2);
if (!driftedPath || !restoredPath) { console.error('usage: <drifted> <restored>'); process.exit(2); }

let ev;
try { ev = JSON.parse(readFileSync('phases/4-gated-deploy/state/drift-evidence.json', 'utf8')); }
catch (e) { fail('drift-evidence.json unreadable: ' + e.message); }
if (ev.drift_detected !== true) fail('drift_detected must be true');
if (typeof ev.marker !== 'string' || ev.marker.length < 8) fail('marker missing/too short');
if (!ev.out_of_band_channel || !/UpdateProgram/i.test(ev.out_of_band_channel)) fail('out_of_band_channel must record the MCP channel');

const drifted = readFileSync(driftedPath, 'utf8');
if (!drifted.includes(ev.marker)) fail('drifted server read lacks the marker (drift not demonstrated)');
const restored = readFileSync(restoredPath, 'utf8');
if (restored.includes(ev.marker)) fail('restored server read still contains the marker (restore incomplete)');
if (!/\bLEFT\s+OUTER\s+JOIN\b/i.test(restored)) fail('restored source is not the green version');
if (!restored.includes('F_SKA1_KTP')) fail('restored source lacks AUTHORITY-CHECK');
console.log('CHECK_OK drift-demonstration');
