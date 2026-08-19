# Clean ABAP — OOP Paradigm

The Clean ABAP rules that apply specifically to the **OOP paradigm** — local classes (`LCL_DATA` / `LCL_ALV`) held inside a REPORT, global classes, interfaces, exception classes, and ABAP Unit with test doubles. Load it when the Phase 1B interview settles `paradigm = OOP` — and NOT when that answer comes out `Procedural`. The paradigm-neutral baseline that both paradigms share sits in its companion, [`clean-code.md`](clean-code.md). Every rule below remains gated by `abap-release-reference.md`.

> The sc4sap OOP pattern file [`oop-pattern.md`](oop-pattern.md) is this file's partner: the split into two classes (LCL_DATA + LCL_ALV / LCL_SCREEN) is settled there, and the coding style that fills those class bodies is settled here.

## Mandatory Main Program Template (MUST match)

The main `REPORT` source of an OOP program is not written from a blank page: the executor MUST take the canonical sample as its starting point and stay conformant to it.

**Source of truth**: [`oop-sample/zsapkit_oop_ex.prog.abap`](../templates/oop-sample/zsapkit_oop_ex.prog.abap) (companion includes: `zsapkit_oop_exa/exc/exe/exf/exi/exo/exs/ext/ex_tst.prog.abap`, screens `zsapkit_oop_ex.prog.screen_0100.abap` / `_0200.abap`).

- **Do**: take the skeleton over — the REPORT statement, the INCLUDE order, the INITIALIZATION / AT SELECTION-SCREEN / START-OF-SELECTION / END-OF-SELECTION blocks, and the class bootstrap pattern `go_data = NEW #( ).` / `go_alv = NEW #( ).` — and adapt the identifiers afterwards (`zsapkit_oop_ex` becomes the actual program name, while the include suffix letters stay as they are).
- **Do not**: reorder the event blocks; drop the two-class bootstrap; move logic into the events themselves (every piece of logic belongs in a class method); swap Docking + Full ALV for a Custom Control; or bring in some other include-suffix convention.
- **Deviation requires written justification in `spec.md`**, recorded before the executor runs Phase 4. Structural drift away from the template that nobody documented is raised as a MAJOR finding in the Phase 6 review.

## OOP-Specific Error Handling

- **Class-based exceptions only** (`CX_*`). Dropping a `MESSAGE ... TYPE 'E'` into the middle of the flow is no substitute for raising one.
- **Own project super class** — `ZCX_{MODULE}_ERROR` is the base you create, and specific situations become sub-classes of it. What callers catch is the base; they filter only where the distinction matters to them.
- **Choose the right base**:
  - `CX_STATIC_CHECK` — the caller is meant to deal with it, which covers most business errors; the compiler holds you to declaring it.
  - `CX_DYNAMIC_CHECK` — validating the input would have avoided it (conversion errors, for instance), so the caller can either catch it or head it off.
  - `CX_NO_CHECK` — nothing the caller does can recover from it; this is where assertions and programming errors go.
- **Prefer `RAISE EXCEPTION NEW zcx_x( ... )`** over `RAISE EXCEPTION TYPE zcx_x EXPORTING ...`.
- **Preserve the stack** — when you wrap, hand the original along as `PREVIOUS = lx_prev`.
- **Wrap foreign exceptions** — a `CX_SY_*` must never surface through a public API. Catch it, wrap it in your own `ZCX_*`, and rethrow.

## OOP-Specific Modularization

- **Method length** stays below roughly 30 lines; what you compose out of is the class, not the file.
- **Parameter count** stops at 3 IMPORTING; anything past that becomes a DDIC structure or a second method.
- **No output parameters masquerading as input** — reach for `CHANGING` only when you mean it; functional methods use `RETURNING`, and `EXPORTING` is left for the case where more than one value genuinely has to come back.
- **Functional methods return one value, no side effects.** A method that does have side effects returns nothing.
- **OOP two-class split** (sc4sap convention) — business logic and BAPI I/O sit in `LCL_DATA`, presentation in `LCL_ALV` or `LCL_SCREEN`. See [`oop-pattern.md`](oop-pattern.md).

## Object Orientation — Scope and Design

