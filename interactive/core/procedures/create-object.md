---
name: create-object
description: ABAP object creation procedure — freeze package and transport intent, then create, write the initial implementation, and activate under attended P3 (MCP success = PROVISIONAL_WRITE, not completion)
source:
  - sc4sap-custom/skills/create-object/SKILL.md
  - sc4sap-custom/skills/create-object/workflow-steps.md
  - sc4sap-custom/skills/create-object/dispatch-prompts.md
---

# Create Object

ABAP object creation procedure for a single agent. Under the attended Track A
Policy: freeze the target and transport intent interactively, then — with a present
human operator (P3) — create, write initial code, and activate the object. Object
creation is not auto-completed on a single confirmation; see "Track A Policy
Alignment" below.

## Purpose

Handle the full lifecycle of creating a new ABAP object: determine the right object type, confirm package and transport assignment, create the object via MCP, generate a well-structured initial implementation, and activate it. Direct produces a DRAFT; the SAP-write steps are attended P3 and their success is PROVISIONAL_WRITE (not completion).

## Track A Policy Alignment (attended-only)

This procedure is a Track A mutation path (see `AGENTS.md` and the 2026-07-16
roadmap §6). Apply the Policy, not a one-shot auto-run:

- **Freeze first (P0/P1).** Object type, name, DEV tier, package, object allowlist,
  and transport intent are confirmed and frozen before any `Create*` call.
- **Apply is P3 and attended.** `Create*` / `Update*` / `ActivateObjects` run only
  with a present human operator. There is no unattended completion (`unattended` is
  sealed — D-025 §7), and a single confirmation does not auto-complete the object.
- **MCP success is PROVISIONAL_WRITE, not done.** An ACTIVE result from
  `GetInactiveObjects` proves the object links — it is not a completion stamp.
- **COMPLETE is reached by handoff to a Guided run** that records an exact-subject
  review `R-PASS` and a vsp-backed `V-PASS` (source read-back · syntax · activate ·
  unit · ATC). The Step 7 report labels the state accordingly.

## Use When

- User says "create", "new class", "new program", "create object", "add a function module", "new table", etc.
- A new ABAP development artifact needs to be created from scratch
- User knows what they want to build but needs the creation scaffolded correctly

## Do Not Use When

- Minor modification of an existing object — use the [modify-object](./modify-object.md) procedure (Minimal intensity)
- Creating multiple interdependent objects or a full program with includes — use the `create-program` procedure
- User just wants to understand what type to use — answer from the matching module consultant persona (see [personas INDEX](../personas/INDEX.md))

## Supported Object Types

| Type | MCP Create Tool | Description |
|------|----------------|-------------|
| Class | `CreateClass` | ABAP OO class (local or global) |
| Interface | `CreateInterface` | ABAP OO interface |
| Program | `CreateProgram` | Executable program (report) |
| Function Module | `CreateFunctionModule` + `CreateFunctionGroup` | RFC-capable function module |
| Table | `CreateTable` | Transparent database table |
| Structure | `CreateStructure` | ABAP structure (type definition) |
| Data Element | `CreateDataElement` | Domain-based data element |
| Domain | `CreateDomain` | Value domain with fixed values or ranges |
| CDS View | `CreateView` | Core Data Services view |
| Service Definition | `CreateServiceDefinition` | OData service definition |
| Service Binding | `CreateServiceBinding` | OData service binding (UI5/API) |
| Behavior Definition | `CreateBehaviorDefinition` | RAP behavior definition |
| Screen | `CreateScreen` | Dynpro screen (selection screen or dialog) |
| GUI Status | `CreateGuiStatus` | PF-Status (menu bar, toolbar, function keys) |

## Mandatory Rule Reads

