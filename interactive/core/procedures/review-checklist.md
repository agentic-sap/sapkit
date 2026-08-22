---
name: review-checklist
description: Phase 6 read-only convention review for create-program — 12 checklist items (§1 ALV … §12 Activation) with per-item verdict criteria and narrow per-item context kits. The reviewer judges only; fixes are applied by the implementation owner. Verdict is emitted as review-result.json.
source:
  - sc4sap-custom/skills/create-program/phase6-review.md
  - sc4sap-custom/skills/create-program/phase6-buckets.md
  - sc4sap-custom/skills/create-program/phase6-output-format.md
---

# Review Checklist — create-program Phase 6

You are the **reviewer**, running in a fresh context, separate from whoever built the program (the main context or its delegated worker). A successful activation only proves the code **compiles and links** — it does NOT prove the code follows the shared conventions. Your job is to pull the source of every created object and check it, line by line, against each convention that applies.

> **Past incident** — a spec said "build LVC_T_FCAT manually" → the executor faithfully wrote `APPEND ls_fc TO pt_fcat` once per column → activation succeeded → the alv-rules violation surfaced only when the user reviewed it by hand. This review would have caught it before the program ever reached the user.

## Reviewer Contract

- **Read-only by role.** You judge; you never fix. On the **Claude adapter** this is
  mechanically enforced: the [sap-reviewer](../../agents/sap-reviewer.md) agent
  definition's `disallowedTools` blocks Write, Edit, Bash, NotebookEdit, and every
  SAP mutation tool (Create*/Update*/Delete*, ActivateObjects, PatchGuiStatus,
  ReleaseTransport, WriteTextElementsBulk, RunUnitTest, the Runtime
  profiling/execution tools, ReloadProfile). That is an **adapter-specific**
  guarantee, not a universal one — the harness-neutral core does not by itself
  mechanically block a reviewer on every host (see the adapter-defense note below),
  so hold the read-only discipline regardless of host. Fixes are applied by the
  implementation owner after reading your result, then re-reviewed in another fresh context.
- **Reviewer Policy profile: P0/P1 only.** You may read metadata / source / ATC /
  health (P0 offline, P1 connected-read). You perform **no P2 row-data extraction,
  no P3 write/execute, and no P4 transport operation — including transport reads**
  (`ListTransports` / `GetTransport` / `ReleaseTransport` are all out of scope for
  the reviewer). You never mutate the repo or SAP.
- **Boundary state.** SAP-side reviewer isolation is not backed by a dedicated
  machine boundary; the recorded state is `sap_mutation_boundary=unverified`
  (D-025 O1). Your isolation rests on this contract plus fresh-context separation,
  not on a proven SAP-write block.

**Adapter-defense note (mechanical enforcement differs by host):**

| Adapter | Reviewer read-only enforcement |
|---|---|
| Claude | Mechanical — `agents/sap-reviewer.md` `disallowedTools` blocks Write/Edit/Bash + all SAP mutation tools |
| Codex | Role + adapter config (exposition / disabled tools); no core-level mutation block is asserted here |
| Antigravity | Role + adapter config; `excludeTools` enforcement unverified on the current version |
- **Input**: `.sapkit/program/{PROG}/review-request.json` (see [schemas/review-request.schema.json](./schemas/review-request.schema.json)) — spec hash, target system (`sid`/`client`), transport, and the `objects[]` list with types. Also read `spec.md` and `interview.md` (for the paradigm and testing-scope decisions) from the same directory. If the request carries `environment_context`, apply the rules under "Environment context" below before counting findings.
- **Output**: review-result JSON conforming to [schemas/review-result.schema.json](./schemas/review-result.schema.json), returned as your final response — you do not write `.sapkit/program/{PROG}/review-result.json` yourself (see "Output — review-result.json" below; the main context validates and records it). Set `reviewed_spec_sha256` to the `spec_sha256` you received in the request (verify it against the actual `spec.md` first — on mismatch, FAIL immediately with a single MAJOR finding "spec changed after approval").
- **Narrow context kit — do NOT bulk-load all conventions.** Each item below names the only convention file(s) to load while you check that item. Take them one item at a time; set the rest aside. Preloading all 12 kits burns context and blunts judgment.
- Pull object sources through the read tools only: `GetProgram`, `GetInclude`, `GetClass`, `GetInterface`, `GetScreen`, `GetGuiStatus`, `GetTextElement`, `ReadTextElementsBulk`, `GetFunctionModule`, `SearchObject`, `GetInactiveObjects`.
- Record one verdict per item: `PASS` / `FINDING(S)` / `N/A (reason)`. Absence of evidence counts as a fail, not a pass — see the false-positive patterns at the end.

