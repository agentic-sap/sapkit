# Code Review Checklist (MANDATORY, Unconditional)

This file is the authoritative checklist for the post-implementation code review step of ABAP program development. Run it after every successful activation, before any completion report.

## Purpose

A successful activation from the implementation step only proves the code **compiles and links**. It does NOT prove the code follows the shared coding conventions and templates (see `../templates/`). This review closes the gap: the reviewer fetches every created object's source via MCP and verifies, line by line, against each applicable convention.

> **Past incident** — a spec said "build LVC_T_FCAT manually" → executor faithfully wrote `APPEND ls_fc TO pt_fcat` repeated per column → activation succeeded → user found the ALV field-catalog rule violation only after manual review. This review step would have caught it before the user ever saw the program.

## Position in the Development Flow

- Implementation → Code Review (this checklist) → Completion Report
- QA and debug steps may be conditional on mode or on failures. **This review is unconditional.**
- The completion report has a hard gate: it requires a review log to exist with PASS verdicts before the report can be written.

## Review Inputs + Strategy

Pass the reviewer:
- The list of object names created during implementation (with type: PROG/I, PROG/P, DYNP, CUAD, etc.)
- The transport number
- The path to the program specification
- A reminder to write a review log

Classify every finding as `PASS` / `MINOR` / `MAJOR`. The checklist below is the source of truth for WHAT is checked; how the checks are distributed across reviewers is an execution detail.

## Convention Checklist

For each created object, fetch source via the appropriate MCP tool (`GetSource` with `type` = PROG / INCL / CLAS / INTF / FUNC; `GetTextElements` for selection texts and text symbols; screens and GUI statuses have no dedicated MCP read tool — inspect flow logic and status entries via ADT/SAP GUI) and verify against **every** convention below that applies. Record verdict per check: `PASS` / `FIX-APPLIED` / `N/A (reason)`.

**Context discipline**: each §1–§12 below is an independent reviewer bucket. Load ONLY the rule context named in that section when checking it — do NOT preload all 12. On a MAJOR finding, re-examine with the narrow context for that section only.

### 1. ALV Display Rules + Screen/GUI Population

Applies to: any program that displays a result set in ALV.

- [ ] **Display mode** matches the spec: `CL_GUI_ALV_GRID` for full screens (custom screen + GUI status + Docking Container), `CL_SALV_TABLE` for popups
- [ ] **Container** for full ALV is `CL_GUI_DOCKING_CONTAINER` (NOT custom container in a Custom Control screen element)
- [ ] **Field Catalog Construction Standard (CRITICAL — most-often violated)**: catalog MUST be extracted via SALV factory and converted with `cl_salv_controller_metadata=>get_lvc_fieldcatalog`. Repeated `APPEND ls_fc TO pt_fcat` inline construction → VIOLATION. Per-field attribute adjustment (`coltext`, `outputlen`, `do_sum`, `no_out`, `hotspot`, `qfieldname`, `cfieldname`) via `CASE FIELDNAME` block only. See `../templates/alv/field-catalog-guide.abap`.
- [ ] **Screen flow logic populated (reject false positives)**: for every screen created, read its flow logic (via ADT/SAP GUI — no dedicated MCP tool) and verify it contains at least one `MODULE ... OUTPUT.` line AND one `MODULE ... INPUT.` line that does NOT start with `*` or `"`. A screen whose flow logic is only `* MODULE STATUS_0100.` / `* MODULE USER_COMMAND_0100.` is a MAJOR finding — the screen was created but its flow logic was never populated.
- [ ] **GUI Status populated**: for every status created, inspect the status (via ADT/SAP GUI) and verify it has non-empty PFKEYS / menu / toolbar entries — not just a `STA` + `TIT` shell. An empty GUI status presents a blank toolbar at runtime.
- [ ] **OK_CODE binding 3-step contract** — per the OK-code binding pattern: (a) TOP include declares `DATA: gv_okcode TYPE sy-ucomm.`; (b) the screen's element list binds the OKCODE field to `GV_OKCODE`; (c) the PAI `user_command_xxxx` FORM reads `gv_okcode`, copies to a local, `CLEAR gv_okcode`, CASE on the local. `CASE sy-ucomm.` inside a user-command FORM, or an OKCODE screen field bound to nothing, is MAJOR.

### 2. Text Element Rule (I / S / R / H)

Applies to: every screen, every dialog message, every literal that the end user can see.

