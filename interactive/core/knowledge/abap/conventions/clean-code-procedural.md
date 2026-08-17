# Clean ABAP — Procedural Paradigm

The Clean ABAP rules gathered here belong to the **Procedural paradigm** alone — `REPORT` programs assembled out of `FORM` / `PERFORM` routines, classic PBO / PAI modules, function modules, and includes. Bring this file in once the Phase 1B interview settles on `paradigm = Procedural` — and NOT when that answer comes back `OOP`. Its companion [`clean-code.md`](clean-code.md) carries the paradigm-neutral shared baseline. Nothing below escapes the gate that `abap-release-reference.md` imposes.

> This file's pair is [`procedural-form-naming.md`](procedural-form-naming.md). FORM naming conventions live over there — the `_{screen_no}` suffix, and the STATUS_xxxx / USER_COMMAND_xxxx module names. What lives here is the coding style that fills the FORM bodies.

## Mandatory Main Program Template (MUST match)

A Procedural program's main `REPORT` source begins at the canonical sample: the executor MUST both start from it and conform to it.

**Source of truth**: [`procedural-sample/main-program.abap`](../templates/procedural-sample/main-program.abap).

- **Do**: reproduce the skeleton — REPORT statement, INCLUDE order matching the t/s/c/a/o/i/e/f/_tst convention, INITIALIZATION / AT SELECTION-SCREEN / START-OF-SELECTION / END-OF-SELECTION block layout, PBO/PAI module stubs delegating to FORMs — and then adapt the identifiers.
- **Do not**: pull FORM logic inline into events; declare globals anywhere other than the TOP include; place `DATA` statements in PBO/PAI/FORM includes; or break the suffix rule owned by the paired `procedural-form-naming.md`.
- **Deviation requires written justification in `spec.md`** — recorded before the executor runs Phase 4. Structural drift from the template that goes undocumented is raised as a MAJOR finding in the Phase 6 review.

## Global vs Local Discipline (TOP include)

- **TOP include holds every global TYPES / DATA / CONSTANTS**. Outside the TOP include, no `DATA` declaration at all (the PBO / PAI / FORM / EVENT includes consume globals; they do not declare them).
- **FORM locals are declared in the FORM**. A variable that exists for one routine only is written inside the FORM body with `DATA: BEGIN OF` / `DATA:`. Promoting it to TOP on the grounds "I might need this elsewhere" is NOT the move.
- **One global namespace — avoid collisions** — the `g` prefix on globals (`gt_vbak`, `gs_header`, `gv_selected`) is what keeps them visually distinguishable from FORM-locals (`lt_*`, `ls_*`, `lv_*`).
- **Never shadow a global** with a same-named local inside a FORM. ABAP permits it, and debugging pays catastrophically for it — rename the local.
- **No cross-FORM state via globals except the main data table** — when FORM A needs a value FORM B produced, that value travels by `USING` / `CHANGING`, not through a hidden global.

## FORM / PERFORM — Parameters and Signatures

- **`USING` for inputs**, `CHANGING` for in/out. A value you are going to modify must never arrive over `USING` — nothing at the call site tells the caller that the value will change.
- **Type every parameter** — `FORM f USING p_a TYPE ... p_b TYPE ...`. Steer clear of the typeless `USING p_a` (it defaults to `ANY` and disables static checks).
- **Use `TYPE REF TO` for large itabs** — the whole table is copied by `USING VALUE(it_data) TYPE ty_t`, so the preferred form is `USING it_data TYPE ty_t` (pass-by-reference by default).
- **Parameter count** — aim for ≤ 4. A FORM that wants more should take a DDIC structure instead (`USING ps_ctx TYPE ty_ctx`).
- **No boolean `USING` parameter** — where `USING pv_force TYPE abap_bool` drives a branch inside the FORM, that should have been two FORMs (`process_force`, `process_strict`).
- **PERFORM call layout** — once the parameter count is > 2, each parameter takes its own line, aligned under the FORM name.

## FORM Body

- **One FORM does one thing.** Its name is a verb + noun pair (`read_vbak`, `build_fieldcatalog`, `display_alv`); the moment the name reaches for "and", split it.
- **Length** under ~50 lines — procedural logic runs more linearly than OOP methods often do, yet comprehension still drops past 50 lines. Extract to sub-FORMs.
- **Screen-bound FORMs end with `_{screen_no}` suffix** (`process_save_0100`, `init_fields_0200`), as [`procedural-form-naming.md`](procedural-form-naming.md) prescribes. Utility FORMs — the ones shared across screens — take no suffix.
- **PBO / PAI module names** — `STATUS_0100`, `USER_COMMAND_0100`, `MODIFY_SCREEN_0100`. One line is all a module's body should be: `PERFORM f_status_0100.` — the logic sits in the FORM, not in the module.
- **PAI user-command routing — MUST follow the OK_CODE binding pattern** laid out in [`ok-code-pattern.md`](ok-code-pattern.md). TOP declares `gv_okcode TYPE sy-ucomm.`; the screen's OKCODE field NAME is bound to `GV_OKCODE`; and inside the `user_command_xxxx` FORM, `gv_okcode` is copied to a local, `CLEAR gv_okcode` follows, and the `CASE` then runs on the local. A FORM that reads `sy-ucomm` directly breaks silently on popup / ALV-event flows — a MAJOR Phase 6 finding.
- **No declaration in the middle of a FORM** — every FORM-local declaration sits at the top, with the logic below it. Inline `DATA(lv_x)` is permitted if `ABAP_RELEASE ≥ 740`, but spend it sparingly — procedural readability improves when the declarations stay gathered at the top of the FORM.