### Finding severity

- **MINOR** — a real violation that does not block (e.g., a TEXT-Txx missing an optional tooltip). The implementation owner clears it after the review; no re-review is required for a MINOR-only fix.
- **MAJOR** — a violation that blocks completion (e.g., manual LVC_T_FCAT build, Docking replaced by Custom Control, ECC-deprecated pattern on S/4, parallel Z-impl created when a reuse target existed). The implementation owner must fix it and the program must go back through review.

### Verdict rule

- `FAIL` — one or more MAJOR findings (list them all, MINOR and MAJOR alike).
- `PASS` — zero MAJOR findings. MINOR findings may still appear on the list; the implementation owner clears them before the completion report.

### Environment context (from the request)

`review-request.json` may carry an optional `environment_context` (schema: known
backend outages + human-approved spec deviations — docs/reference/DECISIONS.md D-013).
Apply it before counting findings:

- **`known_outages[]`** — applies to `unit_test`/`atc` gaps and to the
  RFC-dispatched UI families (Screen / GUI Status / Text Element — steps that
  are `SKIPPED` when the `ZMCP_ADT_UTILS` FMs are absent or the RFC backend is
  unconfigured; see [install-sap-assets.md](./install-sap-assets.md)). A verification
  step recorded `SKIPPED` because of a listed outage is an environment gap, NOT
  a code defect. Do not raise a finding for the gap itself; record the affected
  checklist item as `N/A (environment outage: <component>)` and judge the code
  on the evidence that IS available. **`check_syntax`/`activate` failure or
  absence is never exempt this way**: per
  [schemas/verification.schema.json](./schemas/verification.schema.json) those
  two steps are `PASS`/`FAIL` only (`SKIPPED` is not a legal value for them), and
  a non-`PASS` result is a pipeline-blocking condition — [create-program.md](./create-program.md)
  Phase 6 step 1 keeps such runs from ever reaching review. A `known_outages[]`
  entry naming `check_syntax` or `activate` does not waive that gate.
- **`approved_deviations[]`** — a deviation listed here (with its who/when/why
  approval trail) is NOT a violation of `spec.md`'s literal text; do not
  re-flag it. A deviation you observe in the source that is NOT listed is
  judged normally.
- The context adjusts which *gaps* count as findings; it never lowers the bar
  for the code you can actually see.

## Index

