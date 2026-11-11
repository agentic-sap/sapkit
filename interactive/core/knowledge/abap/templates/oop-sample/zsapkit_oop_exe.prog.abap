*&---------------------------------------------------------------------*
*& Include ZSAPKIT_OOP_EXE
*&---------------------------------------------------------------------*
*& What    : The control event bridges - three classes, one per control
*&           family: LCL_EVENT_ALV for the grid, LCL_EVENT_SALV for a
*&           SALV table, LCL_EVENT_TREE for the tree.
*& How     : Each class registers its handlers once, from
*&           INITIALIZATION, with SET HANDLER ... FOR ALL INSTANCES - so
*&           they also catch the controls LCL_ALV builds later. That is
*&           why registration lives here and not in LCL_ALV: this
*&           include comes after ZSAPKIT_OOP_EXA, and LCL_ALV cannot
*&           reach a class that is defined further down.
*& Caution : These classes hold no logic. Each one reads the event and
*&           hands it, sender included, straight to LCL_ALV; LCL_ALV
*&           decides what to do and ignores controls it did not build.
*&---------------------------------------------------------------------*


*&---------------------------------------------------------------------*
*& CLASS LCL_EVENT_ALV - grid events
*&---------------------------------------------------------------------*
CLASS lcl_event_alv DEFINITION FINAL.

  PUBLIC SECTION.
    CLASS-METHODS register.

    CLASS-METHODS handle_hotspot_click
      FOR EVENT hotspot_click OF cl_gui_alv_grid
      IMPORTING e_column_id es_row_no sender.

    CLASS-METHODS handle_data_changed
      FOR EVENT data_changed OF cl_gui_alv_grid
      IMPORTING er_data_changed sender.

ENDCLASS.


CLASS lcl_event_alv IMPLEMENTATION.

  METHOD register.
    SET HANDLER handle_hotspot_click handle_data_changed FOR ALL INSTANCES.
  ENDMETHOD.

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
*& instead of the grid. SALV hands its events out per table, so this
*& class is wired to the one table it serves:
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
*& The tree also has to tell its frontend which clicks to report -
*& LCL_ALV does that with SET_REGISTERED_EVENTS when it builds the tree.
*&---------------------------------------------------------------------*
CLASS lcl_event_tree DEFINITION FINAL.

  PUBLIC SECTION.
    CLASS-METHODS register.

    CLASS-METHODS handle_link_click
      FOR EVENT link_click OF cl_gui_alv_tree
      IMPORTING fieldname node_key sender.

    CLASS-METHODS handle_node_double_click
      FOR EVENT node_double_click OF cl_gui_alv_tree
      IMPORTING node_key sender.

ENDCLASS.


CLASS lcl_event_tree IMPLEMENTATION.

  METHOD register.
    SET HANDLER handle_link_click handle_node_double_click FOR ALL INSTANCES.
  ENDMETHOD.

  METHOD handle_link_click.
    go_alv->on_tree_link_click( iv_fieldname = fieldname
                                iv_node_key  = node_key
                                io_sender    = sender ).
  ENDMETHOD.

  METHOD handle_node_double_click.
    go_alv->on_node_double_click( iv_node_key = node_key
                                  io_sender   = sender ).
  ENDMETHOD.

ENDCLASS.
