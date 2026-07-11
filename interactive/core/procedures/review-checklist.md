---
name: review-checklist
description: Phase 6 read-only convention review for create-program — 12 checklist items (§1 ALV … §12 Activation) with per-item verdict criteria and narrow per-item context kits. The reviewer judges only; fixes are applied by the worker. Verdict is emitted as review-result.json.
source:
  - sc4sap-custom/skills/create-program/phase6-review.md
  - sc4sap-custom/skills/create-program/phase6-buckets.md
  - sc4sap-custom/skills/create-program/phase6-output-format.md
---

# Review Checklist — create-program Phase 6

You are the **reviewer**, running in a fresh context, separate from the worker that built the program. A successful activation only proves the code **compiles and links** — it does NOT prove the code follows the shared conventions. Your job is to fetch every created object's source and verify, line by line, against each applicable convention.

> **Past incident** — a spec said "build LVC_T_FCAT manually" → the executor faithfully wrote `APPEND ls_fc TO pt_fcat` repeated per column → activation succeeded → the user found the alv-rules violation only after manual review. This review would have caught it before the user ever saw the program.

## Reviewer Contract

- **Read-only — mechanically enforced.** You judge; you never fix. The [sap-reviewer](../../agents/sap-reviewer.md) agent definition's `disallowedTools` blocks Write, Edit, Bash, NotebookEdit, and every SAP mutation tool (Create*/Update*/Delete*, ActivateObjects, PatchGuiStatus, ReleaseTransport, WriteTextElementsBulk, RunUnitTest, the Runtime profiling/execution tools, ReloadProfile) — the harness refuses the call, this is not a convention you have to remember. Fixes are applied by the worker after reading your result, then re-reviewed in another fresh context.
- **Input**: `.sc4sap/program/{PROG}/review-request.json` (see [schemas/review-request.schema.json](./schemas/review-request.schema.json)) — spec hash, target system (`sid`/`client`), transport, and the `objects[]` list with types. Also read `spec.md` and `interview.md` (for the paradigm and testing-scope decisions) from the same directory. If the request carries `environment_context`, apply the rules under "Environment context" below before counting findings.
- **Output**: review-result JSON conforming to [schemas/review-result.schema.json](./schemas/review-result.schema.json), returned as your final response — you do not write `.sc4sap/program/{PROG}/review-result.json` yourself (see "Output — review-result.json" below; the worker validates and records it). Set `reviewed_spec_sha256` to the `spec_sha256` you received in the request (verify it against the actual `spec.md` first — on mismatch, FAIL immediately with a single MAJOR finding "spec changed after approval").
- **Narrow context kit — do NOT bulk-load all conventions.** Each item below names the only convention file(s) to load while checking that item. Load them one item at a time; unload/ignore the rest. Preloading all 12 kits wastes context and dilutes judgment.
- Fetch object sources via the read tools only: `GetProgram`, `GetInclude`, `GetClass`, `GetInterface`, `GetScreen`, `GetGuiStatus`, `GetTextElement`, `ReadTextElementsBulk`, `GetFunctionModule`, `SearchObject`, `GetInactiveObjects`.
- Record a verdict per item: `PASS` / `FINDING(S)` / `N/A (reason)`. Absence of evidence is a fail, not a pass — see the false-positive patterns at the end.

### Finding severity

- **MINOR** — violation exists but is non-blocking (e.g., a TEXT-Txx missing an optional tooltip). The worker fixes it after the review; no re-review required for MINOR-only fixes.
- **MAJOR** — violation that blocks completion (e.g., manual LVC_T_FCAT build, Docking replaced by Custom Control, ECC-deprecated pattern on S/4, parallel Z-impl created when a reuse target existed). The worker must fix and the program must be re-reviewed.

### Verdict rule

- `FAIL` — one or more MAJOR findings (list every finding, MINOR and MAJOR).
- `PASS` — zero MAJOR findings. MINOR findings may still be listed; the worker fixes them before the completion report.

### Environment context (from the request)

`review-request.json` may carry an optional `environment_context` (schema: known
backend outages + human-approved spec deviations — docs/DECISIONS.md D-013).
Apply it before counting findings:

- **`known_outages[]`** — applies to `unit_test`/`atc` gaps only. A verification
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

Buckets group related items so a run can check them in coherent passes (B1 ALV+UI → B2 Logic → B3 Structure → B4 Platform); tag each finding with its bucket in `review-result.json`.

