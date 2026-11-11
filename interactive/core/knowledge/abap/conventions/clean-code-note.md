# Clean ABAP — Conventions Note

This file is the canonical note. The procedures carry byte-identical copies of the text between the markers, and a gate keeps those copies in step with this one.

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
