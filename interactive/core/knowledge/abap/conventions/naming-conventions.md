# Naming Conventions

Every custom name emitted for a sapkit ABAP program and its related objects is
decided here — the report itself, the DDIC objects behind it, function groups
and modules, global classes, CDS views, and the identifiers living inside the
program.

Two things are deliberately out of scope. The role mapping for includes lives
in [`include-structure.md`](include-structure.md) — §5 below only enumerates
the suffixes. And the per-type detail for object kinds this file does not carry
is delegated at the end of §4.

## 1. The pieces every pattern reuses

The patterns below sit in the customer `Z` namespace and are assembled from the
same three building blocks.

- **`{MODULE}`** — the two-letter functional module code:
  `FI`, `SD`, `MM`, `PP`, `PM`, `QM`, `WM`, `TM`, `TR`, `CO`, `HCM`, `BW`,
  `PS`, `AR`.
- **`{TYPE}`** — a single letter identifying the ABAP object kind, used only by
  the numbered family in §3.
- **`{NN}`** — the sequence number, written as five zero-padded digits
  (`00010`, `00020`, …).

The unnumbered families in §4 replace `{NN}` with a `{PURPOSE}` or `{Name}`
word instead.

## 2. Claim the sequence number before you propose a name — MANDATORY

Nothing in §3 may be proposed or created until `{NN}` has been chosen by this
procedure.

- **Prove the name is free.** Query the target system through MCP
  (`SearchObject` / `GetObjectInfo` / `GetObjectsByType`) and confirm the
  candidate `Z{MODULE}{TYPE}{NN}` does not already exist there. A number is
  never assumed to be unused; collision with an existing SAP object is
  disqualifying.
- **Step by ten from the last one used.** Find the highest `{NN}` already in
  use for the same `{MODULE}{TYPE}` pair and propose `last + 10` — with
  `ZFIR00020` present, the next new report is `ZFIR00030`. The gap left by the
  `+10` step is deliberate: it reserves room for objects that later need to be
  inserted next to this one.
- **One unit of work, one number.** A feature that spawns several DDIC
  artifacts alongside its report (TABL + STRU + TTYP + the report that consumes
  them) reuses a single `{NN}` across all of them —
  `ZFIR00030` + `ZFIT00030` + `ZFIS00030` + `ZFIY00030` — rather than
  advancing the counter for each sub-object.
- **On collision, step again.** If the proposal turns out to be taken, add
  another `+10` and re-verify, repeating until a free slot appears.
- **Write the number down.** The chosen sequence goes into the program's
  `interview.md` / `spec.md`.

## 3. Numbered objects — `Z{MODULE}{TYPE}{NN}`

The main program and the classic DDIC objects around it share one pattern:

- Pattern: `Z{MODULE}{TYPE}{NN}`
- `ZFIR00010` reads as FI Report #00010; `ZSDR23070` as SD Report #23070.

### `{TYPE}` letters

Company standard, confirmed 2026-04-17.

| `{TYPE}` | Object | ABAP object kind | Example |
|---|---|---|---|
| `R` | Report / Main Program | PROG (executable) | `ZFIR00010` |
| `S` | Structure | STRU (TABL/STRU) | `ZFIS00010` |
| `T` | Transparent Table | TABL | `ZFIT00010` |
| `Y` | Table Type | TTYP | `ZFIY00010` |
| `E` | Data Element | DTEL | `ZFIE00010` |
| `D` | Domain | DOMA | `ZFID00010` |
| `V` | DDIC View (classic) | VIEW (maintenance/projection/help) | `ZFIV00010` |

## 4. Unnumbered objects — patterns keyed by purpose

### 4.1 Function groups and function modules

Company standard, confirmed 2026-04-19.

**There is no underscore between `Z` and the two-letter module code.** The
separation is carried by the fixed `FG` / `FM` tag that follows the module
code and precedes the purpose.

| Object | Pattern | Example |
|---|---|---|
| Function Group | `Z{MODULE}FG_{PURPOSE}` | `ZMMFG_HISTORY`, `ZFIFG_CLEARING`, `ZSDFG_ORDER` |
| Function Module | `Z{MODULE}FM_{PURPOSE}` | `ZMMFM_GET_HISTORY`, `ZFIFM_POST_CLEAR`, `ZSDFM_ORDER_CREATE` |
| RFC Function Module | `Z{MODULE}FM_RFC_{PURPOSE}` | `ZSDFM_RFC_ORDER_CREATE` |

