# Clean ABAP — Shared Baseline (Paradigm-Neutral)

Gathered here are the Clean ABAP rules that hold whatever paradigm a program is written in. Each one is binding unless a project-specific override has been documented.

> **Gate rule**: `common/abap-release-reference.md` outranks everything below — syntax newer than the `ABAP_RELEASE` configured in `.sapkit/config.json` is never permitted.

> **Paradigm-specific rules live in companion files — the interview's Paradigm dimension (Phase 1B #2) decides which one gets loaded**:
> - **OOP** (`paradigm = OOP`) → load **[`clean-code-oop.md`](clean-code-oop.md)** (classes, objects, constructors, method signatures, class-based exceptions, ABAP Unit with test doubles).
> - **Procedural** (`paradigm = Procedural`) → load **[`clean-code-procedural.md`](clean-code-procedural.md)** (FORM / PERFORM, `USING`/`CHANGING`, TOP-include globals discipline, `EXCEPTIONS` clause on function modules, procedural testing limits).
>
> Per program, load exactly ONE of the two paradigm files. Pulling in both blends the two signature styles and the code comes out inconsistent. Formatting, testing-principles, and comment-detail rules apply to both paradigms and stay in `clean-code-oop.md`, the more exhaustive of the two companions; a reviewer working on procedural code therefore reads the OOP file's formatting / testing-principles / comment-detail sections as canonical while passing over its class-scope / constructor / method-call-syntax sections.

## Naming

- Object-level naming (Z/Y prefix, module namespace, includes, function groups, tables, DEs, DOs) is governed by [`naming-conventions.md`](naming-conventions.md).
- Spell variables out as descriptive full words instead of abbreviating them: `lv_order_total`, not `lv_ord_tot`.
- Single-letter variables are out, with loop counters (`i`, `j`) and obviously short scopes the only exceptions.
- Give booleans an `is_*` / `has_*` / `should_*` prefix — `lv_is_released`, not `lv_released_flag`.
- Name a method with a verb and a class with a noun: `calculate_tax`, `order_processor`.
- Keep Hungarian notation off objects and structures; `ls_`, `lt_`, `lo_` are tolerated on locals but discouraged on class members.

## Variables and Types

- **Declare where you use** (ABAP 740+). Reach for inline declarations (`DATA(x) = ...`, `FIELD-SYMBOLS(<fs>) ASSIGNING ...`) whenever the release permits them.
- **Minimize scope**. Favour locals over globals, and method-locals over class attributes wherever that is possible.
- **Use typed constants, not magic numbers**. The detail sits in [`constant-rule.md`](constant-rule.md).
- **Avoid `TYPE STANDARD TABLE WITH EMPTY KEY`** where it is not genuinely what you mean; when the lookup pattern allows it, reach for `HASHED` / `SORTED` instead.
- **Never reuse a variable** to carry a second, different meaning elsewhere in the same routine.
- **A `RETURNING` parameter must be fully typed** — `RETURNING VALUE(rv) TYPE c LENGTH 1` is rejected with `A RETURNING parameter must be fully typed`. Declare a `TYPES` alias and reference that instead. `IMPORTING` accepts the very same inline length, which is what makes the restriction easy to miss.
- **Ratio / percentage arithmetic assigned into a narrow DEC/CURR field is a runtime-only defect class** — the syntax check never sees it, because `COMPUTE_BCD_OVERFLOW` fires on values alone — see [`function-module-rule.md`](function-module-rule.md) § Narrow DEC Fields — BCD Overflow.

## Control Flow

- **Early exit / guard clauses**. Return on invalid input before anything else; keep the happy path free of indentation.
- **No deeply nested `IF`**. Once nesting passes 3 levels, extract a method.
- **Prefer `CASE`** where an `IF/ELSEIF` chain tests a single variable.
- **Avoid `EXIT` / `CHECK` in the middle of long loops**; extract instead.
- **No silent `CONTINUE`** — the reason for skipping must be self-evident, or else commented.

## Conditions and IFs

