---
name: project-context
description: Runtime project state contract — where SAP connection, version, modules, industry/country, and work-in-progress state live
---

# Project Context (`.sc4sap/`)

Every persona and procedure resolves the current SAP environment from these files
**before** making recommendations or writing code. This is the fifth core element —
knowledge/personas/procedures/policies are static; this is the per-project runtime state.

## Machine-level (once per machine)

```
~/.sc4sap/profiles/<alias>/sap.env     ← connection profile (NEVER committed to git)
```

Keys (exact list verified against the server bundle in Phase L2 — see
[credential-handling](policies/credential-handling.md)):

- `SAP_URL`, `SAP_CLIENT`, `SAP_USER` — connection coordinates
- `SAP_PASSWORD` or OS-keyring storage (preferred — see credential-handling)
- `SAP_TIER=dev|qas|prd` — **required.** The MCP server's built-in readonly guard
  reads this; on `qas`/`prd` write tools are blocked server-side. If unset, do not
  use connected mode.
- `SAP_ACTIVE_MODULES` — comma-separated canonical codes (FI, CO, MM, SD, PP, PM,
  QM, WM, HCM, PS, TR, TM, BW, Ariba). See
  [active-modules](knowledge/modules/common/active-modules.md) for cross-module
  integration impact.
- `MCP_BLOCKLIST_PROFILE` / `MCP_BLOCKLIST_EXTEND` — server-side table blocklist
  (see [data-protection](policies/data-protection/data-extraction-policy.md))

## Project-level (once per project)

```
.sc4sap/active-profile.txt   ← one line: profile alias to use
.sc4sap/config.json          ← environment descriptor
```

`config.json` fields — **personas MUST check these before any recommendation**:

| field | values | drives |
|---|---|---|
| `sapVersion` | `S4` \| `ECC` \| `S4_CLOUD_PUBLIC` \| `S4_CLOUD_PRIVATE` | table world (ACDOCA vs BKPF/BSEG), API choice, Dynpro/RAP eligibility |
| `abapRelease` | e.g. `750`, `756`, `758` | allowed syntax (inline decl ≥740, RAP ≥754) |
| `activeModules` | array of module codes | cross-module concerns in design |
| `industry` | key into [knowledge/industry/](knowledge/industry/) | triggered industry knowledge |
| `country` | ISO key into [knowledge/country/](knowledge/country/) | triggered localization knowledge |

## Work-in-progress state (created by procedures)

```
.sc4sap/program/{PROG}/      ← create-program artifacts: platform.md, module-interview.md,
                               interview.md, plan.md, spec.md, state.json, review.md, report.md
                               + approval/review/verification records per procedures/schemas/
.sc4sap/cbo/<MODULE>/<PACKAGE>/  ← CBO inventory artifacts (analyze-cbo-obj)
.sc4sap/spro/ · .sc4sap/customizations/  ← optional extraction artifacts (may be absent —
                               procedures must fall back to knowledge/modules/<MOD>/)
```

## Rules

1. `.sc4sap/` and `sap.env` are **git-ignored** — never commit runtime state or credentials.
2. No `SAP_TIER` → no connected mode. No `.sc4sap/config.json` → ask the user to
   establish it before version-dependent work.
3. Switching systems = switching the profile alias in `active-profile.txt`, never
   editing credentials inline in a project.
