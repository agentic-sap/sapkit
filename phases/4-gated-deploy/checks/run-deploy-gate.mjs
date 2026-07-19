#!/usr/bin/env node
// S3 verify wrapper: resolves the PASS capsule hash from state.json and runs
// deploy-gate with it. Exists because the engine executes verify strings via
// cmd.exe (shell=True), where the doubly-nested quoting needed to inline this
// hash lookup in PowerShell breaks with a ParserError (run halted and resumed
// 2026-07-19 — see PLANNING.md §8). A bare `node <script>` verify needs no
// nested quoting at all.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const PHASE = 'phases/4-gated-deploy';
let hash = '';
try {
  const st = JSON.parse(readFileSync(PHASE + '/state/state.json', 'utf8'));
  hash = Object.keys(st.pass_records || {})[0] || '';
} catch (e) {
  console.error('STATE_UNREADABLE: ' + e.message);
  process.exit(1);
}
if (!hash) {
  console.error('NO_PASS_RECORD');
  process.exit(1);
}
// --capsule MUST be absolute: deploy-gate substitutes {file} with
// <capsuleDir>/files/<i>/<basename> and spawns the deploy command with
// cwd=scripts/review-gate, so a repo-relative capsule path would make vsp
// resolve the file against that cwd and fail (reproduced 2026-07-19 —
// PLANNING.md §8).
const r = spawnSync('node', [
  'scripts/review-gate/deploy-gate.mjs',
  '--unit', resolve(PHASE + '/unit.json'),
  '--state', resolve(PHASE + '/state'),
  '--capsule', resolve(PHASE + '/state/capsules/' + hash),
  '--deploy-cmd', 'node deploy-shim.mjs {file}',
], { stdio: 'inherit' });
process.exit(r.status ?? 6);