Two older shapes are obsolete and must never be emitted: the underscored
`Z_{MODULE}_{NAME}` form (for example `Z_MM_MATERIAL_READ`), and the
prefix-style tag `ZFG_{MODULE}_...`.

A function module carries the same module code as the function group hosting
it. Keep each side's `{PURPOSE}` short and distinct. Group `ZMMFG_HISTORY`, for
instance, hosts `ZMMFM_GET_HISTORY` and `ZMMFM_POST_HISTORY`.

### 4.2 Global classes and interfaces

| Object | Pattern | Example |
|---|---|---|
| Global Class | `ZCL_{MODULE}_{PURPOSE}` | `ZCL_MM_HISTORY`, `ZCL_FI_CLEARING` |
| Global Interface | `ZIF_{MODULE}_{PURPOSE}` | `ZIF_MM_HISTORY`, `ZIF_FI_CLEARING` |
| Global Exception | `ZCX_{MODULE}_{PURPOSE}` | `ZCX_MM_HISTORY_FAILED` |
| Global Test Class | `ZCL_{MODULE}_{PURPOSE}_TEST` | `ZCL_MM_HISTORY_TEST` |

### 4.3 CDS views and RAP artifacts

CDS objects are **not** numbered — the `Z{MODULE}{TYPE}{NN}` pattern of §3 does
not apply to them. They take SAP Virtual Data Model semantic prefixes instead,
kept in the Z namespace and qualified per module.

| Role | Pattern | Example | Notes |
|---|---|---|---|
| Basic / Interface View | `ZI_{MODULE}_{Name}` | `ZI_FI_ClearingItem` | Reusable VDM layer — 1:1 or light joins, no business logic gating |
| Root View (RAP) | `ZR_{MODULE}_{Name}` | `ZR_FI_Clearing` | Root entity of a Behavior Definition / Business Object |
| Consumption View | `ZC_{MODULE}_{Name}` | `ZC_FI_Clearing` | UI/OData-facing; annotations for Fiori Elements / RAP service |
| Projection View (RAP) | `ZP_{MODULE}_{Name}` | `ZP_FI_Clearing` | Intermediate projection layer when separating read/write |
| Metadata Extension | `{TargetView}_EXT` | `ZC_FI_Clearing_EXT` | Separates UI annotations from the view definition |

Analytics-flavoured and unmanaged CDS variants are not settled — see §6 before
defaulting one.

### 4.4 Object kinds delegated elsewhere

Per-type pattern detail for tables, structures, data elements, domains,
programs, DDIC views, search helps, RAP/OData artifacts, IDoc, enhancements,
and packages lives in
[`naming-conventions-objects.md`](../../modules/common/naming-conventions-objects.md).

## 5. Identifiers inside one program

### Includes

Include names are the main program name plus a suffix, drawn from:
`t` / `s` / `c` / `a` / `o` / `i` / `e` / `f` / `_tst`.

This is the suffix inventory only. Role mapping: see
[`include-structure.md`](include-structure.md).

### Local classes

- `LCL_DATA` — data extraction
- `LCL_ALV` — screen / ALV / display
- `LCL_EVENT` — ALV event handler
- `LCL_TEST_*` — `FOR TESTING` classes, living in `{PROG}_tst`

### Global references

Declared in the TOP include (`{PROG}t`): `GO_DATA`, `GO_ALV`, `GO_EVENT`.

### Screens

Four-digit numeric: `0100`, `0200`, …

### GUI status

Either `STATUS_{SCREEN}` or a purpose-based name such as `MAIN_0100`.

### Procedural ALV FORMs

Must end with `_{screen_no}` — see
[`procedural-form-naming.md`](procedural-form-naming.md).

## 6. Not settled — ask before defaulting

Two CDS sub-types have no company default yet. Raise them with the user the
first time one is needed rather than inventing a pattern:

- **Analytical / Cube / Dimension / Query views (CDS for Analytics).** SAP's own
  convention uses suffixes such as `_CDS_Q`, `_CDS_C`, `_CDS_D`; company policy
  is TBD.
- **Custom Entity** (unmanaged CDS backed by a class implementation). Confirm
  whether `ZI_` applies or a dedicated prefix is wanted.
