---
name: create-program
description: End-to-end procedure for creating ABAP programs (Report / CRUD / ALV / Batch / Interface) with Main+Include structure. One agent runs all phases sequentially — SAP version preflight, two-stage Socratic interview, planning with reuse gates, spec writing, human approval gate, implementation, self-QA, fresh-context review gate, debug escalation, completion report.
source:
  - sc4sap-custom/skills/create-program/SKILL.md
  - sc4sap-custom/skills/create-program/agent-pipeline.md
  - sc4sap-custom/skills/create-program/execution-mode.md
  - sc4sap-custom/skills/create-program/interview-gating.md
  - sc4sap-custom/skills/create-program/inventory-lookups.md
  - sc4sap-custom/skills/create-program/spec-approval-gate.md
---

# Create Program — Procedure

Core ABAP program creation procedure. Generates a Main Program wrapped with conditional Includes following the sc4sap template convention. Supports both OOP (two-class split: Data + Screen/ALV) and Procedural (PERFORM) paradigms.

**A single agent executes every phase below in order.** Where a step says "adopt the X persona", switch working persona for that step; do not skip, reorder, or merge phases. Every phase is MANDATORY unless explicitly marked conditional.

Pipeline overview:

```
Phase 0 (Version Preflight)
  → Phase 1A (Module Interview — business)
  → Phase 1B (Program Interview — technical, incl. inventory lookups)
  → Phase 2 (Planning + reuse gates)
  → Phase 3 (Spec Writing)
  → [Spec Approval Gate — HUMAN]
  → Phase 3.5 (Execution Mode Gate)
  → Phase 4 (Implementation)
  → Phase 5 (Self-QA, conditional)
  → Phase 6 (Review Gate — fresh context, read-only reviewer)
  → Phase 7 (Debug escalation, conditional)
  → Phase 8 (Completion Report)
```

## Use When / Do Not Use When

Use when:
- The user asks for "create program", "new report", "ALV program", "CRUD program", "batch program", etc.
- A new ABAP executable program (REPORT) needs to be created from scratch
- The program requires the Main+Include wrapping convention
- ALV display is needed (full CL_GUI_ALV_GRID or simple SALV popup)

Do NOT use when:
- Creating a single class/interface/table — use the `create-object` procedure
- Modifying an existing program — use direct `UpdateProgram` / `UpdateInclude` calls
- Creating a RAP business object / OData service — use `create-object` (with service binding + behavior definition)
- The user wants only scaffolding without coding — use `create-object` with type=program

## Shared Conventions

The following rules are shared across procedures. Load and apply them during the relevant phases:

| Convention | Reference File | Applied In |
|------------|----------------|------------|
| Include structure (t/s/c/a/o/i/e/f/_tst) | [include-structure.md](../knowledge/abap/conventions/include-structure.md) | Phase 2, Phase 4 |
| OOP two-class pattern (LCL_DATA + LCL_ALV) | [oop-pattern.md](../knowledge/abap/conventions/oop-pattern.md) | Phase 4 (OOP mode only) |
| ALV rules (Full vs SALV, field catalog standard) | [alv-rules.md](../knowledge/abap/conventions/alv-rules.md) | Phase 4, Phase 6 |
| Text element rule (no hardcoded display literals) | [text-element-rule.md](../knowledge/abap/conventions/text-element-rule.md) | Phase 4, Phase 6 |
| Constant rule (no magic literals in logic) | [constant-rule.md](../knowledge/abap/conventions/constant-rule.md) | Phase 4, Phase 6 |
| Procedural FORM naming (`_{screen_no}` suffix) | [procedural-form-naming.md](../knowledge/abap/conventions/procedural-form-naming.md) | Phase 4 (Procedural mode only), Phase 6 |
| Naming conventions (program/include/class/screen) | [naming-conventions.md](../knowledge/abap/conventions/naming-conventions.md) | Phase 2, Phase 4, Phase 6 |
| ECC DDIC fallback (Table / DTEL / DOMA on ECC) | [ecc-ddic-fallback.md](../knowledge/abap/conventions/ecc-ddic-fallback.md) | Phase 2 (gate), Phase 4, Phase 6 |
| Clean ABAP — shared baseline | [clean-code.md](../knowledge/abap/conventions/clean-code.md) | Phase 4, Phase 6 (always) |
| Clean ABAP — OOP paradigm | [clean-code-oop.md](../knowledge/abap/conventions/clean-code-oop.md) | Phase 4, Phase 6 — only when Phase 1B `paradigm = OOP` |
| Clean ABAP — Procedural paradigm | [clean-code-procedural.md](../knowledge/abap/conventions/clean-code-procedural.md) | Phase 4, Phase 6 — only when Phase 1B `paradigm = Procedural` |
| Mandatory main-program template (OOP) | [zrsc4sap_oop_ex.prog.abap](../knowledge/abap/templates/oop-sample/zrsc4sap_oop_ex.prog.abap) (+ companion includes / screens in the same folder) | Phase 4 (starting skeleton) + Phase 6 §8 (structural match) — OOP paradigm |
| Mandatory main-program template (Procedural) | [main-program.abap](../knowledge/abap/templates/procedural-sample/main-program.abap) | Phase 4 + Phase 6 §8 — Procedural paradigm |
| Cloud ABAP constraints (prohibited statements + replacements) | [cloud-abap-constraints.md](../knowledge/abap/conventions/cloud-abap-constraints.md) | Phase 0 (Cloud Public rejection) |

### ECC DDIC Fallback Gate