- **ECC DDIC fallback**: Read [ecc-ddic-fallback](../knowledge/abap/conventions/ecc-ddic-fallback.md) before creating any Table / Data Element / Domain. It defines when the ECC branch triggers, the helper-program naming rules, the strict template format (mirroring the [ecc templates](../knowledge/abap/templates/ecc/)), and the hard constraints (`$TMP` only, no activate, no CTS).
- **Field typing**: Read [field-typing-rule](../knowledge/abap/conventions/field-typing-rule.md) for every Table / Structure / Table Type field-type decision (standard MCP flow **and** ECC helper-program fallback). Priority: **Standard DE (1)** → **existing CBO DE (2)** → **new CBO DE (3)** → **Data Type + Length (4, last resort)**. Raw primitives like `LIFNR CHAR 10` / `MATNR CHAR 40` / `BUKRS CHAR 4` are forbidden when an authoritative SAP data element exists. Before each field, run `SearchObject` against `DTEL` and check `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`.
- **Function module signature**: Read [function-module-rule](../knowledge/abap/conventions/function-module-rule.md) for every `UpdateFunctionModule` source emission. FM signature is stored inline in the `FUNCTION` statement source (SAP parses it on write and updates TFDIR/FUPARAREF automatically). There is no separate "parameters" endpoint. Every FM source MUST declare `IMPORTING / EXPORTING / CHANGING / TABLES / EXCEPTIONS` clauses directly between `FUNCTION {name}` and the first `.`. Never emit the placeholder `" You can use the template 'functionModuleParameter' ...` line, never use `*"*"Local Interface:` blocks as a substitute, never declare shadow locals like `lv_iv_xxx TYPE ...` to stand in for missing parameters. Remote-Enabled (RFC) flag is a separate concern — stored in TFDIR.FMODE, not in source; it currently requires manual SE37 Properties update — flag this in the completion report.
- **Naming conventions**: Read [naming-conventions](../knowledge/modules/common/naming-conventions.md) (module-aware reference) and [naming-conventions (conventions)](../knowledge/abap/conventions/naming-conventions.md) before creating any object. Coverage: general rules (prefix, case, character set, length limits); module codes (SD/MM/FI/CO/...) for the `Z{MODULE}_...` pattern; object-specific patterns — Classes (ZCL_/ZIF_/ZCX_), Programs (ZR_), Function Groups/Modules, Data Dictionary (ZT_/ZDE_/ZDO_), UI (Dynpro/GUI Status), OData/RAP (Z_I_/Z_C_/Z_BP_/Z_SB_), Enhancements, IDoc/ALE; code-level naming (variables LV_/LS_/LT_/IV_/EV_/MV_; constants GC_/LC_; types TY_; methods); validation rules.
- **Project rules**: Read `.sc4sap/RULES.md` if present — apply the rules relevant to this task; matching rules are hard constraints. If absent, continue silently.

**Quick naming validation checklist (applied before every create):**

1. Starts with `Z` or `Y` (customer namespace)
2. UPPERCASE only, characters in `[A-Z0-9_]`
3. Within max length (30 chars for most objects)
4. Not generic (ZTEST/ZTEMP/ZDUMMY forbidden)
5. Object-type prefix follows the reference (e.g., `ZCL_` for classes, `ZIF_` for interfaces)
6. Screen = 4-digit number (e.g., 0100); GUI Status = uppercase identifier (e.g., STATUS_0100) — both require a parent program

If the user-provided name violates any rule, suggest a compliant alternative before proceeding.

## Attended Flow

**Freeze** (interactive — human confirmation gate before any create; a present
operator, DEV tier only):

- Object name (enforce Z/Y prefix, max 30 chars, uppercase)
- Package assignment (search with `GetPackage` if unsure)
- Transport intent (list open transports via `ListTransports`, or create new) —
  freeze the request / intent before applying
- Short description

**Apply** (attended P3 — only with the operator present; not an unattended
auto-run):

- Create object via the appropriate MCP `Create*` tool
- Generate initial implementation (skeleton with proper structure)
- Activate the object
- Verify activation via `GetInactiveObjects` — an ACTIVE result is
  **PROVISIONAL_WRITE**, not completion (see "Track A Policy Alignment" above)

## Workflow Steps

### Step 1 — Classify Object Type

