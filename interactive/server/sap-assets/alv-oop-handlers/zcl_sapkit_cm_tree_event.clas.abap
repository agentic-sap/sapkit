CLASS zcl_sapkit_cm_tree_event DEFINITION
  PUBLIC
  CREATE PUBLIC.

*----------------------------------------------------------------------
* Event relay of the ALV tree.
*
* This is the tree-side twin of ZCL_SAPKIT_CM_ALV_EVENT and works the
* same way. CL_GUI_ALV_TREE raises its events on an object; this class is
* that object, subscribed to every tree event once, and forwards each one
* to wherever the report asked for it.
*
* MT_EVENTLIST holds one row per event. A row is inert until the report
* fills one of two fields on it:
*
*   FORM filled   - PERFORM that routine in the program named by REPID,
*                   passing the event parameters positionally.
*   METHOD filled - call the static method of that name on the local
*                   class the constructor was told about, passing the
*                   event parameters by name.
*
* FORM wins when both are filled; a row with neither is not forwarded.
* SENDER is optional on the receiving side: the call is attempted with
* it, and CX_SY_DYN_CALL_PARAM_NOT_FOUND is answered by repeating the
* call without it.
*
* Registering a handler is only half of what a tree event needs. The
* control also has to be told which events to report at all, and that
* second half lives in ZCL_SAPKIT_CM_ALV=>SET_TREE_EVENT_HANDLER, which
* reads the very same MT_EVENTLIST. Filling a row here without going
* through that method leaves the subscription silent.
*----------------------------------------------------------------------

  PUBLIC SECTION.

    " One subscription. EVENT is the fixed name of the tree event; FORM,
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
        !iv_repid                  TYPE sy-repid DEFAULT sy-cprog
        !iv_local_class_definition TYPE string.

    " --- picked nodes and items -------------------------------------------

    METHODS handle_node_double_click
      FOR EVENT node_double_click OF cl_gui_alv_tree
      IMPORTING
        !node_key
        !sender.

    METHODS handle_item_double_click
      FOR EVENT item_double_click OF cl_gui_alv_tree
      IMPORTING
        !fieldname
        !node_key
        !sender.

    METHODS handle_link_click
      FOR EVENT link_click OF cl_gui_alv_tree
      IMPORTING
        !fieldname
        !node_key
        !sender.

    METHODS handle_header_click
      FOR EVENT header_click OF cl_gui_alv_tree
      IMPORTING
        !fieldname
        !sender.

    METHODS handle_selection_changed
      FOR EVENT selection_changed OF cl_gui_alv_tree
      IMPORTING
        !node_key
        !sender.

    " --- edited items ------------------------------------------------------

    METHODS handle_checkbox_change
      FOR EVENT checkbox_change OF cl_gui_alv_tree
      IMPORTING
        !checked
        !fieldname
        !node_key
        !sender.

    " --- keyboard ----------------------------------------------------------

    METHODS handle_node_keypress
      FOR EVENT node_keypress OF cl_gui_alv_tree
      IMPORTING
        !key
        !node_key
        !sender.

    METHODS handle_item_keypress
      FOR EVENT item_keypress OF cl_gui_alv_tree
      IMPORTING
        !fieldname
        !key
        !node_key
        !sender.

    " --- context menus -----------------------------------------------------
    " Each menu comes as a pair: the REQUEST event is the chance to fill
    " MENU, the SELECTED event reports the FCODE the user then picked.

    METHODS handle_node_context_menu_rq
      FOR EVENT node_context_menu_request OF cl_gui_alv_tree
      IMPORTING
        !menu
        !node_key
        !sender.

    METHODS handle_node_context_menu_sel
      FOR EVENT node_context_menu_selected OF cl_gui_alv_tree
      IMPORTING
        !fcode
        !node_key
        !sender.

    METHODS handle_item_context_menu_rq
      FOR EVENT item_context_menu_request OF cl_gui_alv_tree
      IMPORTING
        !fieldname
        !menu
        !node_key
        !sender.

    METHODS handle_item_context_menu_sel
      FOR EVENT item_context_menu_selected OF cl_gui_alv_tree
      IMPORTING
        !fcode
        !fieldname
        !node_key
        !sender.

    " --- lazy expansion ----------------------------------------------------
    " Raised when a node marked as expandable is opened but carries no
    " children yet, so the report can add them on demand.

    METHODS handle_expand_nc
      FOR EVENT expand_nc OF cl_gui_alv_tree
      IMPORTING
        !node_key
        !sender.

    " --- drag and drop -----------------------------------------------------

    METHODS handle_on_drag
      FOR EVENT on_drag OF cl_gui_alv_tree
      IMPORTING
        !drag_drop_object
        !fieldname
        !node_key
        !sender.

    METHODS handle_on_drag_multiple
      FOR EVENT on_drag_multiple OF cl_gui_alv_tree
      IMPORTING
        !drag_drop_object
        !fieldname
        !node_key_table
        !sender.

    METHODS handle_on_drop
      FOR EVENT on_drop OF cl_gui_alv_tree
      IMPORTING
        !drag_drop_object
        !node_key
        !sender.

    METHODS handle_on_drop_get_flavor
      FOR EVENT on_drop_get_flavor OF cl_gui_alv_tree
      IMPORTING
        !drag_drop_object
        !node_key
        !sender.

    METHODS handle_on_drop_complete
      FOR EVENT on_drop_complete OF cl_gui_alv_tree
      IMPORTING
        !drag_drop_object
        !fieldname
        !node_key
        !sender.

    METHODS handle_on_drop_complete_mult
      FOR EVENT on_drop_complete_multiple OF cl_gui_alv_tree
      IMPORTING
        !drag_drop_object
        !fieldname
        !node_key_table
        !sender.

    METHODS handle_on_drop_external_files
      FOR EVENT on_drop_external_files OF cl_gui_alv_tree
      IMPORTING
        !node_key
        !files
        !sender.

  PROTECTED SECTION.
  PRIVATE SECTION.

    " Names of the subscribable events. They are the row keys of
    " MT_EVENTLIST, and SET_TREE_EVENT_HANDLER of ZCL_SAPKIT_CM_ALV reads
    " the same spellings, so they are fixed on both sides.
    CONSTANTS c_evt_node_double_click TYPE formname VALUE 'HANDLE_NODE_DOUBLE_CLICK'.
    CONSTANTS c_evt_item_double_click TYPE formname VALUE 'HANDLE_ITEM_DOUBLE_CLICK'.
    CONSTANTS c_evt_link_click TYPE formname VALUE 'HANDLE_LINK_CLICK'.
    CONSTANTS c_evt_header_click TYPE formname VALUE 'HANDLE_HEADER_CLICK'.
    CONSTANTS c_evt_selection_changed TYPE formname VALUE 'HANDLE_SELECTION_CHANGED'.
    CONSTANTS c_evt_checkbox_change TYPE formname VALUE 'HANDLE_CHECKBOX_CHANGE'.
    CONSTANTS c_evt_node_keypress TYPE formname VALUE 'HANDLE_NODE_KEYPRESS'.
    CONSTANTS c_evt_item_keypress TYPE formname VALUE 'HANDLE_ITEM_KEYPRESS'.
    CONSTANTS c_evt_node_menu_rq TYPE formname VALUE 'HANDLE_NODE_CONTEXT_MENU_RQ'.
    CONSTANTS c_evt_node_menu_sel TYPE formname VALUE 'HANDLE_NODE_CONTEXT_MENU_SEL'.
    CONSTANTS c_evt_item_menu_rq TYPE formname VALUE 'HANDLE_ITEM_CONTEXT_MENU_RQ'.
    CONSTANTS c_evt_item_menu_sel TYPE formname VALUE 'HANDLE_ITEM_CONTEXT_MENU_SEL'.
    CONSTANTS c_evt_expand_nc TYPE formname VALUE 'HANDLE_EXPAND_NC'.
    CONSTANTS c_evt_on_drag TYPE formname VALUE 'HANDLE_ON_DRAG'.
    CONSTANTS c_evt_on_drag_multiple TYPE formname VALUE 'HANDLE_ON_DRAG_MULTIPLE'.
    CONSTANTS c_evt_on_drop TYPE formname VALUE 'HANDLE_ON_DROP'.
    CONSTANTS c_evt_on_drop_get_flavor TYPE formname VALUE 'HANDLE_ON_DROP_GET_FLAVOR'.
    CONSTANTS c_evt_on_drop_complete TYPE formname VALUE 'HANDLE_ON_DROP_COMPLETE'.
    CONSTANTS c_evt_on_drop_compl_mult TYPE formname VALUE 'HANDLE_ON_DROP_COMPLETE_MULT'.
    CONSTANTS c_evt_on_drop_ext_files TYPE formname VALUE 'HANDLE_ON_DROP_EXTERNAL_FILES'.

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



