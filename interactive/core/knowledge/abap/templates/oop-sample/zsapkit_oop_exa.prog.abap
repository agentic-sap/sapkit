*&---------------------------------------------------------------------*
*& Include ZSAPKIT_OOP_EXA
*&---------------------------------------------------------------------*
*& What    : LCL_ALV - the display half of the two-class split. Screen
*&           0100 shows one grid in a docking container; screen 0200
*&           splits the screen and stands a tree next to a grid.
*& How     : Every CREATE_*, SET_*, DISPLAY_* and REFRESH_* call below
*&           is inherited from ZCL_SAPKIT_CM_ALV. What this class adds
*&           is the two SET_ALV_* entry points the PBO modules call,
*&           and the ON_* methods that ZSAPKIT_OOP_EXE forwards into.
*& Caution : A container is built once per screen. The PBO module asks
*&           MT_OALV whether this DYNNR already carries a grid and
*&           refreshes instead of building a second one.
*&---------------------------------------------------------------------*

CLASS lcl_alv DEFINITION INHERITING FROM zcl_sapkit_cm_alv.

  PUBLIC SECTION.
    METHODS constructor.

    METHODS display.

    METHODS set_alv_0100.

    METHODS set_alv_0200.

    METHODS handle_user_command
      IMPORTING iv_fcode TYPE sy-ucomm.

    METHODS on_hotspot_click
      IMPORTING is_row_no    TYPE lvc_s_roid
                is_column_id TYPE lvc_s_col
                io_sender    TYPE REF TO zcl_sapkit_cm_oalv.

    METHODS on_data_changed
      IMPORTING io_data_changed TYPE REF TO cl_alv_changed_data_protocol
                io_sender       TYPE REF TO zcl_sapkit_cm_oalv.

    METHODS on_tree_link_click
      IMPORTING iv_fieldname TYPE lvc_fname
                iv_node_key  TYPE lvc_nkey.

    METHODS on_node_double_click
      IMPORTING iv_node_key TYPE lvc_nkey.

  PRIVATE SECTION.
    DATA mt_node TYPE ty_nodes.

    METHODS build_fieldcat
      RETURNING VALUE(rt_fcat) TYPE lvc_t_fcat.

    METHODS set_tree_0200
      RAISING zcx_sapkit_excp.

    METHODS set_grid_0200
      RAISING zcx_sapkit_excp.

    METHODS add_nodes_0200.

    METHODS show_purchase_order
      IMPORTING iv_ebeln TYPE ebeln.

    METHODS check_quantity
      IMPORTING io_data_changed TYPE REF TO cl_alv_changed_data_protocol
                is_modified     TYPE lvc_s_modi.

ENDCLASS.


