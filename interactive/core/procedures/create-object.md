---
name: create-object
description: ABAP object creation procedure — freeze package and transport intent, then create, write the initial implementation, and activate under attended P3 (MCP success = PROVISIONAL_WRITE, not completion)
source:
  - sc4sap-custom/skills/create-object/SKILL.md
  - sc4sap-custom/skills/create-object/workflow-steps.md
  - sc4sap-custom/skills/create-object/dispatch-prompts.md
---

# Create Object

ABAP object creation, run by a single agent. Under the attended Track A
Policy: pin the target and the transport intent down interactively, then — with a
human operator present (P3) — create the object, write its initial code, and activate
it. One confirmation does not auto-complete an object creation; see "Track A Policy
Alignment" below.

## Purpose

Carry a new ABAP object through its whole creation lifecycle: settle on the right object type, confirm the package and transport assignment, create the object through MCP, generate a well-structured initial implementation, and activate it. What Direct produces is a DRAFT; the SAP-write steps run attended P3, and their success reads as PROVISIONAL_WRITE (not completion).

## Track A Policy Alignment (attended-only)

This procedure is one of Track A's mutation paths (see `AGENTS.md` and the 2026-07-16
roadmap §6). Apply the Policy — not a one-shot auto-run:

- **Freeze first (P0/P1).** Object type, name, DEV tier, package, object allowlist,
  and transport intent all get confirmed and frozen before any `Create*` call goes out.
- **Apply is P3, and attended.** `Create*` / `Update*` / `ActivateObjects` run only
  while a human operator is present. Unattended completion does not exist here
  (`unattended` is sealed — D-025 §7), and a single confirmation does not auto-complete
  the object.
- **MCP success means PROVISIONAL_WRITE, not done.** An ACTIVE result out of
  `GetInactiveObjects` proves the object links — it is not a completion stamp.
- **COMPLETE arrives by handing off to a Guided run** that records an exact-subject
  review `R-PASS`, paired with a machine check of what SAP is actually holding —
  the source read back and compared against the source that was intended, plus
  syntax and active-state confirmation — per [verify-applied](verify-applied.md). The
  Step 7 report labels the state to match.

## Use When

- The user says "create", "new class", "new program", "create object", "add a function module", "new table", and the like
- A new ABAP development artifact has to be built from scratch
- The user knows what they want built but needs the creation scaffolded correctly

## Do Not Use When

- A minor modification to an object that already exists — reach for the [modify-object](./modify-object.md) procedure (Minimal intensity)
- Several interdependent objects, or a full program with includes — reach for the `create-program` procedure
- The user just wants to know which type applies — answer from the matching module consultant persona (see [personas INDEX](../personas/INDEX.md))

## Supported Object Types

| Type | MCP Create Tool | Description |
|------|----------------|-------------|
| Class | `CreateClass` | OO class in ABAP (local or global) |
| Interface | `CreateInterface` | OO interface in ABAP |
| Program | `CreateProgram` | Executable program (a report) |
| Function Module | `CreateFunctionModule` + `CreateFunctionGroup` | Function module, RFC-capable |
| Table | `CreateTable` | Database table, transparent |
| Structure | `CreateStructure` | ABAP structure (a type definition) |
| Data Element | `CreateDataElement` | Data element built on a domain |
| Domain | `CreateDomain` | Value domain carrying fixed values or ranges |
| CDS View | `CreateView` | View in Core Data Services |
| Service Definition | `CreateServiceDefinition` | Service definition for OData |
| Service Binding | `CreateServiceBinding` | Service binding for OData (UI5/API) |
| Behavior Definition | `CreateBehaviorDefinition` | Behavior definition for RAP |
| Screen | `CreateScreen` | Dynpro screen (a selection screen or a dialog) |
| GUI Status | `CreateGuiStatus` | PF-Status (menu bar, toolbar, function keys) |

## Mandatory Rule Reads