## §1 — ALV Display Rules + Screen/GUI Population

Context kit: [alv-rules.md](../knowledge/abap/conventions/alv-rules.md), [ok-code-pattern.md](../knowledge/abap/conventions/ok-code-pattern.md). Applies to: any program that displays a result set in ALV.

- [ ] **Display mode** matches the spec: `CL_GUI_ALV_GRID` for full screens (custom screen + GUI status + Docking Container), `CL_SALV_TABLE` for popups
- [ ] **Container** for full ALV is `CL_GUI_DOCKING_CONTAINER` (NOT a custom container in a Custom Control screen element)
- [ ] **Field Catalog Construction Standard (CRITICAL — most-often violated)**: catalog MUST be extracted via SALV factory and converted with `cl_salv_controller_metadata=>get_lvc_fieldcatalog`. Repeated `APPEND ls_fc TO pt_fcat` inline construction → VIOLATION (MAJOR). Per-field attribute adjustment (`coltext`, `outputlen`, `do_sum`, `no_out`, `hotspot`, `qfieldname`, `cfieldname`) via `CASE FIELDNAME` block only.
- [ ] **Screen flow logic populated**: for every screen created, call `GetScreen(program, screen_number)` and verify `flow_logic` contains at least one `MODULE ... OUTPUT.` line AND one `MODULE ... INPUT.` line that does NOT start with `*` or `"`. A screen whose flow logic is only `* MODULE STATUS_0100.` / `* MODULE USER_COMMAND_0100.` is a MAJOR finding — the executor ran `CreateScreen` but skipped `UpdateScreen(flow_logic)`.
- [ ] **GUI Status populated**: for every status created, call `GetGuiStatus(program, status_name)` and verify the status has non-empty PFKEYS / menu / toolbar entries — not just a `STA` + `TIT` shell. An empty GUI status presents a blank toolbar at runtime (MAJOR).
- [ ] **OK_CODE binding 3-step contract** — per [ok-code-pattern.md](../knowledge/abap/conventions/ok-code-pattern.md): (a) TOP include declares `DATA: gv_okcode TYPE sy-ucomm.`; (b) the screen's `fields_to_containers[]` OKCODE entry has `NAME=GV_OKCODE`; (c) the PAI `user_command_xxxx` FORM reads `gv_okcode`, copies to a local, `CLEAR gv_okcode`, CASE on the local. `CASE sy-ucomm.` inside a user-command FORM, or an OKCODE field with no NAME, is MAJOR.

## §2 — Text Element Rule (I / S / R / H)

Context kit: [text-element-rule.md](../knowledge/abap/conventions/text-element-rule.md). Applies to: every screen, every dialog message, every literal the end user can see.

- [ ] No hardcoded display literals in screen layouts — all field labels reference `TEXT-Txx`
- [ ] No hardcoded literals in `MESSAGE` statements — use `MESSAGE TEXT-t01 TYPE 'E'`
- [ ] Translatable strings not embedded in string templates with literal text only
- [ ] Text elements created via `CreateTextElement` and present after activation
- [ ] **All four types verified via `ReadTextElementsBulk(program, language)`** (blocks the "Create-without-full-types" regression):
  - `counts.R ≥ 1` (program title present)
  - `counts.I == count of TEXT-xxx literals in source` (read the program source + regex `TEXT-[A-Z0-9]{3}`)
  - **`counts.S == count of SELECT-OPTIONS + PARAMETERS declarations on the selection screen`** (the most common miss — runtime shows technical names like `S_BUDAT` / `P_FILE`)
  - `counts.H ≥ 1` only if the program uses classical WRITE lists (else 0 is correct)
- [ ] Every text id exists in BOTH the primary logon language AND `'E'` (run the bulk read twice with different `language=`; both must return the same key set)

## §3 — Constant Rule

Context kit: [constant-rule.md](../knowledge/abap/conventions/constant-rule.md). Applies to: every program with logic.

- [ ] No magic literals in business logic — function codes (`'SAVE'`, `'EXIT'`), status names, screen numbers used in branching, threshold values must be `CONSTANTS` declared in the TOP include
- [ ] `gc_fcode_*` (or equivalent prefix) constants are referenced everywhere the literal would otherwise appear
- [ ] System values like `abap_true` / `abap_false` / `space` used instead of `'X'` / `''` / `' '`