When the Phase 2 object list includes a new Table, Data Element, or Domain AND `SAP_VERSION = ECC`, Phase 4 must NOT call `CreateTable` / `CreateDataElement` / `CreateDomain`. Instead, follow [ecc-ddic-fallback.md](../knowledge/abap/conventions/ecc-ddic-fallback.md): generate a helper report in `$TMP` using the matching template — [table_create_sample.abap](../knowledge/abap/templates/ecc/table_create_sample.abap), [element_create_sample.abap](../knowledge/abap/templates/ecc/element_create_sample.abap), or [domain_create_sample.abap](../knowledge/abap/templates/ecc/domain_create_sample.abap) — activate the helper, then emit the mandatory user message (SE38 run → uncheck dry-run → SE11 activate + assign transport). Do not treat the DDIC object as created until the user confirms activation. Remaining objects (classes, includes, screens, …) proceed on the normal flow; the plan must sequence the DDIC helpers first so the user can create them before code that depends on them is activated.

## Phase 0 — SAP Version Preflight (MANDATORY, runs before the interview)

The entire development approach (tables, BAPIs, CDS availability, ABAP syntax, RAP eligibility) depends on the SAP platform and release.

Steps:
1. Read `.sc4sap/config.json` for `sapVersion`, `abapRelease`, and `activeModules`
   - Also read `.sc4sap/sap.env` → `SAP_ACTIVE_MODULES` as fallback
   - Load `../knowledge/modules/common/active-modules.md` (if present) and precompute the cross-module concern list for the program's primary module. Every downstream phase (planning, spec, implementation) receives this list and must factor in integration fields (e.g., MM primary + PS active → add `PS_POSID`).
2. If missing or stale, ask the user to confirm:
   - **ECC** (ECC 6.0) — classical DDIC, LFA1/KNA1/BKPF/BSEG/MKPF/MSEG world, SAPGUI only
   - **S/4HANA On-Premise** — ACDOCA, MATDOC, Business Partner (BUT000), CDS/AMDP preferred, Fiori possible, ADT-first
   - **S/4HANA Cloud (Public)** — no classical Dynpro, no SE80 custom dev, only Developer Extensibility / Key User Extensibility (RAP managed, Custom Fields/Logic, Custom Business Objects)
   - **S/4HANA Cloud (Private)** — similar to On-Premise but with extensibility-first mindset
3. Confirm `abapRelease` (e.g. `750`, `756`, `758`) — drives allowed syntax

Branching consequences:
- **ECC**: no RAP, no ACDOCA, no Business Partner; inline decl only if 740+; CDS/AMDP typically unavailable (<750)
- **S/4HANA On-Prem**: prefer CDS + AMDP, RAP where applicable, Business Partner APIs, ACDOCA for finance
- **S/4HANA Cloud Public**: **REJECT classical Dynpro / custom screen + GUI Status requests**. The standard Full-ALV path (CL_GUI_ALV_GRID + Docking Container) is not executable on Cloud Public — redirect to RAP + Fiori Elements, `if_oo_adt_classrun`, or SALV-only output. Fail fast with an explanation. Full prohibited-statement list and Cloud-native API replacements: [cloud-abap-constraints.md](../knowledge/abap/conventions/cloud-abap-constraints.md).
- **S/4HANA Cloud Private**: classical Dynpro technically possible but discouraged; warn the user and confirm intent before proceeding.

Outputs:
- `.sc4sap/program/{PROG}/platform.md` — resolved platform, release, and constraints
- Interview dimensions pre-filtered by platform (e.g., ALV-Full hidden on Cloud Public)

## Phase 1 — Two-Stage Socratic Interview (MANDATORY — never skip, never shortcut, never merge)

Phase 1 runs as two sequential sub-phases (1A then 1B) on every invocation. Skipping a dimension, accepting "just build it" to bypass questioning, inferring answers from context, or bulk-proposing multiple dimensions in a single message is a protocol violation. If the user pushes to skip, answer: *"The interview is mandatory — I will run Module Interview first, then Program Interview, one question at a time."*

**Two-stage rule**: Phase 1B (technical) NEVER starts before Phase 1A (business) closes. The technical conversation has no meaning without business context.

### One-Question-Per-Turn Rule (applies to BOTH 1A and 1B)

This rule is the single most important enforcement in the entire interview — it protects first-time users who need to understand each decision. Both sub-phases run as Socratic dialogue, one dimension per message, regardless of user impatience.

Hard prohibitions:
- Do NOT dump all remaining dimensions into a single table/proposal block for "batch approval" — even if the user says *"알아서 해줘"*, *"figure it out"*, *"just decide"*, *"ok everything"*, *"batch them"*.
- Do NOT present Q2, Q3, Q4 as sub-questions of Q1. One dimension = one message = wait for the user's answer.
- Do NOT pre-answer on the user's behalf and ask only *"approve?"*. The user must actively choose for each dimension.

Handling an impatient user (*"알아서 해줘"* / *"you decide"*):
1. Acknowledge the fatigue politely.
2. Explain: *"I will keep going one question at a time — this protects you from decisions you didn't see. I can propose a default per question which you confirm with a single word."*
3. Continue with the next single dimension only, presenting your recommended default as part of that one question (not as part of a block).
4. Wait for the user's response. Advance only after they confirm or modify that one dimension.

First-time user safeguard: a person running this procedure for the first time does not know what "Paradigm OOP vs Procedural" or "Full CL_GUI_ALV_GRID vs SALV" actually means. Bulk-proposing all 7 dimensions at once denies them the chance to ask "what does this mean?" on each one. Always keep the door open for one dimension at a time.

Recovery clause: if you already bulk-proposed (protocol violation), apologize, roll back, and restart the sub-phase from the first unanswered dimension with strict one-question cadence. Do NOT count a block "ok" as approval for a block proposal — it is invalid by protocol.