- **ECC DDIC fallback**: Read [ecc-ddic-fallback](../knowledge/abap/conventions/ecc-ddic-fallback.md) before any Table / Data Element / Domain is created. It sets out when the ECC branch fires, how helper programs are named, the strict template format (which mirrors the [ecc templates](../knowledge/abap/templates/ecc/)), and the hard constraints (`$TMP` only, no activate, no CTS).
- **Field typing**: Read [field-typing-rule](../knowledge/abap/conventions/field-typing-rule.md) for every field-type decision on a Table / Structure / Table Type (the standard MCP flow **and** the ECC helper-program fallback). Priority: **Standard DE (1)** → **existing CBO DE (2)** → **new CBO DE (3)** → **Data Type + Length (4, last resort)**. Raw primitives on the order of `LIFNR CHAR 10` / `MATNR CHAR 40` / `BUKRS CHAR 4` are forbidden when an authoritative SAP data element exists. Before each field, run `SearchObject` against `DTEL` and check `.sapkit/cbo/<MODULE>/<PACKAGE>/inventory.json`.
- **Function module signature**: Read [function-module-rule](../knowledge/abap/conventions/function-module-rule.md) for every `UpdateFunctionModule` source emission. An FM's signature lives inline in the `FUNCTION` statement source (SAP parses it on write and updates TFDIR/FUPARAREF by itself). No separate "parameters" endpoint exists. Every FM source MUST declare its `IMPORTING / EXPORTING / CHANGING / TABLES / EXCEPTIONS` clauses directly between `FUNCTION {name}` and the first `.`. Never emit the placeholder `" You can use the template 'functionModuleParameter' ...` line, never put `*"*"Local Interface:` blocks in its place, never declare shadow locals such as `lv_iv_xxx TYPE ...` to stand in for parameters that are missing. The Remote-Enabled (RFC) flag is a separate matter — it sits in TFDIR.FMODE rather than in source, and at present it takes a manual SE37 Properties update — flag that in the completion report.
- **RAP / OData artifacts**: Read [rap-odata-rules](../knowledge/abap/conventions/rap-odata-rules.md) before any Behavior Definition / Behavior Implementation / Service Definition / Service Binding / Metadata Extension (DDLX) or OData-exposed CDS view is created or edited. It lists the field-verified **silent** failure modes — projection `use etag` non-inheritance, DDLX facet scope, conversion-exit fields, backend cache masking `$metadata`, `/srvd/` vs `/srvd_a2x/`, on-premise publish paths — that activation, syntax check, and ATC all wave through without a warning. When the RAP/EML or ABAP syntax itself is what you need, pull the official ABAP Keyword Documentation through [help-portal-fetch](help-portal-fetch.md) — if that fetch cannot be completed, say so plainly rather than reciting the syntax from memory.
- **Naming conventions**: Read [naming-conventions](../knowledge/modules/common/naming-conventions.md) (the module-aware reference) and [naming-conventions (conventions)](../knowledge/abap/conventions/naming-conventions.md) before any object is created. What they cover: the general rules (prefix, case, character set, length limits); the module codes (SD/MM/FI/CO/...) behind the `Z{MODULE}_...` pattern; the object-specific patterns — Classes (ZCL_/ZIF_/ZCX_), Programs (ZR_), Function Groups/Modules, Data Dictionary (ZT_/ZDE_/ZDO_), UI (Dynpro/GUI Status), OData/RAP (Z_I_/Z_C_/Z_BP_/Z_SB_), Enhancements, IDoc/ALE; naming down at code level (variables LV_/LS_/LT_/IV_/EV_/MV_; constants GC_/LC_; types TY_; methods); and the validation rules.
- **Project rules**: Read `.sapkit/RULES.md` where it is present — apply whichever rules bear on this task; a rule that matches is a hard constraint. Where it is absent, carry on silently.

**Quick naming validation checklist (applied before every create):**

1. Begins with `Z` or `Y` (the customer namespace)
2. UPPERCASE only, every character inside `[A-Z0-9_]`
3. Inside the max length (30 chars for most objects)
4. Nothing generic (ZTEST/ZTEMP/ZDUMMY forbidden)
5. The object-type prefix follows the reference (e.g., `ZCL_` for a class, `ZIF_` for an interface)
6. Screen = a 4-digit number (e.g., 0100); GUI Status = an uppercase identifier (e.g., STATUS_0100) — both require a parent program

Where the name the user supplied breaks any rule, put a compliant alternative forward before going on.

## Attended Flow

**Freeze** (interactive — a human confirmation gate before any create; an operator
present, DEV tier only):