- **Prefer positive conditions**. `IF lv_is_ready` beats `IF NOT lv_is_not_ready`.
- **Prefer `IS NOT` to `NOT IS`**. Write `IF lv_x IS NOT INITIAL`, not `IF NOT lv_x IS INITIAL`.
- **No empty `IF` branches** — where a branch has no body, either invert the condition or drop the branch.
- **Decompose complex conditions** — give each sub-condition its own well-named `lv_is_*` boolean, then combine those. A long `IF ... AND ... OR ...` chain cannot be read.
- **Predicative method calls** where the method already returns a boolean — `IF is_released( lo_order )` rather than `IF is_released( lo_order ) = abap_true`.

## Internal Tables

- **Pick the right table type by access pattern**:
  - `HASHED TABLE WITH UNIQUE KEY` — single-value lookups, ≥ a few thousand rows
  - `SORTED TABLE WITH NON-UNIQUE KEY` — range reads / ordered iteration
  - `STANDARD TABLE` — sequential processing only, no random access
- **Avoid `DEFAULT KEY`** — it is implicit and inefficient. State the key explicitly or switch to a sorted/hashed type.
- **Prefer `INSERT INTO TABLE`** over `APPEND TO` for a sorted or hashed table. `APPEND` against a sorted table errors at runtime; against a hashed table it is rejected.
- **Prefer `LINE_EXISTS( )`** where the only goal is detecting presence, rather than `READ TABLE ... TRANSPORTING NO FIELDS` or a `LOOP AT ... ENDLOOP`.
- **Prefer `READ TABLE ... WITH KEY` + `ASSIGNING <fs>`** to `INTO ls_` whenever the row is only being inspected.
- **Prefer `LOOP AT lt WHERE ...`** over a `LOOP AT` with an inner `IF` filter — where it can, SAP evaluates the `WHERE` using the key.
- **Secondary keys** — covered by the large-table rule under `## Open SQL` below.

## Strings

- **Use backticks** `` `literal` `` rather than single quotes `'literal'` for string literals. A single-quoted literal yields a fixed-length `C` type whose trailing spaces are trimmed without warning; backticks yield proper `STRING` values.
- **Use string templates** `|text { lv_var } more|` when assembling text. Steer clear of `CONCATENATE lv_a lv_b INTO lv_s` chains — the template is shorter and keeps formatting explicit (`|{ lv_amount NUMBER = USER }|`).
- **One translatable literal per text element** — see [`text-element-rule.md`](text-element-rule.md). Where the string is user-visible, never bury an only-literal text inside a template.
- **Uppercase an externally supplied code value before storing or comparing it** — `TRANSLATE lv_code TO UPPER CASE`. ABAP does not uppercase on assignment into a CHAR field, so a lowercase code arriving from a spreadsheet, a CSV, or an interface is stored exactly as it came. Where the field has a fixed-value list the error surfaces; where it has none, the lowercase value passes silently and every later query filtering on the uppercase form drops those rows without a warning. Apply this to **code fields only** — names, company names, and free text are corrupted by it. (Field-verified in real project work, 2026-08.)

## Booleans

- **Type**: boolean variables are declared `ABAP_BOOL`, not `CHAR1` / `C(1)`.
- **Compare against** `abap_true` / `abap_false` / `abap_undefined`; `'X'` / `' '` / `''` are never the comparison values.
- **Set** with `XSDBOOL( condition )` in place of `IF ... lv_b = abap_true. ELSE. lv_b = abap_false. ENDIF.`
- **Prefer enumeration types** (`ENUM STRUCTURE` or constants cluster) once the concept carries more than two states — "is_released" + "is_blocked" + "is_draft" belongs in one status enum, not three booleans.

## Expressions and Constructors (ABAP 740+)

- **Prefer `NEW`** to `CREATE OBJECT`.
- **Prefer `VALUE #( ... )`** and `CORRESPONDING #( ... )` in place of `MOVE-CORRESPONDING` or explicit field-by-field copies.
- **Use `COND #( ... )` / `SWITCH #( ... )`** where a temp-variable IF tree would otherwise appear.
- **Use `REDUCE`/`FOR` table-expressions** on small transformations; when the logic turns complex, fall back to `LOOP`.
- **Table expressions `table[ key = ... ]`** in place of `READ TABLE ... INTO`. Catch `CX_SY_ITAB_LINE_NOT_FOUND`.

