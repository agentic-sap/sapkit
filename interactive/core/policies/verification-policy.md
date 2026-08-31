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
| 1 | Syntax check | `CheckSyntax` | Zero errors reported | Any syntax error (warnings are recorded, not blocking) |
| 2 | Activation | `ActivateObjects`, then `GetInactiveObjects` | Activation succeeds AND `GetInactiveObjects` returns zero leftovers for the touched objects | Activation error, or any touched object still inactive |
| 3 | Unit tests | `RunUnitTest` (results via `GetUnitTestResult` / `GetUnitTestStatus`) | All test methods pass | Any test failure or test error; missing test class where the procedure mandates one |
| 4 | ATC | `GetAtcFindings` | No findings at blocking severity | Any finding of priority 1 or 2 (errors). Priority 3 / informational findings do not block but MUST be listed in the report |

Notes:

- Step 2 does not cascade: activating a main program does NOT activate its
  sub-includes. Activate every touched include explicitly, or batch them in a
  single `ActivateObjects` call, then confirm with `GetInactiveObjects`.
- Step 3 applies when the object has (or must have) a unit test per the active
  procedure; pure DDIC objects without executable code skip to step 4.
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