### Phase 1A — Module Interview (module consultant persona)

**Purpose**: establish business context, validate the need for custom development, identify reusable assets, and let a domain consultant propose SAP-standard alternatives BEFORE any technical decision is made.

**Persona**: Adopt the matching `sap-{module}-consultant` persona for this step — see the [persona index](../personas/INDEX.md); e.g. [sap-sd-consultant](../personas/sap-sd-consultant.md), [sap-mm-consultant](../personas/sap-mm-consultant.md), [sap-fi-consultant](../personas/sap-fi-consultant.md), [sap-co-consultant](../personas/sap-co-consultant.md), [sap-pp-consultant](../personas/sap-pp-consultant.md), [sap-ps-consultant](../personas/sap-ps-consultant.md), [sap-qm-consultant](../personas/sap-qm-consultant.md), [sap-pm-consultant](../personas/sap-pm-consultant.md), [sap-wm-consultant](../personas/sap-wm-consultant.md), [sap-hcm-consultant](../personas/sap-hcm-consultant.md), [sap-tm-consultant](../personas/sap-tm-consultant.md), [sap-tr-consultant](../personas/sap-tr-consultant.md), [sap-ariba-consultant](../personas/sap-ariba-consultant.md), [sap-bw-consultant](../personas/sap-bw-consultant.md), [sap-bc-consultant](../personas/sap-bc-consultant.md).

**Trigger**: as soon as Phase 0 closes. If the target module is unclear from the initial request, the FIRST question is "which module?" — the consultant persona cannot be adopted until resolved. Multi-module: work through each module's consultant perspective and reconcile the question streams.

**Industry / Country context preflight (MANDATORY — runs before the first business question)**:
- Read `.sc4sap/config.json` (`industry`, `country`) and `.sc4sap/sap.env` (`SAP_INDUSTRY`, `SAP_COUNTRY`). Precedence: `config.json` > `sap.env`.
- If `industry` is set → load `../knowledge/industry/<key>.md` and use it as the consultant's business-context backdrop (do NOT re-ask the user).
- If `country` is set → load `../knowledge/country/<iso>.md` (ISO alpha-2 lowercase, e.g. `kr`, `us`, `de`, or `eu-common` for EU-wide); multi-country: load each file and flag intercompany / intra-EU / transfer-pricing touchpoints. Do NOT re-ask the user.
- If either value is missing → asking is MANDATORY before dimension 1. Do not infer from the project name, package, or prior interviews. Blocking questions:
  - Industry missing: *"Which industry does this program belong to? (see [industry/README.md](../knowledge/industry/README.md) for the supported keys — e.g. `automotive`, `retail`, `pharmaceutical`, …)"*
  - Country missing: *"Which country / localization applies? (ISO alpha-2 lowercase, e.g. `kr`, `us`, `de`, or `eu-common` for EU-wide; multiple allowed)"*
- Offer to persist the answer: *"Save to `.sc4sap/config.json` so future runs skip this question? (yes/no)"*. On `yes`, write the value; on `no`, keep it for this run only.
- Record resolved values in the `module-interview.md` header (`industry:`, `country:`, `source: config.json | sap.env | user-this-run`).

**Question dimensions** (one per turn):
1. **Module identification** — single or multi (SD/MM/FI/CO/PP/PS/QM/PM/WM/HCM/TM/TR/Ariba/BW/BC)
2. **Business purpose** — what business outcome does this program produce (handed off to which role / used for which decision)
3. **Business reason / pain point** — what current Gap, manual workaround, or compliance/regulatory requirement drives the request
4. **Company-specific business rules** — deviations from SAP standard process (special pricing, custom statuses, local compliance, industry-specific calculations, etc.)
5. **Reference assets** — existing CBO packages, prior Z programs, vendor add-ons to model after
   - If the user names a reference Z program: you MAY run a `program-to-spec`-style quick lookup at depth L1 (Quick Spec) for that single object — extract Purpose / inputs / outputs / main logic steps (numbered) — and inline the summary into `module-interview.md` (collapse the step list to 2–3 sentences if it runs long). Do NOT produce a full spec artifact for the reference object; this is a focused lookup.
6. **Standard SAP solution screen (mandatory)** — the consultant MUST propose at least one standard alternative (Fiori app, standard report/transaction, BAPI flow, CDS analytical query, embedded analytics) BEFORE agreeing to a custom build. The user explicitly accepts/rejects each alternative; rejections are logged with reason.

**Skip rule**: skip Phase 1A only for pure technical utilities with zero business logic (e.g., generic string helper, file converter). Default behavior is "do not skip".

**Gate**: business ambiguity ≤ 5%.

**Output**: `.sc4sap/program/{PROG}/module-interview.md`

**Enforcement**: Phase 1B refuses to start if this file is missing or its ambiguity score > 5%.

### Phase 1B — Program Interview (analyst + architect personas)

**Pre-condition**: Phase 1A closed; `module-interview.md` exists; business ambiguity ≤ 5%.

**Purpose**: translate the agreed business solution into concrete technical decisions.

**Personas**: Adopt the [sap-analyst](../personas/sap-analyst.md) persona for functional decomposition (owns dimensions 1, 5) and the [sap-architect](../personas/sap-architect.md) persona for technical structure (owns dimensions 2, 3, 4, 7); both perspectives contribute to dimension 6. Keep the question stream to one dimension per turn.

