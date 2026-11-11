---
name: create-program
description: End-to-end procedure for creating ABAP programs (Report / CRUD / ALV / Batch / Interface) with Main+Include structure. The main context owns all phases and runs them in order (implementation may be delegated to a single fresh worker per the development-loop execution_owner policy) — SAP version preflight, step-by-step interview (business first, then technical), the dig-out stage, planning with reuse gates, spec writing, human approval gate, implementation, self-QA, fresh-context review gate, debug escalation, completion report. Also hands out an easy-to-read HTML copy of the design document on request, and converts an existing design document to HTML.
source:
  - sc4sap-custom/skills/create-program/SKILL.md
  - sc4sap-custom/skills/create-program/agent-pipeline.md
  - sc4sap-custom/skills/create-program/execution-mode.md
  - sc4sap-custom/skills/create-program/interview-gating.md
  - sc4sap-custom/skills/create-program/inventory-lookups.md
  - sc4sap-custom/skills/create-program/spec-approval-gate.md
---

# Create Program — Procedure

The core ABAP program creation procedure. It produces a Main Program wrapped in conditional Includes per the sapkit template convention, and it carries both paradigms — OOP (two-class split: Data + Screen/ALV) and Procedural (PERFORM).

**The main conversation owns every phase below and runs them in order.** Phase 4 implementation may be delegated per the `execution_owner` convention in [development-loop.md](../policies/development-loop.md). Where a step says "adopt the X persona", switch working persona for that step; do not skip, reorder, or merge phases. Every phase is MANDATORY unless explicitly marked conditional.

Pipeline overview:

```
Phase 0 (Version Preflight)
  → Intake Resolution (spec entry form: user spec / deep-interview brief / standard interview)
  → Phase 1A (Module Interview — business)
  → Phase 1B (Program Interview — technical, incl. inventory lookups)
  → Dig-Out Stage (interview-sweep — the blanks nobody put on a list)
  → Phase 2 (Planning + reuse gates)
  → Phase 3 (Spec Writing)
  → [Spec Approval Gate — HUMAN]
  → Phase 3.5 (Go-Ahead Briefing)
  → Phase 4 (Implementation)
  → Phase 5 (Self-QA, conditional)
  → Phase 6 (Review Gate — fresh context, read-only reviewer)
  → Phase 7 (Debug escalation, conditional)
  → Phase 8 (Completion Report)
```

## Track A Policy Alignment (attended-only)

This procedure runs under the Track A execution Policy (see `AGENTS.md` and the
2026-07-16 integration-hardening roadmap §6). Do not treat the pipeline as a
self-completing unit — map its phases to that Policy:

- **Direct scope (P0/P1) ends at the Spec Approval Gate.** Phase 0 → interview →
  plan → spec → human approval produce a local **DRAFT**. No SAP write happens in
  Direct. The one write that can come earlier is not this pipeline's: the
  helper install Phase 0 step 4 may offer is a separate procedure
  ([install-sap-assets](install-sap-assets.md), DEV only) run on its own explicit yes.
- **SAP write (Phase 4 onward) is P3 and attended.** Creating / updating /
  activating objects requires a present human operator; it is never run
  `unattended` (`unattended` is sealed — D-025 §7). Reaching a SAP-write or
  completion request elevates the run to **Guided** — and the operator's approval
  of the design document **is** that explicit proceed: it is the place where a
  present human permits entry into the SAP-writing steps, so the run continues on
  it rather than auto-running on its own or asking a second "shall I proceed?".
  On the `abapgit` delivery branch
  (Phase 1B dimension 8) the P3 act is the **user's own abapGit import**, not a tool
  call from this pipeline — the profile and its DEV-only rule are unchanged, but
  nothing here is connected, so the server-side tier gate cannot fire and DEV is
  carried as a recorded affirmation, a procedural norm
  ([develop-abapgit](develop-abapgit.md) Step 1).
- **`.sapkit/**` files are working material, not completion proof.** A successful
  MCP create / activation makes an object **PROVISIONAL_WRITE**, not done.
- **COMPLETE requires both** an exact-subject fresh-context review **R-PASS** and a
  **machine check of what SAP actually holds** — source read-back compared against
  the intended source, plus syntax and active-state confirmation
  ([verify-applied](verify-applied.md)). Absent either, Phase 8 records **DRAFT**
  or **PROVISIONAL_WRITE** — never "완료 / done".

## Use When / Do Not Use When

