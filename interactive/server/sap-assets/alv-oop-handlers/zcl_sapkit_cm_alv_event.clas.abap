CLASS zcl_sapkit_cm_alv_event DEFINITION
  PUBLIC
  CREATE PUBLIC.

*----------------------------------------------------------------------
* Event relay of the ALV grid.
*
* CL_GUI_ALV_GRID raises its events on an object, so a report that wants
* to react to them needs a handler object registered with SET HANDLER.
* Writing that object by hand means one class per report carrying twelve
* near-identical methods. This class is that object, written once: it
* subscribes to every grid event worth reacting to and forwards each one
* to whatever the report asked for.
*
* Where an event goes is decided per event, in MT_EVENTLIST. Each row
* names one event and stays inert until the report fills one of two
* fields on it:
*
*   FORM filled   - the event is handed to that FORM routine in the
*                   program named by REPID, through PERFORM ... IF FOUND,
*                   with the event parameters passed positionally.
*   METHOD filled - the event is handed to the static method of that name
*                   on the local class the constructor was told about,
*                   with the event parameters passed by name.
*
* FORM wins when both are filled. A row with neither is not forwarded at
* all, which is how a report subscribes to two events and ignores ten.
*
* Two properties of the METHOD route are load bearing. First, parameters
* travel under the names SAP gave the grid event, so the receiving method
* must spell them the same way. Second, SENDER is optional on the
* receiving side: the call is attempted with it, and a
* CX_SY_DYN_CALL_PARAM_NOT_FOUND is answered by repeating the call
* without it. That is why every forwarding method below calls twice.
*----------------------------------------------------------------------

  PUBLIC SECTION.

    " One subscription. EVENT is the fixed name of the grid event; FORM,
    " METHOD and REPID are what the report writes to claim it.
    TYPES:
      BEGIN OF ty_eventlist,
        event  TYPE formname,
        form   TYPE formname,
        method TYPE string,
        repid  TYPE sy-repid,
      END OF ty_eventlist.
    TYPES:
      tt_eventlist TYPE TABLE OF ty_eventlist.

    " The subscription table, public because the report edits it in place.
    DATA mt_eventlist TYPE tt_eventlist.
    " Target of the METHOD route, in the \PROGRAM=..\CLASS=.. form a
    " dynamic call needs to reach a class local to a report.
    DATA mv_local_class_definition TYPE string.

    METHODS constructor
      IMPORTING
        !iv_repid                  TYPE sy-cprog DEFAULT sy-cprog
        !iv_local_class_definition TYPE string.

    " --- toolbar and command --------------------------------------------

    METHODS handle_toolbar
      FOR EVENT toolbar OF cl_gui_alv_grid
      IMPORTING
        !e_object
        !e_interactive
        !sender.

    METHODS handle_user_command
      FOR EVENT user_command OF cl_gui_alv_grid
      IMPORTING
        !e_ucomm
        !sender.

    " --- edited cells ----------------------------------------------------

    METHODS handle_data_changed
      FOR EVENT data_changed OF cl_gui_alv_grid
      IMPORTING
        !er_data_changed
        !e_onf4
        !e_onf4_before
        !e_onf4_after
        !e_ucomm
        !sender.

    METHODS handle_data_changed_finished
      FOR EVENT data_changed_finished OF cl_gui_alv_grid
      IMPORTING
        !e_modified
        !et_good_cells
        !sender.

    METHODS handle_onf4
      FOR EVENT onf4 OF cl_gui_alv_grid
      IMPORTING
        !e_fieldname
        !e_fieldvalue
        !es_row_no
        !er_event_data
        !et_bad_cells
        !e_display
        !sender.

    " --- picked cells ----------------------------------------------------

    METHODS handle_hotspot_click
      FOR EVENT hotspot_click OF cl_gui_alv_grid
      IMPORTING
        !e_row_id
        !e_column_id
        !es_row_no
        !sender.

    METHODS handle_double_click
      FOR EVENT double_click OF cl_gui_alv_grid
      IMPORTING
        !e_row
        !e_column
        !es_row_no
        !sender.

    " --- page header ------------------------------------------------------

    METHODS handle_top_of_page
      FOR EVENT top_of_page OF cl_gui_alv_grid
      IMPORTING
        !e_dyndoc_id
        !sender.

    " --- drag and drop ----------------------------------------------------

    METHODS handle_ondrag
      FOR EVENT ondrag OF cl_gui_alv_grid
      IMPORTING
        !e_row
        !e_column
        !es_row_no
        !e_dragdropobj
        !sender.

    METHODS handle_ondrop
      FOR EVENT ondrop OF cl_gui_alv_grid
      IMPORTING
        !e_row
        !e_column
        !es_row_no
        !e_dragdropobj
        !sender.

    METHODS handle_ondropcomplete
      FOR EVENT ondropcomplete OF cl_gui_alv_grid
      IMPORTING
        !e_row
        !e_column
        !es_row_no
        !e_dragdropobj
        !sender.

    METHODS handle_drop_external_files
      FOR EVENT drop_external_files OF cl_gui_alv_grid
      IMPORTING
        !files
        !sender.

  PROTECTED SECTION.
  PRIVATE SECTION.

    " Names of the subscribable events. They are the row keys of
    " MT_EVENTLIST and, on the METHOD route, also the name a report
    " normally gives the receiving method, so the spelling is fixed.
    CONSTANTS c_evt_toolbar TYPE formname VALUE 'HANDLE_TOOLBAR'.
    CONSTANTS c_evt_user_command TYPE formname VALUE 'HANDLE_USER_COMMAND'.
    CONSTANTS c_evt_data_changed TYPE formname VALUE 'HANDLE_DATA_CHANGED'.
    CONSTANTS c_evt_changed_finished TYPE formname VALUE 'HANDLE_DATA_CHANGED_FINISHED'.
    CONSTANTS c_evt_hotspot_click TYPE formname VALUE 'HANDLE_HOTSPOT_CLICK'.
    CONSTANTS c_evt_double_click TYPE formname VALUE 'HANDLE_DOUBLE_CLICK'.
    CONSTANTS c_evt_onf4 TYPE formname VALUE 'HANDLE_ONF4'.
    CONSTANTS c_evt_top_of_page TYPE formname VALUE 'HANDLE_TOP_OF_PAGE'.
    CONSTANTS c_evt_ondrag TYPE formname VALUE 'HANDLE_ONDRAG'.
    CONSTANTS c_evt_ondrop TYPE formname VALUE 'HANDLE_ONDROP'.
    CONSTANTS c_evt_ondropcomplete TYPE formname VALUE 'HANDLE_ONDROPCOMPLETE'.
    CONSTANTS c_evt_drop_files TYPE formname VALUE 'HANDLE_DROP_EXTERNAL_FILES'.

    " Outcome of looking one event up. C_ROUTE_NONE is the initial value
    " on purpose, so an unclaimed event falls out of the CASE untouched.
    CONSTANTS c_route_none TYPE i VALUE 0.
    CONSTANTS c_route_form TYPE i VALUE 1.
    CONSTANTS c_route_method TYPE i VALUE 2.

    TYPES:
      BEGIN OF ty_route,
        mode   TYPE i,
        form   TYPE formname,
        repid  TYPE sy-repid,
        method TYPE string,
      END OF ty_route.

    " Reads one subscription and says where the event goes.
    METHODS routing
      IMPORTING
        !iv_event       TYPE formname
      RETURNING
        VALUE(rs_route) TYPE ty_route.

