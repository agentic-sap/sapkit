*&---------------------------------------------------------------------*
*& Include ZSAPKIT_OOP_EXE
*&---------------------------------------------------------------------*
*& What    : The control event bridges - three classes, one per control
*&           family: LCL_EVENT_ALV for the grid, LCL_EVENT_SALV for a
*&           SALV table, LCL_EVENT_TREE for the tree.
*& How     : The reusable handler set dispatches statically, by name -
*&           it calls CLASS=>METHOD on the local class it was told
*&           about, exporting the event parameters under their own
*&           names. So every method here is a CLASS-METHOD, declared
*&           FOR EVENT, carrying the full parameter list even where the
*&           body forwards only part of it. Drop one and the dynamic
*&           call raises CX_SY_DYN_CALL_PARAM_NOT_FOUND.
*& Caution : These classes hold no logic. Each one reads the event and
*&           hands it straight to LCL_ALV; the decision of what to do
*&           belongs there, next to the data the decision needs.
*&---------------------------------------------------------------------*


*&---------------------------------------------------------------------*
*& CLASS LCL_EVENT_ALV - grid events
*&---------------------------------------------------------------------*
*& Registered in LCL_ALV CONSTRUCTOR, which fills the METHOD field of
*& the MT_EVENTLIST rows named GC_EVT_HOTSPOT_CLICK and
*& GC_EVT_DATA_CHANGED. An event whose row keeps METHOD empty is never
*& routed here, which is why this class carries those two and no more.
*&---------------------------------------------------------------------*
CLASS lcl_event_alv DEFINITION FINAL.

  PUBLIC SECTION.
    CLASS-METHODS handle_hotspot_click
      FOR EVENT hotspot_click OF zcl_s4sap_cm_oalv
      IMPORTING e_row_id e_column_id es_row_no sender.

    CLASS-METHODS handle_data_changed
      FOR EVENT data_changed OF zcl_s4sap_cm_oalv
      IMPORTING er_data_changed e_onf4 e_onf4_before e_onf4_after
                e_ucomm sender.

ENDCLASS.


CLASS lcl_event_alv IMPLEMENTATION.

  METHOD handle_hotspot_click.
    go_alv->on_hotspot_click( is_row_no    = es_row_no
                              is_column_id = e_column_id
                              io_sender    = sender ).
  ENDMETHOD.

  METHOD handle_data_changed.
    go_alv->on_data_changed( io_data_changed = er_data_changed
                             io_sender       = sender ).
  ENDMETHOD.

ENDCLASS.


*&---------------------------------------------------------------------*
*& CLASS LCL_EVENT_SALV - SALV table events
*&---------------------------------------------------------------------*
*& The counterpart for a program that displays through CL_SALV_TABLE
*& instead of the grid. SALV hands its events out directly, so this
*& class is wired by hand rather than through MT_EVENTLIST.
*&
*&   DATA(lo_events) = lo_salv->get_event( ).
*&   SET HANDLER lcl_event_salv=>on_added_function FOR lo_events.
*&
*& ZSAPKIT_OOP_EX itself runs on the grid and the tree, so the three
*& methods below stay unwired - they are here as the shape to copy.
*&---------------------------------------------------------------------*
CLASS lcl_event_salv DEFINITION FINAL.

  PUBLIC SECTION.
    CLASS-METHODS on_added_function
      FOR EVENT if_salv_events_functions~added_function
                OF cl_salv_events_table
      IMPORTING e_salv_function.

    CLASS-METHODS on_double_click
      FOR EVENT if_salv_events_actions_table~double_click
                OF cl_salv_events_table
      IMPORTING row column.

    CLASS-METHODS on_link_click
      FOR EVENT if_salv_events_actions_table~link_click
                OF cl_salv_events_table
      IMPORTING row column.

ENDCLASS.


CLASS lcl_event_salv IMPLEMENTATION.

  METHOD on_added_function.
    " Own toolbar buttons arrive here under their function code.
  ENDMETHOD.

  METHOD on_double_click.
    " ROW and COLUMN point into the SALV output table.
  ENDMETHOD.

  METHOD on_link_click.
    " The SALV equivalent of a grid hotspot.
  ENDMETHOD.

ENDCLASS.


*&---------------------------------------------------------------------*
*& CLASS LCL_EVENT_TREE - tree events
*&---------------------------------------------------------------------*
*& Registered the same way as the grid class, from the MT_EVENTLIST of
*& the tree handler, on the rows GC_EVT_LINK_CLICK and
*& GC_EVT_NODE_DBL_CLICK.
*&---------------------------------------------------------------------*
CLASS lcl_event_tree DEFINITION FINAL.

  PUBLIC SECTION.
    CLASS-METHODS handle_link_click
      FOR EVENT link_click OF zcl_s4sap_cm_otree
      IMPORTING fieldname node_key sender.

    CLASS-METHODS handle_node_double_click
      FOR EVENT node_double_click OF zcl_s4sap_cm_otree
      IMPORTING node_key sender.

ENDCLASS.


CLASS lcl_event_tree IMPLEMENTATION.

  METHOD handle_link_click.
    go_alv->on_tree_link_click( iv_fieldname = fieldname
                                iv_node_key  = node_key ).
  ENDMETHOD.

  METHOD handle_node_double_click.
    go_alv->on_node_double_click( node_key ).
  ENDMETHOD.

ENDCLASS.