| § | Item | Bucket | Context kit (load only when checking) | Applies to |
|---|------|--------|----------------------------------------|------------|
| 1 | ALV display rules + screen/GUI population | B1 — ALV + UI | [alv-rules.md](../knowledge/abap/conventions/alv-rules.md), [ok-code-pattern.md](../knowledge/abap/conventions/ok-code-pattern.md) | programs with ALV output / custom screens |
| 2 | Text element rule (I / S / R / H) | B1 — ALV + UI | [text-element-rule.md](../knowledge/abap/conventions/text-element-rule.md) | every user-visible literal |
| 3 | Constant rule | B2 — Logic Hygiene | [constant-rule.md](../knowledge/abap/conventions/constant-rule.md) | every program with logic |
| 4 | Procedural FORM naming | B3 — Structure + Naming | [procedural-form-naming.md](../knowledge/abap/conventions/procedural-form-naming.md) | Procedural mode only |
| 5 | OOP two-class pattern | B3 — Structure + Naming | [oop-pattern.md](../knowledge/abap/conventions/oop-pattern.md) | OOP mode only |
| 6 | Include structure | B3 — Structure + Naming | [include-structure.md](../knowledge/abap/conventions/include-structure.md) | every multi-include program |
| 7 | Naming conventions | B3 — Structure + Naming | [naming-conventions.md](../knowledge/abap/conventions/naming-conventions.md), [function-module-rule.md](../knowledge/abap/conventions/function-module-rule.md) | every created object |
| 8 | Clean ABAP (baseline + paradigm) | B2 — Logic Hygiene | [clean-code.md](../knowledge/abap/conventions/clean-code.md) + ONE of [clean-code-oop.md](../knowledge/abap/conventions/clean-code-oop.md) / [clean-code-procedural.md](../knowledge/abap/conventions/clean-code-procedural.md) | every program |
| 9 | ABAP release awareness | B4 — Platform + Config | [abap-release-reference.md](../knowledge/abap/conventions/abap-release-reference.md) | every program |
| 10 | SAP version awareness | B4 — Platform + Config | [sap-version-reference.md](../knowledge/abap/conventions/sap-version-reference.md) | every program |
| 11 | SPRO lookup consistency | B4 — Platform + Config | [spro-lookup.md](./spro-lookup.md) | programs depending on SPRO/IMG config |
| 12 | Activation state | B4 — Platform + Config | (none — tool evidence only) | every created object |

Buckets gather related items so a run can check them in coherent passes (B1 ALV+UI → B2 Logic → B3 Structure → B4 Platform); tag every finding with its bucket in `review-result.json`.

## §1 — ALV Display Rules + Screen/GUI Population

Context kit: [alv-rules.md](../knowledge/abap/conventions/alv-rules.md), [ok-code-pattern.md](../knowledge/abap/conventions/ok-code-pattern.md). Applies to: any program that displays a result set in ALV.

- [ ] **Display mode** agrees with the spec: `CL_GUI_ALV_GRID` for full screens (custom screen + GUI status + Docking Container), `CL_SALV_TABLE` for popups
- [ ] **Container** for a full ALV is `CL_GUI_DOCKING_CONTAINER` (NOT a custom container sitting in a Custom Control screen element)
- [ ] **Field Catalog Construction Standard (CRITICAL — most-often violated)**: the catalog MUST be pulled out of the SALV factory and converted with `cl_salv_controller_metadata=>get_lvc_fieldcatalog`. Inline construction by repeated `APPEND ls_fc TO pt_fcat` → VIOLATION (MAJOR). Per-field attribute adjustment (`coltext`, `outputlen`, `do_sum`, `no_out`, `hotspot`, `qfieldname`, `cfieldname`) goes through a `CASE FIELDNAME` block only.
- [ ] **Screen flow logic populated**: for each screen created, call `GetScreen(program, screen_number)` and confirm `flow_logic` holds at least one `MODULE ... OUTPUT.` line AND one `MODULE ... INPUT.` line that does NOT start with `*` or `"`. A screen carrying only `* MODULE STATUS_0100.` / `* MODULE USER_COMMAND_0100.` as its flow logic is a MAJOR finding — the executor ran `CreateScreen` but skipped `UpdateScreen(flow_logic)`.
- [ ] **GUI Status populated**: for each status created, call `GetGuiStatus(program, status_name)` and confirm it carries non-empty PFKEYS / menu / toolbar entries — not just a `STA` + `TIT` shell. An empty GUI status renders a blank toolbar at runtime (MAJOR).
- [ ] **OK_CODE binding 3-step contract** — per [ok-code-pattern.md](../knowledge/abap/conventions/ok-code-pattern.md): (a) the TOP include declares `DATA: gv_okcode TYPE sy-ucomm.`; (b) the screen's `fields_to_containers[]` OKCODE entry carries `NAME=GV_OKCODE`; (c) the PAI `user_command_xxxx` FORM reads `gv_okcode`, copies it to a local, runs `CLEAR gv_okcode`, then CASE on the local. `CASE sy-ucomm.` inside a user-command FORM, or an OKCODE field carrying no NAME, is MAJOR.