**Question dimensions** (one per turn, pre-filtered by resolved platform):
1. **Purpose-type** — Report / CRUD / ALV List / Batch / Interface
2. **Paradigm** — OOP (two-class) vs Procedural (PERFORM)
3. **Display mode** — None / SALV popup / Full CL_GUI_ALV_GRID
4. **Screen/GUI** — required? screen numbers? Docking Container vs Splitter vs TOP_OF_PAGE layout?
5. **Data source** — standard tables / Z-tables / BAPI / CDS view (must be consistent with Phase 1A reference assets)
6. **Package + Transport** — target package, new or existing transport
7. **Testing scope** — when OOP is selected, which test class methods to cover

For each dimension, you may propose a recommended default (derived from Phase 1A context + CBO inventory + platform constraints). The proposal belongs to the single question for that dimension — never merge proposals across dimensions into a table.

**Gate**: technical ambiguity ≤ 5%. Do NOT proceed to Phase 2 until ≤ 5%.

**Output**: `.sc4sap/program/{PROG}/interview.md` — one Q&A block per resolved dimension and a final ambiguity score ≤ 5%.

**Enforcement**: the Phase 2 planning step MUST refuse to run if either `module-interview.md` or `interview.md` is missing or incomplete. Both files are passed forward to Phase 2 so planning does not re-interview.

### Inventory Lookups (run immediately after `<MODULE>` and `<PACKAGE>` are resolved — Phase 1B dimension 6)

Two back-to-back inventory passes feed every downstream phase.

**CBO Inventory Lookup** — output `.sc4sap/program/{PROG}/cbo-context.md`:
1. Resolve `<MODULE>` (Phase 1A) and `<PACKAGE>` (Phase 1B dimension 6).
2. Check whether `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` exists.
   - **Exists** → read it. Extract the `objects[]` array. Treat every entry as a reuse candidate and surface it in Phase 2 / Phase 3 so planning and spec writing prefer the existing asset over creating a new one.
   - **Does not exist** → offer the user three options in one question:
     > "No CBO inventory at `.sc4sap/cbo/<MODULE>/<PACKAGE>/`. Pick one: **(A) stock now** — I will stock the package inline (~2-5 min, recommended) · **(B) skip** — continue without reuse analysis · **(C) cancel** — run the `analyze-cbo-obj` procedure separately first."
     - **(A) stock now** → Adopt the [sap-stocker](../personas/sap-stocker.md) persona for this step and stock the CBO package `<PACKAGE>` (module `<MODULE>`) per that persona's investigation protocol. On success, re-read the freshly written `inventory.json` and continue to step 3. If stocking is blocked, surface the reason, fall back to option (B), and log `cbo_inventory: "stock_failed: <reason>"`.
     - **(B) skip** → record `cbo_inventory: "skipped"` in `.sc4sap/program/{PROG}/platform.md` and continue.
     - **(C) cancel** → stop the procedure and let the user run `analyze-cbo-obj` manually.
3. Persist the loaded inventory to `.sc4sap/program/{PROG}/cbo-context.md` — one bullet per reusable object: name · type · role · one-line purpose · `reuse_hint`. Phases 2–4 all read this file.

**Customization Inventory Lookup** — runs immediately after the CBO lookup, same resolved `<MODULE>`; output `.sc4sap/program/{PROG}/customization-context.md`:
1. Check whether `.sc4sap/customizations/<MODULE>/enhancements.json` and/or `.sc4sap/customizations/<MODULE>/extensions.json` exist.
   - **Exists** → read both. Treat every `badiImplementations[]`, `cmodProjects[]`, `formBasedExits[]`, and `appendStructures[]` entry as a reuse candidate.
   - **Does not exist** → print one line to the user:
     > "No customization inventory at `.sc4sap/customizations/<MODULE>/`. Run the `setup customizations` procedure to scan this module's Z*/Y* enhancements first, or type `skip` to proceed without customization reuse analysis."
     If the user skips, record `customization_inventory: "skipped"` in `.sc4sap/program/{PROG}/platform.md` and continue.
2. Persist the loaded inventory to `customization-context.md`. One bullet per entry:
   - BAdI impl: `• BAdI {standardName} → existing impl {Z*_CLASS} (impl name: {impl_name}) — reuse target for any new hook into this BAdI`
   - CMOD project: `• SMOD {standardName} → existing CMOD project {Z_PROJECT} — add new components here instead of creating a second project`
   - Form-based exit: `• Include {ZXVEDU01|MV45AFZZ|...} ({lineCount} lines) — already customized; read existing logic before adding new FORMs`
   - Append: `• Table {VBAK|EKKO|...} → existing append {CI_VBAK_ZZ|Z_APPEND_VBAK} fields: [{ZZ_FIELD1}, {ZZ_FIELD2}] — extend this append, do not create a second one`
3. Follow [customization-lookup.md](./customization-lookup.md) for the full resolution protocol and "prefer reuse" ✅/❌ examples.

**Reuse gating rule** (applied in Phases 2 and 3):
- If an inventory entry matches the spec's semantic need (same role + matching FK pattern + purpose overlap), **default to reuse**. Only propose a new Z-object when the consultant or user explicitly rejects the candidate, with the rejection reason logged in `plan.md`.
- If the request is to add a BAdI implementation / CMOD component / append field and the cache already lists a `Z*`/`Y*` asset for the same `standardName` or base table, **default to extending the existing asset**. Creating a second parallel Z impl, a second CMOD project for the same SMOD, or a second append on the same standard table is a MAJOR finding in Phase 6 review and will block the spec. Rejection requires a written justification in `plan.md` (e.g., "existing ZCL_SD_ORDER_IMPL is used by another business flow and merging would break it").

## Phase 2 — Planning

Adopt the [sap-planner](../personas/sap-planner.md) persona for this step.

