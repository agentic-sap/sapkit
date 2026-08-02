---
name: project-context
description: Runtime project state contract — where SAP connection, version, modules, industry/country, and work-in-progress state live
---

# Project Context (`.sapkit/`)

Every persona and procedure resolves the current SAP environment from these files
**before** making recommendations or writing code. This is the fifth core element —
knowledge/personas/procedures/policies are static; this is the per-project runtime state.

## Machine-level (once per machine)

```
~/.sapkit/profiles/<alias>/sap.env     ← connection profile (NEVER committed to git)
```

The machine home is resolved in this order: `SAPKIT_HOME_DIR` env var (if set)
→ the deprecated `SC4SAP_HOME_DIR` (if that is set instead — still works, but
`SAPKIT_HOME_DIR` is now preferred) → `~/.sapkit` → `~/.sc4sap` (the engine's
oldest fallback).

The **project-level** state directory is `.sapkit/` for a new project.
An existing project's `.sc4sap/` is **not** renamed automatically — reads and
writes both stay on whichever directory is already active until a human runs
`node interactive/scripts/migrate-runtime-dir.mjs` (dry-run by default,
`--apply` to execute; see [setup](procedures/setup.md) Step 0 and
[troubleshooting §4](procedures/troubleshooting.md#4-profiles--tiers)). The
rest of this document writes `.sapkit/` — on an un-migrated project, read
every occurrence as `.sc4sap/` instead.

Keys (exact list verified against the server bundle in Phase L2 — see
[credential-handling](policies/credential-handling.md)):

- `SAP_URL`, `SAP_CLIENT`, `SAP_USERNAME` — connection coordinates
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
.sapkit/active-profile.txt   ← one line: profile alias to use
.sapkit/config.json          ← environment descriptor
```

`config.json` fields — **personas MUST check these before any recommendation**:

| field | values | drives |
|---|---|---|
| `sapVersion` | `S4` \| `ECC` \| `S4_CLOUD_PUBLIC` \| `S4_CLOUD_PRIVATE` | table world (ACDOCA vs BKPF/BSEG), API choice, Dynpro/RAP eligibility |
| `abapRelease` | e.g. `750`, `756`, `758` | allowed syntax (inline decl ≥740, RAP ≥754) |
| `activeModules` | array of module codes | cross-module concerns in design |
| `industry` | key into [knowledge/industry/](knowledge/industry/) | triggered industry knowledge |
| `country` | ISO key into [knowledge/country/](knowledge/country/) | triggered localization knowledge |
| `blocklistProfile` | `minimal` \| `standard` \| `strict` (default) | table blocklist scope read by the data-protection hook/server guard |
| `referenceLibraries` | array of `{name, path, note}` (optional) | local best-practice knowledge vaults — consulted by **any persona or procedure answering a business-practice question**, not only [ask-consultant](procedures/ask-consultant.md) — see below |

### `referenceLibraries` (optional, D-050)

Registers personal/company knowledge vaults (directories of `.md` files — e.g. an
Obsidian wiki distilled from another live server) so consultant personas can
consult them before falling back to the bundled generic knowledge:

```json
"referenceLibraries": [
  { "name": "jnc-e2e", "path": "D:/Claude for SAP/JNC/e2e-ontology/20. Wiki",
    "note": "manufacturing E2E best practices from a live implementation" }
]
```

Rules: the plugin ships only this **slot** — vault content is never bundled,
committed, or copied into any artifact (same principle as connection profiles:
slot distributed, values local). Absent field or unreadable path → silent
fallback, nothing else changes. Consumers read **at most 2–3 matching docs per
vault per question** (keyword match on filenames + grep), never bulk-load.

A registered library is a **standing instruction for every entry point**, not a
feature of one skill — it is rung L3 of the consumption contract below. Matching
and budget mechanics live in [ask-consultant](procedures/ask-consultant.md)
§ Reference Libraries; ranking and obligations in
[knowledge-sourcing](policies/knowledge-sourcing.md).

## Work-in-progress state (created by procedures)

```
.sapkit/program/{PROG}/      ← create-program artifacts: platform.md, module-interview.md,
                               interview.md, plan.md, spec.md, state.json, report.md, review-request/review-result JSON
                               + approval/review/verification records per procedures/schemas/
.sapkit/cbo/<MODULE>/<PACKAGE>/  ← CBO inventory artifacts (analyze-cbo-obj)
.sapkit/spro-config.json · .sapkit/customizations*  ← optional extraction artifacts (may be absent —
                               procedures must fall back to knowledge/modules/<MOD>/). Generated by the
                               user with tools/extract/{extract-spro,extract-customizations}.mjs — a P2
                               action: see procedures/spro-lookup.md · customization-lookup.md
.sapkit/vpass/<ts>-<target>.json ← V-PASS completion-evidence records written by
                               tools/vpass/vpass.mjs (vsp read-back · active-state ·
                               unit · ATC). One of the two completion stamps; the
                               record's limits[] state what its evidence does NOT prove.
                               See procedures/create-program.md "Completion state"
.sapkit/RULES.md              ← lesson procedure artifact: distilled rules
.sapkit/LESSONS.md            ← lesson procedure artifact: failure log
.sapkit/knowledge/domain.md · system.md  ← knowledge procedure artifacts: what this project
                               had to find out. `domain.md` (**KD-ids**) holds business facts
                               that outlive the program; `system.md` (**KS-ids**, each carrying
                               the profile/SID it was established against) holds facts true only
                               of a named system. Prefixes avoid the bare-letter space because
                               sapkit's own `D-0xx` decision ids appear in the shipped core.
                               Read before asking by procedures/knowledge.md "Read points";
                               absent directory → continue silently.
```

## Consumption contract — the layers that mature

The state above is not an archive; it is the project getting smarter. Every
persona and procedure honors this ladder — full contract (precedence, conflict,
budgets, citation, write-back): [knowledge-sourcing](policies/knowledge-sourcing.md).

| Read | Layer | Mandatory when |
|---|---|---|
| L0 | `.sapkit/RULES.md` — a scope-matched rule is a **hard constraint** | any SAP-facing action (write, diagnosis, advice) |
| L1 | `.sapkit/knowledge/` KD/KS atoms (KS only when `scope:` matches the profile) | stating a fact about this business / this system |
| L2 | `spro-config*` · `customizations/` · `cbo/` snapshots (via their protocols) | customizing / enhancement / reuse questions |
| L3 | `referenceLibraries` vaults (§ above) | practice questions — "how is this actually done" |
| L4 | bundled `core/knowledge/` | generic names, tables, syntax |
| L5 | model general knowledge — **flag as unverified** | last resort |

Live MCP readings (within tier / P2 gates) outrank every stored layer for
current-state facts; policies bind above everything. Higher layer wins
conflicts; a vault never overrides this system's facts or any policy. Absent
layer → skip silently. When work verifies a new fact or failure, **offer** the
[knowledge](procedures/knowledge.md) / [lesson](procedures/lesson.md) write-back
— that offer is what makes the next session cheaper than this one.

## Rules

1. `.sapkit/` (and legacy `.sc4sap/`) and `sap.env` are **git-ignored** — never commit runtime state or credentials.
2. No `SAP_TIER` → no connected mode. No `.sapkit/config.json` → ask the user to
   establish it before version-dependent work.
3. Switching systems = switching the profile alias in `active-profile.txt`, never
   editing credentials inline in a project.
4. `.sapkit/RULES.md`, `.sapkit/LESSONS.md`, and `.sapkit/knowledge/**` are
   local-only — never shared across machines — and a `setup` re-run does not
   overwrite them. See [lesson](procedures/lesson.md) ·
   [knowledge](procedures/knowledge.md). Moving accumulated knowledge somewhere
   shared (a committed path, a team wiki) is the product user's call; the plugin
   ships no path override and copies nothing out.