## §2 — Text Element Rule (I / S / R / H)

Context kit: [text-element-rule.md](../knowledge/abap/conventions/text-element-rule.md). Applies to: every screen, every dialog message, every literal the end user can see.

- [ ] No hardcoded display literals in screen layouts — every field label references `TEXT-Txx`
- [ ] No hardcoded literals in `MESSAGE` statements — write `MESSAGE TEXT-t01 TYPE 'E'`
- [ ] Translatable strings are not buried inside string templates carrying literal text only
- [ ] Text elements are created via `CreateTextElement` and still present after activation
- [ ] **All four types verified via `ReadTextElementsBulk(program, language)`** (blocks the "Create-without-full-types" regression):
  - `counts.R ≥ 1` (program title present)
  - `counts.I == count of TEXT-xxx literals in source` (read the program source and regex it for `TEXT-[A-Z0-9]{3}`)
  - **`counts.S == count of SELECT-OPTIONS + PARAMETERS declarations on the selection screen`** (the most common miss — at runtime the selection screen shows technical names like `S_BUDAT` / `P_FILE`)
  - `counts.H ≥ 1` only where the program uses classical WRITE lists (otherwise 0 is correct)
- [ ] Every text id exists in BOTH the primary logon language AND `'E'` (run the bulk read twice with a different `language=`; both must come back with the same key set)

## §3 — Constant Rule

Context kit: [constant-rule.md](../knowledge/abap/conventions/constant-rule.md). Applies to: every program with logic.

- [ ] No magic literals in business logic — function codes (`'SAVE'`, `'EXIT'`), status names, screen numbers used in branching, and threshold values must be `CONSTANTS` declared in the TOP include
- [ ] `gc_fcode_*` constants (or the equivalent prefix) stand everywhere the literal would otherwise appear
- [ ] System values such as `abap_true` / `abap_false` / `space` used in place of `'X'` / `''` / `' '`

## §4 — Procedural FORM Naming (Procedural mode only)

Context kit: [procedural-form-naming.md](../knowledge/abap/conventions/procedural-form-naming.md). Applies to: programs implemented with PERFORM (not OOP local classes). Verdict `N/A` when paradigm = OOP.

- [ ] Every FORM holding screen-bound logic ends in the screen-number suffix (`_0100`, `_0200`)
- [ ] FORMs shared across screens take no suffix (utility helpers)
- [ ] PBO/PAI module names keep to the `STATUS_xxxx` / `USER_COMMAND_xxxx` style

## §5 — OOP Two-Class Pattern (OOP mode only)

Context kit: [oop-pattern.md](../knowledge/abap/conventions/oop-pattern.md). Applies to: programs implemented with local classes. Verdict `N/A` when paradigm = Procedural.

- [ ] Both classes are present: `LCL_DATA` (BAPI/business logic) + `LCL_SCREEN` or `LCL_ALV` (presentation)
- [ ] No business logic in the screen class, no UI calls in the data class
- [ ] The public method surface stays minimal; helpers are PRIVATE

## §6 — Include Structure

Context kit: [include-structure.md](../knowledge/abap/conventions/include-structure.md) (+ [main-program.abap](../knowledge/abap/templates/procedural-sample/main-program.abap) for the inlined-Main check). Applies to: every multi-include program.

