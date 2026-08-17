# OK_CODE Pattern for Procedural Screens

This is the governing rule for wiring screen user commands in a Procedural ABAP program that runs on classical Dynpro (`CALL SCREEN {num}`). There is no room to negotiate it — Phase 6 review enforces the pattern.

## Why — what goes wrong with `CASE sy-ucomm`

Every dialog step wipes `sy-ucomm` and fills it again, because it is a system field. In a simple, single-screen program, reading it during PAI holds up; the trouble starts the moment the program:

- brings up a popup dialog (a confirmation, an F4 help, a message-with-selection),
- moves from screen to screen (`CALL SCREEN 0100 STARTING AT …`),
- or fires an asynchronous control event (the ALV toolbar, drag/drop, an editable grid).

In each of those cases the popup runtime has already written its own function code into `sy-ucomm` by the time the outer CASE runs, so the original command is lost. Nothing flags the defect on the way out — a smoke test that stays on the single main screen passes, and the breakage surfaces on the first genuine popup flow.

The binding pattern set out below hands the PAI FORM its own local copy of the function code that the dynpro runtime filled in for this specific screen, taken BEFORE any popup / control event can reach `sy-ucomm`.

## The 3-step contract — ALL required when a screen is present

### Step 1 — Declare `gv_okcode` in the TOP include

```abap
" In {PROG}T
DATA: gv_okcode TYPE sy-ucomm.
```

- The name is fixed at `gv_okcode` — for consistency across the project, do not use `ok_code`, `lv_cmd`, `g_ucomm`, or the like.
- The type is `sy-ucomm`, which holds short function codes such as `BACK` / `SAVE` or a custom `ZXYZ`.
- One declaration, in the TOP include; it is never re-declared inside a FORM or a MODULE.

### Step 2 — Bind the screen's OK_CODE field to `GV_OKCODE`

An OK_CODE element on the screen is mandatory under classical Dynpro, and whatever **name** that element carries is the one the runtime fills before PAI fires.

**SE51 manual path**: Screen {num} → Element List → General attributes → **OK_CODE field** = `GV_OKCODE`.

**ADT / `UpdateScreen` (sc4sap MCP) path**: within the screen's `fields_to_containers[]`, the entry carrying `TYPE=OKCODE` MUST also carry `NAME=GV_OKCODE`. Leave that OKCODE field with the default placeholder (`TEXT=____________________`) and no NAME, and the code lands in `sy-ucomm` alone — which defeats the whole pattern.

A fragment of such an `UpdateScreen` payload:
```json
{
  "fields_to_containers": [
    {
      "CONT_TYPE": "SCREEN",
      "CONT_NAME": "SCREEN",
      "TYPE": "OKCODE",
      "NAME": "GV_OKCODE",
      "LENGTH": 20,
      "VISLENGTH": 20,
      "INPUT_FLD": "X"
    }
  ]
}
```

### Step 3 — Read `gv_okcode` in PAI, clear it, act on a local copy

```abap
" In {PROG}I — PAI include (thin dispatcher)
MODULE user_command_0100 INPUT.
  PERFORM user_command_0100.
ENDMODULE.

" In {PROG}F — FORM include (logic)
FORM user_command_0100.
  DATA lv_fcode TYPE sy-ucomm.
  lv_fcode = gv_okcode.
  CLEAR gv_okcode.             " prevent stale code re-firing on next PAI
  CASE lv_fcode.
    WHEN gc_fcode_back OR gc_fcode_exit OR gc_fcode_canc.
      PERFORM leave_0100.
    WHEN gc_fcode_save.
      PERFORM save_0100.
    WHEN OTHERS.
      " no-op — defensive; unknown codes silently ignored
  ENDCASE.
ENDFORM.
```

The FORM carries three rules, none of them open to negotiation:
1. **Take a copy of `gv_okcode` into a local `lv_fcode` before you branch.** Running the CASE on the local is what shields you from a popup changing the global mid-branch.
2. **Issue `CLEAR gv_okcode` right after the copy.** Without it, a redraw PAI that carries no fresh user action re-fires the same function code.
3. **Branch on CONSTANTS declared in TOP**, never on string literals. See [`constant-rule.md`](constant-rule.md). The usual set: `gc_fcode_back / _exit / _canc / _save / _refresh TYPE sy-ucomm VALUE 'BACK' / 'EXIT' / 'CANC' / 'SAVE' / 'REFRESH'.`

## Anti-patterns — each is a MAJOR Phase 6 finding

- **The PAI FORM reads `sy-ucomm` itself** — any `CASE sy-ucomm.` or `IF sy-ucomm = 'BACK'.` sitting inside a `user_command_xxxx` FORM. The fix is to route through `gv_okcode`.
- **A screen is present but TOP has no `gv_okcode`** — the screen then has nowhere to deposit its code. Popup flows break, yet SAP does NOT error at activation, so the defect travels all the way into production.
- **The screen's OK_CODE field carries no NAME** — the OKCODE field of the `UpdateScreen` payload holds only TYPE and placeholder TEXT, with no NAME attribute. It fails exactly the way a missing TOP declaration does.
- **More than one OK_CODE global** (`gv_okcode`, `ok_code` and `lv_cmd` living side by side in one program) — settle on `gv_okcode` and delete the rest.
- **A local copied from `sy-ucomm` rather than from `gv_okcode`** — on the simple path both hold the same value, but they diverge the moment the popup runtime steps in. It reads as correct in review and fails in production.

## Integration points

- `common/include-structure.md` TOP include row — makes the `DATA: gv_okcode TYPE sy-ucomm.` declaration mandatory whenever a screen is present; the "why + full contract + anti-pattern" companion to that row is this file.
- `common/clean-code-procedural.md` § PBO / PAI Module — points at this pattern as the source of truth for routing PAI user commands.
- `skills/create-program/phase4-parallel.md` Wave 4 — every screen with an OKCODE field MUST have `NAME=GV_OKCODE` set in its `UpdateScreen` payload. An OKCODE field left with no NAME is a MAJOR Phase 6 finding.
- `skills/create-program/phase6-review.md` §1 — the reviewer confirms all three steps of the contract: the TOP declaration is there, the screen's OKCODE field has NAME=`GV_OKCODE`, and the PAI FORM works from `gv_okcode` rather than `sy-ucomm`.

## Applicability

- **REQUIRED**: Procedural programs carrying one or more `CALL SCREEN {num}`.
- **N/A**: OOP programs that rely on RAP / BOPF / SALV popup alone (no classical Dynpro).
- **N/A**: reports that have nothing but a selection screen (no `CALL SCREEN` — commands entered there travel through `AT SELECTION-SCREEN` instead of a PAI MODULE).
- **Follows elsewhere**: where one program holds several classical screens (0100 plus a 0200 dialog, say), `gv_okcode` is declared once in TOP and reused on every screen — a per-screen `gv_okcode_0100` is NOT declared.
