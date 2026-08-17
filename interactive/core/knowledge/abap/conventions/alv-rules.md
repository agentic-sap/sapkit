# ALV Rules

This file holds the ALV display rules that sc4sap programs have in common.

## Display Mode Selection

A **full ALV** is built on `CL_GUI_ALV_GRID`. It needs a custom screen — 0100,
for example — produced by `CreateScreen`, plus a GUI status produced by
`CreateGuiStatus` that carries the standard BACK/EXIT/CANCEL together with an
application toolbar. The container is a **docking container**
(`CL_GUI_DOCKING_CONTAINER`), not a custom container, and the field catalog is
typed `LVC_T_FCAT`.

Where the requirement is a **simple popup display**, `CL_SALV_TABLE` (SALV) is
allowed. Nothing has to be prepared for it — no screen, no GUI status. Call
`cl_salv_table=>factory` and then `display( )`.

## Field Catalog Construction Standard

The reference for what follows is
`sc4sap/common/alv-sample/field-catalog-guide.abap`.

### Step 1 — Auto-Extract via SALV Factory

**Even where `CL_GUI_ALV_GRID` is the final display target**, this is the
pattern to follow: SALV produces the base catalog first, and that catalog is
afterwards transformed into `LVC_T_FCAT`.

```abap
FORM convert_fcat_data_grid USING pt_table TYPE STANDARD TABLE
                         CHANGING pt_fieldcat TYPE lvc_t_fcat.
  DATA lo_table TYPE REF TO data.
  CREATE DATA lo_table LIKE pt_table.
  ASSIGN lo_table->* TO FIELD-SYMBOL(<fo_table>).
  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = DATA(salv_table)
                              CHANGING  t_table      = <fo_table> ).
      pt_fieldcat = cl_salv_controller_metadata=>get_lvc_fieldcatalog(
        r_columns      = salv_table->get_columns( )
        r_aggregations = salv_table->get_aggregations( ) ).
    CATCH cx_root.
  ENDTRY.
ENDFORM.
```

### Step 2 — Modify Per-Screen Catalog Attributes

Field-by-field properties are then adjusted from a `CASE` over `FIELDNAME`.
`coltext`, `qfieldname`, `cfieldname`, `do_sum`, `no_out`, `outputlen`, and
`hotspot` are examples of the properties set there. A worked example is in
`field-catalog-guide.abap`.