- [ ] The suffix convention holds: `t` / `s` / `c` / `a` / `o` / `i` / `e` / `f` / `_tst` per the table in include-structure.md
- [ ] Empty-by-design includes are NOT created; a conditional include (e.g., `s` for a no-parameter program) is simply left out, not stubbed
- [ ] The TOP include holds every global TYPES / DATA / CONSTANTS — no DATA declaration leaking into a PBO/PAI/FORM include
- [ ] **Main program contains `INCLUDE` statements for every planned include** (rejects "everything inlined into Main"): call `GetProgram(main)` and confirm the source carries one `INCLUDE {PROG}{SUFFIX}.` line per planned suffix. A Main program with all declarations / forms / modules inlined is a MAJOR violation of the main-program template — event blocks and headers mixed in with logic belong in their respective includes.
- [ ] **Procedural paradigm MUST NOT have a `{PROG}E` include**: `e` is the OOP ALV event-handler include only. Where `paradigm = Procedural` in `interview.md` AND `SearchObject({PROG}E)` returns a hit → MAJOR. Event blocks (`INITIALIZATION`, `AT SELECTION-SCREEN`, `START-OF-SELECTION`, `END-OF-SELECTION`) belong in the Main body per include-structure.md.

## §7 — Naming Conventions

Context kit: [naming-conventions.md](../knowledge/abap/conventions/naming-conventions.md), [function-module-rule.md](../knowledge/abap/conventions/function-module-rule.md). Applies to: every created object.

- [ ] A Z/Y prefix on every custom object
- [ ] The module prefix in program / table / class names wherever the convention prescribes one (e.g., `ZMM*` for MM, `ZSD*` for SD)
- [ ] Include names match `{PROG}_{SUFFIX}` exactly
- [ ] Function group / function module / data element / domain naming tracks the table in the convention
- [ ] Function Module source follows [function-module-rule.md](../knowledge/abap/conventions/function-module-rule.md) — inline `IMPORTING/EXPORTING/CHANGING/TABLES/EXCEPTIONS` in the `FUNCTION` statement. **Reject when `GetFunctionModule` returns the placeholder `" You can use the template 'functionModuleParameter' to add here the signature!`**, or when the spec calls for parameters but none are declared, or when the body leans on shadow locals (`lv_iv_xxx TYPE ...`) in place of real parameters.

## §8 — Clean ABAP (baseline + paradigm-specific)

Context kit — **paradigm gate first**: read `Paradigm` out of `interview.md`. `OOP` → load [clean-code.md](../knowledge/abap/conventions/clean-code.md) + [clean-code-oop.md](../knowledge/abap/conventions/clean-code-oop.md); `Procedural` → load [clean-code.md](../knowledge/abap/conventions/clean-code.md) + [clean-code-procedural.md](../knowledge/abap/conventions/clean-code-procedural.md). Loading both paradigm files, or loading the wrong one, invalidates this item's review.

Core (clean-code.md, both paradigms):
- [ ] No `SELECT *` — an explicit field list instead
- [ ] No `SELECT` inside `LOOP` — reach for `FOR ALL ENTRIES` or a join
- [ ] `SY-SUBRC` checked after every statement that sets it (SELECT SINGLE, READ TABLE, CALL FUNCTION with EXCEPTIONS)
- [ ] The internal table type fits the access pattern (HASHED / SORTED / STANDARD), with no DEFAULT KEY
- [ ] A secondary key is declared when the SELECT source is a transactional / large table AND downstream access runs on non-primary fields
- [ ] Large-table SELECTs are preceded by a `COUNT(*)` check + tuning plan when the count > 1M
- [ ] Backtick string literals for STRING values, `|...|` templates for assembly
- [ ] Boolean variables typed `ABAP_BOOL`, compared against `abap_true` / `abap_false`, set via `XSDBOOL( )`
- [ ] Conditions positive, `IS NOT` over `NOT IS`, no empty IF branches
- [ ] Explicit typed internal tables preferred over inline `INTO TABLE @DATA(...)` for SELECTs that feed further logic
- [ ] Inline declarations / modern syntax used where `ABAP_RELEASE` permits — never newer than the configured release
- [ ] No commented-out code, no debug statements (`BREAK-POINT`, `MESSAGE 'TEST'`)
- [ ] No ratio/percentage arithmetic assigned into narrow DEC/CURR fields (`COMPUTE_BCD_OVERFLOW` is runtime-only — static gates cannot catch it)
- [ ] Reconciliation/verification outputs do not treat absent values as 0 (empty lookup must not assert "difference = 0")

