# OOP Pattern — Two-Class Split

Shared convention for OOP-mode ABAP programs. Canonical reference: `templates/oop/zrsc4sap_oop_ex*` (derived from `babamba2/OOALV` / `YRPAEK001`).

## Two-Class Split (Mandatory)

OOP-mode programs must split responsibilities across two local classes (plus an optional event handler):

- **`LCL_DATA`** (in `{PROG}c`) — data selection / extraction
  - Methods: `CONSTRUCTOR`, `GET_DATA`
  - Holds result internal tables as private attributes
  - No UI concerns

- **`LCL_ALV`** (in `{PROG}a`) — screen / ALV / display
  - Methods: `CONSTRUCTOR`, `DISPLAY`, field catalog builders, button/menu handlers
  - Holds ALV grid / container references
  - Reads data from `LCL_DATA` instance

- **`LCL_EVENT`** (in `{PROG}e`) — *optional* ALV event handler
  - Handles `double_click`, `hotspot_click`, `user_command`, etc.

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

Global references (`GO_DATA`, `GO_ALV`, `GO_EVENT`) are declared in the TOP include (`{PROG}t`).

## ALV Requirement (Mandatory)

**When the program needs ALV (grid, tree, SALV, or editable ALV), you MUST model it after the sample programs in `templates/oop/`.** Do not invent a new ALV skeleton.

- **Reference set**: `zrsc4sap_oop_ex.prog.abap` + includes `*a` (ALV class) `*c` (DATA class) `*e` (event handler) `*f` (forms) `*i` (PAI) `*o` (PBO) `*s` (selection) `*t` (TOP) + screens `0100`/`0200`.
- **Reuse-first**: the sample leverages reusable handler classes installed separately in the SAP system — `ZCL_S4SAP_CM_ALV`, `ZCL_S4SAP_CM_OALV`, `ZCL_S4SAP_CM_OTREE`, `ZCL_S4SAP_CM_ALV_EVENT`, `ZCL_S4SAP_CM_TREE_EVENT`, `ZIF_S4SAP_CM`, `ZCX_S4SAP_EXCP`. When these exist in the target system (check with `SearchObject`), generated programs should instantiate/extend them, not duplicate them.
- **Messages**: use standard message class `S_UNIFIED_CON` (`013 No data found`, `000 &1 &2 &3 &4`). Never create a custom `ZMC` class — `ZCX_S4SAP_EXCP` and the sample already point to `S_UNIFIED_CON`.
- **When in doubt**: copy the sample's include split (`a/c/e/f/i/o/s/t`), event handler wiring, container creation, field catalog builder shape, and PAI/PBO module names. Deviating from this layout breaks the OOP program-generation conventions and the OOP reviewer checks.

Any agent generating an OOP-mode program, writing ALV logic, or reviewing it MUST open the sample files before generating or approving ALV code.