CLASS lcl_alv IMPLEMENTATION.

  METHOD constructor.
    super->constructor( ).

    " The handler set builds one MT_EVENTLIST entry per event it can
    " serve. Filling METHOD on an entry is what routes that event into
    " the local class named on the left.
    mo_alv_event = NEW #( iv_local_class_definition = 'LCL_EVENT_ALV' ).

    LOOP AT mo_alv_event->mt_eventlist ASSIGNING FIELD-SYMBOL(<ls_grid_evt>)
         WHERE event = gc_evt_hotspot_click
            OR event = gc_evt_data_changed.
      <ls_grid_evt>-method = <ls_grid_evt>-event.
    ENDLOOP.

    mo_tree_event = NEW #( iv_local_class_definition = 'LCL_EVENT_TREE' ).

    LOOP AT mo_tree_event->mt_eventlist ASSIGNING FIELD-SYMBOL(<ls_tree_evt>)
         WHERE event = gc_evt_link_click
            OR event = gc_evt_node_dbl_click.
      <ls_tree_evt>-method = <ls_tree_evt>-event.
    ENDLOOP.
  ENDMETHOD.

  METHOD display.
    IF p_tree = abap_true.
      mv_dynnr = gc_dynnr_0200.
    ELSE.
      mv_dynnr = gc_dynnr_0100.
    ENDIF.

    CALL SCREEN mv_dynnr.
  ENDMETHOD.

  METHOD set_alv_0100.
    TRY.
        DATA(lo_dock) = create_dock_container( ).

        create_alv_grid( io_parent_dock = lo_dock ).

        set_layout( is_layout = VALUE #( stylefname = 'CELLSTYL'
                                         ctab_fname = 'CELLSCOL'
                                         sel_mode   = 'A' ) ).
        set_fieldcat( it_fcat = build_fieldcat( ) ).
        set_register_event( iv_enter = abap_true
                            iv_modified = abap_true ).
        set_event_handler( io_event = mo_alv_event ).

        display_alv( CHANGING it_data = go_data->mt_item ).

      CATCH zcx_sapkit_excp INTO DATA(lo_error).
        MESSAGE lo_error->get_text( ) TYPE 'I' DISPLAY LIKE 'E'.
    ENDTRY.
  ENDMETHOD.

  METHOD set_alv_0200.
    TRY.
        " One row, two columns: the tree takes column 1, the grid
        " column 2. SET_CONTAINER_WIDTH narrows the tree side.
        create_split_container( iv_rows = 1
                                iv_columns = 2 ).
        set_container_width( iv_width = 15 ).

        set_tree_0200( ).
        set_grid_0200( ).

      CATCH zcx_sapkit_excp INTO DATA(lo_error).
        MESSAGE lo_error->get_text( ) TYPE 'I' DISPLAY LIKE 'E'.
        LEAVE LIST-PROCESSING.
    ENDTRY.
  ENDMETHOD.

  METHOD set_tree_0200.
    create_alv_tree( iv_column = 1
                     iv_item_selection = abap_true ).

    set_tree_header(
      is_hierarchy_header = VALUE #( heading   = 'Purchase order'
                                     tooltip   = 'Purchase order'
                                     width     = 30
                                     width_pix = abap_false )
      it_list_commentary  = VALUE #( ( typ = 'H' info = 'Purchase orders' )
                                     ( typ = 'S' info = 'Header node per order' ) ) ).

    set_tree_fieldcat( it_fcat = VALUE #( ( fieldname = 'EBELN'
                                            coltext   = 'Purchase order'
                                            domname   = 'EBELN' )
                                          ( fieldname = 'BSART'
                                            coltext   = 'Order type'
                                            domname   = 'BSART' ) ) ).

    display_tree( CHANGING it_data = go_data->mt_header ).

    add_nodes_0200( ).

    set_tree_event_handler( io_event = mo_tree_event ).
    refresh_tree( iv_columnoptimization = abap_false ).
  ENDMETHOD.

  METHOD add_nodes_0200.
    CLEAR mt_node.

    " One node per purchase order, its items hanging underneath. The
    " node key of each is kept in MT_NODE so a tree event can find the
    " row it stands for.
    LOOP AT go_data->mt_item ASSIGNING FIELD-SYMBOL(<ls_item>)
         GROUP BY ( ebeln = <ls_item>-ebeln
                    bsart = <ls_item>-bsart )
         ASSIGNING FIELD-SYMBOL(<ls_group>).

      DATA(lv_head_key) = set_tree_add_node(
          iv_node_text   = CONV #( <ls_group>-ebeln )
          is_outtab_line = VALUE ty_header( ebeln = <ls_group>-ebeln
                                            bsart = <ls_group>-bsart )
          it_item_layout = VALUE #( ( fieldname = cl_gui_alv_tree=>c_hierarchy_column_name
                                      class     = cl_gui_column_tree=>item_class_link ) ) ).

      APPEND VALUE #( ebeln    = <ls_group>-ebeln
                      node_key = lv_head_key ) TO mt_node.

      LOOP AT GROUP <ls_group> ASSIGNING FIELD-SYMBOL(<ls_member>).

        DATA(lv_item_key) = set_tree_add_node(
            iv_relat_node_key = lv_head_key
            iv_node_text      = CONV #( <ls_member>-ebelp )
            is_outtab_line    = VALUE ty_header( ebeln = <ls_member>-ebeln
                                                 ebelp = <ls_member>-ebelp
                                                 bsart = <ls_member>-bsart )
            it_item_layout    = VALUE #( ( fieldname = 'EBELN'
                                           class     = cl_gui_column_tree=>item_class_link ) ) ).

        APPEND VALUE #( ebeln    = <ls_member>-ebeln
                        ebelp    = <ls_member>-ebelp
                        node_key = lv_item_key ) TO mt_node.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD set_grid_0200.
    create_alv_grid( iv_column = 2 ).

    set_layout( is_layout = VALUE #( stylefname = 'CELLSTYL'
                                     ctab_fname = 'CELLSCOL'
                                     sel_mode   = 'A' ) ).
    set_fieldcat( it_fcat = build_fieldcat( ) ).
    set_register_event( iv_enter = abap_true
                        iv_modified = abap_true ).
    set_event_handler( io_event = mo_alv_event ).

    display_alv( CHANGING it_data = go_data->mt_item ).
  ENDMETHOD.

  METHOD build_fieldcat.
    " Both screens show the same columns, so both build the catalog
    " here rather than each keeping a copy of the same loop.
    rt_fcat = get_fieldcat( it_data = go_data->mt_item ).

    " A column the code reasons about is compared against a constant.
    " What the catalog is then given - QFIELDNAME here, DOMNAME in the
    " tree catalog - stays a literal; that is catalog content.
    LOOP AT rt_fcat ASSIGNING FIELD-SYMBOL(<ls_fcat>).
      CASE <ls_fcat>-fieldname.
        WHEN gc_col_ebeln.
          <ls_fcat>-hotspot = abap_true.
        WHEN gc_col_menge.
          <ls_fcat>-edit = abap_true.
          <ls_fcat>-qfieldname = 'MEINS'.
      ENDCASE.
    ENDLOOP.
  ENDMETHOD.

  METHOD handle_user_command.
    CASE iv_fcode.
      WHEN gc_fcode_refresh.
        refresh_alv( ).
      WHEN OTHERS.
        " Ignored on purpose. BACK, EXIT and CANC never arrive here -
        " the screen flow logic takes them at MODULE exit AT
        " EXIT-COMMAND, before PAI reaches this dispatcher.
    ENDCASE.
  ENDMETHOD.

  METHOD on_hotspot_click.
    CHECK io_sender IS BOUND.

    READ TABLE go_data->mt_item INDEX is_row_no-row_id ASSIGNING FIELD-SYMBOL(<ls_item>).
    CHECK sy-subrc = 0.

    IF is_column_id-fieldname = gc_col_ebeln.
      show_purchase_order( <ls_item>-ebeln ).
    ENDIF.
  ENDMETHOD.

  METHOD on_tree_link_click.
    READ TABLE mt_node WITH KEY node_key = iv_node_key ASSIGNING FIELD-SYMBOL(<ls_node>).
    CHECK sy-subrc = 0.

    IF iv_fieldname = gc_col_ebeln
    OR iv_fieldname = cl_gui_alv_tree=>c_hierarchy_column_name.
      show_purchase_order( <ls_node>-ebeln ).
    ENDIF.
  ENDMETHOD.

  METHOD on_node_double_click.
    READ TABLE mt_node WITH KEY node_key = iv_node_key ASSIGNING FIELD-SYMBOL(<ls_node>).
    CHECK sy-subrc = 0.

    DATA(lt_item) = VALUE ty_items( FOR ls_item IN go_data->mt_item
                                    WHERE ( ebeln = <ls_node>-ebeln )
                                    ( ls_item ) ).

    DATA(lv_text) = |{ <ls_node>-ebeln } carries { lines( lt_item ) } item(s)|.
    MESSAGE lv_text TYPE 'S'.
  ENDMETHOD.

  METHOD on_data_changed.
    CHECK io_sender IS BOUND.

    LOOP AT io_data_changed->mt_good_cells ASSIGNING FIELD-SYMBOL(<ls_cell>)
         WHERE fieldname = gc_col_menge.
      check_quantity( io_data_changed = io_data_changed
                      is_modified = <ls_cell> ).
    ENDLOOP.
  ENDMETHOD.

  METHOD check_quantity.
    DATA lv_quantity TYPE menge_d.

    " MT_GOOD_CELLS has already passed conversion, so the move is safe.
    lv_quantity = is_modified-value.
    CHECK lv_quantity IS INITIAL.

    " An entry in the protocol turns the cell red and holds the change.
    io_data_changed->add_protocol_entry(
        i_msgid     = gc_msgid
        i_msgty     = 'E'
        i_msgno     = gc_msgno
        i_msgv1     = 'Quantity must not be zero'
        i_fieldname = is_modified-fieldname
        i_row_id    = is_modified-row_id ).
  ENDMETHOD.

  METHOD show_purchase_order.
    SET PARAMETER ID gc_parid_ebeln FIELD iv_ebeln.
    CALL TRANSACTION gc_tcode_po WITH AUTHORITY-CHECK AND SKIP FIRST SCREEN.
  ENDMETHOD.

ENDCLASS.