- [ ] No hardcoded display literals in screen layouts — all field labels reference `TEXT-Txx`
- [ ] No hardcoded literals in `MESSAGE` statements — use `MESSAGE TEXT-t01 TYPE 'E'`
- [ ] Translatable strings not embedded in string templates with literal text only
- [ ] Text elements created via `SetTextElements` and present after activation
- [ ] **All four types verified via `GetTextElements` (blocks the "Create-without-full-types" regression)**:
  - `counts.R ≥ 1` (program title present)
  - `counts.I == count of TEXT-xxx literals in source` (read program source + regex `TEXT-[A-Z0-9]{3}`)
  - **`counts.S == count of SELECT-OPTIONS + PARAMETERS declarations on the selection screen`** (the most common miss — runtime shows technical names like `S_BUDAT` / `P_FILE`)
  - `counts.H ≥ 1` only if program uses classical WRITE lists (else 0 is correct)
- [ ] Every text id exists in BOTH the primary logon language AND `'E'` (run the text-element read twice with different `language=`; both must return the same key set).

### 3. Constant Rule

Applies to: every program with logic.

- [ ] No magic literals in business logic — function codes (`'SAVE'`, `'EXIT'`), status names, screen numbers used in branching, threshold values must be `CONSTANTS` declared in the TOP include
- [ ] `gc_fcode_*` (or equivalent prefix) constants are referenced everywhere the literal would otherwise appear
- [ ] System values like `abap_true` / `abap_false` / `space` used instead of `'X'` / `''` / `' '`

### 4. Procedural FORM Naming (Procedural mode only)

Applies to: programs implemented with PERFORM (not OOP local classes).

- [ ] Every FORM that handles screen-bound logic ends with the screen number suffix (`_0100`, `_0200`)
- [ ] FORMs shared across screens get no suffix (utility helpers)
- [ ] PBO/PAI module names follow `STATUS_xxxx` / `USER_COMMAND_xxxx` style

### 5. OOP Two-Class Pattern (OOP mode only)

Applies to: programs implemented with local classes.

- [ ] Two classes present: `LCL_DATA` (BAPI/business logic) + `LCL_SCREEN` or `LCL_ALV` (presentation)
- [ ] No business logic in screen class, no UI calls in data class
- [ ] Public method surface is minimal; helpers are PRIVATE

### 6. Include Structure

Applies to: every multi-include program.

- [ ] Suffix convention followed: `t` / `s` / `c` / `a` / `o` / `i` / `e` / `f` / `_tst` per the include structure convention
- [ ] Empty-by-design includes are NOT created; conditional includes (e.g., `s` for a no-parameter program) are simply omitted, not stubbed
- [ ] TOP include holds all global TYPES / DATA / CONSTANTS — no DATA declarations leaking into PBO/PAI/FORM
- [ ] **Main program contains `INCLUDE` statements for every planned include (rejects "everything inlined into Main")**: call `GetSource` (type `PROG`) on the main program and verify the source contains one `INCLUDE {PROG}{SUFFIX}.` line per planned suffix. A Main program where all declarations / forms / modules are inlined is a MAJOR violation of the `../templates/procedural/main-program.abap` template — event blocks and headers mixed with logic belong in their respective includes.
- [ ] **Procedural paradigm MUST NOT have `{PROG}E` include**: `e` is the OOP ALV event-handler include only. If the paradigm is Procedural AND `SearchObject({PROG}E)` returns a hit → MAJOR. Event blocks (`INITIALIZATION`, `AT SELECTION-SCREEN`, `START-OF-SELECTION`, `END-OF-SELECTION`) belong in the Main body per the include structure convention.

### 7. Naming Conventions

Applies to: every created object.

- [ ] Z/Y prefix on all custom objects
- [ ] Module prefix in program / table / class names where the convention prescribes (e.g., `ZMM*` for MM, `ZSD*` for SD)
- [ ] Include names match `{PROG}_{SUFFIX}` exactly
- [ ] Function group / function module / data element / domain naming follows the naming convention table
- [ ] Function Module source declares its signature inline — `IMPORTING/EXPORTING/CHANGING/TABLES/EXCEPTIONS` in the `FUNCTION` statement. **Reject if `GetSource` (type `FUNC`) returns the placeholder `" You can use the template 'functionModuleParameter' to add here the signature!`**, or if spec calls for parameters but none are declared, or if body uses shadow locals (`lv_iv_xxx TYPE ...`) instead of real parameters.

### 8. Clean ABAP (core + paradigm-specific)

**Paradigm gate** — determine the program's paradigm first: `OOP` → apply the OOP checks below; `Procedural` → apply the Procedural checks below. Applying both sets, or the wrong one, is itself a MAJOR review error.