## §4 — Procedural FORM Naming (Procedural mode only)

Context kit: [procedural-form-naming.md](../knowledge/abap/conventions/procedural-form-naming.md). Applies to: programs implemented with PERFORM (not OOP local classes). Verdict `N/A` when paradigm = OOP.

- [ ] Every FORM that handles screen-bound logic ends with the screen number suffix (`_0100`, `_0200`)
- [ ] FORMs shared across screens get no suffix (utility helpers)
- [ ] PBO/PAI module names follow `STATUS_xxxx` / `USER_COMMAND_xxxx` style

## §5 — OOP Two-Class Pattern (OOP mode only)

Context kit: [oop-pattern.md](../knowledge/abap/conventions/oop-pattern.md). Applies to: programs implemented with local classes. Verdict `N/A` when paradigm = Procedural.

- [ ] Two classes present: `LCL_DATA` (BAPI/business logic) + `LCL_SCREEN` or `LCL_ALV` (presentation)
- [ ] No business logic in the screen class, no UI calls in the data class
- [ ] Public method surface is minimal; helpers are PRIVATE

## §6 — Include Structure

Context kit: [include-structure.md](../knowledge/abap/conventions/include-structure.md) (+ [main-program.abap](../knowledge/abap/templates/procedural-sample/main-program.abap) for the inlined-Main check). Applies to: every multi-include program.

- [ ] Suffix convention followed: `t` / `s` / `c` / `a` / `o` / `i` / `e` / `f` / `_tst` per the table in include-structure.md
- [ ] Empty-by-design includes are NOT created; conditional includes (e.g., `s` for a no-parameter program) are simply omitted, not stubbed
- [ ] TOP include holds all global TYPES / DATA / CONSTANTS — no DATA declarations leaking into PBO/PAI/FORM includes
- [ ] **Main program contains `INCLUDE` statements for every planned include** (rejects "everything inlined into Main"): call `GetProgram(main)` and verify the source contains one `INCLUDE {PROG}{SUFFIX}.` line per planned suffix. A Main program where all declarations / forms / modules are inlined is a MAJOR violation of the main-program template — event blocks and headers mixed with logic belong in their respective includes.
- [ ] **Procedural paradigm MUST NOT have a `{PROG}E` include**: `e` is the OOP ALV event-handler include only. If `paradigm = Procedural` in `interview.md` AND `SearchObject({PROG}E)` returns a hit → MAJOR. Event blocks (`INITIALIZATION`, `AT SELECTION-SCREEN`, `START-OF-SELECTION`, `END-OF-SELECTION`) belong in the Main body per include-structure.md.

## §7 — Naming Conventions

Context kit: [naming-conventions.md](../knowledge/abap/conventions/naming-conventions.md), [function-module-rule.md](../knowledge/abap/conventions/function-module-rule.md). Applies to: every created object.

- [ ] Z/Y prefix on all custom objects
- [ ] Module prefix in program / table / class names where the convention prescribes (e.g., `ZMM*` for MM, `ZSD*` for SD)
- [ ] Include names match `{PROG}_{SUFFIX}` exactly
- [ ] Function group / function module / data element / domain naming follows the table in the convention
- [ ] Function Module source follows [function-module-rule.md](../knowledge/abap/conventions/function-module-rule.md) — inline `IMPORTING/EXPORTING/CHANGING/TABLES/EXCEPTIONS` in the `FUNCTION` statement. **Reject if `GetFunctionModule` returns the placeholder `" You can use the template 'functionModuleParameter' to add here the signature!`**, or if the spec calls for parameters but none are declared, or if the body uses shadow locals (`lv_iv_xxx TYPE ...`) instead of real parameters.

## §8 — Clean ABAP (baseline + paradigm-specific)

Context kit — **paradigm gate first**: read `Paradigm` from `interview.md`. `OOP` → load [clean-code.md](../knowledge/abap/conventions/clean-code.md) + [clean-code-oop.md](../knowledge/abap/conventions/clean-code-oop.md); `Procedural` → load [clean-code.md](../knowledge/abap/conventions/clean-code.md) + [clean-code-procedural.md](../knowledge/abap/conventions/clean-code-procedural.md). Loading both paradigm files, or the wrong one, invalidates this item's review.

