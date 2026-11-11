*&---------------------------------------------------------------------*
*& Include ZSAPKIT_OOP_EXA
*&---------------------------------------------------------------------*
*& What    : LCL_ALV - the display half of the two-class split. Screen
*&           0100 shows one grid in a docking container; screen 0200
*&           splits the screen and stands a tree next to a grid.
*& How     : Standard controls only - CL_GUI_DOCKING_CONTAINER,
*&           CL_GUI_SPLITTER_CONTAINER, CL_GUI_ALV_GRID, CL_GUI_ALV_TREE.
*&           Nothing has to be installed on the system first. The two
*&           SHOW_* methods are what the PBO modules call; the ON_*
*&           methods are what ZSAPKIT_OOP_EXE forwards events into.
*& Caution : PBO runs on every pass of a screen. SHOW_* builds the
*&           controls on the first pass only and refreshes them on every
*&           later one - build a second container on the same screen and
*&           the first one is orphaned behind it.
*&---------------------------------------------------------------------*

CLASS lcl_alv DEFINITION FINAL.

  PUBLIC SECTION.
    METHODS display.

    METHODS show_0100.

    METHODS show_0200.

    METHODS handle_user_command
      IMPORTING iv_fcode TYPE sy-ucomm.

    METHODS on_hotspot_click
      IMPORTING is_row_no    TYPE lvc_s_roid
                is_column_id TYPE lvc_s_col
                io_sender    TYPE REF TO cl_gui_alv_grid.

    METHODS on_data_changed
      IMPORTING io_data_changed TYPE REF TO cl_alv_changed_data_protocol
                io_sender       TYPE REF TO cl_gui_alv_grid.

    METHODS on_tree_link_click
      IMPORTING iv_fieldname TYPE lvc_fname
                iv_node_key  TYPE lvc_nkey
                io_sender    TYPE REF TO cl_gui_alv_tree.

    METHODS on_node_double_click
      IMPORTING iv_node_key TYPE lvc_nkey
                io_sender   TYPE REF TO cl_gui_alv_tree.

  PRIVATE SECTION.
    DATA mo_grid_0100 TYPE REF TO cl_gui_alv_grid.
    DATA mo_grid_0200 TYPE REF TO cl_gui_alv_grid.
    DATA mo_tree TYPE REF TO cl_gui_alv_tree.

    " The tree takes this table over at first display: it must be empty
    " then, and from that point on it grows only through ADD_NODE.
    DATA mt_tree_outtab TYPE ty_headers.
    DATA mt_node TYPE ty_nodes.

    METHODS is_own_grid
      IMPORTING io_grid       TYPE REF TO cl_gui_alv_grid
      RETURNING VALUE(rv_own) TYPE abap_bool.

    METHODS build_grid
      IMPORTING io_parent      TYPE REF TO cl_gui_container
      RETURNING VALUE(ro_grid) TYPE REF TO cl_gui_alv_grid.

    METHODS build_tree
      IMPORTING io_parent TYPE REF TO cl_gui_container.

    METHODS build_fieldcat
      RETURNING VALUE(rt_fcat) TYPE lvc_t_fcat.

    METHODS add_nodes.

    METHODS refresh_grids.

    METHODS show_purchase_order
      IMPORTING iv_ebeln TYPE ebeln.

    METHODS check_quantity
      IMPORTING io_data_changed TYPE REF TO cl_alv_changed_data_protocol
                is_modified     TYPE lvc_s_modi.

ENDCLASS.