## Exception / Error Handling (paradigm-neutral part)

- **Always act on errors** — handle what you are able to handle, pass on what you are not. Swallowing one silently is never acceptable.
- **Preserve the cause** — always carry the original exception or `sy-subrc` value into the escalated error.
- **Never swallow runtime exceptions** (`CX_SY_*`) except where the recovery path is both explicit and documented.
- Paradigm-specific details:
  - OOP: class-based exceptions, `RAISE EXCEPTION NEW`, `CX_STATIC_CHECK` vs `CX_NO_CHECK` vs `CX_DYNAMIC_CHECK` — see [`clean-code-oop.md`](clean-code-oop.md) § Error Handling.
  - Procedural: `sy-subrc` check after each statement, `EXCEPTIONS` clause on `CALL FUNCTION`, `MESSAGE ... RAISING` for FM errors — see [`clean-code-procedural.md`](clean-code-procedural.md) § Error Handling.

## Reconciliation Logic — Null vs Zero

In verification / reconciliation logic an absent value must never be read as `0` — do that and a lookup that failed or came back empty masquerades as "difference = 0, match ✓", because two empty totals compare `0 = 0` and the check passes on nothing. Where the underlying rows are empty, emit no totals at all — block the zero assertion instead of letting it read as a match. Null cannot travel through RFC `TABLES` parameters (a value that was never computed arrives as `0.00` — see [`function-module-rule.md`](function-module-rule.md)), so put a normalization hook on the caller side that maps "no rows / not computed" to null ahead of any comparison.

## Currency Amounts — CURR Internal Unit ≠ Display Unit (TCURX)

Where a currency is registered in `TCURX` with `CURRDEC = 0` (KRW, JPY, …), **the database value of a CURR field is the display value ÷ `10 ** (2 − CURRDEC)`** — 1/100 in the KRW case. SAP performs that conversion on its own between screen and DB, so nothing ever errors; three failure modes follow from it, and none is visible on screen, because the UI converts back on render:

- **Never compare a CURR value against a threshold / master-data parameter registered in display units** (tax minimums, bracket boundaries, truncation units) — apply the factor to the *parameter*, and never scale the amount up and back instead (rounding loss). The standard FI pattern reads `CURRENCY_CONVERTING_FACTOR` over `TCURX-CURRDEC`, with factor 1 for currencies not listed there.
- **Never assign an externally-sourced amount (Excel / CSV / interface string) into a CURR field without the conversion** — what lands is 100× inflated, with no dump and no error. A screen ALV path whose fcat carries a `cfieldname` converts automatically; a file-parsing path has no such protection.
- Neither case survives an eyeball check — verify at DB level (raw value), not on screen. (Field-verified in real project work, 2026-07: a threshold misjudged to 0 tax and a 100× stored upload, both caught only by direct DB reads.)

## Arithmetic and Initial Values

**Integer division with `/` rounds; `DIV` truncates.** `( lv_month - 1 ) / 3 + 1` returns 2 for March, because `2 / 3` rounds up to 1 — a quarter calculation that is wrong for a third of the year and raises nothing at all. Where truncation is what is meant, write `DIV`. (Found in real project work, 2026-08.)

**A `NUMC` or `DATS` operand cannot be compared directly against an arithmetic expression** — the statement is rejected with `An arithmetic expression cannot be compared with the non-numeric operand`. Move the value into a `TYPE i` local first.

**Never encode a verdict in a type whose initial value is also a valid value.** Two instances of this recur:

- `SYMSGNO` is `NUMC(3)`, so `'000'` *is* its initial value. Use it as a "rejected" marker and `IS INITIAL` reads true at the caller, which then takes the rejection for a pass. Carry the verdict in a separate boolean and let the message number stay a message number.
- A `DATS` field has **two** empty representations, and which one arrives depends on the calling path: the initial value is `'00000000'`, but a character copy of a blank source lands as eight spaces, and `IS INITIAL` does not catch those. Guard both — `IF <dats> IS INITIAL OR <dats> CO ' 0'.`