- **Inputs (mandatory read before planning)**: `module-interview.md` (business context, standard-SAP rejections, reference assets) AND `interview.md` (technical decisions). Reconcile both — if a Phase 1B technical choice contradicts a Phase 1A business rule (e.g., chose custom Z-table when the consultant proposed standard CDS), raise the conflict back to the user before producing `plan.md`.
- **CBO reuse gate (mandatory when `cbo-context.md` exists)**: before designing any new Z-object (table / structure / class / FM / data element), scan `cbo-context.md` for a reuse candidate. Default to reuse when role + FK pattern + purpose overlap. Every new-object proposal in the plan must include a one-line justification of why no CBO candidate fits.
- **Customization reuse gate (mandatory when `customization-context.md` exists)**: before proposing a new BAdI implementation, CMOD component, form-based user-exit FORM, or append structure, scan `customization-context.md` for an existing customer asset covering the same `standardName` / base table. Default to extending the existing asset. Every new-enhancement/extension proposal in the plan must include a written justification of why no customization candidate fits (follow [customization-lookup.md](./customization-lookup.md)). Creating a second parallel impl when one already exists is a MAJOR finding in Phase 6.
- Apply shared conventions: [include-structure.md](../knowledge/abap/conventions/include-structure.md), [naming-conventions.md](../knowledge/abap/conventions/naming-conventions.md)
- **Consultant consultation (mandatory when requirements touch SAP business configuration)**:
  - Identify the affected SAP module(s) from the interview output (SD / MM / FI / CO / PP / PS / QM / PM / WM / HCM / TM / TR / Ariba / BW / BC)
  - Adopt the corresponding `sap-{module}-consultant` persona for this sub-step (see the [persona index](../personas/INDEX.md))
  - Check for a local SPRO cache at `.sc4sap/spro-config.json` before querying live
  - Resolve SPRO data per [spro-lookup.md](./spro-lookup.md) (priority: local cache → static module docs under `../knowledge/modules/{MODULE}/` → live query with user confirmation)
  - Consultant output: business-aligned recommendations — relevant IMG customizing tables/views, master data dependencies, standard BAPIs/FMs to leverage, authorization objects, integration touchpoints with neighboring modules
  - File: `.sc4sap/program/{PROG}/consult-{module}.md` (one per consulted module)
  - For multi-module scenarios, consult each module in turn and reconcile as planner
- Integrate consultant inputs into the final plan
- Output: include list, screen numbers, class names, transport plan, test coverage, referenced SPRO views / standard APIs / authorization objects
- **ECC DDIC sequencing**: if the object list includes new DDIC objects on ECC, sequence the DDIC fallback helpers first (see the ECC DDIC Fallback Gate above)
- File: `.sc4sap/program/{PROG}/plan.md`

**Skip consultant when**: pure technical utility with no business logic (e.g., a generic string helper class, a pure file converter) — plan alone.

## Phase 3 — Spec Writing

Adopt the [sap-writer](../personas/sap-writer.md) persona for this step. The spec is the single most critical artifact between interview and implementation — invest full care here.

- Produce a functional + technical spec from `plan.md`
- **CBO reuse (mandatory when `cbo-context.md` exists)**: every spec section that references an existing CBO asset must name it explicitly (e.g., "writes to existing table `ZSD_ORDER_LOG`") and include a one-line reason for reuse.
- **Customization reuse (mandatory when `customization-context.md` exists)**: when the spec extends a BAdI / SMOD / form-based exit / append, it MUST reference the existing `Z*`/`Y*` implementation class, CMOD project, include, or append structure by name (e.g., "add new method to existing BAdI impl `ZCL_SD_ORDER_IMPL`"; "extend existing append `CI_VBAK_ZZ` with field `ZZ_DELIVERY_PRIORITY`"). Never silently introduce a parallel Z-object when a reuse target exists in `customization-context.md`.
- **MANDATORY before writing**: open and read every shared convention file applicable to the program type — [alv-rules.md](../knowledge/abap/conventions/alv-rules.md), [text-element-rule.md](../knowledge/abap/conventions/text-element-rule.md), [constant-rule.md](../knowledge/abap/conventions/constant-rule.md), [oop-pattern.md](../knowledge/abap/conventions/oop-pattern.md) if OOP, [procedural-form-naming.md](../knowledge/abap/conventions/procedural-form-naming.md) if Procedural, [naming-conventions.md](../knowledge/abap/conventions/naming-conventions.md), [include-structure.md](../knowledge/abap/conventions/include-structure.md). The spec must NOT contain instructions that contradict these conventions (e.g., "build LVC_T_FCAT manually" contradicts the SALV-factory rule in alv-rules.md). When the spec describes a technique, paraphrase the convention's prescribed approach — never invent a shortcut.
- File: `.sc4sap/program/{PROG}/spec.md`

### Spec template (minimum sections)

```
# Program Spec: {PROG_NAME}

## 1. Purpose
One-paragraph summary of what the program does and who uses it.

## 2. Functional Scope
- Input: selection screen fields, data sources, triggers
- Processing: high-level algorithm / business rules
- Output: ALV layout / file / screen / BAPI callback

## 3. Technical Design
- Paradigm: OOP / Procedural
- Include structure: main + which includes (t/s/c/a/o/i/e/f/_tst)
- Class hierarchy (if OOP): LCL_DATA / LCL_ALV / LCL_EVENT
- Screens + GUI Status (if any)
- Text Elements registered
- Standard APIs / BAPIs used
- Tables / structures / data elements — reuse first, CBO matches highlighted

## 4. Object List
| Object | Type | Name | Package | Transport |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

## 5. SAP Conventions Applied
Bullet list of which convention files the spec obeys (ALV rules,
Text Element rule, naming conventions, etc).

## 6. Test Coverage (if OOP)
List of ABAP Unit test methods with brief description.

## 7. Open Questions
If any dimension was resolved to "user chose X over Y", record the choice
and rationale here. Empty section if none.

## Approval
(Auto-appended when the user provides an explicit approval keyword.)
- **Approved by**: <user input>
- **Timestamp**: <ISO 8601>
- **Keyword used**: <승인|approve|ok|...>
```

