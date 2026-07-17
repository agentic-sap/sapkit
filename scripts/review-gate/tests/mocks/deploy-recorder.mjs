// Mock deploy command: records what it received (argv + content hash of the
// file argument) to a record file, then exits with the given code (default
// 0). Used by deploy-gate.test.mjs to prove deploy-gate.mjs deploys from the
// capsule copy — never the working tree (spec §4.0 TOCTOU elimination) — and
// that a non-zero deploy exit code propagates unchanged
// (phases/3-review-gate/index.json step 4 Task §2 test 6).
//
// Usage: node deploy-recorder.mjs <recordFilePath> <fileArg> [exitCode]
import fs from 'node:fs';
import crypto from 'node:crypto';

const [, , recordFilePath, fileArg, exitCodeArg] = process.argv;

const entry = {
  argv: process.argv.slice(2),
  fileArg,
  fileSha256: fs.existsSync(fileArg)
    ? crypto.createHash('sha256').update(fs.readFileSync(fileArg)).digest('hex')
    : null,
};
fs.appendFileSync(recordFilePath, `${JSON.stringify(entry)}\n`, 'utf8');

process.exit(exitCodeArg ? parseInt(exitCodeArg, 10) : 0);
