#!/usr/bin/env node
// Deploys one capsule file to SAP $TMP through the credential-self-provisioning
// verify wrapper (scripts/verify-sap.ps1 -Write). Exists because deploy-gate's
// --deploy-cmd template is whitespace-split with no quoting support, while every
// real deploy invocation here needs quoted arguments (the wrapper path and the
// capsule file path both contain spaces). Keeping this shim path space-free lets
// the template stay: node deploy-shim.mjs {file}
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = process.argv[2];
if (!file) {
  console.error('usage: node deploy-shim.mjs <abap-source-file>');
  process.exit(2);
}
const here = dirname(fileURLToPath(import.meta.url));
const wrapper = resolve(here, '..', 'verify-sap.ps1');
const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const cmd = `& ${psQuote(wrapper)} -Write -- deploy ${psQuote(file)} '$TMP'`;
const r = spawnSync('powershell', ['-NoProfile', '-Command', cmd], { stdio: 'inherit' });
process.exit(r.status ?? 6);