Both were paid for in real project work (2026-08). The first was caught by a unit test; the second was not, and a blank date reached the ledger through the very guard that existed to reject it.

## Fixed-Width File Serialization — Keep `DATS` Out of the Record Structure

**A structure whose fields are serialized into a fixed-width record carries dates as `NUMC(8)`, never as `DATS`.** Serialization normally reads the value through a string template, and a string template formats a date by the environment's date settings (`2026-07-10`) rather than as the eight digits the layout expects. The field then has the wrong width, every field behind it shifts, and there is neither a syntax error nor a dump — the file is simply rejected downstream.

Keep the two structures apart: the persisted structure types the field `DATS`, the serialization structure types it `NUMC(8)`, and `MOVE-CORRESPONDING` does the conversion component by component. Verify by reading the produced bytes back and confirming the field reads `20260710`. Note as well that ABAP offsets count **characters** while a record layout counts **bytes**, so a field holding multi-byte text has to be measured in bytes before it is placed. (Field-verified in real project work, 2026-08.)


## Open SQL

- **No `SELECT *`**. Always list the fields you actually need. An exception is made for the `GetTable` schema probe, never for a business read.
- **A standard master's own name field is not the text source** — the description lives in a language-dependent text table, so read that instead: [`alv-rules.md`](alv-rules.md#master-data-texts-live-in-a-language-dependent-text-table) § *Master-Data Texts*.
- **Prefer explicit typed internal tables over inline `INTO TABLE @DATA(...)` declarations in SELECT** — put the row `TYPES` and the table variable at the top of the local FORM / method, then select `INTO CORRESPONDING FIELDS OF TABLE @<var>` (or `APPENDING CORRESPONDING FIELDS OF TABLE @<var>` where several SELECTs accumulate). Rationale: the typed structure gets reused across the FORM/method, the DDIC alignment is spelled out, the itab's field catalog stays traceable for SALV and for QA review, and `APPENDING` lets multi-SELECT accumulation flow cleanly without a throwaway inline table allocated each round. Inline `INTO TABLE @DATA(...)` is acceptable **only** in one-shot local helpers — a lookup helper with a single SELECT whose result neither leaves the method nor feeds another SELECT.
- **Secondary keys on internal tables that receive large-table SELECT results** — declare a `SECONDARY KEY` on the itab when the SELECT source is a transactional / high-volume table (VBRK, VBAP, BKPF, BSEG, EKKO, EKPO, ACDOCA, MATDOC, LIPS, MKPF, MSEG, etc.) AND the internal table it fills is subsequently accessed by `READ TABLE` / `LOOP ... WHERE` on a non-primary-key column. Pattern:
  ```abap
  DATA: lt_vbap TYPE SORTED TABLE OF ty_vbap_row
                WITH NON-UNIQUE KEY vbeln
                WITH NON-UNIQUE SORTED KEY k_matnr COMPONENTS matnr.
  " ...
  READ TABLE lt_vbap WITH KEY k_matnr COMPONENTS matnr = lv_mat
                     ASSIGNING <ls_vbap>.
  LOOP AT lt_vbap USING KEY k_matnr WHERE matnr = lv_mat ...
  ```
  Access pattern decides `SORTED` vs `HASHED` (range → SORTED; equality-only → HASHED). Small config/master itabs must NOT get secondary keys as a blanket measure — they add memory overhead and pay off only where the lookup hotspot is measurable. This rule does NOT extend to small tables (T001, T001W, KNA1/LFA1 cached singletons, SPRO config tables). Where the itab size is borderline (< 100k but frequently accessed), note the rationale in a one-line comment beside the secondary key declaration.