Paradigm = OOP (clean-code-oop.md):
- [ ] **Main program structure matches [zsapkit_oop_ex.prog.abap](../knowledge/abap/templates/oop-sample/zsapkit_oop_ex.prog.abap)** — REPORT statement, INCLUDE order, event block layout, two-class bootstrap (`go_data = NEW #( ).` / `go_alv = NEW #( ).`). Any structural deviation must be justified in `spec.md`; otherwise MAJOR finding.
- [ ] Classes `FINAL` unless designed for inheritance; members `PRIVATE` by default
- [ ] Methods do one thing, ≤ 30 lines, single abstraction level, ≤ 3 IMPORTING parameters
- [ ] Methods return one value (`RETURNING` over `EXPORTING`); no boolean input parameters
- [ ] `NEW #( ... )` over `CREATE OBJECT`; multiple static creation methods over optional constructor params
- [ ] Exceptions: class-based only; own project super class; wrap foreign `CX_SY_*`; `RAISE EXCEPTION NEW`
- [ ] Formatting: 120-char line limit, consistent alignment, one statement per line
- [ ] Tests: given-when-then naming, test publics only, inject doubles via constructor, `LOCAL FRIENDS` only for constructor access

Paradigm = Procedural (clean-code-procedural.md):
- [ ] **Main program structure matches [main-program.abap](../knowledge/abap/templates/procedural-sample/main-program.abap)** — REPORT statement, INCLUDE order (t/s/c/a/o/i/e/f/_tst), event block layout, PBO/PAI modules as one-line `PERFORM` delegators. Any structural deviation must be justified in `spec.md`; otherwise MAJOR finding.
- [ ] All globals declared in the TOP include only; no `DATA` in PBO/PAI/FORM/EVENT includes
- [ ] Global / local variables visually distinguishable (`g*` vs `l*` prefix); no local shadows a global
- [ ] FORM parameters typed (`USING p_a TYPE ...`); `USING` for inputs, `CHANGING` for in/out; no boolean `USING`
- [ ] Screen-bound FORMs end with the `_{screen_no}` suffix; utility FORMs have no suffix
- [ ] PBO/PAI module bodies are one line (`PERFORM f_...`); logic lives in FORMs, not in modules
- [ ] `sy-subrc` checked after every statement that sets it; `CALL FUNCTION` uses the `EXCEPTIONS` clause with `CASE sy-subrc`
- [ ] No `EXIT` / `STOP` / `LEAVE PROGRAM` used as error handling
- [ ] Each FORM has a one-line header comment describing inputs / outputs / global side effects
- [ ] Testing: if the spec requires tests, the testable logic is extracted to `LCL_HELPER` (not left inside FORMs)

## §9 — ABAP Release Awareness

Context kit: [abap-release-reference.md](../knowledge/abap/conventions/abap-release-reference.md).

- [ ] No syntax used that exceeds the configured `abapRelease` (e.g., no `RAP managed implementation` on a 740 system)

## §10 — SAP Version Awareness

Context kit: [sap-version-reference.md](../knowledge/abap/conventions/sap-version-reference.md).

- [ ] No S/4-only tables/APIs on ECC (`MATDOC`, `ACDOCA`, `BUT000` for BP)
- [ ] No ECC-deprecated patterns on S/4 (e.g., `LFA1`/`KNA1` directly when BP is the master record)

