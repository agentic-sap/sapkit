---
name: verification-policy
description: Machine-verification chain for every ABAP change — CheckSyntax → ActivateObjects → RunUnitTest → GetAtcFindings, with blocking criteria, re-run rules, and evidence recording
source:
  - sc4sap-custom/CLAUDE.md
  - server/tool-catalog/sapkit-mcp-tools-read.md
  - server/tool-catalog/sapkit-mcp-tools-write.md
  - server/tool-catalog/sapkit-mcp-tools-runtime.md
---

# Verification Policy

Every ABAP change produced by a harness MUST pass the machine-verification chain
below before it may be reported as done or put on a transport for release.
"It compiles on my side" is not evidence — only tool output is.

Tool names are the canonical MCP tool names from the
[server tool catalog](../../server/tool-catalog/sapkit-mcp-tools.md).

## The chain (fixed order)

| # | Step | Tool | Passes when | Blocks when |
|---|------|------|-------------|-------------|
| 1 | Syntax check | `CheckSyntax` | `verdict: "clean"` — `success: true` with `errors: []` | `verdict: "errors"` — any syntax error (warnings are recorded, not blocking). `verdict: "indeterminate"` / `success: null` is **not a pass** (see notes) |
| 2 | Activation | `ActivateObjects`, then `GetInactiveObjects` | Activation succeeds AND `GetInactiveObjects` returns zero leftovers for the touched objects | Activation error, or any touched object still inactive |
| 3 | Unit tests | `RunUnitTest` (results via `GetUnitTestResult` / `GetUnitTestStatus`) | All test methods pass | Any test failure or test error; missing test class where the procedure mandates one |
| 4 | ATC | `GetAtcFindings` | No findings at blocking severity | Any finding of priority 1 or 2 (errors). Priority 3 / informational findings do not block but MUST be listed in the report |

Notes:

- Step 1 passes only on `verdict: "clean"` (`success: true` **and** `errors: []`).
  `CheckSyntax` can also answer `verdict: "indeterminate"` with `success: null` —
  zero errors **and no verdict**, which is what an include checked without its
  main program gets (SAP had nothing to compile it in). "Zero errors" there
  examined nothing, so it is neither a pass nor a failure: for an include, re-run
  with `main_program` set; otherwise read the response's `reason`. Older engine
  builds expressed the same state as `success: false` with `errors: []`; treat
  that the same way — only `success: true` with `errors: []` is a pass
  ([troubleshooting](../procedures/troubleshooting.md) § 8).
- Step 2 does not cascade: activating a main program does NOT activate its
  sub-includes. Activate every touched include explicitly, or batch them in a
  single `ActivateObjects` call, then confirm with `GetInactiveObjects`.