## Spec Approval Gate (MANDATORY — HUMAN GATE, never skip, never shortcut)

After the interview closes (ambiguity ≤ 5%) and Phase 2 produces `plan.md` and Phase 3 produces `spec.md`, this gate MUST run before any `Create*` / `Update*` call.

Required steps:
1. **Display the spec.md contents in the chat** (or surface the file path prominently) so the user can read it end-to-end.
2. **Block all further progress** — no `CreateProgram`, `CreateClass`, `CreateInclude`, or any other `Create*` / `Update*` call may happen — until the user provides an **explicit affirmative acknowledgement** of the spec.
   - Acceptable approval keywords: `승인`, `approve`, `approved`, `ok`, `proceed`, `go ahead`, `confirmed`
   - Silence, "just try it", "빨리", "해봐", "pull it", "yes", "alright", "그냥 해" are **NOT approval**
3. If the user responds with change requests (e.g., "rename the class", "skip the Dynpro", "add one more field"), loop: revise `spec.md` → re-display → wait again. Do not silently merge comments and proceed.
4. Only after explicit approval:
   - Append the `## Approval` section to `spec.md` (approver / timestamp / keyword).
   - Compute the SHA-256 of the approved `spec.md` and write `.sc4sap/program/{PROG}/approval.json` conforming to [schemas/approval.schema.json](./schemas/approval.schema.json) — this binds the approval to the exact spec content (`spec_sha256`) AND the target system (`sid` / `client` / `tier` from the active connection profile in `.sc4sap/sap.env` / `.sc4sap/config.json`, plus the `transport` from Phase 1B dimension 6).
   - Then move to Phase 3.5.

User-facing message (verbatim template):

> 📋 **Spec ready for review** — `.sc4sap/program/{PROG}/spec.md`
>
> Please read the spec end-to-end. When you are satisfied, reply with **one** of these approval keywords to unlock Phase 4 (implementation):
>
> - `승인` / `approve` / `approved` / `ok` / `proceed` / `go ahead` / `confirmed`
>
> Any other response (including "yes", "alright", "그냥 해", "빨리", "try it") is treated as **change request** — please describe what to revise.

**Enforcement contract** — Phase 4 MUST refuse to run if any of the following is true:
- `.sc4sap/program/{PROG}/spec.md` does not exist
- `spec.md` lacks a `## Approval` footer section with at least one approval keyword
- `approval.json` is missing, does not validate against [schemas/approval.schema.json](./schemas/approval.schema.json), or its `spec_sha256` no longer matches the current `spec.md` (meaning a change arrived post-approval — needs re-approval)
- `approval.json`'s `sid` / `client` do not match the currently connected system

**Rationale**: the spec is the contract between user intent and AI execution. Creating ABAP objects (tables, classes, programs) on the SAP system without this contract being visible and signed off leads to: unexpected objects in the user's package/transport, naming conventions misaligned with team standards, business logic subtly off from actual requirements, and difficulty justifying the generated code in code review. The 30–60 seconds of spec reading + approval saves hours of "oh no, that's not what I meant, please delete all of this and start over".

## Phase 3.5 — Execution Mode Gate (MANDATORY, between spec approval and Phase 4)

### Step 1 — Mode Selection Prompt

Display this to the user:

```
✅ Spec approved. Select execution mode:

  [1] auto    — Phase 4–8 runs unattended (recommended for simple CRUD/Report)
                 └ only pauses on error or a Phase 6 FAIL/BLOCKED verdict
  [2] manual  — prompts "proceed to Phase N?" at every phase transition
  [3] hybrid  — Phase 4 (implementation) runs auto; Phase 5–8 prompt per phase

Choice: 1 / 2 / 3  (default: 2)
```

### Step 2 — Persist Selection

Write the selection to `.sc4sap/program/{PROG}/state.json` under `execution_mode`. Also log phase timestamps here (see the state.json schema below).

### Step 3 — Mode Semantics

| Mode | Phase 4 | Phase 5 | Phase 6 | Phase 7 | Phase 8 |
|------|---------|---------|---------|---------|---------|
| `auto` | run | run | run | run on fail | run |
| `manual` | prompt before | prompt before | prompt before | prompt before | prompt before |
| `hybrid` | run | prompt before | prompt before | prompt before | prompt before |

The prompt the user sees in `manual` / `hybrid` is ONLY the phase-transition confirmation.

### Step 4 — Manual-Mode Prompt Format

Between phases in `manual` or `hybrid`, display:

```
✓ Phase {N-1} complete — {1-line summary}

Proceed to Phase {N}?
  [y] proceed   [s] skip (conditional phases only)   [a] abort — save state and exit
```

- `y` / Enter: run the next phase
- `s`: valid only for conditional phases — Phase 5 (testing scope = none) or Phase 7 (no failures). Required phases re-prompt.
- `a`: record the current phase in `state.json` and exit. The next run resumes from this phase.

### Enforcement Contract

- Phase 4 MUST refuse to run if `state.json.phases.3_5_mode_gate.status != "completed"`.
- If the user picked `auto` and a phase transition happens, do NOT prompt — a prompt is a bug.
- If the user picked `manual` / `hybrid`, do NOT auto-proceed — missing the confirmation is a bug.

## Phase 4 — Implementation

Adopt the [sap-executor](../personas/sap-executor.md) persona for this step.