Where `.sapkit/deep-interviews/` holds a brief whose object scope matches this
request, read that first as the freeze input — confirm the match with the user in
a single line, then close out the items the brief already answers (object type,
package, transport strategy, …) by restating them for confirmation instead of
asking again. It is the same consumption pattern as create-program's
[Intake Resolution](./create-program.md#intake-resolution--spec-entry-forms).

- Object name (enforce the Z/Y prefix, max 30 chars, uppercase)
- Package assignment (search with `GetPackage` where unsure)
- Transport intent (list the open transports via `ListTransports`, or create a new one) —
  freeze the request / intent before anything is applied
- A short description

**Apply** (attended P3 — only while the operator is present; not an unattended
auto-run):

- Create the object through whichever MCP `Create*` tool fits
- Generate the initial implementation (a skeleton with proper structure)
- Bring the object active
- Verify the activation via `GetInactiveObjects` — an ACTIVE result is
  **PROVISIONAL_WRITE**, not completion (see "Track A Policy Alignment" above)

## Workflow Steps

### Step 1 — Classify Object Type

- Read the user's request to settle the object type (class / interface / program / function module / table / structure / data element / domain / CDS view / service definition / service binding / behavior definition / screen / GUI status).
- Where it is ambiguous: ask one clarifying question and stop.

### Step 2 — Collect Metadata (confirmation gate)

- **Object name**: propose one off the description; enforce the `Z`/`Y` prefix, ≤ 30 chars, uppercase, no special characters beyond the underscore. Reject generic names (`ZTEST` / `ZTEMP` / `ZDUMMY`).
- **Short description**: one line, ≤ 60 chars.
- **Package**: show the recent packages, or search via `GetPackage`; warn on `$TMP` (local, non-transportable).
- **Transport**: list the open transports the current user owns via `ListTransports`; offer to create a new one where no suitable TR exists.
- **Module-active context** (conditional): where the object aims at a specific module (an MM table, an SD structure, a PS data element, …), read `SAP_ACTIVE_MODULES` out of `sap.env` / `config.json` and consult `active-modules.md`. Where companion modules are active, put integration fields forward (e.g., an MM table in a landscape with PS active → suggest `PS_POSID` / `AUFNR`). Do NOT add silently — put them to the user and let them accept/decline, then carry the confirmed field list into Step 4.

### Step 3 — Pre-Creation Check

- Call `SearchObject(<name>, <type>)` to confirm the name does NOT already exist.
- Where it exists: *"Object {name} already exists. Modify via direct MCP `Update*` calls (`UpdateClass`, `UpdateProgram`, `UpdateInclude`, etc.)."* Stop.
- Where the object exists because an earlier run of this procedure was interrupted, skip the Create and pick up with `Update*`/`ActivateObjects` instead of stopping.

### Step 3.5 — Version Branch Decision

- Read `SAP_VERSION` out of `.sapkit/config.json` (or `sap.env`).
- Where `SAP_VERSION = ECC` **and** the object type ∈ {Table, Data Element, Domain} → go to Step 4-ECC.
- Otherwise → go to Step 4 (the standard flow).

### Step 4 — Create + Implement + Activate (standard flow)

Adopt the [sap-executor](../personas/sap-executor.md) persona for this step. The standard flow (S/4HANA, or non-DDIC on ECC) takes object creation, the initial implementation code, and activation in one continuous pass.

The implementation inside this step may be delegated under the `execution_owner` convention in [development-loop.md](../policies/development-loop.md); reviewer independence and main-only control artifacts hold regardless. Where the owner has gone unstated and this object is big enough that delegation would materially help, ask once — `[1] main` / `[2] delegated`, default `main` — and otherwise stay on `main` without asking. Launching a worker is adapter-specific ("구현 위임" in [adapters/claude/README.md](../../adapters/claude/README.md), [codex](../../adapters/codex/README.md), [antigravity](../../adapters/antigravity/README.md)); where no worker mechanism exists, say so and carry on as `main`.

Inputs carried in from Steps 2–3: name, type, description, package, transport (`TRKORR` or `$TMP`), `extra_fields` (the confirmed per-module integration fields — Tables/Structures only), `fm_signature` (IMPORTING/EXPORTING/CHANGING/TABLES/EXCEPTIONS — FunctionModule only).

Execute in this order:

1. **CREATE** — call the matching MCP tool (`CreateClass` / `CreateProgram` / `CreateFunctionGroup` + `CreateFunctionModule` / `CreateTable` / ...). For an FM: make sure the parent Function Group is there first. For a Service Binding: the Service Definition must exist first. For a Screen / GUI Status: the parent program must exist.
2. **IMPLEMENT** — write the initial implementation through the matching `Update*` MCP tool; run the bundled checker's 13-rule offline analysis over the source first (`node "<plugin root>/checker/sapkit-checker.bundle.cjs" analyze <file> --format json`) — optional, not a gate; on the Claude adapter the `offline-code-analysis` hook fires it automatically after each source write ([troubleshooting §7](troubleshooting.md#7-sapkit-checker--local-offline-analysis-bundled)). For Class / Program / Interface, `CheckSyntax` with `source_code` compiles the proposed source server-side **without writing anything** — a cheap pre-write check that saves an activation round-trip (those three object types only; the include/FM variants check the server's inactive version instead, field-verified 2026-07):
   - Class: constructor, method signatures, and exception handling per [clean-code-oop](../knowledge/abap/conventions/clean-code-oop.md)
   - Program: the REPORT statement, the basic structure, and an include scaffold where applicable ([include-structure](../knowledge/abap/conventions/include-structure.md))
   - Function Module: IMPORTING/EXPORTING/CHANGING/TABLES/EXCEPTIONS inline in the FUNCTION statement per [function-module-rule](../knowledge/abap/conventions/function-module-rule.md) — never `*"*"Local Interface:` blocks, never shadow-local placeholders
   - Table / Structure: the key fields, the client field (MANDT where client-dependent), and each field typed per [field-typing-rule](../knowledge/abap/conventions/field-typing-rule.md) (priority Standard DE → CBO DE → new CBO DE → primitive data-type+length, a last resort carrying inline justification)
   - Interface: method signatures drawn from the purpose as described
   - Screen: PROCESS BEFORE OUTPUT / PROCESS AFTER INPUT plus the basic module stubs
   - GUI Status: the standard function key layout (Back/Exit/Cancel) plus the application toolbar