- Step 2 reads the **run-level** `activated` and `checked` flags of the
  `ActivateObjects` response, not the per-object `status`. A run answering
  `activated: false` + `checked: false` activated nothing, even where every
  object reports `status: "activated"` with an empty `errors[]`; `checked: false`
  means the syntax stage never ran, so "no errors" examined nothing. Since the
  D-147 engine repair (server engine 1.4.0 / plugin 0.10.3) the tool itself
  fails such a run — `success: false`, `run_executed: false`, every object
  `status: "not_executed"` — but that repair is offline-verified only, and older
  bundles still answer `success: true` here, so read the flags either way. An empty
  `GetInactiveObjects` is a **necessary** condition, never a sufficient one — an
  orphaned inactive version does not appear in the worklist. The oracle that
  settles a disagreement is `REPOSRC.R3STATE` for the object (an `'I'` row means
  not active; the `'A'` row's `UDAT`/`UTIME` must be later than the write); that
  is a `GetSqlQuery` call and carries the per-call approval of
  [data-extraction-policy](./data-protection/data-extraction-policy.md).
  Where a run lands in the false state, the measured way out is to **rewrite the
  whole source** (`UpdateInclude` / `UpdateClass`, `activate: true`) rather than
  retry the activation; a human activation in SE80 comes after that, not before.
  Symptoms, evidence and limits: [troubleshooting](../procedures/troubleshooting.md) § 8.
- Step 3 applies when the object has (or must have) a unit test per the active
  procedure; pure DDIC objects without executable code skip to step 4.
- Step 3 has one **substitute path, and it is weaker than the step it replaces**.
  Where `RunUnitTest` reports `completed` while executing zero tests and the
  engine version has been ruled out as the cause
  ([troubleshooting](../procedures/troubleshooting.md) § 8), the check itself can be
  carried in an executable program, run with `RuntimeRunProgramWithProfiling`,
  and its per-case results written to a table that is read back afterwards
  (that read-back is a row-data call and carries the per-call approval of
  [data-extraction-policy](./data-protection/data-extraction-policy.md)) —
  `WRITE` output does not come back through the runner. What that establishes is
  that the assertions ran and what they returned; it is **not** an AUnit result,
  it does not discover test classes, and it is P3 execution rather than a read,
  so it inherits the attended requirement and the DEV-tier gate. Record it under
  step 3 as its own evidence naming the program and the result table, never as
  `RunUnitTest` PASS. Keep the ABAP Unit classes themselves as assets: this
  substitutes for the runner, not for the tests.
- Never skip ahead: a later step's success is meaningless while an earlier step
  is failing.

## Offline delivery — the one carve-out

The chain above assumes a live ADT connection, because every tool in it is one. The **abapGit
offline delivery branch** ([develop-abapgit](../procedures/develop-abapgit.md);
`state.json.delivery_path == "abapgit"` in [create-program](../procedures/create-program.md))
has no connection at all — the agent builds a ZIP and the **user** imports it — so on that
branch the chain is **not skipped, it is unreachable**, and running it is not an available
action rather than a step someone declined.

What replaces it is deliberately weaker, and is recorded as such:

- The record is `.sapkit/program/{PROG}/verification-offline.json`
  (`../procedures/schemas/verification-offline.schema.json`), **not** `verification.json` —
  which is not written at all on this branch. A half-filled `verification.json` would be exactly
  the false machine PASS this policy exists to prevent.
- Its `import_confirmed` step has **no `PASS` in its enum**. The user's report that the import
  succeeded is an **affirmation on record**, and the schema makes it impossible to record it as
  a machine result.
- **Re-run rule item 3 below still binds, in its own terms: success is not reported.** This
  branch caps at `PROVISIONAL_WRITE`, never claims a phase is complete on the strength of that
  affirmation, and **never releases a transport** — release is the user's, and no agent action
  on this branch touches CTS.
- **Evidence preservation carries over, and it matters more here.** The rule under "Evidence
  recording" — rename the previous record to `verification.prev-<n>.json` before writing a new
  run's, so a re-run never overwrites a failed one — applies to
  `verification-offline.json` as `verification-offline.prev-<n>.json`. This branch **repairs by
  round trip** (repair the mirror, rebuild the whole ZIP, re-import —
  [develop-abapgit](../procedures/develop-abapgit.md) Step 7), so each cycle rewrites the
  record. The one thing that must survive is exactly the one a rewrite would erase: an
  `import_confirmed: USER_REPORTED_FAILURE` with its unknown-state note. **A server left in an
  unknown state is not something a later clean cycle gets to un-say.**
- `COMPLETE` on this branch requires the chain's own evidence after the fact: a read-back
  comparison ([verify-applied](../procedures/verify-applied.md)) plus `CheckSyntax` plus
  `GetInactiveObjects` returning zero, **plus the chain's steps 3–4 on the imported objects** —
  `RunUnitTest` and `GetAtcFindings`, each `PASS` or `SKIPPED` with a recorded reason, the same
  standard the online matrix puts on them (D-144: the MCP availability that makes the read-back
  reachable makes these reachable too, so `COMPLETE` never means less on this branch) — plus an
  exact-subject `R-PASS`. That is reachable **only
  where an MCP read is available**; where it is not, the run **stops at `PROVISIONAL_WRITE` and
  records that**.

So the carve-out narrows what can be *proved*, not what may be *claimed*. Nothing here licenses
reporting a change as done, and no other branch inherits it.

## Re-run rule on failure

1. When a step blocks, fix the cause, then **restart the chain from step 1**
   (`CheckSyntax`) for every object the fix touched — a fix is a new change and
   invalidates earlier evidence.
2. If the **same step fails 3 consecutive times** for the same object, stop.
   Report the failing tool output verbatim to the user and wait for direction —
   do not keep looping, and do not work around the check.
3. Never report success, mark a phase complete, or release a transport while
   any step of the chain is unexecuted or failing.

## Evidence recording

Record the outcome of every chain run under the program's state directory
(see [project-context](../project-context.md)):

```
.sapkit/program/{PROG}/verification.json
```

The record conforms to `../procedures/schemas/verification.schema.json` (authoritative):
one object per chain run with `prog` plus the four fixed step keys —
`check_syntax`, `activate`, `unit_test`, `atc` — each `{status, evidence}` where
`evidence` carries the verbatim tool output summary (error messages, failed test
methods, ATC findings with priorities).

Evidence is preserved across re-runs: before writing a new run's
`verification.json`, rename the previous one to `verification.prev-<n>.json` —
a re-run never overwrites a failed record.
