# OOP Pattern — Two-Class Split

Every OOP-mode ABAP program in sc4sap shares the convention set out below. Its canonical reference is [`common/oop-sample/zrsc4sap_oop_ex*`](../templates/oop-sample/), derived from `babamba2/OOALV` / `YRPAEK001`.

## Two-Class Split (Mandatory)

An OOP-mode program must divide its responsibilities between two local classes, with an event handler available as an optional third:

- **`LCL_DATA`** (in `{PROG}c`) — selection and extraction of data
  - Its methods: `CONSTRUCTOR`, `GET_DATA`
  - Keeps the resulting internal tables as private attributes
  - Stays clear of UI concerns

- **`LCL_ALV`** (in `{PROG}a`) — screen, ALV, and display
  - Its methods: `CONSTRUCTOR`, `DISPLAY`, field catalog builders, button/menu handlers
  - Keeps the ALV grid / container references
  - Takes its data from the `LCL_DATA` instance

- **`LCL_EVENT`** (in `{PROG}e`) — an *optional* handler for ALV events
  - Covers `double_click`, `hotspot_click`, `user_command`, and the like

## Main Program Orchestration

```abap
INITIALIZATION.
  GO_DATA = NEW #( ).
  GO_ALV  = NEW #( ).

START-OF-SELECTION.
  GO_DATA->GET_DATA( ).

END-OF-SELECTION.
  GO_ALV->DISPLAY( ).
```

The TOP include (`{PROG}t`) is where the global references `GO_DATA`, `GO_ALV`, and `GO_EVENT` get their declarations.

## ALV Requirement (Mandatory)

**Whenever a program needs ALV (grid, tree, SALV, or editable ALV), you MUST model it on the sample programs at [`common/oop-sample/`](../templates/oop-sample/).** Inventing a new ALV skeleton is not an option.

- **What the reference set holds**: `zrsc4sap_oop_ex.prog.abap`, its includes `*a` (ALV class) `*c` (DATA class) `*e` (event handler) `*f` (forms) `*i` (PAI) `*o` (PBO) `*s` (selection) `*t` (TOP), and screens `0100`/`0200`.
- **Reuse before writing**: the sample leans on the reusable handlers kept in [`abap/alv-oop-handlers/`](../../../../server/sap-assets/alv-oop-handlers/) — `ZCL_S4SAP_CM_ALV`, `ZCL_S4SAP_CM_OALV`, `ZCL_S4SAP_CM_OTREE`, `ZCL_S4SAP_CM_ALV_EVENT`, `ZCL_S4SAP_CM_TREE_EVENT`, `ZIF_S4SAP_CM`, `ZCX_S4SAP_EXCP`. In a generated program these should be instantiated or extended, not duplicated.
- **Message class**: the standard message class to reach for is `S_UNIFIED_CON` (`013 No data found`, `000 &1 &2 &3 &4`). A custom `ZMC` class is never to be created — both `ZCX_S4SAP_EXCP` and the sample are already pointed at `S_UNIFIED_CON`.
- **If anything is unclear**: take over the sample's include split (`a/c/e/f/i/o/s/t`), its event handler wiring, its container creation, the shape of its field catalog builder, and its PAI/PBO module names. A layout that departs from this breaks what the create-program procedure expects and what the OOP reviewer checks look for.

Three parties MUST open the sample files before any ALV code is generated or approved: agents that invoke the create-program procedure in OOP mode, `sap-executor` as it writes ALV logic, and `sap-code-reviewer` as it reviews that logic.
