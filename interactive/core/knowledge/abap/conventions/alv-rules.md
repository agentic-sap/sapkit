# ALV Rules

This file holds the ALV display rules that sapkit programs have in common, together with
the GUI-status and value-help behaviour that travels with them. Everything below the
field-catalog section is a **silent failure mode, field-verified in real project work between
2026-07 and 2026-08** — none of it is caught by a syntax check or by activation, and most of it
shows up only once a user opens the screen.

## Display Mode Selection

A **full ALV** is built on `CL_GUI_ALV_GRID`. It needs a custom screen — 0100,
for example — produced by `CreateScreen`, plus a GUI status produced by
`CreateGuiStatus` that carries the standard BACK/EXIT/CANCEL together with an
application toolbar. The container is a **docking container**
(`CL_GUI_DOCKING_CONTAINER`), not a custom container, and the field catalog is
typed `LVC_T_FCAT`.

Where the requirement is a **simple popup display**, `CL_SALV_TABLE` (SALV) is
allowed. No screen and no GUI status are needed. Call
`cl_salv_table=>factory` and then `display( )`.

## Field Catalog Construction Standard

The reference for what follows is
[`alv-sample/field-catalog-guide.abap`](../templates/alv-sample/field-catalog-guide.abap).

### Step 1 — Auto-Extract via SALV Factory

**Even where `CL_GUI_ALV_GRID` is the final display target**, this is the
pattern to follow: SALV produces the base catalog first, and that catalog is
afterwards transformed into `LVC_T_FCAT`.

```abap
FORM convert_fcat_data_grid USING pt_table TYPE STANDARD TABLE
                            CHANGING pt_fieldcat TYPE lvc_t_fcat.

  DATA lr_probe TYPE REF TO data.
  DATA lr_salv TYPE REF TO cl_salv_table.

  " SALV has to bind to a table of its own, and PT_TABLE arrives
  " generically typed. An empty twin of it serves as the probe - only the
  " row type is read from it, never the contents.
  CREATE DATA lr_probe LIKE pt_table.
  ASSIGN lr_probe->* TO FIELD-SYMBOL(<fs_probe>).

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lr_salv
                              CHANGING t_table = <fs_probe> ).

      pt_fieldcat = cl_salv_controller_metadata=>get_lvc_fieldcatalog(
                      r_columns = lr_salv->get_columns( )
                      r_aggregations = lr_salv->get_aggregations( ) ).
    CATCH cx_salv_msg.
      " Row type not displayable by SALV: PT_FIELDCAT stays as the caller
      " left it, and the caller decides whether a grid is still possible.
  ENDTRY.

ENDFORM.
```

### Step 2 — Modify Per-Screen Catalog Attributes

Field-by-field properties are then adjusted from a `CASE` over `FIELDNAME`.
`coltext`, `qfieldname`, `cfieldname`, `do_sum`, `no_out`, `outputlen`, and
`hotspot` are examples of the properties set there. A worked example is in
`field-catalog-guide.abap`.

## Column Width — Delegate to `cwidth_opt`

**Never hardcode `ls_fc-outputlen` in the field catalog.** A fixed width beats the layout's
`cwidth_opt` and switches automatic sizing off for that column. Set `cwidth_opt = abap_true` on
the layout and leave the widths alone. Because `cwidth_opt` computes from the data present at
`set_table_for_first_display` time, a screen that comes up with an **empty** grid freezes its
widths against the header text; re-optimize once the data changes —
`get_frontend_layout` -> set `cwidth_opt` -> `set_frontend_layout` -> `refresh_table_display`.

**Exception — an editable column states its `outputlen`.** Display width is cosmetic, but edit
width is functional: an ABAP `DATE` is 8 characters internally while the screen input follows the
logon date format and needs 10, so an auto-sized date column truncates what the user types and the
value never lands at all.

## Editable Grids — Registration Order and Cell Colour

**`register_f4_for_fields` goes *after* `set_table_for_first_display`, never before.** Called
first, the front end has no field catalog yet, the registration matches nothing, and F4 dies
outright — no syntax error, no dump, just a key that does nothing. The SAP standard example
`BCALV_EDIT_04` shows the order. This one hides for a long time: three screens in one project had
F4 registered inside the PBO routine ahead of `set_table`, and their value helps had never worked
since the day they were built.

**`register_edit_event( cl_gui_alv_grid=>mc_evt_modified )` is what makes `data_changed` fire on
input.** Without it the event is raised only when `check_changed_data` is called explicitly — that
is, when a toolbar button is pressed — so typing a value and pressing Enter produces no reaction.

**Do not colour a grid that has editable columns with `is_layout-info_fname` (whole-row colour).**
SAP GUI paints a coloured cell as an output field, so the row looks locked even though every edit
condition (CELLTAB, `set_ready_for_input`, draft state) is satisfied. Give colour per cell through
`ctab_fname` (`LVC_T_SCOL`) and keep the editable columns out of the colour table. An empty
`LVC_S_SCOL-FNAME` applies to the whole row and is the same trap.

## GUI Status (CUA) and the Application Toolbar

Never write a GUI status from memory.

