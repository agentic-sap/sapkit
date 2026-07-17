// Deploy gate — the backend write wrapper that runs the actual deploy
// command (spec §4.1 step 7, PLANNING §3, phases/3-review-gate/index.json
// step 4 Task §1). It never decides PASS/FAIL itself; it only enforces the
// 3-way binding check between a PASS record (step 3), an intact review
// capsule (step 0), and the current working tree, then deploys from the
// capsule copies — never the working tree — closing the TOCTOU window
// between review and deploy (spec §4.0).
//
// Usage:
//   node deploy-gate.mjs --unit <unit.json> --state <stateDir>
//     --capsule <capsuleDir> --deploy-cmd "<template with {file}>"
//
// Exit codes (PLANNING §3.1):
//   0  deploy performed (every file's deploy command exited 0)
//   1  binding mismatch (CAPSULE_TAMPERED / NO_PASS_RECORD / WORKTREE_DRIFT,
//      printed to stderr) OR a per-file deploy command's own non-zero exit,
//      propagated unchanged
//   6  top-level catch-all (corrupt state.json, unreadable manifest, etc.)
//
// Node built-ins only — no dependencies (PLANNING §1-1).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyCapsule } from './capsule.mjs';
import { loadState } from './state.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--unit') args.unit = argv[i += 1];
    else if (argv[i] === '--state') args.state = argv[i += 1];
    else if (argv[i] === '--capsule') args.capsule = argv[i += 1];
    else if (argv[i] === '--deploy-cmd') args.deployCmd = argv[i += 1];
  }
  if (!args.unit || !args.state || !args.capsule || !args.deployCmd) {
    throw new Error('usage: deploy-gate.mjs --unit <unit.json> --state <stateDir> --capsule <capsuleDir> --deploy-cmd "<template>"');
  }
  return args;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function sha256OfFile(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function denyBinding(reasonCode, detail) {
  process.stderr.write(`deploy-gate: ${reasonCode}${detail ? ` — ${detail}` : ''}\n`);
  process.exit(1);
}

function main() {
  const {
    unit: unitPath, state: stateDir, capsule: capsuleDir, deployCmd,
  } = parseArgs(process.argv.slice(2));

  // Check 1: state.json must be readable — corrupt state falls through to
  // the top-level catch below (exit 6).
  const state = loadState(stateDir);

  // Check 2: the capsule's own copies must still match its recorded
  // manifest hashes (spec §4.1 step 7 — capsule integrity).
  const verification = verifyCapsule(capsuleDir);
  if (!verification.ok) {
    denyBinding('CAPSULE_TAMPERED', verification.mismatches.join('; '));
    return;
  }
  const { capsuleHash } = verification;

  // Check 3: a PASS record must exist for this exact capsule hash.
  const passRecord = state.pass_records[capsuleHash];
  if (!passRecord) {
    denyBinding('NO_PASS_RECORD', `no PASS record for capsule hash ${capsuleHash}`);
    return;
  }

  // Check 4: every unit file, as it exists right now in the working tree,
  // must still match the hash the capsule sealed at review time (spec §4.0 —
  // the TOCTOU window between review and deploy must not be exploitable).
  const manifest = loadJson(path.join(capsuleDir, 'manifest.json'));
  const rawUnit = loadJson(unitPath);
  const files = rawUnit.files || [];
  const manifestIndexByPath = new Map(manifest.files.map((entry, idx) => [entry.path, idx]));

  const drifted = [];
  const targets = [];
  for (const filePath of files) {
    const idx = manifestIndexByPath.get(filePath);
    if (idx === undefined) { drifted.push(filePath); continue; }
    let currentHash;
    try {
      currentHash = sha256OfFile(filePath);
    } catch {
      drifted.push(filePath);
      continue;
    }
    if (currentHash !== manifest.files[idx].sha256) {
      drifted.push(filePath);
      continue;
    }
    targets.push(path.join(capsuleDir, 'files', String(idx), 'content'));
  }
  if (drifted.length > 0) {
    denyBinding('WORKTREE_DRIFT', drifted.join(', '));
    return;
  }

  // All three checks passed — deploy from the capsule copies (never the
  // working tree), one invocation per file, substituting {file} in the
  // template. The deploy command is spawned with this script's own
  // directory as cwd so relative template tokens resolve deterministically
  // (spec §4.0 capsule-only deploy; §4.1 step 7).
  for (const capsuleFilePath of targets) {
    const tokens = deployCmd.trim().split(/\s+/).map((t) => t.replace(/\{file\}/g, capsuleFilePath));
    const [cmd, ...cmdArgs] = tokens;
    const result = spawnSync(cmd, cmdArgs, { cwd: __dirname, encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exit(result.status);
      return;
    }
  }

  process.exit(0);
}

try {
  main();
} catch (err) {
  process.stderr.write(`deploy-gate: ${(err && err.stack) || err}\n`);
  process.exit(6);
}