3. **ACTIVATE** — `ActivateObjects`, then `GetInactiveObjects` to verify. Retry once when activation fails. Where it still fails, record status FAILED along with the error message.

Note the outcome down for Step 7 (JSON-like):

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

- Screen / GUI Status / Text Element availability: those three tool families dispatch through the server-side `ZSAPKIT_ADT_DISPATCH` / `ZSAPKIT_ADT_TEXTPOOL` FMs. Where those FMs are absent on the target system OR the RFC backend is not configured, treat the affected object as **SKIPPED** (an environment gap, not a failure): report it as SKIPPED in Step 7 with the reason, do not retry, and send the user to the [install-sap-assets](install-sap-assets.md) procedure for remediation. Where the work feeds a review request (inside `create-program`, say), the skip must additionally be recorded under `environment_context.known_outages` per that procedure's Phase 6.
- Field typing: always follow [field-typing-rule](../knowledge/abap/conventions/field-typing-rule.md) — run `SearchObject(DTEL)` + check `.sapkit/cbo/<MODULE>/<PACKAGE>/inventory.json` before any fall back to primitives.
- FM signature: always inline within the FUNCTION statement per [function-module-rule](../knowledge/abap/conventions/function-module-rule.md).
- Naming: validated already in Step 2, but run a second-pass check and refuse on a violation.
- On a FAILED activation: surface the error verbatim through the Step 7 report (flow = failed); do not silently retry past the single retry above.

### Step 4-ECC — DDIC Helper Program (ECC fallback)

Adopt the [sap-executor](../personas/sap-executor.md) persona for this step. The ECC branch only (`SAP_VERSION = ECC` + Table/DTEL/DOMA). On ECC the DDIC object itself cannot be created through MCP; generate a helper ABAP program instead, for the user to run in SE38.

Inputs: `ddic_target_name`, `ddic_target_type` (Table | DataElement | Domain), the description, and `field_list` (Tables only; per [field-typing-rule](../knowledge/abap/conventions/field-typing-rule.md)).

Execute in this order:

1. Read the template that matches:
   - Table → [table_create_sample.abap](../knowledge/abap/templates/ecc/table_create_sample.abap)
   - DataElement → [element_create_sample.abap](../knowledge/abap/templates/ecc/element_create_sample.abap)
   - Domain → [domain_create_sample.abap](../knowledge/abap/templates/ecc/domain_create_sample.abap)
2. Work the helper program name out from the naming table in [ecc-ddic-fallback](../knowledge/abap/conventions/ecc-ddic-fallback.md). Verify it is ≤ 30 chars.
3. Call `CreateProgram` with `program_name = <helper>`, `package_name = "$TMP"`, `program_type = "executable"`, `description = "Create DDIC <type> <name> on ECC"`.
4. Call `UpdateProgram` with the generated source — substituting ONLY the target DDIC object name; the field list / fixed values / labels; and the description line. Every add_field call MUST use rollname wherever priority 1–3 (Standard DE / CBO DE) applies; a primitive data-type+length requires inline justification. Keep the template skeleton verbatim.
5. Bring the helper program active (activate = true).

**DO NOT attempt `CreateTable` / `CreateDataElement` / `CreateDomain` on ECC — they are disallowed.**

Note the outcome down for Step 7:

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

Adopt the [sap-writer](../personas/sap-writer.md) persona for this step. It is formatting and nothing else, off the Step 4 outcome record — localized into the user's current conversation language.

Render rules:

- flow = "standard" AND activation_status = "ACTIVE": a 5–7 line block — object name · type · package · transport · **state = PROVISIONAL_WRITE** (created + active on DEV; not yet COMPLETE) plus a 1-line next-step hint. Do NOT report the object as "완료 / done" off MCP success alone — COMPLETE requires a Guided run's exact-subject review `R-PASS` plus a machine check of what SAP is actually holding ([verify-applied](verify-applied.md)). Next-step examples: "Add methods with direct `UpdateClass` MCP calls", "Confirm what SAP holds with [verify-applied](verify-applied.md), then hand off to a Guided run for R-PASS", or "Release with the [release](release.md) procedure".
- flow = "standard" AND activation_status = "FAILED": the error message, a suggested fix, and a retry hint.
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

  Do NOT claim the DDIC object has been created. Do NOT put follow-up automation forward until the user confirms activation in SE11.

- Any warnings → append a "⚠️ Warnings" bullet list below the main block.
- Any field_typing_decisions carrying priority=4 (the primitive fallback) → append a "🔍 Field typing" note naming the field and its justification, so the user can inspect it.

## Safety Rails

- ECC DDIC: NEVER call `CreateTable` / `CreateDataElement` / `CreateDomain` while `SAP_VERSION = ECC`.
- Field typing: NEVER emit `LIFNR CHAR 10` / `MATNR CHAR 40` / `BUKRS CHAR 4`, or any other raw-primitive declaration, where an authoritative SAP Data Element exists — enforced by [field-typing-rule](../knowledge/abap/conventions/field-typing-rule.md).
- FM signature: NEVER emit the placeholder `" You can use the template 'functionModuleParameter' ..."` line, and never put `*"*"Local Interface:` blocks in its place — enforced by [function-module-rule](../knowledge/abap/conventions/function-module-rule.md).
- Naming: validated in Step 2 before any create; the second-pass check in Step 4 refuses on a violation.

## MCP Tools Used

- `SearchObject` — check whether objects already exist
- `ListTransports` — list the transports available
- `GetPackage` — confirm a package exists
- `CreateClass` / `CreateInterface` / `CreateProgram` / `CreateFunctionGroup` / `CreateFunctionModule` / `CreateTable` / `CreateStructure` / `CreateDataElement` / `CreateDomain` / `CreateView` / `CreateServiceDefinition` / `CreateServiceBinding` / `CreateBehaviorDefinition` / `CreateScreen` / `CreateGuiStatus`
- `UpdateClass` / `UpdateProgram` / `UpdateScreen` / `UpdateGuiStatus` / etc. — write the initial implementation
- `ActivateObjects` / `GetInactiveObjects` — activate, then verify
- **ECC DDIC fallback:** only `CreateProgram` + `UpdateProgram` (target `$TMP`). `CreateTable` / `CreateDataElement` / `CreateDomain` must NOT be attempted while `SAP_VERSION = ECC`.