- **A function carrying neither an icon nor an `ICON_TEXT` is not drawn anywhere.** An
  application-toolbar `FUN` left without both simply never appears — the button is missing rather
  than misplaced.
- **Where there is an icon, supply `ICON_TEXT` and `INFO_TEXT` with it.** Given `TEXT_NAME` +
  `ICON_ID` alone the icon **replaces** the text and only the picture is left; `ICON_TEXT` is the
  label beside the icon and `INFO_TEXT` the tooltip.
- **Read icon IDs out of the system's `ICON` table.** A guessed ID renders as a blank.
- **A status needs its `<BUT>` (`RSMPE_BUT`) section.** Functions (`FUN`) and function keys (`PFK`)
  on their own leave the screen with no visible buttons.
- **An editable ALV needs `it_toolbar_excluding`.** Otherwise the standard toolbar contributes its
  own insert-row / delete-row / copy / paste / undo functions, which duplicate the CUA entries and
  **bypass every guard the program implements** (read-only cells, delete reference checks, save
  prompts).
- **Before touching an `RSMPE_*` screen structure, read its field list.** `ReadTable` /
  `GetStructure` return it as metadata (a P1 read), so no `DD03L` row query is needed. Departing
  from a builder that is known to work needs a reason.

## Value Help (F4) on the Selection Screen

**Inside `AT SELECTION-SCREEN ON VALUE-REQUEST`, the other selection-screen fields have not been
transferred yet — read them off the screen with `DYNP_VALUES_READ`.** At F4 time their program
variables still hold the initial value, usually blank, so a value help that filters on a sibling
field silently filters on nothing: the screen shows a company code while the handler sees a blank
one and reports "no entries" (field-verified 2026-08). `AT SELECTION-SCREEN ON <field>` runs in
PAI, where the transfer *has* happened — the two events must not be treated alike. Where the
handler lives in a **global class**, `SY-REPID` is the class pool's name, so pass `SY-CPROG` as
`DYNAME`.

**Build the list from a table whose contents you can vouch for — usually the standard master — and
render the custom-table registration as a column rather than using it as a filter.** Filter on a
custom master and every unregistered entry looks as though it does not exist.

**`F4IF_INT_TABLE_VALUE_REQUEST` (`value_org = 'S'`) needs a `value_tab` whose row type references
DDIC types.** A local `c LENGTH n` structure of the right width produces no list at all, and
`retfield` has to be a real component name of that structure. Do not put the **same DDIC type on
two columns** — the column headings come from the type, so both come out identical and the user
cannot tell them apart.

## Master-Data Texts Live in a Language-Dependent Text Table

**Do not read a name or description straight off a standard master table's NAME field — look for
the text table first.** SAP separates master from text, and the master's own name field is
frequently left unmaintained, so the query returns placeholders or blanks while the real
descriptions sit in the text table. Find it through the `<master>T` naming pattern in `DD02L`, or
through the `#TEXT_KEY` of the master's DDIC foreign key. Join on the **language** (`sy-langu`) and
on whatever subtype key the text table carries.

**Data that looks empty is a signal to look at another table, not a configuration gap.** Explaining
a blank column away as "probably not set up yet" is what turns this into a round trip.

## `REUSE_ALV_FIELDCATALOG_MERGE` Reads the Main Program at 72 Characters

The classic catalog merge builds its field catalog by running `READ REPORT <main program>` into an
internal table **72 characters wide**. One line of 73 characters or more anywhere in the main
program body raises `READ_REPORT_LINE_TOO_LONG` (`CX_SY_READ_SRC_LINE_TOO_LONG`) and the program
dumps **before the screen is drawn**. Neither a syntax check nor activation sees it — only running
it does. Split the trailing comment onto its own line:

```abap
*     inline note moved up so the statement line stays inside 72 characters
      PERFORM get_axis USING gs_key-branch CHANGING g_bupla.
```

The constraint stops at the main program: `READ REPORT` reads that one source and does not expand
its includes, so include lines longer than 72 characters are irrelevant here.

## SALV and Dialog Popups — Field-Verified Limits

- **`SET_TOP_OF_LIST` draws nothing on a SALV bound to a container.** Not one line appears, even
  with the call correctly placed ahead of `display( )`. Split the container with a splitter and
  render the summary into its own SALV in the upper cell; switch that grid's toolbar off with
  `get_functions( )->set_all( abap_false )`.
- **SALV column widths freeze at factory time and `REFRESH( )` does not release them.** A grid
  built while the table was still empty keeps those widths afterwards and truncates the real
  values — `set_optimize( abap_true )` does not help, because the problem is *when*, not *whether*.
  Where the data changes shape, discard the frame and rebuild it.
- **Where a computed column sits beside one typed from a data element, give the computed one all
  three heading lengths (short / medium / long).** ALV picks among them by available width, so
  fixing only one of the three brings the collision back at a different width. A structure field
  typed with a built-in type directly has no heading at all.
- **`POPUP_TO_CONFIRM` does not wrap `TEXT_QUESTION` — it cuts it by character count.** Words and
  multi-byte characters are not respected and there is no way to force a line break, so the only
  fix is to keep the question to one short line, put the context in `TITLEBAR`, and leave the
  explanation on the screen, where the user sees it **before** clicking.