Core (clean-code.md, both paradigms):
- [ ] No `SELECT *` — explicit field list
- [ ] No `SELECT` inside `LOOP` — use `FOR ALL ENTRIES` or a join
- [ ] `SY-SUBRC` checked after every statement that sets it (SELECT SINGLE, READ TABLE, CALL FUNCTION with EXCEPTIONS)
- [ ] Internal table type matches the access pattern (HASHED / SORTED / STANDARD), no DEFAULT KEY
- [ ] Secondary key declared when the SELECT source is a transactional / large table AND downstream access is on non-primary fields
- [ ] Large-table SELECTs preceded by a `COUNT(*)` check + tuning plan when count > 1M
- [ ] Backtick string literals for STRING values, `|...|` templates for assembly
- [ ] Boolean variables typed `ABAP_BOOL`, compared against `abap_true` / `abap_false`, set via `XSDBOOL( )`
- [ ] Conditions positive, `IS NOT` over `NOT IS`, no empty IF branches
- [ ] Prefer explicit typed internal tables over inline `INTO TABLE @DATA(...)` for SELECTs feeding further logic
- [ ] Inline declarations / modern syntax used where `ABAP_RELEASE` permits — never newer than the configured release
- [ ] No commented-out code, no debug statements (`BREAK-POINT`, `MESSAGE 'TEST'`)

Paradigm = OOP (clean-code-oop.md):
- [ ] **Main program structure matches [zrsc4sap_oop_ex.prog.abap](../knowledge/abap/templates/oop-sample/zrsc4sap_oop_ex.prog.abap)** — REPORT statement, INCLUDE order, event block layout, two-class bootstrap (`go_data = NEW lcl_data( )` / `go_alv = NEW lcl_alv( go_data )`). Any structural deviation must be justified in `spec.md`; otherwise MAJOR finding.
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

- [ ] Customizing tables referenced in code match what the module consultant recommended in `.sc4sap/program/{PROG}/consult-{module}.md`
- [ ] No hardcoded org-unit values that should come from customizing

## §12 — Activation State

Context kit: none — tool evidence only.

- [ ] `GetInactiveObjects` returns 0 entries from the program's object set
- [ ] All objects assigned to the agreed transport request (from `review-request.json.transport`)

## False-Positive Patterns the Reviewer MUST Reject

These patterns have been observed as "PASS" reports that later turned out to be broken. Actively detect them — absence of evidence is a fail, not a pass.

- **Screen created but flow logic commented out** — `flow_logic` contains only `* MODULE STATUS_xxxx.` / `* MODULE USER_COMMAND_xxxx.` (leading `*`). Empty runtime behavior.
- **GUI Status created but empty** — `definition.STA[*].CODE` exists yet no PFKEYS array and no application toolbar codes. Toolbar renders blank.
- **Text pool partial** — `counts.I > 0` but `counts.S == 0` while the source declares `SELECT-OPTIONS` / `PARAMETERS`. Selection screen shows technical names.
- **Include created but not activated** — `GetInactiveObjects` shows `{PROG}{SUFFIX}` entries after the main program was reported as activated. The main program runs but throws `LOAD_PROGRAM_LOST` at a PERFORM call.
- **Procedural paradigm with a `{PROG}E` include** — event blocks relocated out of the Main body; forbidden per include-structure.md.
- **Main program with no `INCLUDE` statements while the plan says N includes exist** — the executor inlined every declaration into Main; violates the main-program template and the include-structure convention.
- **OK_CODE binding broken** — any of: (a) the screen has an OKCODE field but no `NAME=GV_OKCODE`, (b) the TOP include is missing `DATA: gv_okcode TYPE sy-ucomm.` despite a screen being present, or (c) a PAI `user_command_xxxx` FORM does `CASE sy-ucomm.` instead of copying `gv_okcode` to a local. Runs on the main screen; fails silently on the first popup or ALV toolbar event. See [ok-code-pattern.md](../knowledge/abap/conventions/ok-code-pattern.md).

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

**The worker** (not you) reads this JSON from your response, validates it against
[schemas/review-result.schema.json](./schemas/review-result.schema.json), and writes it to
`.sc4sap/program/{PROG}/review-result.json`. On schema-validation failure the worker treats
the run as blocked rather than fabricating a passing result. The worker also applies fixes
and, for MAJOR findings, requests a re-review in a new fresh context. Maximum 3 review
iterations; after that the pipeline is BLOCKED and the residual findings are surfaced to the
user.