Flow (source-first, single syntax check on the main program, batch activation):
1. Generate ALL include sources locally first, from the approved spec + the mandatory main-program template — [zrsc4sap_oop_ex.prog.abap](../knowledge/abap/templates/oop-sample/zrsc4sap_oop_ex.prog.abap) (OOP) or [main-program.abap](../knowledge/abap/templates/procedural-sample/main-program.abap) (Procedural) — as the starting skeleton. When OOP with testing scope, the `{PROG}_tst` test-class include is part of this initial batch.
2. Create the includes via `CreateInclude` + `UpdateInclude`, then the main program via `CreateProgram` + `UpdateProgram`.
3. Run a single `CheckSyntax` on the MAIN program (not per include). Syntax failures → fix-and-retry loop, max 3 iterations on the main program.
4. Activate, then verify via `GetInactiveObjects` — the program's object set must return 0 inactive entries.
5. Screens (`CreateScreen` + `UpdateScreen`), GUI statuses (`CreateGuiStatus` + `UpdateGuiStatus`), and text elements (`CreateTextElement` + `UpdateTextElement`) run AFTER main activation.
6. **ECC DDIC fallback**: if the plan includes new Table / Data Element / Domain objects and the platform is ECC, do NOT call `CreateTable` / `CreateDataElement` / `CreateDomain` — follow the ECC DDIC Fallback Gate above, and wait for the user's SE11 activation confirmation before activating dependent code.

Apply shared conventions throughout: [oop-pattern.md](../knowledge/abap/conventions/oop-pattern.md) (OOP), [alv-rules.md](../knowledge/abap/conventions/alv-rules.md), [text-element-rule.md](../knowledge/abap/conventions/text-element-rule.md), [constant-rule.md](../knowledge/abap/conventions/constant-rule.md), [procedural-form-naming.md](../knowledge/abap/conventions/procedural-form-naming.md) (Procedural), [naming-conventions.md](../knowledge/abap/conventions/naming-conventions.md), [clean-code.md](../knowledge/abap/conventions/clean-code.md) + the paradigm-specific clean-code file.

On completion, record the `check_syntax` and `activate` step results (status + evidence) into `.sc4sap/program/{PROG}/verification.json` per [schemas/verification.schema.json](./schemas/verification.schema.json).

In `manual`/`hybrid` mode: prompt the user before starting Phase 4; do NOT prompt mid-flow once started.

## Phase 5 — Self-QA (conditional)

Adopt the [sap-qa-tester](../personas/sap-qa-tester.md) persona for this step.

**Skip conditions (either triggers skip, recorded as `skipped` in state.json)**:
- Paradigm = Procedural (no local test classes expected)
- Paradigm = OOP AND `interview.md` dimension 7 (testing scope) = `none` / empty

**When running**:
- The test class include (`{PROG}_tst`) should already exist from Phase 4 — this phase only writes test methods and runs them.
- Call `RunUnitTest` → `GetUnitTestResult`
- On FAIL: fix production code (not tests) → re-activate → re-run (loop until green or 3 attempts)
- In `manual`/`hybrid` mode: prompt before starting Phase 5 (unless a skip condition matched, then auto-skip with a message)

**Verification record** — update `.sc4sap/program/{PROG}/verification.json` per [schemas/verification.schema.json](./schemas/verification.schema.json):
- `unit_test`: PASS/FAIL with the test result summary as evidence; `SKIPPED` when Phase 5 was skipped
- `atc`: run `GetAtcFindings` on the created objects if the backend supports it and record the outcome; otherwise record `SKIPPED` with the reason

## Phase 6 — Review Gate (MANDATORY — never skip, never conditional)

> Phase 4 is NOT complete until Phase 6 has run. Phase 5 (QA) is conditional on OOP mode, Phase 7 (Debug) is conditional on failures, but **Phase 6 is unconditional**.

A successful activation only proves the code compiles and links — it does NOT prove the code follows the shared conventions. Phase 6 closes this gap.

Steps:
1. Verify `verification.json` is complete (all four steps recorded).
2. Re-compute the SHA-256 of `spec.md` and confirm it still matches `approval.json.spec_sha256`. On mismatch, STOP — the spec changed after approval; return to the Spec Approval Gate.
3. Write `.sc4sap/program/{PROG}/review-request.json` conforming to [schemas/review-request.schema.json](./schemas/review-request.schema.json) — `spec_sha256`, `sid`, `client`, `transport`, and the `objects[]` list created in Phase 4 (with types: PROG/P, PROG/I, DYNP, CUAD, …).
   - If any backend service/tool was down during Phase 4/5 (e.g. an ADT endpoint returning 404/500, causing a verification step to be recorded `SKIPPED` in `verification.json`), attach it under `environment_context.known_outages[]` so the reviewer does not miscount the gap as a code defect.
   - If the user approved a deviation from `spec.md` during this run, attach it under `environment_context.approved_deviations[]` with who/when/why it was approved, so the reviewer does not re-flag it as a violation.
   - `environment_context` is optional — omit it entirely when there is no outage or approved deviation to report.
4. Run [review-checklist](./review-checklist.md) **in a fresh context** (new session/subagent per adapter guidance). The reviewer judges read-only; fixes are applied by the worker, then re-reviewed. Pass the reviewer the path to `review-request.json` and the [review-checklist](./review-checklist.md) itself.
5. The reviewer writes `.sc4sap/program/{PROG}/review-result.json` conforming to [schemas/review-result.schema.json](./schemas/review-result.schema.json).
6. Handle the verdict (as the worker, back in this context):
   - **PASS with no findings** → proceed to Phase 8.
   - **PASS with MINOR findings** → fix each MINOR finding via `Update*` calls, re-activate, record the fixes; no full re-review required. Proceed to Phase 8.
   - **FAIL (one or more MAJOR findings)** → fix the findings via `Update*` calls, re-activate, refresh `review-request.json`, and re-run the review in ANOTHER fresh context. Loop until PASS or 3 review iterations are exhausted.
   - After 3 iterations with residual MAJOR findings: STOP, mark `state.json` phase `6_review` as `blocked`, surface the specific violation list to the user. Phase 8 is blocked.