- Parse the user request to determine object type (class / interface / program / function module / table / structure / data element / domain / CDS view / service definition / service binding / behavior definition / screen / GUI status).
- If ambiguous: ask a single clarifying question and stop.

### Step 2 — Collect Metadata (confirmation gate)

- **Object name**: suggest based on description; enforce `Z`/`Y` prefix, ≤ 30 chars, uppercase, no special chars except underscore. Reject generic names (`ZTEST` / `ZTEMP` / `ZDUMMY`).
- **Short description**: 1 line, ≤ 60 chars.
- **Package**: show recent packages or search via `GetPackage`; warn if `$TMP` (local, non-transportable).
- **Transport**: list open transports owned by current user via `ListTransports`; offer create-new if no suitable TR exists.
- **Module-active context** (conditional): when the object targets a specific module (MM table, SD structure, PS data element, …), read `SAP_ACTIVE_MODULES` from `sap.env` / `config.json` and consult `active-modules.md`. If companion modules are active, propose integration fields (e.g., MM table in a landscape with PS active → suggest `PS_POSID` / `AUFNR`). Do NOT add silently — propose to the user and let them accept/decline, then carry the confirmed field list into Step 4.

### Step 3 — Pre-Creation Check

- Call `SearchObject(<name>, <type>)` to verify the name does NOT already exist.
- If it exists: *"Object {name} already exists. Modify via direct MCP `Update*` calls (`UpdateClass`, `UpdateProgram`, `UpdateInclude`, etc.)."* Stop.
- If the object already exists because an earlier run of this procedure was interrupted, skip Create and resume with `Update*`/`ActivateObjects` instead of stopping.

### Step 3.5 — Version Branch Decision

- Read `SAP_VERSION` from `.sc4sap/config.json` (or `sap.env`).
- If `SAP_VERSION = ECC` **and** object type ∈ {Table, Data Element, Domain} → go to Step 4-ECC.
- Otherwise → go to Step 4 (standard flow).

### Step 4 — Create + Implement + Activate (standard flow)

Adopt the [sap-executor](../personas/sap-executor.md) persona for this step. Standard flow (S/4HANA, or non-DDIC on ECC): one continuous pass covers object creation, initial implementation code, and activation.

Implementation within this step may be delegated per [development-loop.md](../policies/development-loop.md)'s `execution_owner` convention; reviewer independence and main-only control artifacts still apply.

Inputs carried from Steps 2–3: name, type, description, package, transport (`TRKORR` or `$TMP`), `extra_fields` (confirmed per-module integration fields — Tables/Structures only), `fm_signature` (IMPORTING/EXPORTING/CHANGING/TABLES/EXCEPTIONS — FunctionModule only).

Execute in order:

