// Mock reviewer: dumps its own process.env key list as JSON — used to prove
// reviewer.mjs spawns the reviewer with an allowlist-only clean env (spec
// §5-3, AC-7). Not a valid review-result payload; tests read stdout directly
// rather than routing it through verdict.evaluate.
process.stdout.write(JSON.stringify(Object.keys(process.env)));