ENDCLASS.



CLASS zcl_sapkit_cm_alv_event IMPLEMENTATION.


  METHOD constructor.

    " A class local to a report is only reachable by its qualified name.
    mv_local_class_definition = |\\PROGRAM={ iv_repid }\\CLASS={ iv_local_class_definition }|.

    " Every event the class can serve gets a row. They start unclaimed -
    " the report fills FORM or METHOD on the ones it wants.
    mt_eventlist = VALUE #( repid = iv_repid
                            ( event = c_evt_toolbar )
                            ( event = c_evt_user_command )
                            ( event = c_evt_data_changed )
                            ( event = c_evt_changed_finished )
                            ( event = c_evt_hotspot_click )
                            ( event = c_evt_double_click )
                            ( event = c_evt_onf4 )
                            ( event = c_evt_top_of_page )
                            ( event = c_evt_ondrag )
                            ( event = c_evt_ondrop )
                            ( event = c_evt_ondropcomplete )
                            ( event = c_evt_drop_files ) ).

  ENDMETHOD.


  METHOD routing.

    READ TABLE mt_eventlist INTO DATA(ls_entry) WITH KEY event = iv_event.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    rs_route-form   = ls_entry-form.
    rs_route-repid  = ls_entry-repid.
    rs_route-method = ls_entry-method.

    IF ls_entry-form IS NOT INITIAL.
      rs_route-mode = c_route_form.
    ELSEIF ls_entry-method IS NOT INITIAL AND mv_local_class_definition IS NOT INITIAL.
      rs_route-mode = c_route_method.
    ENDIF.

  ENDMETHOD.


  METHOD handle_toolbar.

    DATA(ls_route) = routing( c_evt_toolbar ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING e_object
                      e_interactive
                      sender.

      WHEN c_route_method.
        DATA(lr_grid) = CAST zcl_sapkit_cm_oalv( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_object      = e_object
                e_interactive = e_interactive
                sender        = lr_grid.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_object      = e_object
                e_interactive = e_interactive.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_user_command.

    DATA(ls_route) = routing( c_evt_user_command ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING e_ucomm
                      sender.

      WHEN c_route_method.
        DATA(lr_grid) = CAST zcl_sapkit_cm_oalv( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_ucomm = e_ucomm
                sender  = lr_grid.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_ucomm = e_ucomm.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_data_changed.

    DATA(ls_route) = routing( c_evt_data_changed ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING er_data_changed
                      e_onf4
                      e_onf4_before
                      e_onf4_after
                      e_ucomm
                      sender.

      WHEN c_route_method.
        DATA(lr_grid) = CAST zcl_sapkit_cm_oalv( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                er_data_changed = er_data_changed
                e_onf4          = e_onf4
                e_onf4_before   = e_onf4_before
                e_onf4_after    = e_onf4_after
                e_ucomm         = e_ucomm
                sender          = lr_grid.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                er_data_changed = er_data_changed
                e_onf4          = e_onf4
                e_onf4_before   = e_onf4_before
                e_onf4_after    = e_onf4_after
                e_ucomm         = e_ucomm.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_data_changed_finished.

    DATA(ls_route) = routing( c_evt_changed_finished ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING e_modified
                      et_good_cells
                      sender.

      WHEN c_route_method.
        " ET_GOOD_CELLS is deliberately not offered on this route. The
        " changed cells have already been through HANDLE_DATA_CHANGED,
        " and adding a parameter here would push every receiving method
        " that does not declare it onto the fallback call, which drops
        " SENDER as well.
        DATA(lr_grid) = CAST zcl_sapkit_cm_oalv( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_modified = e_modified
                sender     = lr_grid.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_modified = e_modified.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_onf4.

    DATA(ls_route) = routing( c_evt_onf4 ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING e_fieldname
                      e_fieldvalue
                      es_row_no
                      er_event_data
                      et_bad_cells
                      e_display
                      sender.

      WHEN c_route_method.
        DATA(lr_grid) = CAST zcl_sapkit_cm_oalv( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_fieldname   = e_fieldname
                e_fieldvalue  = e_fieldvalue
                es_row_no     = es_row_no
                er_event_data = er_event_data
                et_bad_cells  = et_bad_cells
                e_display     = e_display
                sender        = lr_grid.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_fieldname   = e_fieldname
                e_fieldvalue  = e_fieldvalue
                es_row_no     = es_row_no
                er_event_data = er_event_data
                et_bad_cells  = et_bad_cells
                e_display     = e_display.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_hotspot_click.

    DATA(ls_route) = routing( c_evt_hotspot_click ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING e_row_id
                      e_column_id
                      es_row_no
                      sender.

      WHEN c_route_method.
        DATA(lr_grid) = CAST zcl_sapkit_cm_oalv( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_row_id    = e_row_id
                e_column_id = e_column_id
                es_row_no   = es_row_no
                sender      = lr_grid.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_row_id    = e_row_id
                e_column_id = e_column_id
                es_row_no   = es_row_no.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_double_click.

    DATA(ls_route) = routing( c_evt_double_click ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING e_row
                      e_column
                      es_row_no
                      sender.

      WHEN c_route_method.
        DATA(lr_grid) = CAST zcl_sapkit_cm_oalv( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_row     = e_row
                e_column  = e_column
                es_row_no = es_row_no
                sender    = lr_grid.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_row     = e_row
                e_column  = e_column
                es_row_no = es_row_no.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_top_of_page.

    DATA(ls_route) = routing( c_evt_top_of_page ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING e_dyndoc_id
                      sender.

      WHEN c_route_method.
        DATA(lr_grid) = CAST zcl_sapkit_cm_oalv( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_dyndoc_id = e_dyndoc_id
                sender      = lr_grid.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_dyndoc_id = e_dyndoc_id.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_ondrag.

    DATA(ls_route) = routing( c_evt_ondrag ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING e_row
                      e_column
                      es_row_no
                      e_dragdropobj
                      sender.

      WHEN c_route_method.
        DATA(lr_grid) = CAST zcl_sapkit_cm_oalv( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_row         = e_row
                e_column      = e_column
                es_row_no     = es_row_no
                e_dragdropobj = e_dragdropobj
                sender        = lr_grid.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_row         = e_row
                e_column      = e_column
                es_row_no     = es_row_no
                e_dragdropobj = e_dragdropobj.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_ondrop.

    DATA(ls_route) = routing( c_evt_ondrop ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING e_row
                      e_column
                      es_row_no
                      e_dragdropobj
                      sender.

      WHEN c_route_method.
        DATA(lr_grid) = CAST zcl_sapkit_cm_oalv( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_row         = e_row
                e_column      = e_column
                es_row_no     = es_row_no
                e_dragdropobj = e_dragdropobj
                sender        = lr_grid.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_row         = e_row
                e_column      = e_column
                es_row_no     = es_row_no
                e_dragdropobj = e_dragdropobj.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_ondropcomplete.

    DATA(ls_route) = routing( c_evt_ondropcomplete ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING e_row
                      e_column
                      es_row_no
                      e_dragdropobj
                      sender.

      WHEN c_route_method.
        DATA(lr_grid) = CAST zcl_sapkit_cm_oalv( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_row         = e_row
                e_column      = e_column
                es_row_no     = es_row_no
                e_dragdropobj = e_dragdropobj
                sender        = lr_grid.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                e_row         = e_row
                e_column      = e_column
                es_row_no     = es_row_no
                e_dragdropobj = e_dragdropobj.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_drop_external_files.

    DATA(ls_route) = routing( c_evt_drop_files ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING files
                      sender.

      WHEN c_route_method.
        DATA(lr_grid) = CAST zcl_sapkit_cm_oalv( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                files  = files
                sender = lr_grid.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                files = files.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.

ENDCLASS.