## Procedural Error Handling

- **`sy-subrc` checked after every statement that sets it** — that reaches `SELECT SINGLE`, `READ TABLE`, `ASSIGN`, `CALL FUNCTION` with `EXCEPTIONS`, `AUTHORITY-CHECK`, `CALL TRANSACTION`, `OPEN CURSOR` / `FETCH NEXT CURSOR`, and similar.
- **Classic pattern — call function modules with an `EXCEPTIONS` clause**, like so:
  ```abap
  CALL FUNCTION 'Z_MM_GR_POST'
    EXPORTING iv_matnr = lv_matnr
    IMPORTING ev_result = lv_result
    EXCEPTIONS not_authorized    = 1
               posting_failed    = 2
               OTHERS            = 3.
  CASE sy-subrc.
    WHEN 0.
      " happy path
    WHEN 1. MESSAGE e001(zmsg).
    WHEN 2. MESSAGE e002(zmsg) WITH lv_matnr.
    WHEN OTHERS. MESSAGE e999(zmsg).
  ENDCASE.
  ```
- **Message types match intent** — the mapping being `'S'` success, `'I'` info, `'W'` warning, `'E'` error-in-dialog, `'A'` abort (rare), `'X'` short dump (never from business logic).
- **`MESSAGE ... RAISING <exc>`** within a function module does both jobs at once — it sets `sy-subrc` and the message fields together; on the other side, the caller reads `MESSAGE ID ... NUMBER ...` to recover the text.
- **No `EXIT` / `STOP` / `LEAVE PROGRAM`** in the role of error handling — they skip past `AT EXIT-COMMAND` cleanup. Use `MESSAGE e... `'E'`` or return via `sy-subrc`.
- **Never swallow `sy-subrc`** — where it is not handled on the spot, either the value is checked later or the case is documented inline.

## Modularization Boundaries

- **FORM** — logic local to the program, with no callers beyond that same program or its includes
- **FUNCTION MODULE** — the unit reusable across programs, and the one that may participate in RFC / tRFC / qRFC. Add `EXCEPTIONS` clause.
- **INCLUDE** — a text split, not a modularization unit. Sharing logic between programs through includes is never the answer (copy-paste risk); an FM does that job.
- **When a FORM grows beyond comprehension AND is called from only one place** — a sub-FORM is the extraction target, not a function module. Creating an FM is a design choice about reusability and RFC capability, not a fix for length.
- **When the same procedural logic appears in 2+ programs** — raise it into a function module within the program's function group, or pull it out into a local class `LCL_HELPER` held in a shared include.
- FORM / module naming rules are in [`procedural-form-naming.md`](procedural-form-naming.md), and the t/s/c/a/o/i/e/f/_tst suffix convention is in [`include-structure.md`](include-structure.md).

## Procedural Testing — Limits and Workarounds

- **Procedural code is hard to unit-test** — FORMs lean on globals, and ABAP Unit has no clean way to isolate those.
- **Strategy 1 — extract to a helper class and test that**. Take the pure-computation logic (validation, calculation, transformation) out of the FORM and into a local class `LCL_HELPER` carrying a `FOR TESTING` sibling. What stays behind is a thin adapter: `PERFORM ... → lcl_helper=>process( ... )`.
- **Strategy 2 — test the FORM indirectly via a small driver program** — a test REPORT that sets globals, reaches the FORM through `PERFORM`, and asserts on the results. It automates less; it still beats nothing.
- **What not to do** — `FOR TESTING` annotations do NOT go directly on FORMs (not supported), and globals are NOT to be mocked by reassigning them in setup (race conditions, debug pain).
- **Mandatory**: where the interview's testing scope is `none`, procedural programs skip ABAP Unit entirely — no stubbing out of empty test classes. The rationale goes in the spec.

## Comments — Procedural-Specific

- **One-line header above each FORM** stating that FORM's contract (inputs, outputs, side effects on globals). Example:
  ```abap
  "--------------------------------------------------
  " f_read_vbak — reads header data for selected
  "   vbeln range into gt_vbak; uses gs_selscreen.
  "--------------------------------------------------
  FORM f_read_vbak.
  ...
  ```
  What justifies the header is how often procedural FORMs touch globals — the name on its own does not document that coupling. On OOP methods, do NOT write it (the method signature is self-documenting).
- **No `" begin of ...` / `" end of ...` blocks inside a FORM** — a FORM long enough to want inner section markers is a FORM that is too long; extract.
- **Module-level block** — the PBO / PAI / EVENT includes may carry a single top-of-include comment declaring the include's purpose; no other structural comments.
