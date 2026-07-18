// Review gate state: cache of prior verdicts by capsule hash, unique-FAIL-hash
// revision counting, infra-retry counting, BLOCKED marker, and PASS records
// (spec §3.5, §4.2, §4.3). Pure file-based — no global state; the caller
// guarantees run-scoping by choosing stateDir (PLANNING §3.5, Task).
//
// Node built-ins only — no dependencies (PLANNING §1-1).

import fs from 'node:fs';
import path from 'node:path';

const STATE_FILENAME = 'state.json';

// Classifications that never count toward revision (spec §4.2/§4.3: only
// bump infra_retries, fail_revisions is untouched).
const INFRA_CLASSIFICATIONS = new Set(['TIMEOUT', 'INFRA_ERROR', 'INTERNAL_ERROR']);

export class InternalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InternalError';
    this.code = 'INTERNAL_ERROR';
  }
}

function initialState() {
  // §3.5 initial shape.
  return {
    verdicts: {},
    fail_revisions: [],
    infra_retries: 0,
    blocked: false,
    pass_records: {},
  };
}

/**
 * @param {string} stateDir
 * @returns {object} state — §3.5 shape. Missing state.json -> fresh initial
 *   structure. Unparseable state.json -> InternalError (fail-closed, AC-13 —
 *   never silently re-initialize a corrupt state).
 */
export function loadState(stateDir) {
  const statePath = path.join(stateDir, STATE_FILENAME);
  let raw;
  try {
    raw = fs.readFileSync(statePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return initialState();
    throw new InternalError(`state.json unreadable (${statePath}): ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new InternalError(`state.json corrupt — parse failure (${statePath}): ${err.message}`);
  }
}

/**
 * Atomic write: tmp file -> rename (spec §3.5).
 * @param {string} stateDir
 * @param {object} state
 */
export function saveState(stateDir, state) {
  fs.mkdirSync(stateDir, { recursive: true });
  const statePath = path.join(stateDir, STATE_FILENAME);
  const tmpPath = path.join(stateDir, `.${STATE_FILENAME}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, statePath);
}

/**
 * @param {object} state
 * @param {string} capsuleHash
 * @returns {{classification:string, at:string}|null}
 */
export function getCachedVerdict(state, capsuleHash) {
  return state.verdicts[capsuleHash] || null;
}

/**
 * Records a verdict for capsuleHash and persists it. FAIL verdicts push
 * capsuleHash onto fail_revisions if not already present (unique-hash
 * revision counting, spec §4.2). Infra classifications (TIMEOUT/
 * INFRA_ERROR/INTERNAL_ERROR) never touch fail_revisions — only
 * infra_retries (spec §4.3, AC-9).
 * @param {string} stateDir
 * @param {object} state
 * @param {string} capsuleHash
 * @param {string} classification
 * @returns {object} the mutated state
 */
export function recordVerdict(stateDir, state, capsuleHash, classification) {
  state.verdicts[capsuleHash] = { classification, at: new Date().toISOString() };

  if (INFRA_CLASSIFICATIONS.has(classification)) {
    state.infra_retries += 1;
  } else if (classification === 'FAIL' && !state.fail_revisions.includes(capsuleHash)) {
    state.fail_revisions.push(capsuleHash);
  }

  saveState(stateDir, state);
  return state;
}

/**
 * @param {object} state
 * @returns {number} count of unique FAIL capsule hashes recorded so far.
 */
export function revisionCount(state) {
  return state.fail_revisions.length;
}

/**
 * @param {object} state
 * @param {{revision_limit:number}} limits
 * @returns {boolean}
 */
export function isBlocked(state, limits) {
  return state.blocked === true || revisionCount(state) >= limits.revision_limit;
}

/**
 * @param {string} stateDir
 * @param {object} state
 * @returns {object} the mutated state
 */
export function markBlocked(stateDir, state) {
  state.blocked = true;
  saveState(stateDir, state);
  return state;
}

/**
 * @param {string} stateDir
 * @param {object} state
 * @param {string} capsuleHash
 * @param {{verdict_file:string, model:string, prompt_version:string,
 *   policy_version:string, schema_version:string, duration_ms:number,
 *   tokens:number|null, at:string}} record — stored as-is (spec §5-11
 *   reproducibility fields; tokens is null when the reviewer form reports none)
 * @returns {object} the mutated state
 */
export function recordPass(stateDir, state, capsuleHash, record) {
  state.pass_records[capsuleHash] = record;
  saveState(stateDir, state);
  return state;
}
