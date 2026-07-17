// TDD-guard compatibility shim — NOT the canonical test file.
//
// The repo's .claude/hooks/tdd-guard.py has_js_test() only recognizes
// <dir>/{base}.test.mjs or <dir>/__tests__/{base}.test.mjs next to the
// implementation file; it does not know this phase's own tests/ subdirectory
// convention (PLANNING.md §3.2, used by every step 0-5 in this phase). Since
// this step may only touch scripts/review-gate/** (Forbidden list) and not
// the hook itself, this same-folder shim satisfies the guard by re-running
// the real suite. The Acceptance Criteria and phases/3-review-gate/index.json
// verify command both target tests/gate-e2e.test.mjs directly and are
// unaffected by this file. (Same pattern as step 0/1/2's shims.) reviewer.mjs
// and review-gate.mjs share one E2E suite, so both shims import it.
import './tests/gate-e2e.test.mjs';
