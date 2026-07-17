// Review capsule: creates an immutable snapshot of a review unit (source +
// spec + verification result + policy/model/schema versions) and computes a
// deterministic capsule hash that binds PASS records, FAIL cache, and
// revision counting to that exact input (spec §4.0, PLANNING §3.4).
//
// Node built-ins only — no dependencies (PLANNING §1-1).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class CapsuleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CapsuleError';
    this.code = 'INCOMPLETE';
  }
}

function sha256OfFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function requireReadableNonEmptyFile(filePath, label) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    throw new CapsuleError(`capsule incomplete: missing ${label} (${filePath}): ${err.message}`);
  }
  if (!stat.isFile()) {
    throw new CapsuleError(`capsule incomplete: not a file — ${label} (${filePath})`);
  }
  if (stat.size === 0) {
    throw new CapsuleError(`capsule incomplete: empty file — ${label} (${filePath})`);
  }
}

// Copies srcPath into slotDir/content, isolating each slot so the original
// path string never has to be reused/parsed to relocate the copy (avoids
// unsafe-character issues with absolute paths e.g. Windows drive letters).
function copyIntoSlot(srcPath, slotDir, label) {
  fs.mkdirSync(slotDir, { recursive: true });
  const destPath = path.join(slotDir, 'content');
  try {
    fs.copyFileSync(srcPath, destPath);
  } catch (err) {
    throw new CapsuleError(`capsule incomplete: read failed for ${label} (${srcPath}): ${err.message}`);
  }
  return destPath;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
    return sorted;
  }
  return value;
}

// Canonical JSON = sorted keys, compact (no embedded line breaks — so the
// LF-vs-CRLF concern from the spec cannot arise), UTF-8.
function hashManifest(manifest) {
  const canonical = JSON.stringify(canonicalize(manifest));
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * @param {{unit_id:string, files:string[], spec_path:string,
 *   verification_path?: string|null, policy_version:string,
 *   schema_version:string, reviewer_model:string, target_system:string}} unit
 * @param {string} capsuleDir
 * @returns {{capsuleDir:string, capsuleHash:string, manifest:object}}
 */
export function createCapsule(unit, capsuleDir) {
  const {
    unit_id, files = [], spec_path, verification_path = null,
    policy_version, schema_version, reviewer_model, target_system,
  } = unit;

  // Validate everything up front — a capsule is never partially created.
  files.forEach((f, i) => requireReadableNonEmptyFile(f, `files[${i}]`));
  requireReadableNonEmptyFile(spec_path, 'spec_path');
  if (verification_path !== null) requireReadableNonEmptyFile(verification_path, 'verification_path');

  fs.mkdirSync(capsuleDir, { recursive: true });

  const fileEntries = files.map((f, i) => {
    const destPath = copyIntoSlot(f, path.join(capsuleDir, 'files', String(i)), `files[${i}]`);
    return { path: f, sha256: sha256OfFile(destPath) };
  });

  const specDestPath = copyIntoSlot(spec_path, path.join(capsuleDir, 'spec'), 'spec_path');
  const specSha256 = sha256OfFile(specDestPath);

  let verificationSha256 = null;
  if (verification_path !== null) {
    const verDestPath = copyIntoSlot(verification_path, path.join(capsuleDir, 'verification'), 'verification_path');
    verificationSha256 = sha256OfFile(verDestPath);
  }

  const manifest = {
    unit_id,
    files: fileEntries,
    spec_path,
    spec_sha256: specSha256,
    verification_path,
    verification_sha256: verificationSha256,
    policy_version,
    schema_version,
    reviewer_model,
    target_system,
  };

  fs.writeFileSync(path.join(capsuleDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  return { capsuleDir, capsuleHash: hashManifest(manifest), manifest };
}

/**
 * @param {string} capsuleDir
 * @returns {{ok:boolean, capsuleHash:string|null, mismatches:string[]}}
 */
export function verifyCapsule(capsuleDir) {
  const manifestPath = path.join(capsuleDir, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return { ok: false, capsuleHash: null, mismatches: [`manifest unreadable: ${err.message}`] };
  }

  const mismatches = [];

  (manifest.files || []).forEach((entry, i) => {
    const copyPath = path.join(capsuleDir, 'files', String(i), 'content');
    try {
      const actual = sha256OfFile(copyPath);
      if (actual !== entry.sha256) mismatches.push(`file hash mismatch at index ${i}: ${entry.path}`);
    } catch (err) {
      mismatches.push(`file copy missing at index ${i}: ${entry.path} (${err.message})`);
    }
  });

  try {
    const actual = sha256OfFile(path.join(capsuleDir, 'spec', 'content'));
    if (actual !== manifest.spec_sha256) mismatches.push(`spec hash mismatch: ${manifest.spec_path}`);
  } catch (err) {
    mismatches.push(`spec copy missing: ${manifest.spec_path} (${err.message})`);
  }

  if (manifest.verification_path !== null && manifest.verification_path !== undefined) {
    try {
      const actual = sha256OfFile(path.join(capsuleDir, 'verification', 'content'));
      if (actual !== manifest.verification_sha256) mismatches.push(`verification hash mismatch: ${manifest.verification_path}`);
    } catch (err) {
      mismatches.push(`verification copy missing: ${manifest.verification_path} (${err.message})`);
    }
  }

  return { ok: mismatches.length === 0, capsuleHash: hashManifest(manifest), mismatches };
}
