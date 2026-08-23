# Customization Lookup Protocol

**MANDATORY for every sapkit consultant persona, for [sap-critic](../personas/sap-critic.md), and for any procedure that analyses, critiques, or extends an SAP installation that already exists.**

What the customer runs today in Z*/Y* — BAdI implementations, CMOD projects, customized form-based user-exit includes, Append Structures, custom fields — is inventoried into per-module JSON files by the extraction utility this plugin ships at `tools/extract/extract-customizations.mjs` (see [Generating the inventory](#generating-the-inventory) below). **Reading that inventory before you recommend, critique, or design is not optional**: proposing a fresh BAdI while a working Z implementation is already in place burns effort, splits the logic in two, and is the single most common source of rework on brownfield SAP projects. Where the inventory has never been generated, take Steps 2–3 below instead — the static knowledge reference, or a targeted live query.

## Files You MUST Check

| File | Holds |
|---|---|
| `.sapkit/customizations/{MODULE}/enhancements.json` | `smodExits[]` (standard SMOD → CMOD projects in the Z namespace), `badiImplementations[]` (standard BAdI → Z*/Y* implementing classes), `formBasedExits[]` (customized include programs, with line counts), `ggbRules[]` (the customer's GGB0 substitutions / GGB1 validations / rules, read from table `GB03` and filtered by `APPLAREA`), `bteImplementations[]` (the customer's BTE Publish/Subscribe and Process FMs, read from `TBE24` / `TPS34` and filtered by `APPL`) |
| `.sapkit/customizations/{MODULE}/extensions.json` | `appendStructures[]` — per base table, which `CI_*` / `Z*` appends and which `ZZ*` / `YY*` custom fields are genuinely on it |

**Modules with GGB/BTE coverage**: `FI`, `CO`, `PS`, `TR`, `AA`, `PM`, `SD`, `HCM`. Anywhere else those arrays are always empty and should not be relied on.

The JSON records **positives only**: a standard exit or base table appears in it only where the customer has in fact customized it. An exit that stays silent means "no customization detected at last scan".

## Resolution Order

### 1. Local Customization Cache (preferred — short-circuits everything below)

For each module the question touches:

- If `.sapkit/customizations/{MODULE}/enhancements.json` exists:
  - Load it, and let the `timestamp` show in your reasoning ("customization snapshot: 2026-04-17T…")
  - Check each standard SMOD / BAdI / include you are on the point of recommending against the cache. Where the customer holds a Z implementation already, **extend that existing Z object in preference** to building a new one.
  - Name the reuse candidate explicitly in what you output (e.g., "`BADI_SD_SALES` already has impl `ZCL_IM_SD_SALES_HEADER` — extend this instead of creating a new impl").
- If `.sapkit/customizations/{MODULE}/extensions.json` exists:
  - Check the base tables you are on the point of extending. Where a `CI_*` or `ZA*` append is already there, **put the new field into that existing append** rather than opening a second one. Two appends on one table are legal, and widely read as an anti-pattern.
- If the file for a required module is absent, drop through to Step 2 — for that module only.

### 2. Static Reference — `../knowledge/modules/{MODULE}/enhancements.md`

With the cache file absent, the static doc still gives you the *names* of the standard exits/BAdIs worth recommending. What it does **not** give you is which of them the customer has already implemented. So:

- Name the standard object in the recommendation
- **Add a callout** that hands the user the choice: "No customization inventory is present. Before I create a new implementation, either generate the inventory yourself (`node tools/extract/extract-customizations.mjs {MODULE}` — see below) or let me run a targeted live query (Step 3) to check whether this BAdI already has a Z implementation."
- Do NOT hold the current task behind the extraction — carry on, but state the assumption ("no prior Z impl") out loud so it can be corrected.

### 3. Live MCP Fallback (last resort)

Where the stakes are high (sap-critic on the verge of a REJECT, sap-planner sizing WRICEF, sap-architect proposing a new BAdI implementation) AND no cache exists, you MAY call:

- `GetEnhancementSpot` to look at one specific BAdI for Z*/Y* implementations
- `GetSqlQuery` over `MODSAP` / `MODACT` to trace the CMOD projects behind a given SMOD enhancement
- `GetSqlQuery` over `GB03`, filtered by `APPLAREA`, for the customer's GGB0/GGB1 rules (`BSTAT = 'A'`, `VSR_NAME` starting with `Z`/`Y`)
- `GetSqlQuery` over `TBE24` / `TPS34`, filtered by `APPL`, for the customer's BTE subscriber FMs (`FUNCTION` starting with `Z`/`Y`)
- `GetTable` against a base table to read out its appends and custom fields

Every live call must:
1. Name what it targets (BAdI name / SMOD name / table name)
2. Say why the cache miss leaves no other way to answer
3. Flag the token cost and put the alternative on the table — the user generating the customization inventory (see below)

### Decision flow summary

```
about to recommend / critique / extend a standard SAP object
        │
        ▼
  .sapkit/customizations/{MODULE}/*.json present?
    yes ──► cross-reference; prefer reuse; cite timestamp
     no
        │
        ▼
  ../knowledge/modules/{MODULE}/enhancements.md (name-only reference)
        │
        └── high-stakes & live SAP available?
                 yes ──► Step 3 targeted MCP query (with user warning)
                  no ──► proceed with "no prior Z impl" assumption + call-out to user
```

## What "Prefer Reuse" Actually Looks Like

Where the cache shows `BADI_SD_SALES → [ZCL_IM_SD_SALES_HEADER]`:

- ✅ Recommend: "Extend method `IF_BADI_SD_SALES~CHECK_HEADER` in existing impl `ZCL_IM_SD_SALES_HEADER` (active, last modified …)."
- ❌ Do NOT recommend: "Create new implementation `ZCL_IM_SD_SALES_HEADER_V2` of `BADI_SD_SALES`."

Where the cache shows `VBAK → appendStructures: [CI_VBAK], customFields: [ZZAPPROVER]`:

- ✅ Recommend: "Add new field `ZZ_PRIORITY` to existing append `CI_VBAK` (already contains `ZZAPPROVER`)."
- ❌ Do NOT recommend: "Create a second append `ZAVBAK_NEW` on `VBAK`."

Where the cache shows `MV45AFZZ → lineCount: 420, customized: true`:

- ✅ Recommend: "Add the check inside FORM `USEREXIT_SAVE_DOCUMENT_PREPARE` in `MV45AFZZ` (already customized — 420 non-comment lines)."
- ❌ Do NOT recommend: "Create a new BAdI" — 420 lines of legacy form-exit code are already in the customer's hands, and any new logic must be kept coherent with them.

Where the FI cache shows `ggbRules: [{ name: "ZGL0001", type: "substitution", applArea: "GLT0", callupPoint: "0001" }]`:

- ✅ Recommend: "Extend existing substitution `ZGL0001` at call-up point 0001 (FI document header) via GGB0 — add the new field/condition to its existing step."
- ❌ Do NOT recommend: "Create a new `BADI_FI_DOCUMENT_SAVE` implementation" — GGB0 is plainly this customer's framework of choice for manipulating the FI header, and a BAdI running alongside it leaves the order of the logic ambiguous.

Where the FI-AP cache shows `bteImplementations: [{ kind: "P/S", event: "00001025", application: "FI-AP", function: "Z_BTE_1025_PAYMENT_BLOCK" }]`:

- ✅ Recommend: "Add the logic inside FM `Z_BTE_1025_PAYMENT_BLOCK` (already registered as subscriber for event 1025 / FI-AP)."
- ❌ Do NOT recommend: "Implement `BAdI_PAYMENT_PROPOSAL`" — with the customer already on BTE for this event, adding a BAdI splits the control flow and makes reconciling the two paths fragile.

## Generating the inventory

The extractor rides along with this plugin at `tools/extract/extract-customizations.mjs`
(plain Node, nothing to npm install). The **user** runs it, **from the project root** —
the directory that holds `.sapkit/` — against the active profile:

```bash
node "$CLAUDE_PLUGIN_ROOT/tools/extract/extract-customizations.mjs" --dry-run SD MM
node "$CLAUDE_PLUGIN_ROOT/tools/extract/extract-customizations.mjs" SD MM
node "$CLAUDE_PLUGIN_ROOT/tools/extract/extract-customizations.mjs" all
```

`--dry-run` prints the scope offline — modules, what it parsed out of each
`enhancements.md`, the exact SQL scans, the output paths — and connects to nothing.

**Approval gate — this is a P2 action.** Two of the scans read rows
(`MODACT`/`MODATTR`, `GB03`, `TBE24`/`TPS34` — enhancement registration
metadata), which puts Gate B of [approval-gates](../policies/approval-gates.md) in force:

- **You do not run this on the user's behalf.** Recommend it, show the command, and
  leave the execution to the user. Never run it yourself, never hand it to a subagent,
  and never use it as a way around the per-call approval you would otherwise
  owe (Gate B(c) — subagent and batch use are prohibited under every layer).
- The `--dry-run` output is the scope disclosure; the user running the command
  without `--dry-run` is the act of approval, for exactly that scope.
- The extractor never sets `acknowledge_risk`, so the server-side blocklist
  floor keeps the last word. A refused table returns no findings, and a refusal
  caches nothing. [data-extraction-policy](../policies/data-protection/data-extraction-policy.md)
  stays authoritative for every other table.

## Extraction Awareness

- The inventory is optional. Not having one is ordinary — Steps 2–3 handle the lookup without it.
- Where it is missing, you MAY suggest the user run the extraction after the current task — but do not block on it
- Let a stale cache (> 30 days) prompt a refresh suggestion, and still prefer it to a live query

## Persona Integration Checklist

Every consultant persona MUST list, inside its `<Reference_Data>` section:

1. Local Customization Cache (`.sapkit/customizations/{MODULE}/{enhancements,extensions}.json`) — **priority 1 for any extension/enhancement recommendation**
2. Static fallback (`../knowledge/modules/{MODULE}/enhancements.md`) — name-only reference
3. A pointer back to this protocol: `customization-lookup.md`

[sap-critic](../personas/sap-critic.md) MUST flag any plan that reaches for a new BAdI / CMOD / append without justifying why the existing Z implementation (where one exists) cannot be extended.

Any procedure that hands off to a consultant or critic persona MUST carry a "customization cache available: yes/no + timestamp" flag in the handoff context.