- **Prefer objects to static classes**. A static class invites hidden global state; an instance puts its dependencies out in the open.
- **Prefer composition to inheritance**. Inheriting ties the child to how the parent is laid out, whereas composing lets a collaborator arrive through the constructor or a setter.
- **Don't mix stateful and stateless** inside one class. A stateless service — pure computation — gets a class of its own, separate from the stateful aggregate.
- **FINAL by default**. A class is marked `FINAL` unless it was explicitly designed to be a base for inheritance.
- **PRIVATE by default**. Members start PRIVATE and move out to PROTECTED or PUBLIC only against a need you can demonstrate.
- **READ-ONLY sparingly**. Making an attribute public `READ-ONLY` puts state on display; a getter method returning a computed value is the better answer.
- **Immutable over getter** where the value cannot change after construction — there, public `READ-ONLY` on the constructor-assigned attribute is cleaner than a trivial getter.
- **Instance over static methods** — statics are awkward to mock and bake in a design that resists evolution.
- **Public instance methods should be part of an interface**. Have classes implement interfaces, and have callers depend on those interfaces rather than on the concrete class.

## Constructors

- **Prefer `NEW #( ... )`** over `CREATE OBJECT lo_x EXPORTING ...`.
- **Global `CREATE PRIVATE` classes still have a public CONSTRUCTOR** — restricting instantiation does not change the constructor's PUBLIC visibility, so gate creation through static factory methods.
- **Multiple static creation methods over optional parameters**. Two named entry points, `zcl_order=>create_from_vbeln( )` and `zcl_order=>create_from_posnr( )`, read more clearly than one constructor carrying `OPTIONAL` parameters and the branching logic that comes with them.
- **Descriptive creation method names** — `build_`, `from_`, `copy_of_`. `create_1` and `create_2` are never acceptable.
- **Singletons only when multiple instances are genuinely impossible** — most of the time, wanting a singleton signals a missing factory or dependency-injection point.

## Methods — Parameters and Calls

- **Aim for fewer than 3 IMPORTING parameters**. Past that point, hand over a structure or split the method in two.
- **No `OPTIONAL` parameter just to shorten signatures** — make it two methods with names that say which is which.
- **Prefer `RETURNING` to `EXPORTING`**. RETURNING is what makes functional-style calls such as `lv_x = get_x( )` possible, and table expressions along with them.
- **Return or export exactly one value**. Three things exported means three things done.
- **Use `CHANGING` sparingly** — it blurs import against export. Keep it for the cases where the parameter's identity is the point, such as mutating an internal table that already exists.
- **No boolean input parameter** — what is written as `process( iv_force = abap_true )` wants to be a separate `force_process( )` method. A boolean input is almost always two methods hidden inside one.
- **RETURNING large tables is fine** — do not optimize in advance against the misconception that RETURNING copies the entire table; internally, ABAP works on large tables by reference.
- **Call style — omit noise**:
  - Leave out `RECEIVING` — write `lv_x = f( )` rather than `CALL METHOD f RECEIVING x = lv_x`.
  - Leave out the `EXPORTING` keyword where it is the only kind of parameter in the call.
  - Leave out the parameter name when the call takes only one — `f( lv_a )`, not `f( iv_a = lv_a )`.
  - Leave out `me->` when the instance member being called belongs to the current object.
- **Consider calling the `RETURNING` parameter `RESULT`** where neutrality helps — generic utility classes above all.

## Method Body

- **One responsibility per method, carried out well and carried out alone.** The method's name should say everything the method does.
- **Stay one level of abstraction below the name.** The body works one level down from what the name announces; when it starts jumping levels — high-level workflow sitting beside low-level SQL — extract.
- **Keep methods small** — roughly 30 lines is the default ceiling. A method that grows past it has taken on more than one thing.
- **Focus on the happy path OR error handling, not both.** The outer method deals with the errors; the happy path is extracted into another one.

## Error Handling — Detail

- **Exceptions are for errors, not for ordinary control flow.** An optional lookup that finds nothing is not an exception; a required foreign key whose row is missing is.
- **Class-based exceptions only** (`CX_*`). An inline message-and-exit aborts the flow — it does not handle the error.
- **Own super class** — build a project-local base exception, `ZCX_SD_ERROR` for example, and derive sub-classes from it for specific situations. The base class is what you catch at the boundaries of a workflow.
- **Throw one type per method**, with sub-classes carrying the distinction — callers catch the base class and filter further only where they actually care.
- **Choose the right base**:
  - `CX_STATIC_CHECK` — the caller is meant to deal with it, which covers most business errors; the compiler holds you to declaring it.
  - `CX_DYNAMIC_CHECK` — validating the input would have avoided it (conversion errors, for instance), so the caller can either catch it or head it off.
  - `CX_NO_CHECK` — nothing the caller does can recover from it; this is where assertions and programming errors go.