In `manual`/`hybrid` mode: prompt before starting Phase 6; the review run itself is uninterrupted once started.

## Phase 7 — Debug Escalation (conditional)

Adopt the [sap-debugger](../personas/sap-debugger.md) persona for this step. Triggers:
- Activation failures persisting after the Phase 4 retry loop
- Runtime dumps during test execution

## Phase 8 — Completion Report

Adopt the [sap-writer](../personas/sap-writer.md) persona for this step.

**Pre-condition (HARD GATE)**: `.sc4sap/program/{PROG}/review-result.json` must exist with `verdict: "PASS"` and its `reviewed_spec_sha256` must equal `approval.json.spec_sha256`. If missing, FAIL, or hash-mismatched, return to Phase 6 — do not write the report and do not tell the user the program is done.

Report inputs (from local state, no re-fetching):
- Objects created + activation status
- Transport number
- Test results summary (Phase 5, if run) and `verification.json` step results
- Review verdict + findings summary (from `review-result.json`)
- Timing summary — per-phase `ts` fields from `state.json` so the report can render a total-duration table
- User conversation language (so the report localizes — Korean / English / Japanese / etc.)

Output: `.sc4sap/program/{PROG}/report.md`

In `manual`/`hybrid` mode: prompt the user before writing the report.

## Backend Tools Used

`SearchObject` (existence check) · `ListTransports` / `CreateTransport` (transport management) · `GetPackage` (package validation) · `CreateProgram` + `UpdateProgram` (main program) · `CreateInclude` + `UpdateInclude` (all includes) · `CreateScreen` + `UpdateScreen` (custom screens, ALV full mode) · `CreateGuiStatus` + `UpdateGuiStatus` (PF-Status) · `CreateTextElement` + `UpdateTextElement` (text-xxx resources) · `CheckSyntax` (pre-activation check) · `GetInactiveObjects` (post-activation verification) · `RunUnitTest` / `GetUnitTestResult` (QA) · `GetAtcFindings` (ATC, when available)

## State Files

- `.sc4sap/program/{PROG}/platform.md` — Phase 0 preflight output
- `.sc4sap/program/{PROG}/module-interview.md` — Phase 1A business interview (purpose / reason / company-specific rules / reference assets / standard-SAP alternatives)
- `.sc4sap/program/{PROG}/interview.md` — Phase 1B technical interview (7-dimension Q&A log)
- `.sc4sap/program/{PROG}/cbo-context.md` — CBO reuse candidates
- `.sc4sap/program/{PROG}/customization-context.md` — Z*/Y* BAdI impl / CMOD / form-exit / append reuse candidates
- `.sc4sap/program/{PROG}/consult-{module}.md` — Phase 2 consultant outputs (one per module)
- `.sc4sap/program/{PROG}/plan.md` — Phase 2 output
- `.sc4sap/program/{PROG}/spec.md` — Phase 3 output (requires human approval)
- `.sc4sap/program/{PROG}/approval.json` — approval record bound to spec hash + system ([schema](./schemas/approval.schema.json))
- `.sc4sap/program/{PROG}/state.json` — execution_mode + per-phase status/timing (schema below, drives resume support)
- `.sc4sap/program/{PROG}/verification.json` — check_syntax / activate / unit_test / atc step results ([schema](./schemas/verification.schema.json))
- `.sc4sap/program/{PROG}/review-request.json` — Phase 6 reviewer input ([schema](./schemas/review-request.schema.json))
- `.sc4sap/program/{PROG}/review-result.json` — Phase 6 reviewer verdict ([schema](./schemas/review-result.schema.json))
- `.sc4sap/program/{PROG}/report.md` — final completion report

### state.json schema (resume support)

```json
{
  "prog": "ZFI_...",
  "execution_mode": "auto | manual | hybrid",
  "phases": {
    "0_preflight":   { "status": "completed", "ts": "2026-04-18T10:00:00Z" },
    "1a_interview":  { "status": "completed", "ts": "..." },
    "1b_interview":  { "status": "completed", "ts": "..." },
    "2_planning":    { "status": "completed", "ts": "..." },
    "3_spec":        { "status": "completed", "ts": "...", "approved_at": "..." },
    "3_5_mode_gate": { "status": "completed", "ts": "..." },
    "4_implement":   { "status": "in_progress | completed | blocked", "ts": "..." },
    "5_qa":          { "status": "skipped | completed | blocked", "ts": "..." },
    "6_review":      { "status": "completed | blocked", "ts": "..." },
    "7_debug":       { "status": "skipped | completed", "ts": "..." },
    "8_report":      { "status": "completed", "ts": "..." }
  },
  "objects_created": [ "..." ],
  "transport": "S4HK904224"
}
```

## Resume Behavior

On a subsequent invocation for the same `{PROG}`:
1. If `state.json` exists and has `execution_mode` set, skip Phase 0–3.5 re-prompting.
2. Find the first phase with `status != "completed" && status != "skipped"` — resume from there.
3. In `auto` mode, resumption happens silently; in `manual`/`hybrid`, show the user the resume point and ask to confirm.

Phase restart (rerun a completed phase) requires the user to delete the corresponding `state.json` entry explicitly — the pipeline does not re-run completed phases automatically.