1. **CREATE** — call the matching MCP tool (`CreateClass` / `CreateProgram` / `CreateFunctionGroup` + `CreateFunctionModule` / `CreateTable` / ...). For FM: ensure the parent Function Group exists first. For Service Binding: the Service Definition must exist first. For Screen / GUI Status: the parent program must exist.
2. **IMPLEMENT** — write initial implementation via the matching `Update*` MCP tool; if `vsp` is installed, lint/parse the source locally first — optional, not a gate ([troubleshooting §7](troubleshooting.md#7-vsp-local-verification-optional)):
   - Class: constructor + method signatures + exception handling per [clean-code-oop](../knowledge/abap/conventions/clean-code-oop.md)
   - Program: REPORT statement + basic structure + include scaffold when applicable ([include-structure](../knowledge/abap/conventions/include-structure.md))
   - Function Module: inline IMPORTING/EXPORTING/CHANGING/TABLES/EXCEPTIONS in the FUNCTION statement per [function-module-rule](../knowledge/abap/conventions/function-module-rule.md) — never `*"*"Local Interface:` blocks, never shadow-local placeholders
   - Table / Structure: key fields + client field (MANDT for client-dependent) + each field typed per [field-typing-rule](../knowledge/abap/conventions/field-typing-rule.md) (priority Standard DE → CBO DE → new CBO DE → primitive data-type+length, last resort with inline justification)
   - Interface: method signatures based on described purpose
   - Screen: PROCESS BEFORE OUTPUT / PROCESS AFTER INPUT + basic module stubs
   - GUI Status: standard function key layout (Back/Exit/Cancel) + application toolbar
3. **ACTIVATE** — `ActivateObjects` then `GetInactiveObjects` to verify. Retry once on activation failure. If still failing, record status FAILED with the error message.

Record the outcome for Step 7 (JSON-like):

```
{
  "object_name"           : "<NAME>",
  "object_type"           : "<TYPE>",
  "package"               : "<PACKAGE>",
  "transport"             : "<TRKORR or $TMP>",
  "flow"                  : "standard",
  "activation_status"     : "ACTIVE" | "FAILED",
  "field_typing_decisions": [{field, type, rollname, priority, justification}],  // Tables/Structures only
  "warnings"              : ["..."],
  "errors"                : ["..."]                                              // only on FAILED
}
```

Rules:

- Screen / GUI Status / Text Element availability: these three tool families dispatch through the server-side `ZMCP_ADT_DISPATCH` / `ZMCP_ADT_TEXTPOOL` FMs. When those FMs are absent on the target system OR the RFC backend is not configured, treat the affected object as **SKIPPED** (an environment gap, not a failure): report it as SKIPPED in Step 7 with the reason, do not retry, and point the user to the [install-sap-assets](install-sap-assets.md) procedure for remediation. When the work feeds a review request (e.g. inside `create-program`), the skip must additionally be recorded under `environment_context.known_outages` per that procedure's Phase 6.
- Field typing: always follow [field-typing-rule](../knowledge/abap/conventions/field-typing-rule.md) — run `SearchObject(DTEL)` + check `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` before falling back to primitives.
- FM signature: always inline in the FUNCTION statement per [function-module-rule](../knowledge/abap/conventions/function-module-rule.md).
- Naming: already validated in Step 2, but run a second-pass check and refuse on violation.
- On FAILED activation: surface the error verbatim via the Step 7 report (flow = failed); do not silently retry beyond the single retry above.

### Step 4-ECC — DDIC Helper Program (ECC fallback)

Adopt the [sap-executor](../personas/sap-executor.md) persona for this step. ECC branch only (`SAP_VERSION = ECC` + Table/DTEL/DOMA). The DDIC object itself cannot be created via MCP on ECC; generate a helper ABAP program the user runs in SE38.

Inputs: `ddic_target_name`, `ddic_target_type` (Table | DataElement | Domain), description, `field_list` (Tables only; per [field-typing-rule](../knowledge/abap/conventions/field-typing-rule.md)).

Execute in order:

1. Read the matching template:
   - Table → [table_create_sample.abap](../knowledge/abap/templates/ecc/table_create_sample.abap)
   - DataElement → [element_create_sample.abap](../knowledge/abap/templates/ecc/element_create_sample.abap)
   - Domain → [domain_create_sample.abap](../knowledge/abap/templates/ecc/domain_create_sample.abap)
2. Compute the helper program name per the [ecc-ddic-fallback](../knowledge/abap/conventions/ecc-ddic-fallback.md) naming table. Verify ≤ 30 chars.
3. Call `CreateProgram` with: `program_name = <helper>`, `package_name = "$TMP"`, `program_type = "executable"`, `description = "Create DDIC <type> <name> on ECC"`.
4. Call `UpdateProgram` with the generated source — substitute ONLY: the target DDIC object name; field list / fixed values / labels; the description line. Every add_field call MUST use rollname where priority 1–3 (Standard DE / CBO DE) applies; primitive data-type+length requires inline justification. Keep the template skeleton verbatim.
5. Activate the helper program (activate = true).

**DO NOT attempt `CreateTable` / `CreateDataElement` / `CreateDomain` on ECC — they are disallowed.**

Record the outcome for Step 7:

```
{
  "object_name"           : "<NAME>",
  "object_type"           : "<TYPE>",
  "flow"                  : "ecc-helper",
  "activation_status"     : "ECC_DEFERRED",
  "helper_program_name"   : "<HELPER_NAME>",
  "field_typing_decisions": [...],
  "warnings"              : ["..."]
}
```

### Step 7 — Completion Report

Adopt the [sap-writer](../personas/sap-writer.md) persona for this step. Pure formatting from the Step 4 outcome record — localize to the user's current conversation language.

Render rules:

- flow = "standard" AND activation_status = "ACTIVE": 5–7 line block — object name · type · package · transport · **state = PROVISIONAL_WRITE** (created + active on DEV; not yet COMPLETE) + 1-line next-step hint. Do NOT report the object as "완료 / done" from MCP success alone — COMPLETE requires a Guided run's exact-subject review `R-PASS` plus a vsp `V-PASS`. Next-step examples: "Add methods with direct `UpdateClass` MCP calls", "Hand off to a Guided run for R-PASS + vsp V-PASS to complete", or "Release with the [release](release.md) procedure".
- flow = "standard" AND activation_status = "FAILED": error message + suggested fix + retry hint.
- flow = "ecc-helper" AND activation_status = "ECC_DEFERRED": **use the MANDATORY format VERBATIM** (do NOT rephrase):

  ```
  ⚠ ECC detected — DDIC {Table|Data Element|Domain} cannot be created via MCP.
  Helper program generated instead:
    Program : <HELPER_NAME>           (package $TMP, activated)
    Target  : <DDIC_OBJECT_NAME>      ({type})

  Next steps (manual, in ECC):
    1. SE38 → run <HELPER_NAME>                 (dry-run previews field layout)
    2. Uncheck p_dryrun → re-run                (writes inactive DDIC version)
    3. SE11 → open <DDIC_OBJECT_NAME>           (activate, assign package + transport)
  ```

  Do NOT claim the DDIC object is created. Do NOT propose follow-up automation until the user confirms activation in SE11.

- Any warnings → append a "⚠️ Warnings" bullet list after the main block.
- Any field_typing_decisions with priority=4 (primitive fallback) → append a "🔍 Field typing" note listing which field + the justification, so the user can inspect.

## Safety Rails

- ECC DDIC: NEVER call `CreateTable` / `CreateDataElement` / `CreateDomain` when `SAP_VERSION = ECC`.
- Field typing: NEVER emit `LIFNR CHAR 10` / `MATNR CHAR 40` / `BUKRS CHAR 4` or any other raw-primitive declaration where an authoritative SAP Data Element exists — enforced by [field-typing-rule](../knowledge/abap/conventions/field-typing-rule.md).
- FM signature: NEVER emit the placeholder `" You can use the template 'functionModuleParameter' ..."` line, never use `*"*"Local Interface:` blocks as a substitute — enforced by [function-module-rule](../knowledge/abap/conventions/function-module-rule.md).
- Naming: validated in Step 2 before any create; second-pass check in Step 4 refuses on violation.

## MCP Tools Used

- `SearchObject` — check for existing objects
- `ListTransports` — list available transports
- `GetPackage` — verify package existence
- `CreateClass` / `CreateInterface` / `CreateProgram` / `CreateFunctionGroup` / `CreateFunctionModule` / `CreateTable` / `CreateStructure` / `CreateDataElement` / `CreateDomain` / `CreateView` / `CreateServiceDefinition` / `CreateServiceBinding` / `CreateBehaviorDefinition` / `CreateScreen` / `CreateGuiStatus`
- `UpdateClass` / `UpdateProgram` / `UpdateScreen` / `UpdateGuiStatus` / etc. — write initial implementation
- `ActivateObjects` / `GetInactiveObjects` — activate and verify
- **ECC DDIC fallback:** only `CreateProgram` + `UpdateProgram` (target `$TMP`). `CreateTable` / `CreateDataElement` / `CreateDomain` must NOT be attempted when `SAP_VERSION = ECC`.