Core (both paradigms):
- [ ] No `SELECT *` — explicit field list
- [ ] No `SELECT` inside `LOOP` — use `FOR ALL ENTRIES` or join
- [ ] `SY-SUBRC` checked after every statement that sets it (SELECT SINGLE, READ TABLE, CALL FUNCTION with EXCEPTIONS)
- [ ] Internal table type matches access pattern (HASHED / SORTED / STANDARD), no DEFAULT KEY
- [ ] Secondary key declared when SELECT source is a transactional / large table AND downstream access is on non-primary fields
- [ ] Large-table SELECTs preceded by `COUNT(*)` check + tuning plan when count > 1M
- [ ] Backtick string literals (` \` `) for STRING values, `|...|` templates for assembly
- [ ] Boolean variables typed `ABAP_BOOL`, compared against `abap_true` / `abap_false`, set via `XSDBOOL( )`
- [ ] Conditions positive, `IS NOT` over `NOT IS`, no empty IF branches
- [ ] Prefer explicit typed internal tables over inline `INTO TABLE @DATA(...)` for SELECTs feeding further logic
- [ ] Inline declarations / modern syntax used where the target ABAP release permits — never newer than the target release
- [ ] No commented-out code, no debug statements (`BREAK-POINT`, `MESSAGE 'TEST'`)

Paradigm = OOP → check:
- [ ] **Main program structure matches `../templates/oop/zrsc4sap_oop_ex.prog.abap`** — REPORT statement, INCLUDE order, event block layout, two-class bootstrap (`go_data = NEW lcl_data( )` / `go_alv = NEW lcl_alv( go_data )`). Any structural deviation must be justified in the program specification; otherwise MAJOR finding.
- [ ] Classes `FINAL` unless designed for inheritance; members `PRIVATE` by default
- [ ] Methods do one thing, ≤ 30 lines, single abstraction level, ≤ 3 IMPORTING parameters
- [ ] Methods return one value (`RETURNING` over `EXPORTING`); no boolean input parameters
- [ ] `NEW #( ... )` over `CREATE OBJECT`; multiple static creation methods over optional constructor params
- [ ] Exceptions: class-based only; own project super class; wrap foreign `CX_SY_*`; `RAISE EXCEPTION NEW`
- [ ] Formatting: 120-char line limit, consistent alignment, one statement per line
- [ ] Tests: given-when-then naming, test publics only, inject doubles via constructor, `LOCAL FRIENDS` only for constructor access

Paradigm = Procedural → check:
- [ ] **Main program structure matches `../templates/procedural/main-program.abap`** — REPORT statement, INCLUDE order (t/s/c/a/o/i/e/f/_tst), event block layout, PBO/PAI modules as one-line `PERFORM` delegators. Any structural deviation must be justified in the program specification; otherwise MAJOR finding.
- [ ] All globals declared in TOP include only; no `DATA` in PBO/PAI/FORM/EVENT includes
- [ ] Global / local variables visually distinguishable (`g*` vs `l*` prefix); no local shadows a global
- [ ] FORM parameters typed (`USING p_a TYPE ...`); `USING` for inputs, `CHANGING` for in/out; no boolean `USING`
- [ ] Screen-bound FORMs end with `_{screen_no}` suffix; utility FORMs have no suffix
- [ ] PBO/PAI module bodies are one line (`PERFORM f_...`); logic lives in FORMs, not in modules
- [ ] `sy-subrc` checked after every statement that sets it; `CALL FUNCTION` uses `EXCEPTIONS` clause with `CASE sy-subrc`
- [ ] No `EXIT` / `STOP` / `LEAVE PROGRAM` used as error handling
- [ ] Each FORM has a one-line header comment describing inputs / outputs / global side effects
- [ ] Testing: if the spec requires tests, the testable logic is extracted to `LCL_HELPER` (not left inside FORMs)

### 9. ABAP Release Awareness

- [ ] No syntax used that exceeds the target system's ABAP release (e.g., no `RAP managed implementation` on a 740 system)

### 10. SAP Version Awareness

- [ ] No S/4-only tables/APIs on ECC (`MATDOC`, `ACDOCA`, `BUT000` for BP)
- [ ] No ECC-deprecated patterns on S/4 (e.g., `LFA1`/`KNA1` directly when BP is the master record)

### 11. SPRO Lookup Protocol

Applies to: programs that depend on SPRO/IMG configuration.

- [ ] Customizing tables referenced in code match the documented module consulting / configuration decisions for the program
- [ ] No hardcoded org-unit values that should come from customizing

### 12. Activation State

- [ ] `GetInactiveObjects` returns 0 entries from the program's object set
- [ ] All objects assigned to the agreed transport request

## Output Format + Failure Handling

Record a review log with a verdict per check (`PASS` / `FIX-APPLIED` / `N/A (reason)`). On a violation: fix the source, re-activate, and re-verify before recording `FIX-APPLIED`.

Explicit false-positive patterns the reviewer must reject (do not let these pass as "done"):
- Commented-out screen flow logic (`* MODULE ...` lines only)
- Empty GUI status (a `STA` + `TIT` shell with no PFKEYS / menu / toolbar entries)
- Missing selection texts (runtime shows technical names like `S_BUDAT` / `P_FILE`)
- Inactive includes remaining after a "completed" report
- A `{PROG}E` include in a Procedural-paradigm program
- A Main program with everything inlined instead of `INCLUDE` statements
