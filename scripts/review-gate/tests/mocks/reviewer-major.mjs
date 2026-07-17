// Mock reviewer: one MAJOR finding -> FAIL (deterministic). Same argv[2]
// marker-file convention as reviewer-pass.mjs — used by the 3-revision
// BLOCKED test to prove the reviewer is not spawned once fail-fast kicks in.
import fs from 'node:fs';

const markerFile = process.argv[2];
if (markerFile) {
  let n = 0;
  try {
    n = parseInt(fs.readFileSync(markerFile, 'utf8'), 10) || 0;
  } catch {
    // first invocation — no marker file yet
  }
  fs.writeFileSync(markerFile, String(n + 1), 'utf8');
}

process.stdout.write(JSON.stringify({
  reviewed_spec_sha256: 'b'.repeat(64),
  verdict: 'FAIL',
  findings: [
    {
      bucket: 'B2',
      severity: 'MAJOR',
      object: 'ZFOO',
      finding: 'mock MAJOR finding — INNER JOIN used where spec requires LEFT JOIN',
    },
  ],
}));