## §11 — SPRO Lookup Consistency

Context kit: [spro-lookup.md](./spro-lookup.md). Applies to: programs that depend on SPRO/IMG configuration. Verdict `N/A` otherwise.

- [ ] The customizing tables referenced in code match what the module consultant recommended in `.sapkit/program/{PROG}/consult-{module}.md`
- [ ] No hardcoded org-unit values that should come from customizing

## §12 — Activation State

Context kit: none — tool evidence only.

- [ ] `GetInactiveObjects` returns 0 entries from the program's object set
- [ ] Every object is assigned to the agreed transport request (from `review-request.json.transport`)

## False-Positive Patterns the Reviewer MUST Reject

Each pattern below has arrived as a "PASS" report that later turned out to be broken. Go looking for them — absence of evidence is a fail, not a pass.

- **Screen created but flow logic commented out** — `flow_logic` holds only `* MODULE STATUS_xxxx.` / `* MODULE USER_COMMAND_xxxx.` (leading `*`). Empty behavior at runtime.
- **GUI Status created but empty** — `definition.STA[*].CODE` is there, yet no PFKEYS array and no application toolbar codes. The toolbar renders blank.
- **Text pool partial** — `counts.I > 0` but `counts.S == 0` while the source declares `SELECT-OPTIONS` / `PARAMETERS`. The selection screen shows technical names.
- **Include created but not activated** — `GetInactiveObjects` still lists `{PROG}{SUFFIX}` entries after the main program was reported as activated. The main program runs, then throws `LOAD_PROGRAM_LOST` at a PERFORM call.
- **Procedural paradigm with a `{PROG}E` include** — event blocks moved out of the Main body; forbidden per include-structure.md.
- **Main program with no `INCLUDE` statements while the plan says N includes exist** — the executor inlined every declaration into Main; that breaks the main-program template and the include-structure convention.
- **OK_CODE binding broken** — any of: (a) the screen has an OKCODE field but no `NAME=GV_OKCODE`, (b) the TOP include is missing `DATA: gv_okcode TYPE sy-ucomm.` despite a screen being present, or (c) a PAI `user_command_xxxx` FORM does `CASE sy-ucomm.` instead of copying `gv_okcode` to a local. It runs on the main screen, then fails silently at the first popup or ALV toolbar event. See [ok-code-pattern.md](../knowledge/abap/conventions/ok-code-pattern.md).

## Output — review-result.json

You do not write this file — Write, Edit, and Bash are all blocked (see the Reviewer
Contract above). Return the review-result JSON, conforming to
[schemas/review-result.schema.json](./schemas/review-result.schema.json), as your final
response. Example:

```json
{
  "reviewed_spec_sha256": "3f8a…64-hex…c1",
  "verdict": "FAIL",
  "findings": [
    {
      "bucket": "B1",
      "severity": "MAJOR",
      "object": "ZMM_STOCK_RPTF01",
      "finding": "Field catalog built via repeated APPEND ls_fc TO pt_fcat instead of cl_salv_controller_metadata=>get_lvc_fieldcatalog (alv-rules.md §Field Catalog Construction Standard)"
    },
    {
      "bucket": "B2",
      "severity": "MINOR",
      "object": "ZMM_STOCK_RPTT01",
      "finding": "Constant gc_fcode_save declared but literal 'SAVE' still used at one CASE branch"
    }
  ]
}
```

**The main context** (not you) reads this JSON from your response, validates it against
[schemas/review-result.schema.json](./schemas/review-result.schema.json), and writes it to
`.sapkit/program/{PROG}/review-result.json`. On schema-validation failure the main context treats
the run as blocked rather than fabricating a passing result. The implementation owner also applies fixes
and, for MAJOR findings, requests a re-review in a new fresh context. Maximum 3 review
iterations; after that the pipeline is BLOCKED and the residual findings are surfaced to the
user.
