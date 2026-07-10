---
name: verification-policy
description: Machine-verification chain for every ABAP change — CheckSyntax → ActivateObjects → RunUnitTest → GetAtcFindings, with blocking criteria, re-run rules, and evidence recording
source:
  - sc4sap-custom/CLAUDE.md
  - server/tool-catalog/sc4sap-mcp-tools-read.md
  - server/tool-catalog/sc4sap-mcp-tools-write.md
  - server/tool-catalog/sc4sap-mcp-tools-runtime.md
---

# Verification Policy

Every ABAP change produced by a harness MUST pass the machine-verification chain
below before it may be reported as done or put on a transport for release.
"It compiles on my side" is not evidence — only tool output is.

Tool names are the canonical MCP tool names from the
[server tool catalog](../../server/tool-catalog/sc4sap-mcp-tools.md).

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
.sc4sap/program/{PROG}/verification.json
```

The record conforms to `../procedures/schemas/verification.schema.json` (authoritative):
one object per chain run with `prog` plus the four fixed step keys —
`check_syntax`, `activate`, `unit_test`, `atc` — each `{status, evidence}` where
`evidence` carries the verbatim tool output summary (error messages, failed test
methods, ATC findings with priorities).

Evidence is preserved across re-runs: before writing a new run's
`verification.json`, rename the previous one to `verification.prev-<n>.json` —
a re-run never overwrites a failed record.