- **Prefer `RAISE EXCEPTION NEW zcx_x( ... )`** over `RAISE EXCEPTION TYPE zcx_x EXPORTING ...`.
- **Preserve the stack** — pass the original on as `PREVIOUS = lx_prev` while wrapping.
- **Wrap foreign exceptions** — no `CX_SY_*` may pass out through a public API. Catch it, wrap it into your own `ZCX_*`, and rethrow.
- **Don't swallow** — that is, a `CATCH ... ENDCATCH` with nothing in between. Where ignoring really is the right call, leave a one-line comment giving the reason.

## Formatting

- **Be consistent within a project** — the style already in the code wins over whatever you learned last.
- **Optimize for reading**, not for writing: code gets read 10× as often as it gets written.
- **Use the project's Pretty Printer / ABAP Formatter settings** — the ones configured in `.abap_formatter` where that file is present.
- **One statement per line** — no `.` chains packed onto a single line.
- **Reasonable line length** — wrap somewhere around 120 characters. Avoid horizontal scrolling.
- **Blank lines separate thoughts** — one blank line between groups of related statements, and no padding around every single statement.
- **Align assignments to the same target**, while leaving assignments to different targets unaligned:
  ```abap
  " Yes:
  ls_order-vbeln = lv_vbeln.
  ls_order-posnr = lv_posnr.
  ls_order-matnr = lv_matnr.
  ```
- **Close brackets at line end** — the ` ... )` finishes the line rather than standing on one of its own.
- **Parameter line breaks** — where a call will not fit on one line, indent the parameters under the method name:
  ```abap
  lo_service->process(
    iv_order = lv_vbeln
    iv_item  = lv_posnr
    iv_plant = lv_werks ).
  ```
- **Indent inline declarations** as if they were ordinary parameters — `DATA(lv_x)` lines up with the rest.
- **Don't align `TYPE` clauses** across DATA statements that have nothing to do with each other; the day one row's type grows, the alignment turns into maintenance friction.
- **No assignment chaining** — `lv_a = lv_b = 0.` is compact, but it costs you when reading and debugging.

## Testing — Detail

- **Test publics, not private internals**. Private members are implementation, and refactoring them must not break the tests.
- **Don't obsess about coverage** — 100% line coverage and meaningless asserts can perfectly well coexist. Prefer tests aimed at the critical paths.
- **Name tests for given-when-then** — `is_released_returns_true_when_status_is_freigegeben`, never `test01` or `test_ok`.
- **One `when` per test method** — a single action and the single set of assertions that follows it.
- **Don't add `TEARDOWN`** where nothing genuinely needs it; `SETUP` already gives each method fresh state as a rule.
- **Code Under Test naming** — the local reference to the object being tested is named `cut`, and `cut` is the default when no better name presents itself.
- **Test against interfaces** — the instance the test creates is concrete, but the reference type is the interface.
- **Extract the call to CUT** into a helper method of its own (`when_called_with` / `act`), so the given/when/then structure reads like prose.
- **Dependency inversion + test doubles** — collaborators arrive through the constructor, and the test injects `CL_ABAP_TESTDOUBLE` instances. A unit test contains no `SELECT`.
- **`LOCAL FRIENDS`** exists here for test-constructor access and nothing else — never as a way for a test to reach into private methods.
- **No production hooks purely for testing** — a method that exists only so a test can poke it means the design needs reworking.
- **Assertions**:
  - Kept few and focused: 1–3 per method.
  - Matched to the type — `assert_equals` on values, `assert_bound` / `assert_not_bound` on references, `assert_true` on `ABAP_BOOL` and nothing else.
  - Aimed at content, the value that matters, rather than at quantity such as a bare counter check.
  - `CL_ABAP_UNIT_ASSERT=>fail( ... )` placed inside a `CATCH` block asserts that an expected exception really was thrown.
  - Unexpected exceptions get forwarded — do not blindly `CATCH cx_root` and `fail( )`; let the test framework surface the actual cause.

## Comments — Detail (beyond main file)

- **Before the statement, not after** — the block comment sits above the statement it explains; trailing `"…` comments describing what the line just did do not belong.
- **No manual versioning** — `" 2024-03-15 ABC: added field` is information for the transport description.
- **Use `" FIXME:` / `" TODO:` / `" XXX:`** together with your user ID for tracked in-code markers; ADT search picks them up.
- **No method signature / end-of-method comments** — `" method begin` and `" end of process_order` pollute the file.
- **No text-symbol duplication as comment** — the text element is itself the documentation.
- **ABAP Doc only for public APIs** — a private helper gets no ABAP Doc, because its name is the doc.
- **Prefer pragmas `##NEEDED` / `##NO_TEXT`** over the pseudo-comments `"#EC` wherever the release supports them.
