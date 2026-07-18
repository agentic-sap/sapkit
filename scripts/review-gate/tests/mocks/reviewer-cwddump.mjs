// Mock reviewer: dumps its own cwd and received argv as JSON — used to prove
// reviewer.mjs spawns the reviewer with a cwd OUTSIDE the capsule and passes
// the capsule's absolute path via the {capsule} token substitution (spec §4.0
// / §5-3, MINOR ⑤). Not a valid review-result payload; the test reads stdout
// directly rather than routing it through verdict.evaluate.
process.stdout.write(JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(2) }));
