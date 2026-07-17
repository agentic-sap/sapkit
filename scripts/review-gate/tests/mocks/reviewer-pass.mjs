// Mock reviewer: schema-valid PASS with zero findings.
//
// Optional argv[2] = marker file path; if given, the file's integer content
// is incremented by one on every invocation. review-gate.mjs's cache path
// (spec §4.1 step 3) must never spawn this mock for a capsule hash it has
// already judged — tests use the marker to prove that
// (phases/3-review-gate/index.json step 3 Task §4 test 3).
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
  reviewed_spec_sha256: 'a'.repeat(64),
  verdict: 'PASS',
  findings: [],
}));