CLASS zcl_sapkit_cm_tree_event IMPLEMENTATION.


  METHOD constructor.

    " A class local to a report is only reachable by its qualified name.
    mv_local_class_definition = |\\PROGRAM={ iv_repid }\\CLASS={ iv_local_class_definition }|.

    " The rows start unclaimed - the report fills FORM or METHOD on the
    " ones it wants. REPID is the calling program rather than IV_REPID:
    " the FORM route looks the routine up there.
    "
    " C_EVT_ITEM_DOUBLE_CLICK is knowingly absent from this list. The
    " handler method for it exists and SET_TREE_EVENT_HANDLER knows the
    " name, but no row means no way to claim it. Adding one would start
    " dispatching an event that reports written against the current
    " behaviour never asked for, so the gap is left as it stands.
    mt_eventlist = VALUE #( repid = sy-cprog
                            ( event = c_evt_node_double_click )
                            ( event = c_evt_checkbox_change )
                            ( event = c_evt_expand_nc )
                            ( event = c_evt_header_click )
                            ( event = c_evt_item_menu_rq )
                            ( event = c_evt_item_menu_sel )
                            ( event = c_evt_item_keypress )
                            ( event = c_evt_link_click )
                            ( event = c_evt_node_menu_rq )
                            ( event = c_evt_node_menu_sel )
                            ( event = c_evt_node_keypress )
                            ( event = c_evt_on_drag )
                            ( event = c_evt_on_drag_multiple )
                            ( event = c_evt_on_drop )
                            ( event = c_evt_on_drop_complete )
                            ( event = c_evt_on_drop_compl_mult )
                            ( event = c_evt_on_drop_ext_files )
                            ( event = c_evt_on_drop_get_flavor )
                            ( event = c_evt_selection_changed ) ).

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


  METHOD handle_node_double_click.

    DATA(ls_route) = routing( c_evt_node_double_click ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING node_key
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                node_key = node_key
                sender   = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                node_key = node_key.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_item_double_click.

    DATA(ls_route) = routing( c_evt_item_double_click ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING fieldname
                      node_key
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                fieldname = fieldname
                node_key  = node_key
                sender    = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                fieldname = fieldname
                node_key  = node_key.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_link_click.

    DATA(ls_route) = routing( c_evt_link_click ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING fieldname
                      node_key
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                fieldname = fieldname
                node_key  = node_key
                sender    = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                fieldname = fieldname
                node_key  = node_key.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_header_click.

    DATA(ls_route) = routing( c_evt_header_click ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING fieldname
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                fieldname = fieldname
                sender    = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                fieldname = fieldname.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_selection_changed.

    DATA(ls_route) = routing( c_evt_selection_changed ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING node_key
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                node_key = node_key
                sender   = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                node_key = node_key.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_checkbox_change.

    DATA(ls_route) = routing( c_evt_checkbox_change ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING node_key
                      fieldname
                      checked
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                node_key  = node_key
                fieldname = fieldname
                checked   = checked
                sender    = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                node_key  = node_key
                fieldname = fieldname
                checked   = checked.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_node_keypress.

    DATA(ls_route) = routing( c_evt_node_keypress ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING key
                      node_key
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                key      = key
                node_key = node_key
                sender   = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                key      = key
                node_key = node_key.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_item_keypress.

    DATA(ls_route) = routing( c_evt_item_keypress ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING fieldname
                      key
                      node_key
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                fieldname = fieldname
                key       = key
                node_key  = node_key
                sender    = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                fieldname = fieldname
                key       = key
                node_key  = node_key.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_node_context_menu_rq.

    DATA(ls_route) = routing( c_evt_node_menu_rq ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING menu
                      node_key
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                menu     = menu
                node_key = node_key
                sender   = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                menu     = menu
                node_key = node_key.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_node_context_menu_sel.

    DATA(ls_route) = routing( c_evt_node_menu_sel ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING fcode
                      node_key
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                fcode    = fcode
                node_key = node_key
                sender   = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                fcode    = fcode
                node_key = node_key.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_item_context_menu_rq.

    DATA(ls_route) = routing( c_evt_item_menu_rq ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING fieldname
                      menu
                      node_key
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                fieldname = fieldname
                menu      = menu
                node_key  = node_key
                sender    = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                fieldname = fieldname
                menu      = menu
                node_key  = node_key.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_item_context_menu_sel.

    DATA(ls_route) = routing( c_evt_item_menu_sel ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING fieldname
                      fcode
                      node_key
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                fieldname = fieldname
                fcode     = fcode
                node_key  = node_key
                sender    = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                fieldname = fieldname
                fcode     = fcode
                node_key  = node_key.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_expand_nc.

    DATA(ls_route) = routing( c_evt_expand_nc ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING node_key
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                node_key = node_key
                sender   = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                node_key = node_key.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_on_drag.

    DATA(ls_route) = routing( c_evt_on_drag ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING drag_drop_object
                      fieldname
                      node_key
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                drag_drop_object = drag_drop_object
                fieldname        = fieldname
                node_key         = node_key
                sender           = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                drag_drop_object = drag_drop_object
                fieldname        = fieldname
                node_key         = node_key.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_on_drag_multiple.

    DATA(ls_route) = routing( c_evt_on_drag_multiple ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING drag_drop_object
                      fieldname
                      node_key_table
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                drag_drop_object = drag_drop_object
                fieldname        = fieldname
                node_key_table   = node_key_table
                sender           = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                drag_drop_object = drag_drop_object
                fieldname        = fieldname
                node_key_table   = node_key_table.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_on_drop.

    DATA(ls_route) = routing( c_evt_on_drop ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING drag_drop_object
                      node_key
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                drag_drop_object = drag_drop_object
                node_key         = node_key
                sender           = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                drag_drop_object = drag_drop_object
                node_key         = node_key.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_on_drop_get_flavor.

    DATA(ls_route) = routing( c_evt_on_drop_get_flavor ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING drag_drop_object
                      node_key
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                drag_drop_object = drag_drop_object
                node_key         = node_key
                sender           = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                drag_drop_object = drag_drop_object
                node_key         = node_key.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_on_drop_complete.

    DATA(ls_route) = routing( c_evt_on_drop_complete ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING drag_drop_object
                      fieldname
                      node_key
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                drag_drop_object = drag_drop_object
                fieldname        = fieldname
                node_key         = node_key
                sender           = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                drag_drop_object = drag_drop_object
                fieldname        = fieldname
                node_key         = node_key.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_on_drop_complete_mult.

    DATA(ls_route) = routing( c_evt_on_drop_compl_mult ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING drag_drop_object
                      fieldname
                      node_key_table
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                drag_drop_object = drag_drop_object
                fieldname        = fieldname
                node_key_table   = node_key_table
                sender           = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                drag_drop_object = drag_drop_object
                fieldname        = fieldname
                node_key_table   = node_key_table.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.


  METHOD handle_on_drop_external_files.

    DATA(ls_route) = routing( c_evt_on_drop_ext_files ).

    CASE ls_route-mode.
      WHEN c_route_form.
        PERFORM (ls_route-form) IN PROGRAM (ls_route-repid) IF FOUND
                USING node_key
                      files
                      sender.

      WHEN c_route_method.
        DATA(lr_tree) = CAST zcl_sapkit_cm_otree( sender ).
        TRY.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                node_key = node_key
                files    = files
                sender   = lr_tree.
          CATCH cx_sy_dyn_call_param_not_found.
            CALL METHOD (mv_local_class_definition)=>(ls_route-method)
              EXPORTING
                node_key = node_key
                files    = files.
        ENDTRY.
    ENDCASE.

  ENDMETHOD.

ENDCLASS.
