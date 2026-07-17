// Mock reviewer: sleeps well past any test timeout_ms, to exercise
// reviewer.mjs's TIMEOUT path. Produces no output.
await new Promise((resolve) => setTimeout(resolve, 60000));