CLASS lcl_alv IMPLEMENTATION.

  METHOD display.
    IF p_tree = abap_true.
      CALL SCREEN gc_dynnr_0200.
    ELSE.
      CALL SCREEN gc_dynnr_0100.
    ENDIF.
  ENDMETHOD.

  METHOD show_0100.
    IF mo_grid_0100 IS BOUND.
      refresh_grids( ).
      RETURN.
    ENDIF.

    DATA(lo_dock) = NEW cl_gui_docking_container( repid     = sy-repid
                                                  dynnr     = gc_dynnr_0100
                                                  side      = cl_gui_docking_container=>dock_at_left
                                                  extension = gc_dock_extension ).

    mo_grid_0100 = build_grid( lo_dock ).
  ENDMETHOD.

  METHOD show_0200.
    IF mo_tree IS BOUND.
      refresh_grids( ).
      RETURN.
    ENDIF.

    DATA(lo_dock) = NEW cl_gui_docking_container( repid     = sy-repid
                                                  dynnr     = gc_dynnr_0200
                                                  side      = cl_gui_docking_container=>dock_at_left
                                                  extension = gc_dock_extension ).

    " One row, two columns: the tree takes column 1, the grid column 2.
    DATA(lo_split) = NEW cl_gui_splitter_container( parent  = lo_dock
                                                    rows    = 1
                                                    columns = 2 ).
    lo_split->set_column_width( id    = 1
                                width = gc_tree_width ).

    build_tree( lo_split->get_container( row    = 1
                                         column = 1 ) ).

    mo_grid_0200 = build_grid( lo_split->get_container( row    = 1
                                                        column = 2 ) ).
  ENDMETHOD.

  METHOD build_grid.
    DATA(lt_fcat) = build_fieldcat( ).

    ro_grid = NEW cl_gui_alv_grid( i_parent = io_parent ).

    " DATA_CHANGED fires only for the edit events registered here.
    ro_grid->register_edit_event( i_event_id = cl_gui_alv_grid=>mc_evt_enter ).
    ro_grid->register_edit_event( i_event_id = cl_gui_alv_grid=>mc_evt_modified ).

    " Layout variants are kept per report and per control kind (HANDLE),
    " and the user may save them in every mode.
    ro_grid->set_table_for_first_display(
      EXPORTING
        i_default       = abap_true
        is_variant      = VALUE #( report = sy-repid
                                   handle = 'GRID' )
        i_save          = 'A'
        is_layout       = VALUE #( stylefname = 'CELLSTYL'
                                   ctab_fname = 'CELLSCOL'
                                   sel_mode   = 'A' )
      CHANGING
        it_outtab       = go_data->mt_item
        it_fieldcatalog = lt_fcat ).
  ENDMETHOD.

  METHOD build_tree.
    DATA lt_events TYPE cntl_simple_events.

    mo_tree = NEW cl_gui_alv_tree( parent              = io_parent
                                   node_selection_mode = cl_gui_column_tree=>node_sel_mode_single
                                   item_selection      = abap_true
                                   no_html_header      = abap_true
                                   no_toolbar          = abap_true ).

    DATA(lt_fcat) = VALUE lvc_t_fcat( ( fieldname = 'EBELN'
                                        coltext   = 'Purchase order'
                                        domname   = 'EBELN' )
                                      ( fieldname = 'BSART'
                                        coltext   = 'Order type'
                                        domname   = 'BSART' ) ).

    mo_tree->set_table_for_first_display(
      EXPORTING
        is_hierarchy_header = VALUE #( heading = 'Purchase order'
                                       tooltip = 'Purchase order'
                                       width   = 30 )
        is_variant          = VALUE #( report = sy-repid
                                       handle = 'TREE' )
        i_save              = 'A'
      CHANGING
        it_outtab           = mt_tree_outtab
        it_fieldcatalog     = lt_fcat ).

    add_nodes( ).

    " The frontend reports a tree click only for events named here.
    " Start from what the tree already reports - it registers a few of
    " its own - and add to that list instead of replacing it.
    mo_tree->get_registered_events( IMPORTING events = lt_events ).
    lt_events = VALUE #( BASE lt_events
                         ( eventid = cl_gui_column_tree=>eventid_link_click )
                         ( eventid = cl_gui_column_tree=>eventid_node_double_click ) ).
    mo_tree->set_registered_events( events = lt_events ).

    mo_tree->frontend_update( ).
  ENDMETHOD.

  METHOD add_nodes.
    DATA lv_head_key TYPE lvc_nkey.
    DATA lv_item_key TYPE lvc_nkey.

    CLEAR mt_node.

    " One node per purchase order, its items hanging underneath. The
    " rows are the ones LCL_DATA derived for the tree. The node key of
    " each is kept in MT_NODE so a tree event can find the row it
    " stands for.
    LOOP AT go_data->mt_header ASSIGNING FIELD-SYMBOL(<ls_header>)
         GROUP BY ( ebeln = <ls_header>-ebeln
                    bsart = <ls_header>-bsart )
         ASSIGNING FIELD-SYMBOL(<ls_group>).

      mo_tree->add_node(
        EXPORTING
          i_relat_node_key = space
          i_relationship   = cl_gui_column_tree=>relat_last_child
          i_node_text      = CONV #( <ls_group>-ebeln )
          is_outtab_line   = VALUE ty_header( ebeln = <ls_group>-ebeln
                                              bsart = <ls_group>-bsart )
          it_item_layout   = VALUE #( ( fieldname = cl_gui_alv_tree=>c_hierarchy_column_name
                                        class     = cl_gui_column_tree=>item_class_link ) )
        IMPORTING
          e_new_node_key   = lv_head_key ).

      APPEND VALUE #( ebeln    = <ls_group>-ebeln
                      node_key = lv_head_key ) TO mt_node.

      LOOP AT GROUP <ls_group> ASSIGNING FIELD-SYMBOL(<ls_member>).

        mo_tree->add_node(
          EXPORTING
            i_relat_node_key = lv_head_key
            i_relationship   = cl_gui_column_tree=>relat_last_child
            i_node_text      = CONV #( <ls_member>-ebelp )
            is_outtab_line   = <ls_member>
            it_item_layout   = VALUE #( ( fieldname = 'EBELN'
                                          class     = cl_gui_column_tree=>item_class_link ) )
          IMPORTING
            e_new_node_key   = lv_item_key ).

        APPEND VALUE #( ebeln    = <ls_member>-ebeln
                        ebelp    = <ls_member>-ebelp
                        node_key = lv_item_key ) TO mt_node.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD build_fieldcat.
    " A local row type has no dictionary name to merge from, so the
    " catalog is read off the table itself. SALV describes any table it
    " is given, and an empty table of the same type describes just as
    " well as a full one.
    DATA lt_shape TYPE ty_items.

    TRY.
        cl_salv_table=>factory( IMPORTING r_salv_table = DATA(lo_salv)
                                CHANGING  t_table      = lt_shape ).

        rt_fcat = cl_salv_controller_metadata=>get_lvc_fieldcatalog(
                      r_columns      = lo_salv->get_columns( )
                      r_aggregations = lo_salv->get_aggregations( ) ).

      CATCH cx_salv_msg INTO DATA(lo_error).
        MESSAGE lo_error->get_text( ) TYPE 'I' DISPLAY LIKE 'E'.
        RETURN.
    ENDTRY.

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

  METHOD refresh_grids.
    " Keep the user's scroll position and the cursor on the same cell.
    DATA(ls_stable) = VALUE lvc_s_stbl( row = abap_true
                                        col = abap_true ).

    IF mo_grid_0100 IS BOUND.
      mo_grid_0100->refresh_table_display( is_stable = ls_stable ).
    ENDIF.

    IF mo_grid_0200 IS BOUND.
      mo_grid_0200->refresh_table_display( is_stable = ls_stable ).
    ENDIF.
  ENDMETHOD.

  METHOD is_own_grid.
    " The event classes listen to every grid of the session, so a grid
    " event is acted on only when it comes from a grid built here.
    rv_own = xsdbool( io_grid IS BOUND
                      AND ( io_grid = mo_grid_0100 OR io_grid = mo_grid_0200 ) ).
  ENDMETHOD.

  METHOD handle_user_command.
    CASE iv_fcode.
      WHEN gc_fcode_refresh.
        refresh_grids( ).
      WHEN OTHERS.
        " Ignored on purpose. BACK, EXIT and CANC never arrive here -
        " the screen flow logic takes them at MODULE exit AT
        " EXIT-COMMAND, before PAI reaches this dispatcher.
    ENDCASE.
  ENDMETHOD.

  METHOD on_hotspot_click.
    CHECK is_own_grid( io_sender ) = abap_true.

    READ TABLE go_data->mt_item INDEX is_row_no-row_id ASSIGNING FIELD-SYMBOL(<ls_item>).
    CHECK sy-subrc = 0.

    IF is_column_id-fieldname = gc_col_ebeln.
      show_purchase_order( <ls_item>-ebeln ).
    ENDIF.
  ENDMETHOD.

  METHOD on_tree_link_click.
    CHECK io_sender IS BOUND AND io_sender = mo_tree.

    READ TABLE mt_node WITH KEY node_key = iv_node_key ASSIGNING FIELD-SYMBOL(<ls_node>).
    CHECK sy-subrc = 0.

    IF iv_fieldname = gc_col_ebeln
    OR iv_fieldname = cl_gui_alv_tree=>c_hierarchy_column_name.
      show_purchase_order( <ls_node>-ebeln ).
    ENDIF.
  ENDMETHOD.

  METHOD on_node_double_click.
    CHECK io_sender IS BOUND AND io_sender = mo_tree.

    READ TABLE mt_node WITH KEY node_key = iv_node_key ASSIGNING FIELD-SYMBOL(<ls_node>).
    CHECK sy-subrc = 0.

    DATA(lt_item) = VALUE ty_items( FOR ls_item IN go_data->mt_item
                                    WHERE ( ebeln = <ls_node>-ebeln )
                                    ( ls_item ) ).

    DATA(lv_text) = |{ <ls_node>-ebeln } carries { lines( lt_item ) } item(s)|.
    MESSAGE lv_text TYPE 'S'.
  ENDMETHOD.

  METHOD on_data_changed.
    CHECK is_own_grid( io_sender ) = abap_true.

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