- **Use CDS views** for any reusable read logic (ABAP 750+). The module-standard views sit in `configs/{MODULE}/`.
- **Never `SELECT` inside a `LOOP`** — `FOR ALL ENTRIES IN` or a join takes its place.
- **`FOR ALL ENTRIES` accepts neither `GROUP BY` nor an aggregate function** — ABAP SQL rejects the combination outright. Read the raw rows and fold them in ABAP.
- **Always check `sy-subrc`**, or catch the class-based equivalent (`CX_SY_OPEN_SQL_DB`).
- **Filter and aggregate server-side**. Post-filtering via `LOOP ... WHERE ... DELETE` is out.
- **Large transactional tables — mandatory pre-count**: ahead of a SELECT on a transactional table (VBRK, VBAP, BKPF, BSEG, EKKO, EKPO, ACDOCA, MATDOC, LIPS, MKPF, MSEG, WBCROSSGT and equivalents), size the result set first by running `SELECT COUNT(*) FROM <table> WHERE <same predicate>`. Should that count come out above **1,000,000 rows**, the main SELECT does NOT run as-is — at least one of the following tuning measures comes first:
  - re-count after tightening the `WHERE` predicate (add mandatory date/org unit filter)
  - check that an index covers the predicate (`DB02` / `ST05` during development, or the table's secondary index list via `GetTable`)
  - move to **package iteration**: `SELECT ... PACKAGE SIZE n` with chunked processing, or `OPEN CURSOR` + `FETCH NEXT CURSOR`
  - spread the work over independent key ranges with `aRFC` / `bgRFC`
  - push filtering/aggregation down into a CDS view carrying the matching annotations (`@Analytics`, `@ClientHandling`, buffer hints), so only aggregates hit the ABAP layer
  - drop row-level extraction in favour of aggregated output (SUM / GROUP BY)

  The count and the tuning measure chosen go into `spec.md` / `plan.md` when Phase 2 detects the risk, and into the Phase 6 review notes once confirmed.
- **Blocked tables**: consult [`data-extraction-policy.md`](../../../policies/data-protection/data-extraction-policy.md) and [`table_exception.md`](../../../policies/data-protection/table_exception.md) before any `GetTableContents` / `GetSqlQuery`.

## Modularization (paradigm-neutral part)

- **One unit does one thing.** Method, FORM, or function module alike, it should carry a single purpose, and the name should capture that purpose.
- **Length limit** — the default ceiling is roughly 30 lines; extract once it outgrows that.
- **Parameter count** — target ≤ 3 inputs. Beyond that, hand over a structure.
- **`EXPORTING` parameters are passed by reference.** Where the caller hands the *same* variable to an input and to an output parameter, the `CLEAR e_*` on the routine's first line wipes the input along with it, and everything after that computes from an empty value. Build the result in a local and assign it to the exporting parameter only at the end. (Field-verified in real project work, 2026-08 — an entire smoke run failed on this one line.)
- **Respect include structure**: [`include-structure.md`](include-structure.md) lays it out.
- Paradigm-specific guidance:
  - OOP methods / classes / constructors — see [`clean-code-oop.md`](clean-code-oop.md) § Methods and § OOP.
  - Procedural FORM / PERFORM / FM — see [`clean-code-procedural.md`](clean-code-procedural.md) § Modularization and [`procedural-form-naming.md`](procedural-form-naming.md).

## Editing Existing Code — Two Silent Traps

**The statement before `ENDFORM` / `ENDMETHOD` is not necessarily reached.** A routine that returns early and keeps the remains of an older implementation behind that `RETURN` will happily accept new code appended at the bottom — code that never runs, and that passes both the syntax check and activation. Locate the `RETURN` statements inside the routine before choosing where to insert. (Field-verified in real project work, 2026-08: an edit landed in a dead tail and surfaced only when the screen was exercised by hand.)

**Renaming a component of a shared structure or type is one write, and its consumers need a check of their own.** The two halves fail in opposite ways:

- Patch the *definition* alone and the write is refused — `The data object "<X>" does not have a component called "<OLD>"`. That is the safe half; send the definition and every use site together.
- Activating the class does **not** re-check the programs that consume it. They keep the old name, stay marked active, never show up in `GetInactiveObjects`, and fail as a `SYNTAX_ERROR` short dump the first time someone opens the screen — possibly days later. After a rename, sweep for the old name with `GrepPackages` and run `CheckSyntax` on each consumer.


## Text and User Interaction

- **All user-visible text via Text Elements**. [`text-element-rule.md`](text-element-rule.md) governs.
- **No hardcoded language literals** in logic — text symbols (`TEXT-001`), message classes (`MESSAGE e001(z_msg)`), or OTR instead.
- **ALV output follows** [`alv-rules.md`](alv-rules.md) for field catalog, events, and layout.

## Comments

- **Default: no comments.** Clean naming and short methods do the explaining.
- **Write a comment only for the WHY** — a hidden invariant, a workaround for a specific SAP Note, a constraint handed down by a domain expert. Never the WHAT.
- **No comment banners, author tags, or change logs.** The audit trail is Git/Transport.
- **Inside a class definition use `"` comments, never a `*` block.** ADT refuses the write itself — `The class contains unknown comments which can't be stored`. Block comments inside a method implementation (`METHOD` ... `ENDMETHOD`) are accepted. The refusal leaves the server source untouched, so re-sending with the comment style changed is all that is required.
- **Delete commented-out code** — it does not get checked in.

## Testing (paradigm-neutral principles)

- **Non-trivial logic has tests** — every calculation, every branching decision, every integration edge.
- **Test the public contract**, not the private internals.
- **One concept per test** where that is practical, under a descriptive name: `is_released_returns_true_when_status_is_X`.
- **Each commit's tests pass** — run `RunUnitTest` via MCP before release.
- Paradigm-specific test patterns:
  - OOP — ABAP Unit `LOCAL CLASS ... FOR TESTING`, `CL_ABAP_TESTDOUBLE`, `LOCAL FRIENDS` only for constructor access — see [`clean-code-oop.md`](clean-code-oop.md) § Testing.
  - Procedural — FORM testing limits (hard to mock globals); recommend extracting testable logic into a helper class tested separately — see [`clean-code-procedural.md`](clean-code-procedural.md) § Testing.

## Performance

- **Measure, don't guess**. The instruments are `RuntimeRunClassWithProfiling` / `RuntimeAnalyzeProfilerTrace`.
- **Server-side work beats client-side**. Filter, aggregate, and sort in Open SQL or CDS, and bring back only what you need.
- **Avoid nested SELECTs / nested loops over large itabs**. `FOR ALL ENTRIES`, joins, or hashed lookups replace them.
- **Parallelization**: `aRFC` / `bgRFC` for independent chunks where the operation supports it.
- **Avoid buffer-busting patterns** — reach for `SELECT ... BYPASSING BUFFER` only as a last resort.

## Security and Data Handling

- **Authorization checks at every entry point** (`AUTHORITY-CHECK` ahead of any read/write of restricted data).
- **No SQL injection**: user input is never concatenated into `EXEC SQL` or a dynamic `WHERE`. Use parameter markers.
- **Mask/skip PII in logs, dumps, and error messages.** The PII categories are listed in `exceptions/*.md`.
- **Data extraction rules are hard rules** — see [`data-extraction-policy.md`](../../../policies/data-protection/data-extraction-policy.md). `acknowledge_risk` requires an explicit user affirmative (`yes` / `authorize` / `approve` / `proceed` / `confirmed`). Never auto-set.

## Version Awareness

- Every generated code snippet passes the gate of the configured `SAP_VERSION` (`S4` vs `ECC`) and `ABAP_RELEASE`. Check [`sap-version-reference.md`](sap-version-reference.md) and [`abap-release-reference.md`](abap-release-reference.md).
- On S/4HANA: Business Partner (BP) instead of `XD01`/`XK01`; `ACDOCA` / `MATDOC` / CDS views instead of the classic cluster tables.
- Verify the minimum release before proposing a feature (inline decl, RAP, CDS behavior def, Open SQL expressions).

## Review Checklist (agent self-check before handing off)

1. Every name passes [`naming-conventions.md`](naming-conventions.md).
2. No `SELECT *`; no hardcoded magic literals.
3. Methods stay short, hold one responsibility, take ≤ 3 params.
4. Every exception either reaches a handler that does something, or is rethrown.
5. Text Elements are used; output carries no language literals.
6. `RunUnitTest` and `CheckSyntax` both green; `GetInactiveObjects` empty.
7. Syntax matches the configured `ABAP_RELEASE`.
8. Blocklist / `acknowledge_risk` rules respected in any `GetTableContents` / `GetSqlQuery` invocation.
