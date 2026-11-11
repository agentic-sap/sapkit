# OOP Pattern — Two-Class Split

Every OOP-mode ABAP program in sapkit shares the convention set out below. Its canonical reference is [`common/oop-sample/zsapkit_oop_ex*`](../templates/oop-sample/), authored in-repo (판4); the pattern lineage traces back to the retired `zrsc4sap_oop_ex*` sample.

## Two-Class Split (Mandatory)

An OOP-mode program must divide its responsibilities between two local classes, with an event handler available as an optional third:

- **`LCL_DATA`** (in `{PROG}c`) — selection and extraction of data
  - Its methods: `CONSTRUCTOR`, `GET_DATA`
  - Keeps the resulting internal tables as private attributes
  - Stays clear of UI concerns

- **`LCL_ALV`** (in `{PROG}a`) — screen, ALV, and display
  - Its methods: `DISPLAY`, field catalog builders, button/menu handlers
  - Keeps the ALV grid / container references
  - Takes its data from the `LCL_DATA` instance

- **`LCL_EVENT`** (in `{PROG}e`) — an *optional* handler for ALV events
  - Covers `double_click`, `hotspot_click`, `user_command`, and the like

## Main Program Orchestration

```abap
INITIALIZATION.
  GO_DATA = NEW #( ).
  GO_ALV  = NEW #( ).
  LCL_EVENT_ALV=>REGISTER( ).   " only when the program has ALV events

START-OF-SELECTION.
  GO_DATA->GET_DATA( ).

END-OF-SELECTION.
  GO_ALV->DISPLAY( ).
```

The TOP include (`{PROG}t`) is where the global references `GO_DATA`, `GO_ALV`, and `GO_EVENT` get their declarations.

## ALV Requirement (Mandatory)

**Whenever a program needs ALV (grid, tree, SALV, or editable ALV), you MUST model it on the sample programs at [`common/oop-sample/`](../templates/oop-sample/).** Inventing a new ALV skeleton is not an option.

- **What the reference set holds**: `zsapkit_oop_ex.prog.abap`, its includes `*a` (ALV class) `*c` (DATA class) `*e` (event handler) `*f` (forms) `*i` (PAI) `*o` (PBO) `*s` (selection) `*t` (TOP) `*_tst` (test classes), and screens `0100`/`0200`.
- **Standard classes only — nothing to install first**: the sample builds its containers and controls directly on `CL_GUI_DOCKING_CONTAINER` / `CL_GUI_SPLITTER_CONTAINER` / `CL_GUI_ALV_GRID` / `CL_GUI_ALV_TREE` (or `CL_SALV_TABLE`), so a generated program depends on no global class that has to exist in SAP beforehand. It imports and activates the same way over MCP and through an abapGit ZIP — most users cannot connect MCP at all, and a prerequisite they cannot install is a program that will not activate.
- **A shared class only on request**: when several programs are meant to reuse the same ALV logic, that logic becomes a global class named per [naming-conventions.md](naming-conventions.md) (`ZCL_{MODULE}_{PURPOSE}`), listed in the program's own object list, and created and delivered with it. Never reference a global class the spec does not create and that the target system is not known to have.
- **Retired dependency**: before 2026-11-11 the sample inherited from the plugin's shared handler set (`ZCL_SAPKIT_CM_*` · `ZIF_SAPKIT_CM` · `ZCX_SAPKIT_EXCP`, sources in [`server/sap-assets/alv-oop-handlers/`](../../../../server/sap-assets/alv-oop-handlers/)). New programs no longer use it; it stays installable only for programs already written against it (D-168).
- **Message class**: the standard message class to reach for is `S_UNIFIED_CON` (`013 No data found`, `000 &1 &2 &3 &4`). A custom `ZMC` class is never to be created — the sample is already pointed at `S_UNIFIED_CON`.
- **If anything is unclear**: take over the sample's include split (`a/c/e/f/i/o/s/t/_tst`), its event handler wiring (handlers registered `FOR ALL INSTANCES` from `INITIALIZATION`, `LCL_ALV` ignoring controls it did not build), its container creation, the shape of its field catalog builder, and its PAI/PBO module names. A layout that departs from this breaks what the create-program procedure expects and what the OOP reviewer checks look for.

Three parties MUST open the sample files before any ALV code is generated or approved: agents that invoke the create-program procedure in OOP mode, `sap-executor` as it writes ALV logic, and `sap-code-reviewer` as it reviews that logic.
