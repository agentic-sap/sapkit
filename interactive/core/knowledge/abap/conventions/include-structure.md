# Include Structure Convention

sapkit ABAP programs share one layout: a Main Program plus conditional Includes that carry the logic. **For Procedural programs the source of truth is [`procedural-sample/main-program.abap`](../templates/procedural-sample/main-program.abap)**. Programs written OOP take their pattern from [`oop-sample/zsapkit_oop_ex.prog.abap`](../templates/oop-sample/zsapkit_oop_ex.prog.abap).

## Include Set

| Include | Suffix | Procedural | OOP | Content |
|---------|--------|------------|-----|---------|
| TOP | `{PROG}t` | Always | Always | `TYPES`, `DATA`, `CONSTANTS` declarations. **MUST declare `DATA: gv_okcode TYPE sy-ucomm.`** when a screen is present — full 3-step binding contract (TOP decl + screen OK_CODE NAME + PAI FORM routing) in [`ok-code-pattern.md`](ok-code-pattern.md); `CASE sy-ucomm` in PAI is a MAJOR Phase 6 finding. |
| Selection Screen | `{PROG}s` | Always | Always | `SELECTION-SCREEN`, `PARAMETERS`, `SELECT-OPTIONS` |
| FORM / Logic | `{PROG}f` | Always | Optional | `PERFORM` business logic |
| Class Definition | `{PROG}c` | **NEVER** | OOP | `LCL_DATA` — data extraction class |
| ALV Class | `{PROG}a` | **NEVER** | ALV present | `LCL_ALV` — screen/ALV display class |
| PBO | `{PROG}o` | Screen/GUI present | Screen/GUI present | Screen PBO modules (`MODULE status_0100 OUTPUT.`) |
| PAI | `{PROG}i` | Screen/GUI present | Screen/GUI present | Screen PAI modules (`MODULE user_command_0100 INPUT.`) |
| Event Handler | `{PROG}e` | **FORBIDDEN** | OOP + ALV events | ALV event handler class (`LCL_EVENT`). **In Procedural mode this include MUST NOT be created** — event blocks (`INITIALIZATION`, `AT SELECTION-SCREEN`, `AT SELECTION-SCREEN OUTPUT`, `START-OF-SELECTION`, `END-OF-SELECTION`) live in the Main program body, never in an include. |
| Test Class | `{PROG}_tst` | Optional | OOP (required) | `FOR TESTING` local test classes |

## Main Program Body

Only the following belong in the main program:
- `REPORT` statement
- **6-field header comment block** (mandatory — see [`clean-code-procedural.md`](clean-code-procedural.md) § *Mandatory Main Program Header*)
- `INCLUDE` statements (Procedural order: t → s → c → a → o → i → f → _tst; `e` is NEVER in Procedural order)
- Event blocks: `INITIALIZATION`, `AT SELECTION-SCREEN`, `AT SELECTION-SCREEN OUTPUT`, `AT SELECTION-SCREEN OUTPUT FOR FIELD <p>`, `START-OF-SELECTION`, `END-OF-SELECTION`

All declarations and business logic belong in the includes, not in the main program. An event block's job is to delegate to a FORM: `START-OF-SELECTION. PERFORM get_data_0100.`

## Conditional Generation Rule

- **Procedural, no Screen, no ALV**: `t` / `s` / `f` and nothing else.
- **Procedural, with Screen + ALV**: `t` / `s` / `a` / `o` / `i` / `f` (6 — `c` may be left out when no local classes are used). **Never add `e`.**
- **OOP, with Screen + ALV**: `t` / `s` / `c` / `a` / `o` / `i` / `e` / `f` / `_tst` (`e` appears only for `LCL_EVENT` — the ALV event handler class).

## Activation Protocol — MANDATORY (matches every skill that creates includes)

**The reach of `UpdateProgram(activate=true)` stops at the main program; activation does NOT cascade down to sub-includes.** Any skill that produces a main program + N includes MUST:

1. Create every include with `CreateInclude` and upload its body with `UpdateInclude`.
2. Once all includes are uploaded, do either of the following:
   - `UpdateInclude` with `activate=true` on each include **in dependency order** — usually `t → s → a → o → i → f`, since a later include references declarations made in an earlier one — OR
   - a single `ActivateObjects` call carrying the whole list `[main + every include + screen + gui_status]`.
3. **Verify with `GetInactiveObjects`** — a program-scoped include showing up in that result means the skill has FAILED, whatever the individual tool responses reported.

An agent that claims "5/5 프로그램 활성화 OK" without running the `GetInactiveObjects=0` check is emitting **false positives**, and that is a MAJOR finding in Phase 6 review.

## Anti-patterns (each is a MAJOR Phase 6 finding)

- **`{PROG}e` include exists in a Procedural program** — the event blocks were pulled out of the Main body and parked in the `e` include. The structure is invalid and it hides control flow.
- **Event blocks (`START-OF-SELECTION` / `END-OF-SELECTION` / `AT SELECTION-SCREEN`) placed in `f` or `e` include instead of Main** — control flow gets hidden the same way.
- **Main program missing the 6-field header comment block** — a violation of `clean-code-procedural.md` § *Mandatory Main Program Header*.
- **Includes left inactive after "successful" build** — any `{PROG}<suffix>` entry comes back from `GetInactiveObjects`.
- **`c` / `a` include missing when spec declares local classes or ALV** — skipped without a word.
- **Inferring suffix meaning from the suffix list in `naming-conventions.md` alone** — enumerating suffixes is all that file does. The conditions attached to them (OOP vs Procedural, ALV vs none) live **here** and in the sample files. Cross-check this table + the sample every time before generating.
