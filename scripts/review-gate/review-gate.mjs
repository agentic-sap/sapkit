// Review gate — main CLI. Assembles capsule.mjs (step 0) + verdict.mjs (step
// 1) + state.mjs (step 2) + reviewer.mjs (this step) into the review-gate
// verify command a phase-3 review step runs before every SAP write (spec
// §4.1/§4.2/§4.3, PLANNING §3, phases/3-review-gate/index.json step 3 Task
// §2).
//
// Usage: node review-gate.mjs --unit <unit.json> --state <stateDir> --config <config.json>
//
// Exit codes — §3.1 table, via verdict.exitFor(): 0 PASS / 1 FAIL / 2
// MALFORMED / 3 INSUFFICIENT_CONTEXT / 4 TIMEOUT / 5 INFRA_ERROR /
// 6 INTERNAL_ERROR (also the catch-all for any unexpected exception,
// including capsule.mjs's CapsuleError(INCOMPLETE)) / 7 BLOCKED.
//
// Node built-ins only — no dependencies (PLANNING §1-1).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCapsule } from './capsule.mjs';
import { evaluate, exitFor } from './verdict.mjs';
import {
  loadState, getCachedVerdict, recordVerdict, isBlocked, markBlocked, recordPass,
} from './state.mjs';
import { runReviewer } from './reviewer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--unit') args.unit = argv[i += 1];
    else if (argv[i] === '--state') args.state = argv[i += 1];
    else if (argv[i] === '--config') args.config = argv[i += 1];
  }
  if (!args.unit || !args.state || !args.config) {
    throw new Error('usage: review-gate.mjs --unit <unit.json> --state <stateDir> --config <config.json>');
  }
  return args;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Builds the capsule.mjs `unit` input: unit-specific fields (which files,
// which spec, which target system) come from unit.json; policy/schema/model
// fields come from config.json, the single source of truth for the
// currently-active reviewer policy (so a config change alone changes the
// capsule hash, per spec §4.0).
function buildCapsuleUnit(rawUnit, config) {
  return {
    unit_id: rawUnit.unit_id,
    files: rawUnit.files || [],
    spec_path: rawUnit.spec_path,
    verification_path: rawUnit.verification_path ?? null,
    policy_version: config.policy_version,
    // spec §4.0: the reviewer prompt template version is part of the capsule
    // hash, so editing the prompt (and bumping prompt_version) invalidates
    // stale PASS/FAIL cache entries — same discipline as policy_version.
    prompt_version: config.prompt_version,
    schema_version: config.schema_version,
    reviewer_model: config.reviewer.model,
    target_system: rawUnit.target_system,
  };
}

// Persists a freshly-created capsule under a hash-keyed directory so later
// tooling (deploy-gate.mjs, step 4) can relocate the exact capsule a PASS
// record was issued for. If a capsule with this hash already exists (e.g.
// unchanged source re-submitted), the fresh copy is discarded in favor of
// the persisted one — content-identical by construction of the hash.
function persistCapsule(tmpCapsuleDir, capsulesRoot, capsuleHash) {
  const finalDir = path.join(capsulesRoot, capsuleHash);
  if (fs.existsSync(finalDir)) {
    fs.rmSync(tmpCapsuleDir, { recursive: true, force: true });
    return finalDir;
  }
  fs.renameSync(tmpCapsuleDir, finalDir);
  return finalDir;
}

function writeVerdictFile(stateDir, capsuleHash, verdict) {
  const verdictPath = path.join(stateDir, `verdict-${capsuleHash}.json`);
  const payload = {
    capsule_hash: capsuleHash,
    classification: verdict.classification,
    max_severity: verdict.maxSeverity,
    findings: verdict.findings,
    violations: verdict.violations,
  };
  fs.writeFileSync(verdictPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return verdictPath;
}

async function main() {
  const { unit: unitPath, state: stateDir, config: configPath } = parseArgs(process.argv.slice(2));
  const config = loadJson(configPath);
  const schema = loadJson(path.join(__dirname, 'schemas', 'review-result.schema.json'));

  let state = loadState(stateDir);

  // Step 1 (spec §4.2): already blocked -> fail-fast, no capsule, no spawn.
  if (isBlocked(state, config.limits)) {
    process.exit(exitFor('BLOCKED'));
    return;
  }

  // Step 1b (spec §4.3): once the infra-retry budget is spent, fail-fast
  // without spawning. This caps the infra portion of the hard budget
  // (reviewer spawns per unit <= revision_limit + infra_retry_limit) so
  // repeated TIMEOUT/INFRA_ERROR/INTERNAL_ERROR cannot burn the whole engine
  // retry allowance. The ULTIMATE stop stays delegated to the engine's
  // step/run timeout; this is the wrapper-side sub-cap, symmetric with the
  // revision BLOCKED check above.
  if (state.infra_retries >= config.limits.infra_retry_limit) {
    process.stderr.write(`review-gate: INFRA_BUDGET_EXHAUSTED (infra_retries=${state.infra_retries} >= ${config.limits.infra_retry_limit})\n`);
    process.exit(exitFor('INFRA_ERROR'));
    return;
  }

  // Step 2 (spec §4.0): build the capsule. CapsuleError(INCOMPLETE) falls
  // through to the top-level catch below -> exit 6.
  const rawUnit = loadJson(unitPath);
  const unit = buildCapsuleUnit(rawUnit, config);
  const tmpCapsuleDir = path.join(stateDir, 'capsules', `.tmp-${process.pid}-${Date.now()}`);
  const { capsuleHash } = createCapsule(unit, tmpCapsuleDir);
  const capsuleDir = persistCapsule(tmpCapsuleDir, path.join(stateDir, 'capsules'), capsuleHash);

  // Step 3 (spec §4.1-3): cache hit -> reviewer never spawns.
  const cached = getCachedVerdict(state, capsuleHash);
  if (cached) {
    process.exit(exitFor(cached.classification));
    return;
  }

  // Step 4: spawn the reviewer. Give it a run-scoped scratch cwd OUTSIDE the
  // capsule so its session logs never pollute the immutable capsule (spec
  // §4.0); the capsule path reaches the reviewer via the {capsule} token in
  // config.reviewer.command (reviewer.mjs).
  const reviewerCwd = path.join(stateDir, 'reviewer-cwd');
  fs.mkdirSync(reviewerCwd, { recursive: true });
  const startedAt = Date.now();
  const outcome = await runReviewer({ capsuleDir, config, cwd: reviewerCwd });
  const durationMs = Date.now() - startedAt;

  if (outcome.type === 'timeout') {
    state = recordVerdict(stateDir, state, capsuleHash, 'TIMEOUT');
    process.exit(exitFor('TIMEOUT'));
    return;
  }
  if (outcome.type === 'spawn_error') {
    state = recordVerdict(stateDir, state, capsuleHash, 'INFRA_ERROR');
    process.exit(exitFor('INFRA_ERROR'));
    return;
  }

  // Step 5 (spec §4.1-5): deterministic verdict from stdout.
  const verdict = evaluate(outcome.stdout, schema);
  state = recordVerdict(stateDir, state, capsuleHash, verdict.classification);

  // Step 6: PASS -> verdict file + PASS record.
  if (verdict.classification === 'PASS') {
    const verdictFile = writeVerdictFile(stateDir, capsuleHash, verdict);
    recordPass(stateDir, state, capsuleHash, {
      verdict_file: verdictFile,
      model: config.reviewer.model,
      // spec §5-11 reproducibility record: model id, prompt template version,
      // schema version, duration, tokens (when available).
      prompt_version: config.prompt_version,
      policy_version: config.policy_version,
      schema_version: config.schema_version,
      duration_ms: durationMs,
      // The reviewer runs as `claude -p --output-format text`, which returns
      // only the raw verdict text — no token accounting is available in that
      // form (switching to a usage-bearing output format would break the
      // raw-JSON parsing contract of verdict.evaluate). Recorded as null so
      // the audit record shape stays stable and a future usage-bearing
      // reviewer form can populate it, per spec §5-11 "토큰(가용 시)".
      tokens: null,
      at: new Date().toISOString(),
    });
    process.exit(exitFor('PASS'));
    return;
  }

  // Step 7: FAIL -> verdict file (findings for the retry's worker) -> BLOCKED
  // once the revision limit is reached, else plain FAIL.
  if (verdict.classification === 'FAIL') {
    writeVerdictFile(stateDir, capsuleHash, verdict);
    if (isBlocked(state, config.limits)) {
      markBlocked(stateDir, state);
      process.exit(exitFor('BLOCKED'));
      return;
    }
    process.exit(exitFor('FAIL'));
    return;
  }

  // MALFORMED / INSUFFICIENT_CONTEXT — deterministic exit only; Task §2
  // steps 6-7 prescribe a stored verdict file for PASS/FAIL specifically.
  process.exit(exitFor(verdict.classification));
}

// Step 8: every unexpected exception (CapsuleError INCOMPLETE, InternalError
// from a corrupt state.json, anything else) -> exit 6, INTERNAL_ERROR
// catch-all (spec §4.3).
main().catch((err) => {
  process.stderr.write(`review-gate: ${(err && err.stack) || err}\n`);
  process.exit(6);
});