Use when:
- The user asks for a "create program", "new report", "ALV program", "CRUD program", "batch program", etc.
- A new ABAP executable program (REPORT) has to be built from scratch
- The program calls for the Main+Include wrapping convention
- ALV display is wanted (full CL_GUI_ALV_GRID or simple SALV popup)
- The user only wants an HTML copy of a design document this procedure already wrote — that is the conversion-only branch under [HTML copy of the design document](#html-copy-of-the-design-document-on-request): it runs no phase, connects to nothing, and only makes and opens the copy

Do NOT use when:
- A single class/interface/table is what is wanted — use the `create-object` procedure
- An existing program is being modified — use the [modify-object](./modify-object.md) procedure (Minimal intensity)
- A RAP business object / OData service is being created — use `create-object` (with service binding + behavior definition)
- The user wants only scaffolding without coding — use `create-object` with type=program

## Shared Conventions

These rules are shared across procedures. The conventions note right below this table carries the core coding rules — clean ABAP, naming, constants, text elements, FORM naming — in full; load and apply each file in the table on top of it during the phases named:

| Convention | Reference File | Applied In |
|------------|----------------|------------|
| Include structure (t/s/c/a/o/i/e/f/_tst) | [include-structure.md](../knowledge/abap/conventions/include-structure.md) | Phase 2, Phase 4 |
| OOP two-class pattern (LCL_DATA + LCL_ALV) | [oop-pattern.md](../knowledge/abap/conventions/oop-pattern.md) | Phase 4 (OOP mode only) |
| ALV rules (Full vs SALV, field catalog standard) | [alv-rules.md](../knowledge/abap/conventions/alv-rules.md) | Phase 4, Phase 6 — only when the plan includes ALV output |
| ECC DDIC fallback (Table / DTEL / DOMA on ECC) | [ecc-ddic-fallback.md](../knowledge/abap/conventions/ecc-ddic-fallback.md) | Phase 2 (gate), Phase 4, Phase 6 |
| Mandatory main-program template (OOP) | [zsapkit_oop_ex.prog.abap](../knowledge/abap/templates/oop-sample/zsapkit_oop_ex.prog.abap) (+ companion includes / screens in the same folder) | Phase 4 (starting skeleton) + Phase 6 §8 (structural match) — OOP paradigm |
| Mandatory main-program template (Procedural) | [main-program.abap](../knowledge/abap/templates/procedural-sample/main-program.abap) | Phase 4 + Phase 6 §8 — Procedural paradigm |
| Cloud ABAP constraints (prohibited statements + replacements) | [cloud-abap-constraints.md](../knowledge/abap/conventions/cloud-abap-constraints.md) | Phase 0 (Cloud Public rejection) |

### Conventions Note

Applied in Phase 3 (the spec must not contradict it) and Phase 4 (the code follows it). Apply the Core, House rules, and Release and function modules groups to every program, and the OOP or the Procedural group by Phase 1B `paradigm`.

This block is a copy of the canonical conventions note (clean-code-note, in the ABAP conventions folder) — edit the canonical note and let the gate bring the copies in line; never edit a copy.

<!-- sapkit:conventions-note:begin -->
**Core**
- No `SELECT *` — an explicit field list instead [clean-code.md § Open SQL]
- No `SELECT` inside `LOOP` — reach for `FOR ALL ENTRIES` or a join [clean-code.md § Open SQL]
- Every statement that sets `SY-SUBRC` is followed by a check of it (SELECT SINGLE, READ TABLE, CALL FUNCTION with EXCEPTIONS) [clean-code.md § Open SQL]
- The internal table type fits the access pattern (HASHED / SORTED / STANDARD), with no DEFAULT KEY [clean-code.md § Internal Tables]
- No `SORT itab.` / `DELETE ADJACENT DUPLICATES FROM itab.` without `BY` / `COMPARING` on a `WITH EMPTY KEY` table — syntax check only warns, offline checker is silent [clean-code.md § Variables and Types]
- Secondary key on an itab filled from a transactional / large table when downstream access runs on non-primary fields [clean-code.md § Open SQL]
- Large-table SELECTs: `COUNT(*)` first, tuning plan when > 1M [clean-code.md § Open SQL]
- STRING values carry backtick literals; `|...|` templates do the assembly [clean-code.md § Strings]
- Booleans: `ABAP_BOOL`, compared with `abap_true` / `abap_false`, set via `XSDBOOL( )` [clean-code.md § Booleans]
- Conditions phrased positively, `IS NOT` in place of `NOT IS`, and no IF branch left empty [clean-code.md § Conditions and IFs]
- Explicit typed itabs over inline `INTO TABLE @DATA(...)` for SELECTs feeding further logic [clean-code.md § Open SQL]
- Inline declarations / modern syntax used where `ABAP_RELEASE` permits — never newer than the configured release [clean-code.md § Version Awareness]
- No commented-out code, no leftover debug statement (`BREAK-POINT`, `MESSAGE 'TEST'`) [clean-code.md § Comments]
- No ratio/percentage arithmetic assigned into narrow DEC/CURR fields (`COMPUTE_BCD_OVERFLOW` is runtime-only) [clean-code.md § Variables and Types]
- Reconciliation outputs never treat absent values as 0 (empty lookup must not assert "difference = 0") [clean-code.md § Reconciliation Logic — Null vs Zero]
- Descriptive full-word names, no abbreviations; single letters only for loop counters; booleans `is_*` / `has_*`; methods verbs, classes nouns [clean-code.md § Naming]
- Guard clauses first; extract past 3 `IF` levels; `CASE` over an `IF/ELSEIF` chain on one variable; no `EXIT` / `CHECK` mid long loop, no unexplained `CONTINUE` [clean-code.md § Control Flow]
- CURR of a `CURRDEC = 0` currency (KRW, JPY) is stored as display ÷ 100: scale display-unit thresholds before comparing, never store an external amount in CURR unconverted [clean-code.md § Currency Amounts — CURR Internal Unit ≠ Display Unit (TCURX)]
- Integer `/` rounds, `DIV` truncates; move `NUMC` / `DATS` into a `TYPE i` local before comparing with an arithmetic expression [clean-code.md § Arithmetic and Initial Values]
- No verdict in a type whose initial value is valid (`SYMSGNO` `'000'`) — use a boolean; guard blank `DATS` with `IS INITIAL OR <d> CO ' 0'` [clean-code.md § Arithmetic and Initial Values]
- Fixed-width record structures type dates `NUMC(8)`, never `DATS`; offsets count characters, layouts bytes [clean-code.md § Fixed-Width File Serialization — Keep `DATS` Out of the Record Structure]
- Code after a `RETURN` never runs — find the routine's `RETURN`s before appending above `ENDFORM` / `ENDMETHOD` [clean-code.md § Editing Existing Code — Two Silent Traps]
- Renaming a shared type component: send definition and use sites together, then `GrepPackages` + `CheckSyntax` every consumer [clean-code.md § Editing Existing Code — Two Silent Traps]
- All user-visible text via text elements or message classes — no hardcoded language literals in logic [clean-code.md § Text and User Interaction]
- `AUTHORITY-CHECK` at every entry point; user input never concatenated into `EXEC SQL` / dynamic `WHERE`; mask PII in logs and messages [clean-code.md § Security and Data Handling]

**OOP**
- Classes `FINAL` unless designed for inheritance; members `PRIVATE` by default [clean-code-oop.md § Object Orientation — Scope and Design]
- One job per method, at most 30 lines, one abstraction level, at most 3 IMPORTING parameters [clean-code-oop.md § Method Body] [clean-code-oop.md § Methods — Parameters and Calls]
- A method returns one value (`RETURNING` over `EXPORTING`); no boolean input parameter [clean-code-oop.md § Methods — Parameters and Calls]
- `NEW #( ... )` over `CREATE OBJECT`; several static creation methods over optional constructor params [clean-code-oop.md § Constructors]
- Exceptions: class-based only, from the project's own super class, foreign `CX_SY_*` wrapped, raised with `RAISE EXCEPTION NEW` [clean-code-oop.md § Error Handling — Detail]
- Formatting: 120-char lines, consistent alignment, one statement per line [clean-code-oop.md § Formatting]
- Tests: given-when-then names, publics only, doubles injected through the constructor, `LOCAL FRIENDS` only for constructor access [clean-code-oop.md § Testing — Detail]
- Comments above the statement, not trailing; no version notes or begin/end markers; ABAP Doc only on public APIs; pragmas over `"#EC` [clean-code-oop.md § Comments — Detail (beyond main file)]

**Procedural**
- Main program structure matches template main-program.abap — REPORT statement, INCLUDE order (t/c/s/o/i/a/f, optional `_tst` last — never `e`), event block layout, PBO/PAI modules as one-line `PERFORM` delegators; deviations justified in `spec.md` [clean-code-procedural.md § Mandatory Main Program Template (MUST match)]
- All globals declared in the TOP include only; no `DATA` in PBO/PAI/FORM/EVENT includes [clean-code-procedural.md § Global vs Local Discipline (TOP include)]
- Globals `g*`, locals `l*` — told apart on sight; no local shadows a global [clean-code-procedural.md § Global vs Local Discipline (TOP include)]
- Every FORM parameter typed (`USING p_a TYPE ...`); inputs via `USING`, in/out via `CHANGING`; no boolean `USING` [clean-code-procedural.md § FORM / PERFORM — Parameters and Signatures]
- Screen-bound FORMs end with the `_{screen_no}` suffix; utility FORMs have no suffix [clean-code-procedural.md § FORM Body]
- A PBO/PAI module body is one `PERFORM f_...` line; the logic lives in the FORM [clean-code-procedural.md § FORM Body]
- `sy-subrc` checked after every statement that sets it; `CALL FUNCTION` uses the `EXCEPTIONS` clause with `CASE sy-subrc` [clean-code-procedural.md § Procedural Error Handling]
- `EXIT` / `STOP` / `LEAVE PROGRAM` never stand in for error handling [clean-code-procedural.md § Procedural Error Handling]
- One-line header comment above each FORM: inputs / outputs / global side effects [clean-code-procedural.md § Comments — Procedural-Specific]
- Where the spec calls for tests, testable logic is pulled out into `LCL_HELPER`, not left inside FORMs [clean-code-procedural.md § Procedural Testing — Limits and Workarounds]
- FORM for program-local logic, FM for cross-program or RFC reuse; never share logic via includes or create an FM just for length [clean-code-procedural.md § Modularization Boundaries]

**House rules**
- Magic literals in logic (status/type codes, screen numbers, GUI status names, thresholds, compared return codes) become `CONSTANTS` in the TOP include [constant-rule.md § 1. What must become a constant] [constant-rule.md § 3. Where the declaration goes]
- Numbered objects `Z{MODULE}{TYPE}{NN}` (R report, S structure, T table, Y table type, E data element, D domain, V view); `{NN}` is 5 zero-padded digits (`00010`); prove it free via `SearchObject`, take last + 10, one `{NN}` per feature [naming-conventions.md § 3. Numbered objects — `Z{MODULE}{TYPE}{NN}`] [naming-conventions.md § 2. Claim the sequence number before you propose a name — MANDATORY]
- `Z{MODULE}FG_{PURPOSE}` / `Z{MODULE}FM_{PURPOSE}` (never `Z_MM_...`); `ZCL_` / `ZIF_` / `ZCX_{MODULE}_{PURPOSE}`; CDS `ZI_` / `ZR_` / `ZC_` / `ZP_{MODULE}_{Name}` [naming-conventions.md § 4. Unnumbered objects — patterns keyed by purpose]
- Write every applicable text-pool type (`R` title, `I` per `TEXT-xxx`, `S` per selection field, `H` only for WRITE lists) in the logon language and in `'E'` [text-element-rule.md § Scope — Four Text Pool Types (MUST verify ALL that apply)] [text-element-rule.md § Language Strategy (MANDATORY — two passes)]
- An `S` label starts at offset 8: via the MCP text tools `text` begins with 8 reserved characters; in an abapGit `TPOOL` they stay out of `ENTRY` [text-element-rule.md § Selection Texts — the Label Starts at Offset 8]
- Main program = `REPORT` + `INCLUDE`s + delegating event blocks; only the includes needed, never `e` in Procedural; no declaration after an event block [include-structure.md § Main Program Body] [include-structure.md § Event Blocks — Placement and Order]
- Activation does not cascade: activate main + every include (one `ActivateObjects`), then confirm `GetInactiveObjects` is empty [include-structure.md § Activation Protocol — MANDATORY (matches every skill that creates includes)]
- OOP split: `LCL_DATA` (`{PROG}c`) extracts data, no UI; `LCL_ALV` (`{PROG}a`) displays it; ALV follows the OOP sample on standard classes, never a global class the program does not ship; messages `S_UNIFIED_CON`, no new `ZMC` [oop-pattern.md § Two-Class Split (Mandatory)] [oop-pattern.md § ALV Requirement (Mandatory)]

**Release and function modules**
- Never emit syntax newer than the configured `ABAP_RELEASE`; if it is unset, stop and ask [abap-release-reference.md § 5. Checklist before emitting ABAP]
- Release `< 740`: no inline declarations, constructor expressions (`NEW`, `VALUE`, `COND` …), table expressions, string templates or chained method calls [abap-release-reference.md § 3. Feature matrix — the release each feature arrives in]
- FM signature inline in the `FUNCTION` statement — never a `*"` comment block or the `functionModuleParameter` placeholder [function-module-rule.md § HARD RULE — Inline signature only]
- No shadow locals (`lv_iv_xxx`) standing in for FM parameters — declare the real parameter [function-module-rule.md § Required source template (every FM)]

Not covered here? Open the section named in the rule's tag, in that file of the ABAP conventions folder.
<!-- sapkit:conventions-note:end -->

### ECC DDIC Fallback Gate

Where the Phase 2 object list carries a new Table, Data Element, or Domain AND `SAP_VERSION = ECC`, Phase 4 must NOT call `CreateTable` / `CreateDataElement` / `CreateDomain`. Follow [ecc-ddic-fallback.md](../knowledge/abap/conventions/ecc-ddic-fallback.md) instead: generate a helper report in `$TMP` from the matching template — [table_create_sample.abap](../knowledge/abap/templates/ecc/table_create_sample.abap), [element_create_sample.abap](../knowledge/abap/templates/ecc/element_create_sample.abap), or [domain_create_sample.abap](../knowledge/abap/templates/ecc/domain_create_sample.abap) — activate the helper, then emit the mandatory user message (SE38 run → uncheck dry-run → SE11 activate + assign transport). Do not count the DDIC object as created until the user confirms activation. The remaining objects (classes, includes, screens, …) continue on the normal flow; the plan must sequence the DDIC helpers first, so the user can create them before any code depending on them is activated.

## Phase 0 — SAP Version Preflight (runs before the interview)

Everything about the development approach (tables, BAPIs, CDS availability, ABAP syntax, RAP eligibility) hangs on the SAP platform and release.

Steps:
1. Read `.sapkit/config.json` for `sapVersion`, `abapRelease`, and `activeModules`
   - Also read `.sapkit/sap.env` → `SAP_ACTIVE_MODULES` as fallback
   - Load `../knowledge/modules/common/active-modules.md` (if present) and precompute the cross-module concern list for the program's primary module. Every downstream phase (planning, spec, implementation) receives this list and must factor in integration fields (e.g., MM primary + PS active → add `PS_POSID`).
2. Where any of these is missing or stale, ask the user to confirm:
   - **ECC** (ECC 6.0) — classical DDIC, LFA1/KNA1/BKPF/BSEG/MKPF/MSEG world, SAPGUI only
   - **S/4HANA On-Premise** — ACDOCA, MATDOC, Business Partner (BUT000), CDS/AMDP preferred, Fiori possible, ADT-first
   - **S/4HANA Cloud (Public)** — no classical Dynpro, no SE80 custom dev, only Developer Extensibility / Key User Extensibility (RAP managed, Custom Fields/Logic, Custom Business Objects)
   - **S/4HANA Cloud (Private)** — similar to On-Premise but with extensibility-first mindset
3. Confirm `abapRelease` (e.g. `750`, `756`, `758`) — drives allowed syntax
4. **SAP-side helper check** — the generated program itself needs nothing pre-installed ([oop-pattern.md § ALV Requirement](../knowledge/abap/conventions/oop-pattern.md#alv-requirement-mandatory) — standard classes only). What can be missing is the plugin's own RFC route, through which the agent writes screens, GUI statuses and text elements over MCP. So this check matters only on a live connection; an inspection-only session skips it silently and records `not-checked`. One P1 read:
   - `GetTextElement(program_name=RSPARAM)` — **only when that tool is on the tool list**. The **look but do not touch** surface does not load it; then record `not-checked`, because its absence says nothing about the route. The read goes through the RFC route and exercises the text pool FM on it. Screens and GUI statuses go through the sibling dispatcher FM on the same route, which this read does not reach. So an error means: treat all three as unavailable. A success proves the route and the texts; a dispatcher gap still surfaces later as a Phase 4 SKIPPED step.

   Route works → record it and move on without a message. Otherwise say in plain words what the gap stops (not object names), then:
   - **Tier `DEV` and the change tools on the tool list** → ask once:
     - **Install first** (recommended — the interview can then recommend the program shape it normally would) — pause and run [install-sap-assets](install-sap-assets.md) for the missing part. This is the same install setup Step 7 offers, with the manual work it leaves named up front as Step 7 does. It is a separate attended procedure that runs on the user's explicit yes — not a write of this pipeline, which still writes nothing before the approval gate. When it finishes, repeat the read. Whatever still fails because manual work is pending (an SE37 flag, the route set-up) is carried as **build without it** for that part — do not ask again.
     - **Build without it** — continue with the pre-filter below.
   - **Otherwise** → offer no install and continue with the pre-filter, saying in one line why: on a DEV system without the change tools, setup Step 7 is where it gets installed after switching to allow changes; on QA/PRD the helpers arrive by transport from the development system.

   Pre-filter while the route stays unavailable (`not-checked` filters nothing):
   - On the MCP delivery route the agent cannot write custom screens or GUI statuses. Full `CL_GUI_ALV_GRID` and the OOP sample's screens are therefore out: recommend SALV over Full (Phase 1B dimension 3). The abapGit route (dimension 8) still carries screens, statuses and texts inside the ZIP. On the MCP route, text elements become SKIPPED steps under the Phase 4 utility-FM rule, and the user enters them in SE38.

Branching consequences:
- **ECC**: no RAP, no ACDOCA, no Business Partner; inline decl only from 740+; CDS/AMDP typically unavailable (<750)
- **S/4HANA On-Prem**: prefer CDS + AMDP, RAP where applicable, Business Partner APIs, ACDOCA for finance
- **S/4HANA Cloud Public**: **REJECT classical Dynpro / custom screen + GUI Status requests**. Cloud Public cannot run the standard Full-ALV path (CL_GUI_ALV_GRID + Docking Container) — redirect to RAP + Fiori Elements, `if_oo_adt_classrun`, or SALV-only output. Fail fast, with an explanation. The full prohibited-statement list and the Cloud-native API replacements: [cloud-abap-constraints.md](../knowledge/abap/conventions/cloud-abap-constraints.md).
- **S/4HANA Cloud Private**: classical Dynpro is technically possible but discouraged; warn the user and confirm intent before proceeding.

Outputs:
- `.sapkit/program/{PROG}/platform.md` — resolved platform, release, and constraints, plus the helper check result (`rfc_route: works|unavailable|not-checked`)
- Interview dimensions pre-filtered by platform (e.g., ALV-Full hidden on Cloud Public) and by the helper check (step 4)

## Intake Resolution — Spec Entry Forms

Runs once, as soon as Phase 0 closes. The spec input can arrive three ways; the entry forms differ ONLY in how the spec input was produced — everything behind the interview (planning → spec writing → human approval with hash freeze → implementation → machine verification → fresh-context review) is identical for all three. No entry form skips Phase 0, shrinks the artifact contract, or bypasses any downstream gate.

Check three signals in order — the first match sets the interview scope:

1. **spec-provided** — the user pointed at or attached a design/spec document for this request. That document is the primary input to Phase 1.
2. **deep-interview brief** — no user document, but `.sapkit/deep-interviews/*.md` holds a [deep-interview](./deep-interview.md) brief (only a `*.md` file there is a brief — an HTML copy next to one is never read as a brief) whose **object scope/module matches** this request — most recent first; if several match, list them and ask which (on an un-migrated project the same directory lives under the legacy runtime dir — see [project-context](../project-context.md)). Confirm the match with the user in one line, then treat the brief as the primary input.
3. **neither** — run the standard step-by-step interview below exactly as written (the unchanged default).

### Document-input rules (forms 1 and 2)

- **Phase 0 never shrinks.** The platform preflight runs in full on every entry form — a brought document can embed platform-wrong assumptions (e.g. an ECC-only transaction such as `XK02` where the S/4HANA reality is Business Partner), and Phase 0 is the step that catches them before they harden into the spec.
- **Build a coverage map; interview only the gaps.** Read the document and map it against the 14 interview dimensions (Phase 1A dimensions 1–6 + Phase 1B dimensions 1–8). A dimension the document answers is closed by **confirmation restatement** citing the exact document location (*"§2.1 of your spec fixes the paradigm to Procedural — confirming rather than re-asking"*) — the same consumption pattern as `KD-` atoms in the Project knowledge preflight below. A dimension without a citable answer is a **deficit dimension**. Present the coverage map — each covered dimension with its **resolved value** and exact citation, never a citation alone — for one user confirmation; a covered dimension the user does not confirm is **demoted to a deficit dimension**. Then ask the deficit dimensions in bundles — the Bundled-Question Rule, its bulk-proposal prohibitions, and its Recovery clause all apply to deficit dimensions unchanged. A bundle mixes freely: a slot the document already answered rides along as a confirmation restatement next to the open ones.
- **Phase 1A dimension 6 (standard SAP solution screen) is never exempted.** If the document already records a standard-alternative review (which standard options were weighed, why rejected), restate it for confirmation; if it does not, the consultant still proposes at least one standard alternative before agreeing to the custom build.
- **The artifact contract is unchanged.** `module-interview.md` and `interview.md` are still produced in full, and every resolved dimension records its source: `source: user-spec §x` / `source: deep-interview <file>` / `source: interview`. The Phase 2 enforcement (refuse to plan when either file is missing) operates exactly as before.
- **Phase 3 and the approval gate are unchanged.** The spec is written with the brought document as its primary input, but that document never substitutes for `spec.md` — approval and the SHA-256 hash freeze bind to `spec.md` exactly as specified.

## Phase 1 — Step-by-Step Interview (business first, then technical)

Phase 1 runs as two sequential sub-phases (1A then 1B) on every invocation. What "never skip" protects is that **all 14 dimensions (8 when the Phase 1A skip rule applies) close with user-confirmed answers** — not the act of questioning itself. When Intake Resolution (above) resolved a document input, dimensions the document answers close by confirmation restatement with a source citation — a brought document is the user answering in advance, not a bypass; claiming document coverage with no document on the table, or beyond what the document actually answers, remains a protocol violation. Skipping **any** dimension (a deficit dimension on a document-input run), accepting "just build it" to bypass questioning, inferring answers from context instead of from a confirmed source, or rolling the remaining dimensions into one table under a single "approve?" is a protocol violation. If the user pushes to skip a remaining dimension — **with or without a document** — do not skip it; say this in the user's language, in plain words: that the interview is not optional, that the business side is settled before the technical side, and that the questions arrive a few at a time rather than all at once.

**Order rule**: Phase 1B (technical) NEVER starts before Phase 1A (business) closes. Without the business context the technical conversation means nothing.

### Bundled-Question Rule (applies to BOTH 1A and 1B)

This is the single most important enforcement in the whole interview — it protects the first-time user who needs to understand each decision as it arrives, without making them answer a dozen separate messages to get there. Questions travel in **bundles of 2–4 related slots**: not one at a time, and not all at once. On a document-input run (Intake Resolution forms 1–2), the same cadence governs the **deficit dimensions**, and a document-covered dimension rides inside the same bundle as a confirmation restatement.

**How a bundle is worded and formatted is not decided here.** Bundle size, the picker-vs-prose choice and its limits, folding when candidates exceed the cap, the recommendation-first option shape, the context line, the open slot, and the glossing rules all live in the [plain-language policy](../policies/plain-language.md). Follow it; this section does not restate any of it, so that the two cannot drift apart. What belongs here is only **which slots travel together**.

**Default groupings** — the starting shape, adjusted when a platform filter or a document already closes part of a bundle:

- **Phase 1A (business)**: `{1 · 2 · 3}` — who this is for and why · `{4 · 5}` — where the process departs from standard, and what to model after · `{6}` — the standard-SAP alternatives screen, on its own because it is a decision with consequences rather than a fact to state.
- **Phase 1B (technical)**: `{1 · 2 · 3 · 4}` — what the program is and what it looks like · `{5 · 6}` — where the data comes from and where the objects land · `{7 · 8}` — how it is tested and how it reaches SAP.

**Every slot is still asked.** Bundling changes how many questions ride in one message; it never removes one. A slot the user has not answered — or confirmed a restatement of — is open, whatever else the bundle carried.

Hard prohibitions:
- Do NOT roll the whole interview into one table under a single *"approve?"* — not even when the user says *"알아서 해줘"*, *"figure it out"*, *"just decide"*, *"ok everything"*, *"batch them"*. One word cannot answer a dozen decisions, and nothing has actually said yes to anything in particular.
- Do NOT let a bundle grow past the policy's cap, and do NOT bury extra slots as sub-questions of the ones on screen. What is inside the bundle is what the user is answering.
- Do NOT answer on the user's behalf and then ask only *"approve?"* for the bundle. Each slot in it carries its own recommendation and its own answer.

**Confirmation restatement happens inside the bundle.** A slot a brought-in document, a [deep-interview](./deep-interview.md) brief, or a `KD-`/`KS-` atom already answers is restated with its source next to the open slots in the same message, and the user corrects it there. It is a confirmation, not an extra question, and it is never re-asked as though the source did not exist.

**"Just decide for me" applies to the bundle that is currently open.** Acknowledge the fatigue, fill that bundle's remaining slots with the recommended answers, show them, and confirm that one bundle. It does not authorize the rest of the interview, and a batch proposal already sent under a wider reading is withdrawn. Then carry on with the next bundle.

First-time user safeguard: someone running this procedure for the first time has no idea what "Paradigm OOP vs Procedural" or "Full CL_GUI_ALV_GRID vs SALV" actually means. A bundle small enough to read in one breath is what keeps the chance to ask "what does this mean?" alive; a table of every remaining decision takes it away. Keep the bundles related and keep them small.

Recovery clause: where a bulk proposal already went out (protocol violation), apologize, roll it back, and restart the sub-phase from the first unanswered slot at the bundle cadence above — the correct repair is bundles of 2–4, not a swing to one question per message. Do NOT read a block "ok" as approval of a block proposal — protocol makes it invalid, and the slots it covered are still open.

### Phase 1A — Module Interview (module consultant persona)

**Purpose**: fix the business context, test whether custom development is warranted, surface the reusable assets, and let a domain consultant put SAP-standard alternatives on the table BEFORE any technical decision is made.

**Persona**: Adopt the matching `sap-{module}-consultant` persona for this step — see the [persona index](../personas/INDEX.md); e.g. [sap-sd-consultant](../personas/sap-sd-consultant.md), [sap-mm-consultant](../personas/sap-mm-consultant.md), [sap-fi-consultant](../personas/sap-fi-consultant.md), [sap-co-consultant](../personas/sap-co-consultant.md), [sap-pp-consultant](../personas/sap-pp-consultant.md), [sap-ps-consultant](../personas/sap-ps-consultant.md), [sap-qm-consultant](../personas/sap-qm-consultant.md), [sap-pm-consultant](../personas/sap-pm-consultant.md), [sap-wm-consultant](../personas/sap-wm-consultant.md), [sap-hcm-consultant](../personas/sap-hcm-consultant.md), [sap-tm-consultant](../personas/sap-tm-consultant.md), [sap-tr-consultant](../personas/sap-tr-consultant.md), [sap-ariba-consultant](../personas/sap-ariba-consultant.md), [sap-bw-consultant](../personas/sap-bw-consultant.md), [sap-bc-consultant](../personas/sap-bc-consultant.md).

**Trigger**: as soon as Intake Resolution closes. Where the initial request leaves the target module unclear, the FIRST question is "which module?" — the consultant persona cannot be adopted until that is resolved. Multi-module: work each module's consultant perspective in turn and reconcile the question streams.

**Industry / Country context preflight (MANDATORY — runs before the first business question)**:
- Read `.sapkit/config.json` (`industry`, `country`) and `.sapkit/sap.env` (`SAP_INDUSTRY`, `SAP_COUNTRY`). Precedence: `config.json` > `sap.env`.
- Where `industry` is set → load `../knowledge/industry/<key>.md` and let it stand as the consultant's business-context backdrop (do NOT re-ask the user).
- Where `country` is set → load `../knowledge/country/<iso>.md` (ISO alpha-2 lowercase, e.g. `kr`, `us`, `de`, or `eu-common` for EU-wide); multi-country: load each file and flag intercompany / intra-EU / transfer-pricing touchpoints. Do NOT re-ask the user.
- Where either value is missing → asking is MANDATORY before dimension 1. Do not infer it from the project name, the package, or prior interviews. Say each in the user's language, in plain words, in this order — the user answers in their own terms and **you** resolve the answer back to the internal key, so never ask them for a key:
  - **Industry missing** — which industry this program belongs to, offered as the industries that are actually supported, named the way the user would name them (read the supported set from [industry/README.md](../knowledge/industry/README.md)).
  - **Country missing** — which country's rules apply, more than one allowed, offered as the localizations that are actually supported and named the same way.
- Offer to remember the answer: one line saying that keeping it means future runs will not ask this again, and that not keeping it holds it to this run only. Do not name the file. On a yes, write the value; on a no, hold it for this run only.
- Record the resolved values in the `module-interview.md` header (`industry:`, `country:`, `source: config.json | sap.env | user-this-run`).

**Project knowledge preflight (MANDATORY — runs with the above, before dimension 1)**:
- Read `.sapkit/knowledge/domain.md` and `.sapkit/knowledge/system.md` if present — the business and this-system facts earlier runs had to find out. Absent directory → continue silently.
- A **`KD-` atom** is established context and is **not re-asked** — state it back for confirmation, in the user's language and in plain words: name the fact itself and say that this project established it earlier, so you are confirming rather than asking again. The atom id belongs in the record, not in the sentence the user hears. Then spend the slot on what the atom does not cover. This is what makes a second program on the same system cheaper than the first.
- A **`KS-` atom** counts as established only when its `scope:` matches this run's profile/SID/client; a non-matching one is a hint to confirm, not a fact.
- Anything under **`## Pending`** carries no evidence — ask it as a normal dimension question.
- If the user **contradicts** an atom: a `KD-` business rule is theirs to overrule (take the correction); a `KS-` system fact opens a correction candidate to check against DDIC/MCP before rewriting. Both route to [knowledge](./knowledge.md) `Correct` — never a silent overwrite.
- If `config.json` registers `referenceLibraries` vaults, keyword-match the program's topic against them (2–3 docs per vault max — mechanics in [ask-consultant](./ask-consultant.md) § Reference Libraries): the user's own distilled practices inform dimensions 2–4 (business purpose, pain points, company-specific rules) better than the bundled generic knowledge. Cite `참조: {name}/{file}` where a vault doc shapes a question or a spec decision. Ladder: [knowledge-sourcing](../policies/knowledge-sourcing.md).

**Question dimensions** (asked in the default bundles above):
1. **Module identification** — single or multi (SD/MM/FI/CO/PP/PS/QM/PM/WM/HCM/TM/TR/Ariba/BW/BC)
2. **Business purpose** — which business outcome the program produces (handed to which role / feeding which decision)
3. **Business reason / pain point** — which current Gap, manual workaround, or compliance/regulatory requirement drives the request
4. **Company-specific business rules** — where the process departs from the SAP standard (special pricing, custom statuses, local compliance, industry-specific calculations, etc.)
5. **Reference assets** — existing CBO packages, earlier Z programs, vendor add-ons worth modelling after
   - Where the user names a reference Z program: you MAY run a `program-to-spec`-style quick lookup at depth L1 (Quick Spec) on that single object — pull Purpose / inputs / outputs / main logic steps (numbered) — and inline the summary into `module-interview.md` (collapse the step list to 2–3 sentences where it runs long). Do NOT produce a full spec artifact for the reference object; this is a focused lookup.
6. **Standard SAP solution screen (mandatory)** — the consultant MUST put at least one standard alternative (Fiori app, standard report/transaction, BAPI flow, CDS analytical query, embedded analytics) on the table BEFORE agreeing to a custom build. The user explicitly accepts/rejects each alternative; every rejection is logged with its reason.

**Skip rule**: skip Phase 1A only for a pure technical utility with zero business logic (e.g., a generic string helper, a file converter). The default is "do not skip".

**Gate**: every slot in this stage is closed by user confirmation.

**Output**: `.sapkit/program/{PROG}/module-interview.md`

**Enforcement**: Phase 1B refuses to start where this file is missing, or where any slot in it is still open — one the user never answered, or one you closed on their behalf.

### Phase 1B — Program Interview (analyst + architect personas)

**Pre-condition**: Phase 1A closed; `module-interview.md` exists; every slot in that stage closed by user confirmation.

**Purpose**: turn the agreed business solution into concrete technical decisions.

**Personas**: Adopt the [sap-analyst](../personas/sap-analyst.md) persona for functional decomposition (owns dimensions 1, 5) and the [sap-architect](../personas/sap-architect.md) persona for technical structure (owns dimensions 2, 3, 4, 7, 8); both perspectives feed dimension 6. Hold the question stream to the bundles above.

**Question dimensions** (asked in the default bundles above, pre-filtered by resolved platform):
1. **Purpose-type** — Report / CRUD / ALV List / Batch / Interface
2. **Paradigm** — OOP (two-class) vs Procedural (PERFORM)
3. **Display mode** — None / SALV popup / Full CL_GUI_ALV_GRID
4. **Screen/GUI** — required? screen numbers? Docking Container vs Splitter vs TOP_OF_PAGE layout?
5. **Data source** — standard tables / Z-tables / BAPI / CDS view (must be consistent with Phase 1A reference assets)
6. **Package + Transport** — target package, new or existing transport
7. **Testing scope** — which logic gets test methods, or `none`, under **either paradigm**: in OOP the local classes' methods; in Procedural the pure-computation logic pulled out of the FORMs into `LCL_HELPER` [clean-code-procedural.md § Procedural Testing — Limits and Workarounds]. **Recommended default: turn the acceptance examples into tests.** The "given this input, this result" examples that the dig-out stage below collects become the test methods, so the program is checked against something the user wrote rather than against the code. Offer that as the recommendation, and let the user widen or narrow it from there.
8. **Delivery path** — which route the finished code takes into SAP: **through MCP** (the agent writes and activates the objects over the live ADT connection) or **as an abapGit ZIP the user imports themselves** through the abapGit UI ([develop-abapgit](./develop-abapgit.md)). Recommend **MCP wherever a live connection exists**; abapGit is the route when MCP is unavailable, unreliable, or not permitted on the target system — for some users it is the only way in, so it is offered as a route, never as a lesser one. Ask it here rather than at implementation time, because the plan and the risk briefing both hang on it: on the abapGit route the agent never connects to SAP before the user's import, so syntax and activation authority stay with the server until then, and **newly authored screen (DYNPRO) or GUI status (CUA) XML carries an import → repair → re-ZIP round trip** the user should expect from the outset.

On each dimension you may propose a recommended default (drawn from Phase 1A context + CBO inventory + platform constraints). That proposal belongs to its own slot inside the bundle, shaped per the [plain-language policy](../policies/plain-language.md) — never merge the remaining dimensions into one table under a single approval.

**Gate**: every slot in this stage is closed by user confirmation. Do NOT proceed to the dig-out stage until that holds.

**Output**: `.sapkit/program/{PROG}/interview.md` — one Q&A block per resolved dimension, and a closing line recording that every slot closed by user confirmation. The dig-out stage below appends its own section to this same file.

**Enforcement**: the Phase 2 planning step MUST refuse to run where either `module-interview.md` or `interview.md` is missing or incomplete, **and refuse equally where `interview.md` carries no dig-out section** (the existence check is a grep for the `<!-- SAPKIT:DIG-OUT -->` marker, never for a heading string — the heading is rendered in the user's language and would not be found). All of it carries forward into Phase 2, so planning does not re-interview.

### Inventory Lookups (run immediately after `<MODULE>` and `<PACKAGE>` are resolved — Phase 1B dimension 6)

Two back-to-back inventory passes feed every downstream phase.

**CBO Inventory Lookup** — output `.sapkit/program/{PROG}/cbo-context.md`:
1. Resolve `<MODULE>` (Phase 1A) and `<PACKAGE>` (Phase 1B dimension 6).
2. Check whether `.sapkit/cbo/<MODULE>/<PACKAGE>/inventory.json` exists.
   - **Exists** → read it. Extract the `objects[]` array. Treat every entry as a reuse candidate and surface it in Phase 2 / Phase 3 so planning and spec writing prefer the existing asset over creating a new one.
   - **Does not exist** → offer the user three options in one question. Say this in the user's language, in plain words, with no file paths and no procedure names in what they read:
     - that the objects already sitting in this package have not been surveyed, so the build has no list of things to reuse and may end up creating something that is already there;
     - **(A) survey it now** — the recommendation, first: you do it inline, it takes a couple of minutes, and from then on the build prefers what already exists;
     - **(B) go on without it** — the build proceeds, but it will not know what is already in the package;
     - **(C) stop here** — the user would rather run the survey on its own first.
     - **(A) stock now** → Adopt the [sap-stocker](../personas/sap-stocker.md) persona for this step and stock the CBO package `<PACKAGE>` (module `<MODULE>`) per that persona's investigation protocol. On success, re-read the freshly written `inventory.json` and continue to step 3. If stocking is blocked, surface the reason, fall back to option (B), and log `cbo_inventory: "stock_failed: <reason>"`.
     - **(B) skip** → record `cbo_inventory: "skipped"` in `.sapkit/program/{PROG}/platform.md` and continue.
     - **(C) cancel** → stop the procedure and let the user run `analyze-cbo-obj` manually.
3. Persist the loaded inventory to `.sapkit/program/{PROG}/cbo-context.md` — one bullet per reusable object: name · type · role · one-line purpose · `reuse_hint`. Phases 2–4 all read this file.

**Customization Inventory Lookup** — runs immediately after the CBO lookup, same resolved `<MODULE>`; output `.sapkit/program/{PROG}/customization-context.md`:
1. Check whether `.sapkit/customizations/<MODULE>/enhancements.json` and/or `.sapkit/customizations/<MODULE>/extensions.json` exist.
   - **Exists** → read both. Treat every `badiImplementations[]`, `cmodProjects[]`, `formBasedExits[]`, and `appendStructures[]` entry as a reuse candidate.
   - **Does not exist** → say one line to the user, in their language and in plain words, with no file paths and no procedure names in it: that this module's existing customer enhancements have not been surveyed; that surveying them first means the build extends what is already there instead of adding a second parallel copy of it; and that going on without it is a fine choice if they prefer.
     If the user chooses to go on, record `customization_inventory: "skipped"` in `.sapkit/program/{PROG}/platform.md` and continue.
2. Persist the loaded inventory to `customization-context.md`. One bullet per entry:
   - BAdI impl: `• BAdI {standardName} → existing impl {Z*_CLASS} (impl name: {impl_name}) — reuse target for any new hook into this BAdI`
   - CMOD project: `• SMOD {standardName} → existing CMOD project {Z_PROJECT} — add new components here instead of creating a second project`
   - Form-based exit: `• Include {ZXVEDU01|MV45AFZZ|...} ({lineCount} lines) — already customized; read existing logic before adding new FORMs`
   - Append: `• Table {VBAK|EKKO|...} → existing append {CI_VBAK_ZZ|Z_APPEND_VBAK} fields: [{ZZ_FIELD1}, {ZZ_FIELD2}] — extend this append, do not create a second one`
3. Follow [customization-lookup.md](./customization-lookup.md) for the full resolution protocol and "prefer reuse" ✅/❌ examples.

**Reuse gating rule** (applied in Phases 2 and 3):
- If an inventory entry matches the spec's semantic need (same role + matching FK pattern + purpose overlap), **default to reuse**. Only propose a new Z-object when the consultant or user explicitly rejects the candidate, with the rejection reason logged in `plan.md`.
- If the request is to add a BAdI implementation / CMOD component / append field and the cache already lists a `Z*`/`Y*` asset for the same `standardName` or base table, **default to extending the existing asset**. Creating a second parallel Z impl, a second CMOD project for the same SMOD, or a second append on the same standard table is a MAJOR finding in Phase 6 review and will block the spec. Rejection requires a written justification in `plan.md` (e.g., "existing ZCL_SD_ORDER_IMPL is used by another business flow and merging would break it").

### Phase 1B close — project knowledge offer

The interview is where facts get established, so the offer belongs here rather than
at completion: a run that stalls in implementation would otherwise lose them, and
Phase 8's hard gate can still send the run back to Phase 6.

If Phase 1A/1B established a business or system fact — a company-specific rule the
user explained, a legacy table's real grain, a non-obvious status meaning — grep the
two knowledge files for its key terms, and only if it is not already recorded offer
one line — said in the user's language, in plain words, naming no file and no
procedure: that you noticed something worth keeping (state the fact itself), and
that keeping it means the next program on this system will not have to ask about it
again. On a yes, follow
[knowledge](./knowledge.md). Failures go to [lesson](./lesson.md), facts go
to `knowledge`; a single incident can warrant both. Nothing newly established, or
already recorded → no prompt.

### Dig-Out Stage — the blanks nobody put on a list (MANDATORY, runs before Phase 2)

The interview closed the slots this procedure knew to ask. The dig-out closes the
ones it did not — the exception cases, the error handling, the run mode, the
locking, the rounding, the acceptance examples. Left unasked, those are decided
silently by whoever writes the code.

Run [interview-sweep](./interview-sweep.md) in its **Full** variant, entered here:
after Phase 1B closes and **before** Phase 2 starts. That procedure owns the whole
of it — drawing the program map out of the Phase 1A and 1B answers and having the
user correct it, enumerating the blanks off the corrected map, asking all of them
with a recommendation attached, and its stopping criterion. None of it is restated
here, and nothing about it is optional: a brought-in design document, a
[deep-interview](./deep-interview.md) brief, or a recorded `KD-`/`KS-` atom changes
the *form* of an individual question (confirmation restatement instead of a fresh
ask), never whether the stage runs.

**Where the record goes.** The stage appends its section to the `interview.md` this
run already owns, alongside the slot answers — no new file. The section opens with
this exact marker, alone on its line:

```
<!-- SAPKIT:DIG-OUT -->
```

Do not translate it, reword it, or drop it. It is an HTML comment, so it never
shows on the rendered page, and it is the machine handle a later step greps for. A
visible heading follows on the next line, in the user's language like the rest of
the artifact; the entries under it carry what was asked, what the user answered,
whether the answer taken was the one recommended, and where it came from
([interview-sweep](./interview-sweep.md) Step ④).

Two results of this stage are load-bearing downstream and are worth naming here:
the **business rules and exceptions** become the design document's rules section,
and the **acceptance criteria** ("given this input, this result") become both the
design document's acceptance section and, when testing scope is set (either
paradigm — Procedural through `LCL_HELPER`), the minimum set of test methods in
Phase 5.

**Gate**: Phase 2 does not start until the stopping criterion holds and the marked
section exists in `interview.md`.

## Phase 2 — Planning

Adopt the [sap-planner](../personas/sap-planner.md) persona for this step.

If `.sapkit/RULES.md` (written by the [lesson](./lesson.md) procedure) exists, read the rules relevant to this program before planning; matching rules are hard constraints. If absent, continue silently.

- **Inputs (mandatory read before planning)**: `module-interview.md` (business context, standard-SAP rejections, reference assets) AND `interview.md` (technical decisions **and its dig-out section** — the business rules, exception handling, and acceptance examples). **Refuse to plan where either file is missing, or where `interview.md` carries no `<!-- SAPKIT:DIG-OUT -->` marker** — planning without the dug-out rules is planning against assumptions. Reconcile all of it — if a Phase 1B technical choice contradicts a Phase 1A business rule or a dug-out rule (e.g., chose custom Z-table when the consultant proposed standard CDS), raise the conflict back to the user before producing `plan.md`.
- **CBO reuse gate (mandatory when `cbo-context.md` exists)**: before designing any new Z-object (table / structure / class / FM / data element), scan `cbo-context.md` for a reuse candidate. Default to reuse when role + FK pattern + purpose overlap. Every new-object proposal in the plan must include a one-line justification of why no CBO candidate fits.
- **Customization reuse gate (mandatory when `customization-context.md` exists)**: before proposing a new BAdI implementation, CMOD component, form-based user-exit FORM, or append structure, scan `customization-context.md` for an existing customer asset covering the same `standardName` / base table. Default to extending the existing asset. Every new-enhancement/extension proposal in the plan must include a written justification of why no customization candidate fits (follow [customization-lookup.md](./customization-lookup.md)). Creating a second parallel impl when one already exists is a MAJOR finding in Phase 6.
- Apply shared conventions: [include-structure.md](../knowledge/abap/conventions/include-structure.md), and the naming rules in the conventions note (Shared Conventions above)
- **Consultant consultation (mandatory when requirements touch SAP business configuration)**:
  - Name the affected SAP module(s) off the interview output (SD / MM / FI / CO / PP / PS / QM / PM / WM / HCM / TM / TR / Ariba / BW / BC)
  - Adopt the corresponding `sap-{module}-consultant` persona for this sub-step (see the [persona index](../personas/INDEX.md))
  - Check for a local SPRO cache at `.sapkit/spro-config.json` before querying live
  - Resolve SPRO data per [spro-lookup.md](./spro-lookup.md) (priority: local cache → static module docs under `../knowledge/modules/{MODULE}/` → live query with user confirmation)
  - Consultant output: business-aligned recommendations — the relevant IMG customizing tables/views, master data dependencies, standard BAPIs/FMs worth leveraging, authorization objects, and integration touchpoints with neighboring modules
  - File: `.sapkit/program/{PROG}/consult-{module}.md` (one per consulted module)
  - For multi-module scenarios, consult each module in turn and reconcile as planner
- Integrate consultant inputs into the final plan
- Output: include list, screen numbers, class names, transport plan, test coverage, referenced SPRO views / standard APIs / authorization objects
- **ECC DDIC sequencing**: if the object list includes new DDIC objects on ECC, sequence the DDIC fallback helpers first (see the ECC DDIC Fallback Gate above)
- File: `.sapkit/program/{PROG}/plan.md`

**Skip consultant when**: pure technical utility with no business logic (e.g., a generic string helper class, a pure file converter) — plan alone.

## Phase 3 — Spec Writing

Adopt the [sap-writer](../personas/sap-writer.md) persona for this step. The spec is the most critical artifact standing between interview and implementation — put full care into it here.

- Produce a functional + technical spec out of `plan.md`
- **CBO reuse (mandatory when `cbo-context.md` exists)**: every spec section that references an existing CBO asset must name it explicitly (e.g., "writes to existing table `ZSD_ORDER_LOG`") and include a one-line reason for reuse.
- **Customization reuse (mandatory when `customization-context.md` exists)**: when the spec extends a BAdI / SMOD / form-based exit / append, it MUST reference the existing `Z*`/`Y*` implementation class, CMOD project, include, or append structure by name (e.g., "add new method to existing BAdI impl `ZCL_SD_ORDER_IMPL`"; "extend existing append `CI_VBAK_ZZ` with field `ZZ_DELIVERY_PRIORITY`"). Never silently introduce a parallel Z-object when a reuse target exists in `customization-context.md`.
- **MANDATORY before writing**: follow the conventions note (Shared Conventions above), and open and read every remaining shared convention file that applies to the program type — [alv-rules.md](../knowledge/abap/conventions/alv-rules.md) when the plan includes ALV output, [oop-pattern.md](../knowledge/abap/conventions/oop-pattern.md) if OOP, [include-structure.md](../knowledge/abap/conventions/include-structure.md). The spec must NOT carry an instruction that contradicts these conventions (e.g., "build LVC_T_FCAT manually" contradicts the SALV-factory rule in alv-rules.md). Where the spec describes a technique, paraphrase the approach the convention prescribes — never invent a shortcut.
- File: `.sapkit/program/{PROG}/spec.md`

### Design-document template (minimum sections)

**The whole document is written in the user's conversation language** — front
section and technical body alike. It is the thing they are asked to sign, so it
cannot be in a language they read at half speed. A term of art carries its meaning
the first time it appears — `term(meaning)` — per the
[plain-language policy](../policies/plain-language.md).

**The front section comes first, before any technical section.** Five parts, in
this fixed order. It is not a summary written afterwards; it is the face of what
the interview and the dig-out stage established, and it is the part a business
reader can check on their own.

1. **At a glance** — what this is, who it is for, when it runs, and input →
   output. Around five lines; short enough to read standing up.
2. **What was decided, and why** — the decisions in plain words, each with the
   reason behind it, **including the standard SAP alternatives that were put on
   the table and turned down, and why** (Phase 1A dimension 6). Where a dimension
   was resolved as "chose X over Y", the choice and its rationale belong here.
3. **Business rules and exceptions** — the dig-out result: an "in this case, do
   this" list, one line per rule, drawn from the dig-out section of
   `interview.md`.
4. **Acceptance criteria** — the worked examples in the shape "given this input,
   this result", so the finished program is checked against something the user
   wrote rather than against the code.
5. **What will be built, in human words** — the shape of the delivery in one or
   two lines: *one report, seven includes, one screen, transport X*. Not the
   object table; that is §4 below.

The technical sections follow underneath. Headings below are shown in English
because this is product instruction — render them in the user's language:

```
# Program Spec: {PROG_NAME}

## At a glance
What / who / when / input → output. ~5 lines.

## What was decided, and why
Each decision in plain words with its reason, including the standard SAP
alternatives weighed and why each was turned down.

## Business rules and exceptions
The dig-out result — "in this case, do this", one line per rule.

## Acceptance criteria
"Given this input, this result" — the worked examples.

## What will be built
One or two lines in human words (e.g. one report, seven includes, one screen,
transport X).

---

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

## 6. Test Coverage (when testing scope is set)
List of ABAP Unit test methods with brief description.

## 7. Still Open
Anything genuinely undecided and deliberately left so, with what it depends
on. Empty section if none — the resolved "chose X over Y" decisions and their
rationale live in "What was decided, and why" above, not here.

## Approval
(Auto-appended once the user approves.)
- **Approved by**: <user input>
- **Timestamp**: <ISO 8601>
- **What the user said**: <their approval, verbatim, in their own language>
```

## Spec Approval Gate (human gate)

Once the interview and the dig-out stage close (every slot confirmed by the user), Phase 2 has produced `plan.md`, and Phase 3 has produced `spec.md`, this gate MUST run before any `Create*` / `Update*` call.

Required steps:
1. **Display the whole document in the chat** — the front section *and* the full
   technical detail, not an excerpt and not a link. The user is signing the whole
   file, and they cannot sign what they have not been shown. Surface the file path
   as well, for reading it later. Then add **one statement line — not a
   question**: you can make an easy-to-read HTML copy of it and open it in their
   browser, if they just say so ([HTML copy of the design document](#html-copy-of-the-design-document-on-request)
   below). That line adds no question: the gate still asks **exactly one**.
2. **Block all further progress** — no `CreateProgram`, `CreateClass`,
   `CreateInclude`, or any other `Create*` / `Update*` call may happen — until the
   user approves. What counts as approval is set by the
   [approval-gates policy](../policies/approval-gates.md) Gate A and is not
   restated here in a narrower form. In short: **any clearly affirmative answer is
   approval**, in whatever language and phrasing the user chose; there is no
   keyword list to match against. An **ambiguous** answer — enthusiasm or
   impatience without a decision — is not yet approval: ask back **exactly once**,
   then judge that answer by the same standard. **Silence, or moving on to another
   topic, is not approval.**
3. A **change request is a design edit, not a verdict on the gate**: revise the
   document, re-display it in full, and ask again. Never silently fold the
   comments in and continue.
4. Only after approval:
   - Append the `## Approval` section to `spec.md`, recording **the user's actual
     words, verbatim** — not a keyword, not a normalized form, not a translation.
   - Compute the SHA-256 of the approved `spec.md` and write `.sapkit/program/{PROG}/approval.json` conforming to [schemas/approval.schema.json](./schemas/approval.schema.json) — `approval_phrase` carries those same verbatim words. This binds the approval to the exact spec content (`spec_sha256`) AND the target system (`sid` / `client` / `tier` from the active connection profile in `.sapkit/sap.env` / `.sapkit/config.json`, plus the `transport` from Phase 1B dimension 6).
   - Record `state.json.phases.3_5_mode_gate.status = "completed"` **at this
     moment** — the approval is what satisfies the gate Phase 4 checks, not an
     answer to the Phase 3.5 briefing. (Why it is keyed here: see the Phase 3.5
     Enforcement Contract.)
   - Then move to Phase 3.5. **Do not ask a second "shall I proceed?"** — the
     approval answer already was that go-ahead.

What the user is asked, at this gate — say this in the user's language, in plain
words, and do not paste the element list itself:

- that the design document is ready and is shown in full above;
- that reading it end-to-end is worth the couple of minutes, because it is what
  the build follows;
- that saying yes starts the build on SAP;
- that anything they want changed should be said instead, and the document comes
  back revised.

That is the gate's one question. The HTML-copy line from step 1 stands next to it
as a statement and is never asked as a second question.

**Enforcement contract** — Phase 4 MUST refuse to run if any of the following is true:
- `.sapkit/program/{PROG}/spec.md` does not exist
- `spec.md` lacks a `## Approval` footer section recording the user's approval
- `approval.json` is missing, does not validate against [schemas/approval.schema.json](./schemas/approval.schema.json), or its `spec_sha256` no longer matches the current `spec.md` (meaning a change arrived post-approval — needs re-approval)
- `approval.json`'s `sid` / `client` do not match the currently connected system

**Rationale**: the spec is the contract between user intent and AI execution. Create ABAP objects (tables, classes, programs) on the SAP system without that contract visible and signed off, and what follows is: unexpected objects in the user's package/transport, naming conventions out of step with team standards, business logic subtly off the actual requirements, and generated code that is hard to justify in code review. The 30–60 seconds of spec reading + approval buys back hours of "oh no, that's not what I meant, please delete all of this and start over".

### HTML copy of the design document (on request)

`spec.md` stays the document of record. The HTML copy is generated from it so the
user can read it comfortably or forward it by mail or chat as one file that opens
offline. Nothing binds to the copy: approval stays bound to the SHA-256 of
`spec.md` alone, the copy is never hashed, and it never replaces showing the whole
document in the chat at the gate. Offer it only as the step-1 statement line —
never ask about it up front, and never make it unasked.

- **Making it.** Use the [HTML renderer](../../tools/spec/md-to-html.mjs):
  `node PLUGIN_ROOT/tools/spec/md-to-html.mjs .sapkit/program/{PROG}/spec.md .sapkit/program/{PROG}/{PROG}-spec.html --lang <conversation language> [--draft] --open`.
  Add `--open` only the first time a copy is made in this run.
- **Draft or final.** If `approval.json` exists and its `spec_sha256` matches the
  current `spec.md`, the copy is **final** (no banner); otherwise it is a **draft**
  (`--draft` — a "not yet approved" banner on top). The same test applies during
  a run and in the conversion-only branch below.
- **Asked for alone at the gate.** Make the draft copy, open it, then say in one
  line that approval is still open. The request **itself** is not approval, not a
  change request, and does not use up the one ask-back on an ambiguous answer
  (step 2). The gate stays closed and still waits on its one question.
- **Asked for together with approval** (e.g. "good — show me the HTML too").
  Approval is judged exactly as step 2 says (Gate A — a clearly affirmative
  meaning approves). Finish step 4's approval records first, then make the copy
  **without** the banner and open it. The HTML request does not undo the approval.
- **Keeping it current.** If `{PROG}-spec.html` exists next to `spec.md`,
  regenerate it every time `spec.md` is rewritten — a revision for a change
  request, the `## Approval` section appended at approval, a return to this gate
  after a post-approval change, or a run resumed in a later session — applying the
  draft-or-final test. The file's existence is the only signal; record nothing
  for it in `state.json`. After a change, say in one line that the HTML copy was
  updated too, without reopening it. After approval the copy carries no banner and
  shows the approval record (who, when, the user's words verbatim) exactly as the
  Markdown does.
- **Opening and reporting.** Only the first copy in a run is opened; later
  regenerations in the same run just say it was updated. The renderer prints
  `WROTE <path>`, then `OPENED` when the browser launch was accepted (not proof a
  window appeared) or `OPEN-FAILED <reason>` (still exit 0 — a sandbox that
  blocks the browser lands here); exit 1 means `spec.md` could not be read and
  nothing was written. Always give the file path too. Say it in the user's
  language and in plain words — that an easy-to-read HTML copy was made and
  opened in their browser, or that it could not be opened and here is where it
  is — never the renderer's name, its flags, or file-schema names.
- **Conversion-only request.** When the user asks to turn an existing design
  document of this procedure into HTML — names a file, or points at "last time's"
  one — that is the whole task: no SAP connection, no Phase 0, no interview, no
  analysis. Identify the `spec.md`; if it cannot be identified, list the
  candidates found under `.sapkit/program/*/spec.md` and let the user pick (a
  picker where the host has one, prose otherwise). Write `{PROG}-spec.html` next
  to it under the draft-or-final test, open it, and report as above. `--lang`:
  the file name's `-<lang>` suffix if it carries one, else the language of the
  document body, else the conversation language.

## Phase 3.5 — Go-Ahead Briefing (between spec approval and Phase 4)

The number **3.5** is kept because other documents point at it. What changed is
what happens here: this is no longer a mode menu. It is **one screen that tells
the user what is about to happen and carries exactly one question** — the
permission offer in Step 1. Everything else on the screen is a statement.

### Step 1 — The briefing (one screen, one question)

Say all of this in the user's language, in plain words, in this order. Only (a)
is a question; the rest are told, not asked.

**(a) The permission offer — Claude Code only, and only in the main conversation.**
A delegated worker never makes this offer. Ask, yes or no, whether to pre-allow
the SAP tools this build needs, so the run does not stop on a permission prompt
for every object it writes. Carry the honest caveat with it: **whether it takes
effect inside this same session is unmeasured** — if a prompt still appears,
allow it once, and from the next session at the latest it will not appear again.

On **yes**, merge the subset list at `interactive/adapters/claude/permissions-build.json`
into the project's `.claude/settings.local.json` under `permissions.allow`:

- **Additive merge only.** Add entries that are absent. Never delete an existing
  entry, never reorder the list, never rewrite an entry the user put there.
- **Count before and after.** If the entry count drops, the merge went wrong —
  roll it back to the file as it was and say so.
- **Report dead prefixes.** An entry in the subset list matching no tool the
  build will actually call is reported, not silently merged over.

On **no**, change nothing and continue; the run then stops at each permission
prompt, which is a slower run, not a worse one.

On **Codex and Antigravity this offer does not exist** — replace it with a
one-line notice, not a question: sapkit has no allow-list to merge on those
hosts, per-call approval is the host's own user setting, and the two real-data
tools ask everywhere regardless.

**(b) What the allowance changes, and what it does not.** Two different things,
and the user needs both — a briefing that gives only the first tells them the run
will never pause when in fact it still will:

- **Where *this run* stops and asks them** — the closed list in (c). With the
  allowance in place no permission prompt appears while the build writes to SAP,
  so the places in (c) are the only places the run pauses. Ask them to stay nearby
  for those.
- **Where their *host's own* approval window still appears, allowance or not** —
  the subset list that gets merged deliberately leaves out deleting anything,
  creating or releasing a transport, creating a package, running anything on the
  system, and the two tools that read real business data. Saying yes does not
  pre-allow those: if one is ever reached, the host asks in its usual way, on top
  of whatever (c) already requires. Say it as effect — *deleting, transports, new
  packages, running things, and reading real data are not covered by this; you
  will still be asked* — and not as a list of tool names.
- **Count before you say it (Claude Code only — the same host as (a)).** "You
  will still be asked" is true only for a family the user has not already allowed
  on their own. Before the briefing, read the settings the host will apply — the
  project's `.claude/settings.local.json` and `.claude/settings.json`, and the
  user-level `~/.claude/settings.json` — and judge each left-out family. (On Codex
  and Antigravity there is nothing to count: say instead that whether those
  families ask is the host's own setting.)
  - A server-wide rule (`mcp__plugin_sapkit_sap` or `mcp__plugin_sapkit_sap__*`)
    allows every family at once, and so does `defaultMode: "bypassPermissions"`.
    Under either, a `deny` rule naming a tool still wins, and an `ask` rule wins
    over an `allow`.
  - A family nothing allows: say *you will still be asked*. A family the user
    already allowed: say that instead — *your own settings already allow deleting
    (N entries), so that will not ask either* — and leave those entries alone; the
    merge is additive and never removes them.
  - Real data is the exception to "will not ask either": even where the user's
    settings allow the two real-data tools, the run itself still stops before
    every real-data read (the stop list in (c)). Say so.
  (Field-measured 2026-11-11: one project already carried 42 delete, transport and
  runtime entries, and the unconditional sentence was false.)

That distinction is what makes "nothing outside (c) stops the run" true rather
than false: (c) is where **this procedure** stops to ask, and the excluded actions
are where **the host** asks.

**(c) The stop list — closed, and it is these seven.** The run stops when:

1. **it needs to read real business data out of a table** — every single time,
   with the scope, the fields, and the row cap shown first, and never in a
   delegated worker or a batch;
2. **something turns out not to be buildable the way the design was approved** —
   any such finding, not only a large one. The run asks about that one thing,
   records the answer, and carries on (Phase 4); only where the answer changes the
   object list or the transport does the design document go back for approval;
3. **the automatic repair budget is spent** — the run retries a failure on its own
   a fixed number of times (the phase sections below own those numbers), and when
   they are used up it stops and hands the problem over instead of trying again;
4. **an ECC DDIC object needs a person to activate it in SE11** — the run prepares
   the helper and waits for the user's confirmation before anything depending on
   that object is activated;
5. **a step belongs to the user** — on the abapGit route the import into SAP is
   theirs to run, and the run waits for them to report back;
6. **a delegated worker was asked for by name and cannot be launched here** — the
   run never quietly builds it itself instead; it says so and waits for direction;
7. **the read-back comparison diverges** — what SAP holds is not what was sent, so
   the run stops there and says what diverged rather than reporting the work
   finished.

Where the user takes (d)'s opt-in, each step is confirmed as well. Otherwise
nothing outside these seven stops the run. Say them as effects, not as policy
grades, phase numbers, or tool names.

**These seven are build stops.** The offers that close a finished run — keeping a
recurring root cause as a lesson, keeping a newly established fact as project
knowledge — are not among them and are not exempt from them either: they come
**after** the work is done, they never gate a build step, and the user declining
one changes nothing about what was built. Do not add them to the list the user is
shown, and do not treat them as violating it.

**(d) One line: if they would rather confirm each step, they say so now.** That
opt-in is the whole of what the old mode menu offered; it is now one sentence
inside this screen.

**(e) One plain line on who implements it** — a delegated worker with your review,
or you building it directly, resolved per Step 1b below. The user can change it
in the same answer.

**(f) One plain line restating the delivery path** — straight through the SAP
tools, or an abapGit ZIP they import themselves (Step 1c below).

### Step 1b — Ownership Resolution (deterministic — no separate prompt)

`execution_mode` records whether the user opted into step-by-step confirmation at
Step 1 (d). `execution_owner` is the separate
question of **who implements Phase 4** ([development-loop.md](../policies/development-loop.md)).
Resolve it deterministically before displaying the Step 1 briefing — there is no standalone
ownership question:

1. An owner the user stated for this run (or a standing session instruction) →
   `selection_source: explicit`.
2. Otherwise the default: **`delegated` when the current adapter can invoke a named
   worker without user action** (Claude adapter: the bundled `sapkit:sap-worker`
   subagent); **`main` when launching a worker needs manual user action** (Codex /
   Antigravity: a fresh session) or no worker mechanism exists →
   `selection_source: default`. The test is capability — can this session actually
   call a worker right now — not whether a worker file exists on disk.

The resolved value is surfaced as Step 1's line (e), so the
user can override it in the same reply; an override is recorded as `explicit`.
**Never dispatch a worker or start Phase 4 before the briefing has been shown, and —
where it carries the permission question — before the user has answered it.** Never drop an explicit `delegated` silently — if the environment
cannot launch a worker, say so and wait for direction ([development-loop.md](../policies/development-loop.md)
"Harness-neutral fallback"). How a worker is launched is adapter-specific: the
"구현 위임" section of [adapters/claude/README.md](../../adapters/claude/README.md),
[adapters/codex/README.md](../../adapters/codex/README.md), or
[adapters/antigravity/README.md](../../adapters/antigravity/README.md) owns the exact
invocation.

### Step 1c — Delivery Path (restate and persist — never re-asked here)

`execution_mode` records the step-by-step opt-in; `execution_owner` sets who implements
Phase 4. The **delivery path** is a third, orthogonal axis: which route the finished code
takes into SAP. It was already decided by the user at **Phase 1B dimension 8**, so Phase 3.5
confirms and persists it — it does not re-ask it.

Read the dimension 8 answer out of `interview.md` and restate it as Step 1's line (f), in
plain words and with no field names — that the finished code goes straight into SAP through
the tools, or that it comes as an abapGit ZIP the user imports themselves and nothing here
connects to SAP. The user sees which route Phase 4 is about to take while the briefing is
still in front of them. A user who changes their mind in that reply changes the dimension 8
answer: update `interview.md` accordingly before persisting.

### Step 2 — Persist Selection

Write the outcome to `.sapkit/program/{PROG}/state.json` under `execution_mode` — `auto` unless the user took the step-by-step opt-in at Step 1 (d), in which case `manual` (or `hybrid` where they asked to confirm only from the checks onward). Record the permission answer's effect too where it changed `.claude/settings.local.json`. Also record the resolved `execution_owner` and its `selection_source` (`explicit` | `default`) alongside it; when a launch fallback later diverges from the resolved value, record `effective_owner` too. Write the confirmed delivery path as `delivery_path` — `"mcp"` or `"abapgit"` — in the same object; every branch from Phase 4 onward reads it from there, not from `interview.md`. Also log phase timestamps here (see the state.json schema below).

### Step 3 — What each recorded value means

| `execution_mode` | Phase 4 | Phase 5 | Phase 6 | Phase 7 | Phase 8 |
|------|---------|---------|---------|---------|---------|
| `auto` (default) | run | run | run | run on fail | run |
| `manual` | confirm before | confirm before | confirm before | confirm before | confirm before |
| `hybrid` | run | confirm before | confirm before | confirm before | confirm before |

`auto` is what the run takes when the user does not opt in at Step 1 (d). The stop
list in Step 1 (c) applies in every row — it is not what this table governs. What
the user sees in `manual` / `hybrid` is ONLY the step-to-step confirmation.

### Step 4 — The step-by-step confirmation, where the user opted into it

Where `execution_mode` is `manual` or `hybrid`, say this between steps in the
user's language, in plain words — one short message, no phase numbers, no field
names:

- **what just finished**, in one line of effect (*"the seven includes and the main
  program are created, syntax is clean, and everything is active"*);
- **what comes next**, in one line;
- and the three answers available: go on · skip this one, where it is a step that
  can legitimately be skipped (the test run when nothing is in scope for it, the
  troubleshooting step when nothing failed) · stop here and save, to pick up later.

A step that cannot be skipped re-asks rather than accepting "skip". On "stop here
and save", record the current phase in `state.json` and exit; the next run resumes
from it.

### Enforcement Contract

- Phase 4 MUST refuse to run if `state.json.phases.3_5_mode_gate.status != "completed"`. The key name `3_5_mode_gate` is kept for resume compatibility with runs recorded under the old name.
- **That key is recorded `completed` at the approval moment** — when the user approves the design document — **not when the briefing is answered.** The briefing carries a question only on Claude Code; on Codex and Antigravity (a) is a notice and the screen holds nothing to answer, so a gate keyed to an answer would never complete and would stall those runs for good. Keying it to the approval keeps one rule for all three hosts.
- Showing the briefing is still mandatory on every host, and where it *does* carry the permission question, **wait for that answer before dispatching a worker or writing to SAP**. That wait is a step of this phase; it is not the gate Phase 4 tests.
- If `execution_mode` is `auto` and a step transition happens, do NOT prompt — a prompt is a bug.
- If `execution_mode` is `manual` / `hybrid`, do NOT run ahead — missing the confirmation is a bug.

## Phase 4 — Implementation

Adopt the [sap-executor](../personas/sap-executor.md) persona for this step.

Implementation runs under the `execution_owner` resolved at Phase 3.5 (`main` | `delegated` — [development-loop.md](../policies/development-loop.md)). **When the resolved owner is `delegated`, dispatching the worker is mandatory — the coordinating conversation must not implement the slice itself.** Launch is adapter-specific: on the Claude adapter delegate to the bundled `sapkit:sap-worker` subagent; on Codex / Antigravity hand the worker contract to a fresh session (the adapter README's "구현 위임" section owns the exact invocation). If the launch fails or no worker mechanism exists: with `selection_source: default`, continue as `main`, say so, and record `effective_owner: "main"` in `state.json`; with `selection_source: explicit`, never fall back silently — stop, explain the limitation, and wait for direction. After a worker has started, an owner change is not a rollback: stop the worker, preserve and report what was actually applied (including `PROVISIONAL_WRITE` state), and continue only on the user's direction. A delegated worker receives the approved spec, its task slice, and the relevant rules and paths — never secrets. Control artifacts (`approval.json`, `state.json`, `verification.json`, **`verification-offline.json`**, `review-request.json`, `review-result.json`) remain main-only, and the worker never serves as its own reviewer. P2 data reads stay main-only (including any non-MCP route from a worker shell — a local CLI, a script, a direct query), and P4 transport lifecycle actions are never delegated — the worker only references the transport id its contract names.

**Delivery-path branch (read `state.json.delivery_path` before anything else in this phase):**

- **`"abapgit"` → delegate the implementation to [develop-abapgit](./develop-abapgit.md)** and
  do not run the MCP flow below. That procedure owns the whole of it — seeding the mirror from
  the user's full package export, the mirror discipline, the offline checks, and the
  whole-package ZIP build — and this procedure does not restate any of it. Enter it as its
  **Entry A**, which inherits these `.sapkit/program/{PROG}/` artifacts unchanged. Two things
  carry into that branch and are worth naming because they are easy to drop when the work moves
  to another document: the `execution_owner` resolved at Phase 3.5 **still applies** (a
  delegated worker can do the mirror and ZIP work under the same contract — control artifacts
  stay main-only, and the worker is never its own reviewer), and **the approved spec is still
  the contract** (`approval.json.spec_sha256` binds Phase 6 exactly as it does on the MCP path).
  The verification record for this branch is
  `.sapkit/program/{PROG}/verification-offline.json` per
  [schemas/verification-offline.schema.json](./schemas/verification-offline.schema.json), not
  `verification.json` — see Phase 6 step 1.
- **`"mcp"` → run the flow below.** It is the MCP path in full and its meaning is unchanged;
  it simply now runs under a stated condition rather than as the only possibility.

Flow when `delivery_path == "mcp"` (source-first, single syntax check on the main program, batch activation):
1. Generate ALL include sources locally first, from the approved spec + the mandatory main-program template — [zsapkit_oop_ex.prog.abap](../knowledge/abap/templates/oop-sample/zsapkit_oop_ex.prog.abap) (OOP) or [main-program.abap](../knowledge/abap/templates/procedural-sample/main-program.abap) (Procedural) — as the starting skeleton. When testing scope is set (either paradigm — in Procedural the tests target `LCL_HELPER`), the `{PROG}_tst` test-class include is part of this initial batch. Run the bundled checker's 13-rule offline analysis on these sources before step 2 (`node "<plugin root>/checker/sapkit-checker.bundle.cjs" analyze <file> --format json`) — an optional local check that needs no install; on the Claude adapter the `offline-code-analysis` hook runs it automatically after each source write ([troubleshooting §7](troubleshooting.md#7-sapkit-checker--local-offline-analysis-bundled)).
2. Create the includes via `CreateInclude` + `UpdateInclude`, then the main program via `CreateProgram` + `UpdateProgram`.
3. Run a single `CheckSyntax` on the MAIN program (not per include). Syntax failures → fix-and-retry loop, max 3 iterations on the main program.
4. Activate, then verify via `GetInactiveObjects` — the program's object set must return 0 inactive entries.
   - **FUGR activation recipe** — activating the FMs alone fails with `FUNCTION ... cannot be used ... FUNCTION-POOL`. A function group activates as ONE run containing: the main program (`SAPL<fugr>`), the TOP include (`L<fugr>TOP`), every FM (each with its parent FUGR reference), and the FUGR itself. If activation fails, also check sibling FMs in the same group — the group is one compile unit (see [`../knowledge/abap/conventions/function-module-rule.md`](../knowledge/abap/conventions/function-module-rule.md) § Function Group Is One Compile and Activation Unit). Never batch-activate unrelated objects in the same run (activation-set contamination) — select only the object family being worked.
5. Screens (`CreateScreen` + `UpdateScreen`), GUI statuses (`CreateGuiStatus` + `UpdateGuiStatus`), and text elements (`CreateTextElement` + `UpdateTextElement`) run AFTER main activation.
   - **Utility-FM availability rule**: these three families dispatch through the server-side `ZSAPKIT_ADT_DISPATCH` / `ZSAPKIT_ADT_TEXTPOOL` FMs. When those FMs are absent on the target system OR the RFC backend is not configured, treat every Screen / GUI Status / Text Element step as **SKIPPED** (an environment gap, not a failure), continue with the remaining steps, and record the outage for Phase 6 step 3. Remediation: [install-sap-assets](install-sap-assets.md).
6. **ECC DDIC fallback**: if the plan includes new Table / Data Element / Domain objects and the platform is ECC, do NOT call `CreateTable` / `CreateDataElement` / `CreateDomain` — follow the ECC DDIC Fallback Gate above, and wait for the user's SE11 activation confirmation before activating dependent code.

Apply the conventions note above (Shared Conventions) throughout, plus [oop-pattern.md](../knowledge/abap/conventions/oop-pattern.md) (OOP) and [alv-rules.md](../knowledge/abap/conventions/alv-rules.md) (when the plan includes ALV output).

On completion, record the `check_syntax` and `activate` step results (status + evidence) into `.sapkit/program/{PROG}/verification.json` per [schemas/verification.schema.json](./schemas/verification.schema.json).

On the `abapgit` branch neither tool ran, so `verification.json` is **not written at all**. Record instead the `offline_analyze` and `include_check` results from the delegated run into `.sapkit/program/{PROG}/verification-offline.json` per [schemas/verification-offline.schema.json](./schemas/verification-offline.schema.json); `import_confirmed`, `readback`, `unit_test`, and `atc` stay open until Phase 7 / Phase 8 fill them.

**Design deviation — ask about the one thing, then continue.** Where something in
the approved document turns out not to be buildable as written, do not stop the run
and do not re-approve the document. Ask about **that one thing only**, in plain
words: what cannot be done as approved, what you propose instead, and what it costs.
Record the user's answer in `environment_context.approved_deviations[]` of
`review-request.json` (who / when / why — the same field Phase 6 already reads so the
reviewer does not re-flag it), and **carry on**.

**The exception**: a deviation that changes the **object list** or the **transport**
goes back through the design document — revise it, re-display it in full, and take
approval again. That edit changes the hash, so the earlier approval is void anyway,
and a user who approved seven objects on one transport has not approved eight on
another.

Only where the user opted into step-by-step confirmation (Phase 3.5 Step 1 (d)):
confirm before starting this phase; do NOT interrupt mid-flow once started.

**Close this phase with a one-line progress report** — stated, not asked. What was
built and what state it is in, in effects (*"7 includes and the main program created ·
syntax clean · activated"*). No question follows it.

## Phase 5 — Self-QA (conditional)

Adopt the [sap-qa-tester](../personas/sap-qa-tester.md) persona for this step.

**Skip conditions (any one triggers skip, recorded as `skipped` in state.json)**:
- `interview.md` dimension 7 (testing scope) = `none` / empty — under either paradigm. Procedural is **not** a skip reason by itself: where testing scope is set, the testable logic sits in `LCL_HELPER` and `{PROG}_tst` tests that.
- `state.json.delivery_path == "abapgit"` — **automatically SKIPPED**, whatever the paradigm and testing scope say. `RunUnitTest` needs a live ADT connection and this branch has none, so there is nothing to run. Record the reason in that form: it is an environment fact, not a judgment that the code did not need testing, and a reader must not take the skip as evidence about the code. Note that the test-class include itself is still authored into the mirror when dimension 7 asked for one — it ships in the ZIP and the user can run it after import; what is absent is any run of it here.

**When running**:
- The test class include (`{PROG}_tst`) should already be there from Phase 4 — this phase only writes test methods and runs them.
- **Where the approved document carries acceptance-criteria examples, those examples are the minimum set of test methods** — under either paradigm. One example, one test method — that is the floor, not the ceiling; add whatever else the code needs. An acceptance example with no test method behind it is a gap in this phase, because the example is the one check the user wrote themselves.
  - **An example no test method can hold is documented instead** — screen flow, a database read, anything that is not pure computation (in Procedural code, whatever stays in the FORMs rather than in `LCL_HELPER`). Carry it into the program's header comment block and into the completion report, in the same "given this input, this result" shape. Documented, not silently dropped.
- Call `RunUnitTest` → `GetUnitTestResult`. The test classes live in `{PROG}_tst`, which belongs to the program, not to a class — so the container is the main program: `tests: [{container_class: "{PROG}", test_class: "<the LTCL_… class>"}]` **with `container_type: "program"`**. Without it the run is addressed to a class of that name; engine 1.5.1+ refuses that run as "selected no test class" and names the fix, older bundles answered `success: true` over an empty result. Either way nothing ran — never record it as PASS.
- On FAIL: fix production code (not tests) → re-activate → re-run (loop until green or 3 attempts)
- Only where the user opted into step-by-step confirmation: confirm before starting this phase (unless a skip condition matched, then skip with a one-line statement).
- **Close this phase with a one-line progress report** — stated, not asked (*"6 tests run · all green"*, or *"no tests in scope — skipped, and why"*).

**Verification record** (`mcp` branch only — on the `abapgit` branch there is no `verification.json` to update; the Phase 5 skip is recorded in `state.json` alone. `verification-offline.json` does carry its own `unit_test`/`atc` steps, but those are filled at **Phase 8, after the user's import**, in the same MCP-available moment as `readback` — never here, where the objects do not yet exist on SAP — per D-144) — update `.sapkit/program/{PROG}/verification.json` per [schemas/verification.schema.json](./schemas/verification.schema.json):
- `unit_test`: PASS/FAIL with the test result summary as evidence; `SKIPPED` when Phase 5 was skipped
- `atc`: run `GetAtcFindings` on the created objects if the backend supports it and record the outcome; otherwise record `SKIPPED` with the reason

## Phase 6 — Review Gate

> Phase 4 is NOT complete until Phase 6 has run. Phase 5 (QA) is conditional on testing scope, Phase 7 (Debug) is conditional on failures, but **Phase 6 is unconditional**.

A successful activation only proves the code compiles and links — it does NOT prove the code follows the shared conventions. Phase 6 is what closes that gap.

Steps:
1. Verify `verification.json` is complete (all four steps recorded) AND check the gate
   matrix: `check_syntax = PASS AND activate = PASS`. Per
   [schemas/verification.schema.json](./schemas/verification.schema.json) these two
   steps can only be `PASS` or `FAIL` — `SKIPPED` is not a legal value for them. If
   either is `FAIL`, missing, or otherwise not `PASS`, do NOT proceed with the rest of
   Phase 6: record `state.json` phase `6_review` as `blocked`, state which step failed,
   and report to the user. A backend outage that prevents `CheckSyntax`/`ActivateObjects`
   from completing is a block, not a completion — `environment_context` (step 3 below)
   exists so the reviewer can judge `unit_test`/`atc` gaps fairly; it never exempts
   `check_syntax`/`activate`.
   - **On the `abapgit` branch this gate is substituted, not waived.** Neither
     `check_syntax` nor `activate` can ever be produced there — no connection was opened, so
     the tools never ran — and `verification.schema.json` rightly refuses `SKIPPED` on both,
     which would leave the branch blocked at the entrance to Phase 6. So `verification.json`
     is **not written at all** on this branch: a half-filled one carrying invented or omitted
     machine steps is the exact false machine PASS the closed schema exists to prevent.
     Verify instead that `.sapkit/program/{PROG}/verification-offline.json` is complete (all
     four steps recorded) per
     [schemas/verification-offline.schema.json](./schemas/verification-offline.schema.json),
     and check that record's own gate matrix: `offline_analyze = PASS AND include_check ∈
     {PASS, INCONCLUSIVE (with the unsettled lines named in evidence)}`. `import_confirmed`,
     `readback`, `unit_test`, and `atc` are not gated here — the review runs before the user
     has imported anything, and they are read at Phase 8. If `offline_analyze` is `FAIL`, missing, or
     `include_check` is `FAIL`, record `state.json` phase `6_review` as `blocked` exactly as
     above. This is a substitution of one record for another, not an exemption from having
     one: a branch with no verification record does not enter Phase 6.
2. Re-compute the SHA-256 of `spec.md` and confirm it still matches `approval.json.spec_sha256`. On mismatch, STOP — the spec changed after approval; return to the Spec Approval Gate.
3. Write `.sapkit/program/{PROG}/review-request.json` conforming to [schemas/review-request.schema.json](./schemas/review-request.schema.json) — `spec_sha256`, `sid`, `client`, `transport`, and the `objects[]` list created in Phase 4 (with types: PROG/P, PROG/I, DYNP, CUAD, …).
   - If any backend service/tool was down during Phase 4/5 (e.g. an ADT endpoint returning 404/500, causing a verification step to be recorded `SKIPPED` in `verification.json`), attach it under `environment_context.known_outages[]` so the reviewer does not miscount the gap as a code defect.
   - The same applies when Screen / GUI Status / Text Element steps were SKIPPED in Phase 4 because the `ZSAPKIT_ADT_DISPATCH`/`ZSAPKIT_ADT_TEXTPOOL` FMs are absent or the RFC backend is not configured: record one `known_outages[]` entry with `component` (e.g. `"ZSAPKIT_ADT_DISPATCH/TEXTPOOL FMs not installed — RFC dispatch unavailable"`), `affected_step` (which Phase 4 step was skipped and how), and `observed_at`. Remediation: [install-sap-assets](install-sap-assets.md).
   - If the user approved a deviation from `spec.md` during this run, attach it under `environment_context.approved_deviations[]` with who/when/why it was approved, so the reviewer does not re-flag it as a violation.
   - **On the `abapgit` branch, say where the sources are.** No object exists on SAP yet, so
     the reviewer cannot fetch source through the read tools; the review subject is the local
     abapGit mirror. Carry that in `environment_context.notes` — free text the closed schema
     already allows, so nothing about
     [schemas/review-request.schema.json](./schemas/review-request.schema.json) changes — and
     make it say both halves plainly: the mirror path
     (`.sapkit/abapgit/<SID>/<PACKAGE>/`) and that the reviewer reads those files **instead
     of** SAP, because the objects have not been imported. E.g. *"Offline delivery
     (`delivery_path: abapgit`): nothing is on SAP yet. Review the sources in the local
     abapGit mirror at `.sapkit/abapgit/<SID>/<PACKAGE>/` — the read tools (`GetProgram`,
     `GetInclude`, …) do not apply on this run."* `sid` / `client` / `transport` are still
     filled from `approval.json`, where on this branch they are the user's declaration and a
     user-owned transport marker rather than a live session's values.
   - `environment_context` is optional — omit it entirely when there is no outage or approved
     deviation to report. **One exception: on the `abapgit` branch `notes` is mandatory**,
     outage or not. It is the only carrier the reviewer has for the mirror path, and a review
     request that omits it sends the reviewer to fetch objects that do not exist.
4. Run [review-checklist](./review-checklist.md) **in a fresh reviewer context — never in this conversation**: on the Claude adapter delegate to the bundled `sapkit:sap-reviewer` subagent; on Codex / Antigravity use a new session (the adapter README owns the invocation). The main context performing the checklist itself does not satisfy this gate — it is not a fresh reviewer context, whoever implemented Phase 4. The reviewer judges read-only; fixes are applied by the implementation owner (main, or the delegated worker), then re-reviewed. Pass the reviewer the path to `review-request.json` and the [review-checklist](./review-checklist.md) itself.
5. The reviewer runs read-only — on the Claude adapter this is mechanical (its
   `disallowedTools` blocks Write/Edit/Bash and every SAP mutation call); on other
   adapters it is role + adapter config (see review-checklist.md's adapter-defense
   note). It returns its verdict as review-result JSON, conforming to
   [schemas/review-result.schema.json](./schemas/review-result.schema.json), in its final
   response. **The main context** (back in this context) validates that JSON against the schema
   and, on success, writes it to `.sapkit/program/{PROG}/review-result.json`. On
   schema-validation failure, treat the run as blocked — do not fabricate a passing result —
   and re-run the reviewer in a fresh context.
6. Handle the verdict (as the main context, back in this context):
   - **PASS with no findings** → proceed to Phase 8.
   - **PASS with MINOR findings** → fix each MINOR finding via `Update*` calls (routed
     through the resolved execution_owner when delegated), then re-run
     the full machine-verification chain from step 1 (`CheckSyntax` → `ActivateObjects` /
     `GetInactiveObjects` → `RunUnitTest` when in scope → `GetAtcFindings` when available)
     per [verification-policy.md](../policies/verification-policy.md)'s re-run rule ("a fix
     is a new change and invalidates earlier evidence"), updating `verification.json`. No
     full re-review is required for MINOR-only fixes. Proceed to Phase 8 once the refreshed
     `verification.json` satisfies the Phase 8 gate matrix.
   - **FAIL (one or more MAJOR findings)** → fix the findings via `Update*` calls (routed
     through the resolved execution_owner when delegated), then
     re-run the full machine-verification chain from step 1 (same order as above) per
     [verification-policy.md](../policies/verification-policy.md)'s re-run rule, updating
     `verification.json`. Refresh `review-request.json` and re-run the review in ANOTHER
     fresh context. Loop until PASS or 3 review iterations are exhausted.
   - After 3 iterations with residual MAJOR findings: STOP, mark `state.json` phase `6_review` as `blocked`, surface the specific violation list to the user. Phase 8 is blocked.

Only where the user opted into step-by-step confirmation: confirm before starting this phase; the review run itself is uninterrupted once started.

**Close this phase with a one-line progress report** — stated, not asked (*"independent review done · passed with two minor points, both fixed"*).

## Phase 7 — Debug Escalation (conditional)

Adopt the [sap-debugger](../personas/sap-debugger.md) persona for this step. Triggers:
- An activation failure that survives the Phase 4 retry loop
- A runtime dump during test execution

**On the `abapgit` branch the trigger is different: the user reports back that the import
failed.** The handling is owned by [develop-abapgit](./develop-abapgit.md) (its Step 7) and
is not restated here — go there for the round-trip bound and the repair procedure. Three
points belong to this phase and must not be got wrong in passing:

- **A reported failure means the server is in an unknown state.** Partial application is
  entirely possible, so the import is not "did not happen".
- Record it as **`PROVISIONAL_WRITE` with an unknown-state note** in
  `verification-offline.json` (`import_confirmed: USER_REPORTED_FAILURE`, with the reported
  errors as evidence). It **never regresses to `DRAFT`** — `DRAFT` would claim SAP is
  untouched, which is precisely what is no longer known.
- The repair goes back out as a **whole-package re-ZIP**, never a patch ZIP of "just the
  fix": an offline abapGit import reads the ZIP as the complete remote state, so a partial
  one turns every omitted object into a delete candidate.

A verified root cause likely to recur may be proposed for capture via the [lesson](./lesson.md) procedure — user approval required; never auto-promote.

Only where the user opted into step-by-step confirmation: confirm before starting this phase. **Close it with a one-line progress report** — stated, not asked (*"cause found and fixed · re-activated · clean"*).

## Phase 8 — Completion Report

Adopt the [sap-writer](../personas/sap-writer.md) persona for this step.

After completion, a verified root cause likely to recur may be proposed for capture via the [lesson](./lesson.md) procedure — user approval required; never auto-promote.

**Pre-condition (HARD GATE)**: ALL of the following must hold. If any is unmet, return to Phase 6 — do not write the report and do not tell the user the program is done:
- `.sapkit/program/{PROG}/review-result.json` exists with `verdict: "PASS"` and its `reviewed_spec_sha256` equals `approval.json.spec_sha256`.
- `.sapkit/program/{PROG}/verification.json` satisfies the gate matrix: `check_syntax = PASS AND activate = PASS AND unit_test ∈ {PASS, SKIPPED (with a reason recorded in evidence)} AND atc ∈ {PASS, SKIPPED (with a reason recorded in evidence)}`. Per [schemas/verification.schema.json](./schemas/verification.schema.json), `check_syntax`/`activate` cannot legally be `SKIPPED` — anything other than `PASS` on either fails this gate.
  - **On the `abapgit` branch, substitute the offline record's matrix** (the review-result requirement above is unchanged): `.sapkit/program/{PROG}/verification-offline.json` per [schemas/verification-offline.schema.json](./schemas/verification-offline.schema.json) satisfies `offline_analyze = PASS AND include_check ∈ {PASS, INCONCLUSIVE (with the unsettled lines named in evidence)}`. `import_confirmed`, `readback`, `unit_test`, and `atc` are not pass/fail conditions of this gate — they select which completion state is reportable, below.

**Run the machine check first — automatically, no approval needed.** Once the
independent review comes back `PASS`, call [verify-applied](verify-applied.md) over
`state.json.objects_created` without asking. It is read-only (source read-back,
active-state lookup, `CheckSyntax` — no write, no row data), and the user already
confirmed this exact object set when they approved the design document: that
confirmation **is** the confirmation that procedure's step ① asks for, so do not ask
again. Say which objects you are checking and on whose confirmation, then run it.

- **Clean read-back + review `R-PASS`** → report **COMPLETE**.
- **The comparison diverges** → **stop there.** Do not report COMPLETE, and do not
  quietly re-write the objects. Say plainly what diverged — which object, what was
  sent, what SAP holds — and let the user direct the repair.
- **No intended-source text to compare against, or no read available on that
  system** → the run stops at `PROVISIONAL_WRITE` and the report says so, with the
  reason. Over-reporting here is the failure this whole phase exists to prevent.

Report the outcome the way the [plain-language policy](../policies/plain-language.md)
sets — in the user's language, plain words, the status word led by its plain-language
name and glossed on first use.

**Completion state (report exactly one, per the Track A state model — see the
"Track A Policy Alignment" section above):**

- **DRAFT** — no SAP write happened (Direct ended at spec approval, the run was
  aborted before Phase 4, or — on the `abapgit` branch — the ZIP was handed over and
  the user has not imported it yet: `import_confirmed: NOT_YET`). The report says a
  draft/spec exists — not that a program was built.
- **PROVISIONAL_WRITE** — objects were created/activated on DEV and the HARD GATE
  above holds, but what SAP actually holds has not been read back and confirmed —
  because the check could not run, because there was no intended-source text to
  compare against, or because the comparison diverged. The report
  must NOT say "완료 / done"; it states the objects are provisional pending that
  confirmation, and names which of those three it was.
- **COMPLETE** — the HARD GATE holds AND the machine check in
  [verify-applied](verify-applied.md), run automatically over `objects_created`
  once the review passed, came back clean on the same objects: the
  source read back out of SAP matches what was intended, it compiles, and nothing
  is left inactive. Only then may the report state the program is complete, and
  only together with the exact-subject review `R-PASS` (verdict `PASS` bound to
  `approval.json.spec_sha256`). Both halves, every time — neither one alone is
  completion. When quoting that check, carry its limits with it:
  it establishes that the intended source is present, compiles, and is active —
  not that the logic is correct, and it does not replace the `verification.json`
  activation record.

An MCP success response, an ACTIVE flag, or a single `CheckSyntax` result alone
never upgrades the state past PROVISIONAL_WRITE.

**On the `abapgit` branch, `verification-offline.json` selects the state:**

- **`import_confirmed: NOT_YET` → `DRAFT`.** The ZIP is the deliverable, and a run may
  legitimately close with it handed over and not yet imported. Say that in those terms — this
  is a finished piece of work waiting on the user, not an incomplete run, and reporting it as
  a failure misdescribes it as badly as calling it done would.
- **`import_confirmed: USER_AFFIRMED` → `PROVISIONAL_WRITE`.** An affirmation on record, not
  a machine PASS: the claim comes from the side that did the writing, and it is not upgraded
  because a person said it rather than a tool.
- **`import_confirmed: USER_REPORTED_FAILURE` → `PROVISIONAL_WRITE`, with the unknown-state
  note** (Phase 7). Never `DRAFT`.
- **`COMPLETE` only when `readback: PASS` AND `unit_test` ∈ {PASS, SKIPPED (with a reason
  recorded in evidence)} AND `atc` ∈ {PASS, SKIPPED (with a reason recorded in evidence)}** —
  the machine confirmation of [verify-applied](./verify-applied.md) plus the same test/ATC
  standard the `mcp` branch's matrix above requires (D-144) — **and** the exact-subject
  `R-PASS`. This branch is otherwise unchanged: the same check is called the same way, just
  at a different moment — after the user reports their import rather than after Phase 4 —
  and it is still read-only and still needs no separate approval.
  The MCP availability that makes `readback` reachable makes `RunUnitTest` and
  `GetAtcFindings` reachable too, so in the same post-import moment run them and record both
  steps into `verification-offline.json`: `RunUnitTest` where a test class is in scope
  (container = the program, `container_type: "program"` — Phase 5; a P3 execution — DEV-only
  holds exactly as on the `mcp` branch), `GetAtcFindings` where
  the backend supports it; `SKIPPED` with the reason otherwise (testing scope none, ATC
  unsupported, or the user declining execution on that system). Where no MCP
  read is available on that system, `readback` is `UNAVAILABLE`, the run **stops at
  `PROVISIONAL_WRITE`**, and the report records that there is no path to `COMPLETE` there.
  Saying otherwise is over-reporting.

Report inputs (taken from local state, with no re-fetching):
- Objects created + activation status
- Transport number
- Test results summary (Phase 5, where it ran) and `verification.json` step results
- Review verdict + findings summary (from `review-result.json`)
- Timing summary — the per-phase `ts` fields out of `state.json`, so the report can render a total-duration table
- The user's conversation language (so the report localizes — Korean / English / Japanese / etc.)
- The HTML copy's path, where `{PROG}-spec.html` exists next to `spec.md` — the report mentions it

Output: `.sapkit/program/{PROG}/report.md`

Only where the user opted into step-by-step confirmation: confirm before writing the report.

**Close the run with a one-line progress report** — stated, not asked: what was built, what state it is in, and what is left for the user to do, in effects rather than in field names.

## Backend Tools Used

`SearchObject` (existence check) · `ListTransports` / `CreateTransport` (transport management) · `GetPackage` (package validation) · `CreateProgram` + `UpdateProgram` (main program) · `CreateInclude` + `UpdateInclude` (all includes) · `CreateScreen` + `UpdateScreen` (custom screens, ALV full mode) · `CreateGuiStatus` + `UpdateGuiStatus` (PF-Status) · `CreateTextElement` + `UpdateTextElement` (text-xxx resources) · `CheckSyntax` (pre-activation check) · `GetInactiveObjects` (post-activation verification) · `RunUnitTest` / `GetUnitTestResult` (QA) · `GetAtcFindings` (ATC, when available)

## State Files

- `.sapkit/program/{PROG}/platform.md` — Phase 0 preflight output
- `.sapkit/program/{PROG}/module-interview.md` — Phase 1A business interview (purpose / reason / company-specific rules / reference assets / standard-SAP alternatives)
- `.sapkit/program/{PROG}/interview.md` — Phase 1B technical interview (8-dimension Q&A log) **plus the dig-out section** under the `<!-- SAPKIT:DIG-OUT -->` marker ([interview-sweep](./interview-sweep.md) Step ④)
- `.sapkit/program/{PROG}/cbo-context.md` — CBO reuse candidates
- `.sapkit/program/{PROG}/customization-context.md` — Z*/Y* BAdI impl / CMOD / form-exit / append reuse candidates
- `.sapkit/program/{PROG}/consult-{module}.md` — Phase 2 consultant outputs (one per module)
- `.sapkit/program/{PROG}/plan.md` — Phase 2 output
- `.sapkit/program/{PROG}/spec.md` — Phase 3 output (requires human approval)
- `.sapkit/program/{PROG}/approval.json` — approval record bound to spec hash + system ([schema](./schemas/approval.schema.json))
- `.sapkit/program/{PROG}/{PROG}-spec.html` — optional HTML copy of `spec.md`, made only on request ([HTML copy of the design document](#html-copy-of-the-design-document-on-request)); never hashed, never a gate input
- `.sapkit/program/{PROG}/state.json` — execution_mode + delivery_path + per-phase status/timing (schema below, drives resume support)
- `.sapkit/program/{PROG}/verification.json` — check_syntax / activate / unit_test / atc step results ([schema](./schemas/verification.schema.json)) — the `mcp` delivery branch's record
- `.sapkit/program/{PROG}/verification-offline.json` — the `abapgit` delivery branch's record, written **instead of** `verification.json` (never alongside it): offline_analyze / include_check / import_confirmed / readback / unit_test / atc ([schema](./schemas/verification-offline.schema.json))
- `.sapkit/program/{PROG}/review-request.json` — Phase 6 reviewer input ([schema](./schemas/review-request.schema.json))
- `.sapkit/program/{PROG}/review-result.json` — Phase 6 reviewer verdict ([schema](./schemas/review-result.schema.json))
- `.sapkit/program/{PROG}/report.md` — final completion report

### state.json schema (resume support)

```json
{
  "prog": "ZFI_...",
  "execution_mode": "auto | manual | hybrid (default 'auto' — a resumed run with the key missing reads as 'auto')",
  "execution_owner": "main | delegated (resolved deterministically at Phase 3.5 Step 1b — 'auto' does not exist in this procedure)",
  "selection_source": "explicit | default",
  "delivery_path": "mcp | abapgit (confirmed and persisted at Phase 3.5 Step 1c from Phase 1B dimension 8; absent = 'mcp')",
  "effective_owner": "main | delegated (optional — recorded only when a launch fallback diverges from execution_owner)",
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

Two notes on that object:

- **`execution_mode` defaults to `auto`.** It is `manual` or `hybrid` only where the user took the step-by-step opt-in at Phase 3.5 Step 1 (d). A run whose `state.json` has no `execution_mode` at all reads as `auto` — do not re-ask for it.
- **`3_5_mode_gate` keeps its key name** even though the step it guards is now the go-ahead briefing. Renaming it would make every run recorded under the old name unresumable, and the key is internal — the user never sees it. It is recorded `completed` **at the approval moment**, not when the briefing is answered: the briefing carries no question on Codex or Antigravity, so keying it to an answer would leave those runs permanently short of the gate (Phase 3.5 Enforcement Contract).

## Resume Behavior

On a subsequent invocation for the same `{PROG}`:
1. Where `state.json` exists, skip the Phase 0–3.5 re-prompting; a missing `execution_mode` reads as `auto`. **Where `interview.md` carries no `<!-- SAPKIT:DIG-OUT -->` section** — a run from before the dig-out stage existed — the resume point decides what happens: **before approval**, run the dig-out now (planning has not happened, so nothing is invalidated by what it turns up); **after approval**, proceed without it and add one line to the completion report saying this run was designed without the dig-out stage. Going back to planning there would change the design document, void the approval, and cost the user a second approval on work already built.
2. If that `state.json` lacks `execution_owner` (a pre-0.5.3 run), resolve it once per Phase 3.5 Step 1b, announce the result in one line, and record it with its `selection_source` before continuing. A persisted owner is honored as-is — never re-derived on resume.
3. If that `state.json` lacks `delivery_path` — a run from before the delivery-path dimension existed — it is **read as `"mcp"`**, because that is the only path such a run could have taken. State that reading once in the resume line rather than leaving it inferred, and write the value in before continuing.
4. Find the first phase whose `status != "completed" && status != "skipped"` — resume from there.
5. Under `auto` state the resume point in one line and carry on — stated, not asked. Only where the user opted into step-by-step confirmation (`manual`/`hybrid`) is that line a question. Where item 1's dig-out rule applied, say which of its two branches was taken, in plain words.

Restarting a phase (re-running one already completed) requires the user to delete the corresponding `state.json` entry explicitly — the pipeline does not re-run a completed phase on its own.
