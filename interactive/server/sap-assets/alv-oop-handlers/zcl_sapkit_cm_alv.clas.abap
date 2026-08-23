CLASS zcl_sapkit_cm_alv DEFINITION
  PUBLIC
  CREATE PUBLIC.

*----------------------------------------------------------------------
* Screen-side half of an OOP report: builds containers, grids and trees
* and keeps track of the ones it built.
*
* A report subclasses this class, and its own display class then reaches
* every control through the methods below instead of holding references
* to CL_GUI_* objects. What makes that possible is the registry: MT_OALV,
* MT_OTREE and MT_CONTAINER each hold one row per control built, keyed by
* the four values that identify a place on a screen -
*
*   REPID + DYNNR + ROW + COLUMN
*
* - so a later call finds the same control without being handed it. REPID
* and DYNNR default to the running program and screen, and ROW and COLUMN
* default to the position of the control built last, which is why a
* report that shows one grid on one screen never passes any of the four.
*
* That default is the one thing to know before reading further. Every
* SET_* and REFRESH_* method resolves its target through GRID_INDEX or
* TREE_INDEX, and both substitute MV_ACTIVE_ROW / MV_ACTIVE_COLUMN when
* the caller leaves ROW or COLUMN initial. So the order of calls matters:
* build the control, then configure it. Configuring a second control on
* a split screen means either building it first or naming its position.
*
* The settings a grid needs before its first display - field catalogue,
* layout, sort, filter, excluded functions - are not pushed into the
* control as they arrive. They are parked on the registry row and handed
* over in one go by DISPLAY_ALV, because SET_TABLE_FOR_FIRST_DISPLAY
* takes them all together and only once. A SET_* call made after
* DISPLAY_ALV has therefore been stored but not shown.
*
* Events are the exception to that shape: they need an object to be
* raised on, so they are delegated. MO_ALV_EVENT and MO_TREE_EVENT hold
* the two relay classes, and SET_EVENT_HANDLER / SET_TREE_EVENT_HANDLER
* subscribe them to the controls. The tree needs both halves - a handler
* registration and a SET_REGISTERED_EVENTS list - and does them together.
*----------------------------------------------------------------------

  PUBLIC SECTION.

    INTERFACES zif_sapkit_cm.

    " The three objects a docked page header is made of. A header is
    " built once per grid and kept, because rebuilding it would leave the
    " old docking container on the screen.
    TYPES:
      BEGIN OF ty_top_of_pages,
        container   TYPE REF TO cl_gui_docking_container,
        html_viewer TYPE REF TO cl_gui_html_viewer,
        dd_document TYPE REF TO cl_dd_document,
      END OF ty_top_of_pages.

    " How a tree was asked to behave when it was created.
    TYPES:
      BEGIN OF ty_tree_mode,
        node_selection_mode TYPE i,
        item_selection_mode TYPE abap_bool,
        no_html_header      TYPE abap_bool,
        no_toolbar          TYPE abap_bool,
      END OF ty_tree_mode.

    " One built grid. The first four components are the key; the
    " CONTAINER trio records which kind of parent it was given; the rest
    " is what DISPLAY_ALV will hand to SET_TABLE_FOR_FIRST_DISPLAY.
    TYPES:
      BEGIN OF ty_oalv,
        repid             TYPE sy-repid,
        dynnr             TYPE sy-dynnr,
        row               TYPE i,
        column            TYPE i,
        docking_container TYPE REF TO cl_gui_docking_container,
        custom_container  TYPE REF TO cl_gui_custom_container,
        container         TYPE REF TO cl_gui_container,
        grid              TYPE REF TO zcl_sapkit_cm_oalv,
        fieldcat          TYPE lvc_t_fcat,
        layout            TYPE lvc_s_layo,
        sort              TYPE lvc_t_sort,
        f4                TYPE lvc_t_f4,
        toolbar_exclusion TYPE ui_functions,
        quickinfo         TYPE alv_t_qinf,
        filter            TYPE lvc_t_filt,
        savemode          TYPE char1,
        variant           TYPE disvariant,
        setedit           TYPE abap_bool,
        register_events   TYPE lvc_t_rows,
        topofpages        TYPE ty_top_of_pages,
        handler_events    TYPE REF TO zcl_sapkit_cm_alv_event,
      END OF ty_oalv.

    " One built tree, keyed and shaped the same way.
    TYPES:
      BEGIN OF ty_otree,
        repid             TYPE sy-repid,
        dynnr             TYPE sy-dynnr,
        row               TYPE i,
        column            TYPE i,
        docking_container TYPE REF TO cl_gui_docking_container,
        custom_container  TYPE REF TO cl_gui_custom_container,
        container         TYPE REF TO cl_gui_container,
        tree              TYPE REF TO cl_gui_alv_tree,
        option            TYPE ty_tree_mode,
        hierarchy_header  TYPE treev_hhdr,
        list_commentary   TYPE slis_t_listheader,
        logo              TYPE sdydo_value,
        exceptionfield    TYPE lvc_s_l004,
        fieldcat          TYPE lvc_t_fcat,
        quickinfo         TYPE alv_t_qinf,
        toolbar_exclusion TYPE ui_functions,
        filter            TYPE lvc_t_filt,
        savemode          TYPE char1,
        variant           TYPE disvariant,
        handler_events    TYPE REF TO zcl_sapkit_cm_tree_event,
      END OF ty_otree.

    " One place on a screen that a control can be put into. A splitter
    " pane also records ID, which is the handle SET_ROW_HEIGHT and
    " SET_COLUMN_WIDTH address it by.
    TYPES:
      BEGIN OF ty_container,
        repid             TYPE sy-repid,
        dynnr             TYPE sy-dynnr,
        parent            TYPE REF TO cl_gui_docking_container,
        splitter          TYPE REF TO cl_gui_splitter_container,
        id                TYPE i,
        row               TYPE i,
        column            TYPE i,
        height            TYPE i,
        width             TYPE i,
        docking_container TYPE REF TO cl_gui_docking_container,
        custom_container  TYPE REF TO cl_gui_custom_container,
        container         TYPE REF TO cl_gui_container,
      END OF ty_container.

    " The registries. Public because a PBO module reads them to tell a
    " first screen pass from a later one.
    DATA:
      mt_oalv TYPE TABLE OF ty_oalv.
    DATA:
      mt_otree TYPE TABLE OF ty_otree.
    DATA:
      mt_container TYPE TABLE OF ty_container.

    " Function code last handled, for a subclass that wants to keep one.
    DATA mv_ucomm TYPE sy-ucomm.
    " The two event relays, filled by the subclass constructor.
    DATA mo_alv_event TYPE REF TO zcl_sapkit_cm_alv_event.
    DATA mo_tree_event TYPE REF TO zcl_sapkit_cm_tree_event.
    " Screen the subclass is about to call, for its own bookkeeping.
    DATA mv_dynnr TYPE sy-dynnr.

* --- containers --------------------------------------------------------

    " Docks a container on one side of the screen. This is the container
    " a plain one-grid report wants: no screen painter work is needed.
    METHODS create_dock_container
      IMPORTING
        !iv_repid                  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr                  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_extension              TYPE i DEFAULT 4000
        !iv_side                   TYPE i DEFAULT cl_gui_docking_container=>dock_at_top
        !iv_row                    TYPE i DEFAULT 1
        !iv_column                 TYPE i DEFAULT 1
      RETURNING
        VALUE(ro_dock_container)   TYPE REF TO cl_gui_docking_container.

    " Wraps a custom control area that the screen painter already put on
    " the screen. IV_CONTAINER_NAME is that area's name.
    METHODS create_cust_container
      IMPORTING
        !iv_repid                  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr                  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_container_name         TYPE csequence
      RETURNING
        VALUE(ro_cust_container)   TYPE REF TO cl_gui_custom_container.

    " Splits a docked container into up to four panes and registers each
    " one. The panes come back through EO_CONTAINER_01..04 and are also
    " reachable afterwards by their ROW and COLUMN.
    METHODS create_split_container
      IMPORTING
        !iv_repid             TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr             TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_extension         TYPE i DEFAULT 4000
        !iv_rows              TYPE i
        !iv_columns           TYPE i
      EXPORTING
        VALUE(eo_container_01) TYPE REF TO cl_gui_container
        VALUE(eo_container_02) TYPE REF TO cl_gui_container
        VALUE(eo_container_03) TYPE REF TO cl_gui_container
        VALUE(eo_container_04) TYPE REF TO cl_gui_container
      RAISING
        zcx_sapkit_excp.

    " Narrows one splitter pane. IV_WIDTH is a percentage of the width
    " the splitter has to give away.
    METHODS set_container_width
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i DEFAULT 1
        !iv_column TYPE i DEFAULT 1
        !iv_width  TYPE i DEFAULT 30.

    " The same for the height of a pane.
    METHODS set_container_height
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i DEFAULT 1
        !iv_column TYPE i DEFAULT 1
        !iv_height TYPE i DEFAULT 20.

* --- grid --------------------------------------------------------------

    " Builds a grid and registers it. The parent is either handed in -
    " one of the three IO_PARENT* parameters - or looked up from the
    " containers already registered for this screen position.
    METHODS create_alv_grid
      IMPORTING
        !io_parent       TYPE REF TO cl_gui_container OPTIONAL
        !io_parent_dock  TYPE REF TO cl_gui_docking_container OPTIONAL
        !io_parent_cust  TYPE REF TO cl_gui_custom_container OPTIONAL
        !iv_dynnr        TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_repid        TYPE sy-cprog DEFAULT sy-cprog
        !iv_row          TYPE i DEFAULT 1
        !iv_column       TYPE i DEFAULT 1
      RETURNING
        VALUE(ro_oalv)   TYPE REF TO zcl_sapkit_cm_oalv
      RAISING
        zcx_sapkit_excp.

    " Describes a table as a field catalogue, from a DDIC name if there
    " is one and otherwise from the shape of the table itself.
    CLASS-METHODS get_fieldcat
      IMPORTING
        !it_data       TYPE STANDARD TABLE OPTIONAL
        !iv_tabname    TYPE tabname OPTIONAL
      RETURNING
        VALUE(rt_fcat) TYPE lvc_t_fcat.

    METHODS set_fieldcat
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !it_fcat   TYPE lvc_t_fcat
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL.

    METHODS set_layout
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL
        !is_layout TYPE lvc_s_layo.

    METHODS set_sort
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL
        !it_sort   TYPE lvc_t_sort.

    METHODS set_filter
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL
        !it_filter TYPE lvc_t_filt.

    " Picks one of four toolbar profiles. '1' is the read-only default,
    " '2' and '3' additionally take sorting and totals away, '4' is the
    " editable one and keeps the row and refresh functions.
    METHODS set_excluding
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL
        !iv_type   TYPE char01 DEFAULT '1'.

    METHODS set_quickinfo
      IMPORTING
        !iv_repid     TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr     TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row       TYPE i OPTIONAL
        !iv_column    TYPE i OPTIONAL
        !it_quickinfo TYPE alv_t_qinf.

    METHODS set_f4
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL
        !it_f4     TYPE lvc_t_f4.

    " Builds the page header of a grid and hands back its three parts so
    " the caller can write into the document. Built once per grid.
    METHODS set_top_of_page
      IMPORTING
        !iv_repid    TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr    TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row      TYPE i OPTIONAL
        !iv_column   TYPE i OPTIONAL
        !iv_size     TYPE i DEFAULT 45
        !iv_type     TYPE char1 DEFAULT '1'
      EXPORTING
        !eo_dock     TYPE REF TO cl_gui_docking_container
        !eo_html     TYPE REF TO cl_gui_html_viewer
        !eo_document TYPE REF TO cl_dd_document.

    " Tells the grid when to report edited cells: on ENTER, on leaving a
    " modified cell, or both. Without this, DATA_CHANGED never fires.
    METHODS set_register_event
      IMPORTING
        !iv_repid    TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr    TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row      TYPE i OPTIONAL
        !iv_column   TYPE i OPTIONAL
        !iv_enter    TYPE abap_bool DEFAULT space
        !iv_modified TYPE abap_bool DEFAULT space.

    " Switches a displayed grid between editable and read-only.
    METHODS set_ready_for_input
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL
        !iv_input  TYPE abap_bool DEFAULT abap_false.

    " Lets files be dropped onto the grid from outside SAP. Call before
    " subscribing to DROP_EXTERNAL_FILES.
    METHODS set_drop_external
      IMPORTING
        !iv_repid        TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr        TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row          TYPE i OPTIONAL
        !iv_column       TYPE i OPTIONAL
        !iv_accept_files TYPE i DEFAULT 1.

    " Subscribes the relay to the grid, for the events the caller has
    " claimed in IO_EVENT->MT_EVENTLIST.
    METHODS set_event_handler
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL
        !io_event  TYPE REF TO zcl_sapkit_cm_alv_event.

    " Shows the grid, handing over everything parked on its registry row.
    " IT_DATA stays with the caller - the grid displays it in place, so
    " the table has to outlive the screen.
    METHODS display_alv
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL
      CHANGING
        !it_data   TYPE ANY TABLE
      RAISING
        zcx_sapkit_excp.

    " Redraws a grid whose table has changed underneath it.
    METHODS refresh_alv
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL
        !is_stable TYPE lvc_s_stbl OPTIONAL.

* --- tree --------------------------------------------------------------

    " Builds a tree and registers it. The parent is found the same way as
    " for a grid; the four mode parameters are fixed at creation time.
    METHODS create_alv_tree
      IMPORTING
        !io_parent         TYPE REF TO cl_gui_container OPTIONAL
        !io_parent_dock    TYPE REF TO cl_gui_docking_container OPTIONAL
        !io_parent_cust    TYPE REF TO cl_gui_custom_container OPTIONAL
        !iv_dynnr          TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_repid          TYPE sy-cprog DEFAULT sy-cprog
        !iv_row            TYPE i DEFAULT 1
        !iv_column         TYPE i DEFAULT 1
        !iv_selection_mode TYPE i DEFAULT cl_gui_column_tree=>node_sel_mode_single
        !iv_item_selection TYPE abap_bool DEFAULT abap_true
        !iv_no_html_header TYPE abap_bool DEFAULT abap_true
        !iv_no_toolbar     TYPE abap_bool DEFAULT abap_true
      RETURNING
        VALUE(ro_otree)    TYPE REF TO zcl_sapkit_cm_otree
      RAISING
        zcx_sapkit_excp.

    METHODS set_tree_fieldcat
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL
        !it_fcat   TYPE lvc_t_fcat.

    " The hierarchy column heading and the list header shown above it.
    METHODS set_tree_header
      IMPORTING
        !iv_repid             TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr             TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row               TYPE i OPTIONAL
        !iv_column            TYPE i OPTIONAL
        !is_hierarchy_header  TYPE treev_hhdr
        !it_list_commentary   TYPE slis_t_listheader OPTIONAL
        !iv_logo              TYPE sdydo_value DEFAULT space.

    METHODS set_tree_filter
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL
        !it_filter TYPE lvc_t_filt.

    " Picks a tree toolbar profile: '1' keeps navigation and layout, '2'
    " strips the toolbar down to nothing.
    METHODS set_tree_excluding
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL
        !iv_type   TYPE char01 DEFAULT '1'.

    METHODS set_tree_quickinfo
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL
        !it_qinfo  TYPE lvc_t_qinf.

    " Subscribes the relay to the tree. Unlike the grid, a tree also has
    " to be told which events to report at all, so this method does both.
    METHODS set_tree_event_handler
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL
        !io_event  TYPE REF TO zcl_sapkit_cm_tree_event.

    " Adds one node and returns its key. IS_OUTTAB_LINE is the row the
    " node stands for and must match the tree field catalogue.
    METHODS set_tree_add_node
      IMPORTING
        !iv_repid              TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr              TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row                TYPE i OPTIONAL
        !iv_column             TYPE i OPTIONAL
        !iv_relat_node_key     TYPE lvc_nkey OPTIONAL
        !iv_relationship       TYPE i DEFAULT cl_gui_column_tree=>relat_last_child
        !iv_node_text          TYPE lvc_value
        !is_outtab_line        TYPE any
        !is_node_layout        TYPE lvc_s_layn OPTIONAL
        !it_item_layout        TYPE lvc_t_layi
      RETURNING
        VALUE(rv_new_node_key) TYPE lvc_nkey.

    " Shows the tree. Nodes are added afterwards, not before.
    METHODS display_tree
      IMPORTING
        !iv_repid  TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr  TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row    TYPE i OPTIONAL
        !iv_column TYPE i OPTIONAL
      CHANGING
        !it_data   TYPE ANY TABLE
      RAISING
        zcx_sapkit_excp.

    " Recalculates the tree and sends it to the frontend. Adding nodes
    " changes nothing on screen until this runs.
    METHODS refresh_tree
      IMPORTING
        !iv_repid              TYPE sy-cprog DEFAULT sy-cprog
        !iv_dynnr              TYPE sy-dynnr DEFAULT sy-dynnr
        !iv_row                TYPE i OPTIONAL
        !iv_column             TYPE i OPTIONAL
        !iv_columnoptimization TYPE abap_bool DEFAULT abap_true.

  PROTECTED SECTION.
  PRIVATE SECTION.

    " Position of the control built last. Every lookup falls back to it
    " when the caller leaves ROW or COLUMN initial.
    DATA mv_active_row TYPE i.
    DATA mv_active_column TYPE i.

    " Toolbar profiles, as accepted by SET_EXCLUDING.
    CONSTANTS c_grid_bar_display TYPE char01 VALUE '1'.
    CONSTANTS c_grid_bar_no_aggregate TYPE char01 VALUE '2'.
    CONSTANTS c_grid_bar_no_sum TYPE char01 VALUE '3'.
    CONSTANTS c_grid_bar_edit TYPE char01 VALUE '4'.

    " Toolbar profiles, as accepted by SET_TREE_EXCLUDING.
    CONSTANTS c_tree_bar_display TYPE char01 VALUE '1'.
    CONSTANTS c_tree_bar_bare TYPE char01 VALUE '2'.

    " Which registry row a call is about. Zero means no such control,
    " which every caller treats as "nothing to do".
    METHODS grid_index
      IMPORTING
        !iv_repid       TYPE sy-cprog
        !iv_dynnr       TYPE sy-dynnr
        !iv_row         TYPE i
        !iv_column      TYPE i
      RETURNING
        VALUE(rv_index) TYPE sy-tabix.

    METHODS tree_index
      IMPORTING
        !iv_repid       TYPE sy-cprog
        !iv_dynnr       TYPE sy-dynnr
        !iv_row         TYPE i
        !iv_column      TYPE i
      RETURNING
        VALUE(rv_index) TYPE sy-tabix.

    " Container lookup. Takes the position as given - a container is
    " addressed by where it is, never by what was built last.
    METHODS cell_index
      IMPORTING
        !iv_repid       TYPE sy-cprog
        !iv_dynnr       TYPE sy-dynnr
        !iv_row         TYPE i
        !iv_column      TYPE i
      RETURNING
        VALUE(rv_index) TYPE sy-tabix.

    " The container a new control should live in.
    METHODS parent_container
      IMPORTING
        !io_parent       TYPE REF TO cl_gui_container
        !io_parent_dock  TYPE REF TO cl_gui_docking_container
        !io_parent_cust  TYPE REF TO cl_gui_custom_container
        !iv_repid        TYPE sy-cprog
        !iv_dynnr        TYPE sy-dynnr
        !iv_row          TYPE i
        !iv_column       TYPE i
      RETURNING
        VALUE(ro_parent) TYPE REF TO cl_gui_container.

    " The two toolbar profile tables. An unknown profile gives an empty
    " table, and the caller then leaves the control as it is.
    METHODS grid_exclusions
      IMPORTING
        !iv_type            TYPE char01
      RETURNING
        VALUE(rt_functions) TYPE ui_functions.

    METHODS tree_exclusions
      IMPORTING
        !iv_type            TYPE char01
      RETURNING
        VALUE(rt_functions) TYPE ui_functions.

    " SET HANDLER cannot be written dynamically, so each claimed event
    " needs its own line. These two carry those lines.
    METHODS bind_grid_events
      IMPORTING
        !io_event TYPE REF TO zcl_sapkit_cm_alv_event
        !io_grid  TYPE REF TO cl_gui_alv_grid.

    METHODS bind_tree_events
      IMPORTING
        !io_event  TYPE REF TO zcl_sapkit_cm_tree_event
        !io_tree   TYPE REF TO cl_gui_alv_tree
      CHANGING
        !ct_events TYPE cntl_simple_events.

    " Adds one event id to the list a tree is about to be given, unless
    " it is already on it.
    METHODS require_event_id
      IMPORTING
        !iv_eventid TYPE i
      CHANGING
        !ct_events  TYPE cntl_simple_events.

ENDCLASS.



CLASS zcl_sapkit_cm_alv IMPLEMENTATION.




  METHOD grid_index.
    " ── lookups ──

    DATA lv_row TYPE i.
    DATA lv_column TYPE i.

    lv_row = COND #( WHEN iv_row IS NOT INITIAL THEN iv_row ELSE mv_active_row ).
    lv_column = COND #( WHEN iv_column IS NOT INITIAL THEN iv_column ELSE mv_active_column ).

    READ TABLE mt_oalv TRANSPORTING NO FIELDS
         WITH KEY repid  = iv_repid
                  dynnr  = iv_dynnr
                  row    = lv_row
                  column = lv_column.
    IF sy-subrc = 0.
      rv_index = sy-tabix.
    ENDIF.

  ENDMETHOD.


  METHOD tree_index.

    DATA lv_row TYPE i.
    DATA lv_column TYPE i.

    lv_row = COND #( WHEN iv_row IS NOT INITIAL THEN iv_row ELSE mv_active_row ).
    lv_column = COND #( WHEN iv_column IS NOT INITIAL THEN iv_column ELSE mv_active_column ).

    READ TABLE mt_otree TRANSPORTING NO FIELDS
         WITH KEY repid  = iv_repid
                  dynnr  = iv_dynnr
                  row    = lv_row
                  column = lv_column.
    IF sy-subrc = 0.
      rv_index = sy-tabix.
    ENDIF.

  ENDMETHOD.


  METHOD cell_index.

    READ TABLE mt_container TRANSPORTING NO FIELDS
         WITH KEY repid  = iv_repid
                  dynnr  = iv_dynnr
                  row    = iv_row
                  column = iv_column.
    IF sy-subrc = 0.
      rv_index = sy-tabix.
    ENDIF.

  ENDMETHOD.


  METHOD parent_container.

    " A parent handed in wins over the registry, and the generic
    " reference wins among the three that can be handed in.
    IF io_parent IS BOUND.
      ro_parent = io_parent.
      RETURN.
    ENDIF.

    IF io_parent_dock IS BOUND.
      ro_parent = io_parent_dock.
      RETURN.
    ENDIF.

    IF io_parent_cust IS BOUND.
      ro_parent = io_parent_cust.
      RETURN.
    ENDIF.

    " Nothing handed in: the container built earlier for this position is
    " the one meant. A splitter pane is stored as CONTAINER, the other
    " two kinds under their own component, so all three are tried.
    DATA(lv_index) = cell_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_container INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_cell>).

    IF <ls_cell>-container IS BOUND.
      ro_parent = <ls_cell>-container.
    ELSEIF <ls_cell>-docking_container IS BOUND.
      ro_parent = <ls_cell>-docking_container.
    ELSEIF <ls_cell>-custom_container IS BOUND.
      ro_parent = <ls_cell>-custom_container.
    ENDIF.

  ENDMETHOD.




  METHOD create_dock_container.
    " ── containers ──

    ro_dock_container = NEW #( repid     = iv_repid
                               dynnr     = iv_dynnr
                               extension = iv_extension
                               side      = iv_side ).
    CHECK ro_dock_container IS BOUND.

    APPEND VALUE #( repid             = iv_repid
                    dynnr             = iv_dynnr
                    docking_container = ro_dock_container
                    id                = 1
                    row               = iv_row
                    column            = iv_column ) TO mt_container.

  ENDMETHOD.


  METHOD create_cust_container.

    ro_cust_container = NEW #( repid          = iv_repid
                               dynnr          = iv_dynnr
                               container_name = iv_container_name ).
    CHECK ro_cust_container IS BOUND.

    " A custom control area is whole - there is no second position on a
    " screen to give it, so it is registered at 1 / 1.
    APPEND VALUE #( repid            = iv_repid
                    dynnr            = iv_dynnr
                    custom_container = ro_cust_container
                    id               = 1
                    row              = 1
                    column           = 1 ) TO mt_container.

  ENDMETHOD.


  METHOD create_split_container.

    " Which panes a geometry has, as ID / ROW / COLUMN. Building the list
    " first keeps the geometry decision in one place and the container
    " work in another.
    TYPES:
      BEGIN OF ty_pane,
        id     TYPE i,
        row    TYPE i,
        column TYPE i,
      END OF ty_pane.
    DATA lt_pane TYPE STANDARD TABLE OF ty_pane WITH EMPTY KEY.

    IF iv_rows > 3 OR iv_columns > 3.
      zcx_sapkit_excp=>raise( iv_message = 'A splitter takes at most three rows and three columns' ).
    ENDIF.

    " Pane 1 is always the top left one; the rest depend on the shape.
    " Only the shapes below are laid out, and a single pane is not one of
    " them - a screen that needs no split needs no splitter either.
    lt_pane = VALUE #( ( id = 1 row = 1 column = 1 ) ).

    IF iv_columns = 1 AND iv_rows = 2.
      lt_pane = VALUE #( BASE lt_pane ( id = 2 row = 2 column = 1 ) ).

    ELSEIF iv_columns = 1 AND iv_rows = 3.
      lt_pane = VALUE #( BASE lt_pane ( id = 2 row = 2 column = 1 )
                                      ( id = 3 row = 3 column = 1 ) ).

    ELSEIF iv_columns = 2 AND iv_rows = 1.
      lt_pane = VALUE #( BASE lt_pane ( id = 2 row = 1 column = 2 ) ).

    ELSEIF iv_columns = 2 AND iv_rows = 2.
      lt_pane = VALUE #( BASE lt_pane ( id = 2 row = 2 column = 1 )
                                      ( id = 3 row = 1 column = 2 )
                                      ( id = 4 row = 2 column = 2 ) ).

    ELSEIF iv_columns = 3 AND iv_rows = 1.
      lt_pane = VALUE #( BASE lt_pane ( id = 2 row = 1 column = 2 )
                                      ( id = 3 row = 1 column = 3 ) ).

    ELSE.
      zcx_sapkit_excp=>raise( iv_message = 'That row and column combination has no layout' ).
    ENDIF.

    " The dock is opened at full height. IV_EXTENSION is part of the
    " signature but is not read here, and starting to read it now would
    " resize every split screen whose caller already passes a value.
    DATA(lr_dock) = NEW cl_gui_docking_container( repid     = iv_repid
                                                  dynnr     = iv_dynnr
                                                  extension = 4000 ).

    " The dock itself is registered without a position, so it never
    " answers a pane lookup - the panes below do that.
    APPEND VALUE #( repid             = iv_repid
                    dynnr             = iv_dynnr
                    docking_container = lr_dock ) TO mt_container.

    DATA(lr_splitter) = NEW cl_gui_splitter_container( parent  = lr_dock
                                                       rows    = iv_rows
                                                       columns = iv_columns ).

    LOOP AT lt_pane INTO DATA(ls_pane).

      DATA(lr_pane) = lr_splitter->get_container( row    = ls_pane-row
                                                  column = ls_pane-column ).

      APPEND VALUE #( repid     = iv_repid
                      dynnr     = iv_dynnr
                      splitter  = lr_splitter
                      parent    = lr_dock
                      container = lr_pane
                      id        = ls_pane-id
                      row       = ls_pane-row
                      column    = ls_pane-column ) TO mt_container.

      CASE ls_pane-id.
        WHEN 1.
          eo_container_01 = lr_pane.
        WHEN 2.
          eo_container_02 = lr_pane.
        WHEN 3.
          eo_container_03 = lr_pane.
        WHEN 4.
          eo_container_04 = lr_pane.
      ENDCASE.

    ENDLOOP.

  ENDMETHOD.


  METHOD set_container_width.

    DATA(lv_index) = cell_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_container INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_cell>).

    <ls_cell>-splitter->set_column_width( id    = <ls_cell>-id
                                          width = iv_width ).

  ENDMETHOD.


  METHOD set_container_height.

    DATA(lv_index) = cell_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_container INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_cell>).

    <ls_cell>-splitter->set_row_height( id     = <ls_cell>-id
                                        height = iv_height ).

  ENDMETHOD.




  METHOD create_alv_grid.
    " ── grid ──

    DATA(lr_parent) = parent_container( io_parent      = io_parent
                                        io_parent_dock = io_parent_dock
                                        io_parent_cust = io_parent_cust
                                        iv_repid       = iv_repid
                                        iv_dynnr       = iv_dynnr
                                        iv_row         = iv_row
                                        iv_column      = iv_column ).

    IF lr_parent IS NOT BOUND.
      zcx_sapkit_excp=>raise( iv_message = 'No container to build the ALV grid in' ).
    ENDIF.

    ro_oalv = NEW #( i_parent = lr_parent ).

    " The grid carries its own place, so an event handler that only gets
    " SENDER can still tell which screen the event came from.
    ro_oalv->mv_dynnr = iv_dynnr.
    ro_oalv->mv_repid = iv_repid.

    " The three container components record what the caller handed in.
    " A parent taken from the registry leaves all three empty, because
    " the registry already holds it.
    APPEND VALUE #( repid             = iv_repid
                    dynnr             = iv_dynnr
                    row               = iv_row
                    column            = iv_column
                    container         = io_parent
                    docking_container = io_parent_dock
                    custom_container  = io_parent_cust
                    grid              = ro_oalv ) TO mt_oalv.

    mv_active_row = iv_row.
    mv_active_column = iv_column.

  ENDMETHOD.


  METHOD get_fieldcat.

    IF iv_tabname IS NOT INITIAL.
      " A DDIC name is the better source: the dictionary already knows
      " every heading, length and conversion routine.
      CALL FUNCTION 'LVC_FIELDCATALOG_MERGE'
        EXPORTING
          i_structure_name       = iv_tabname
          i_client_never_display = 'X'
        CHANGING
          ct_fieldcat            = rt_fcat
        EXCEPTIONS
          inconsistent_interface = 1
          program_error          = 2
          OTHERS                 = 3.
      RETURN.
    ENDIF.

    CHECK it_data IS NOT INITIAL.

    " No DDIC name, so the shape is read off the table itself. SALV can
    " describe any table it is given, and an empty table of the same type
    " describes just as well as a full one.
    DATA lr_shape TYPE REF TO data.
    CREATE DATA lr_shape LIKE it_data.
    ASSIGN lr_shape->* TO FIELD-SYMBOL(<lt_shape>).

    TRY.
        cl_salv_table=>factory( IMPORTING r_salv_table = DATA(lr_salv)
                                CHANGING  t_table      = <lt_shape> ).

        rt_fcat = cl_salv_controller_metadata=>get_lvc_fieldcatalog(
                      r_columns      = lr_salv->get_columns( )
                      r_aggregations = lr_salv->get_aggregations( ) ).

      CATCH cx_salv_msg.
        " Nothing describable. The caller gets an empty catalogue and
        " decides for itself whether that is fatal.
    ENDTRY.

  ENDMETHOD.


  METHOD set_fieldcat.

    DATA(lv_index) = grid_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_oalv INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_grid>).
    <ls_grid>-fieldcat = it_fcat.

  ENDMETHOD.


  METHOD set_layout.

    DATA(lv_index) = grid_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_oalv INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_grid>).
    <ls_grid>-layout = is_layout.

  ENDMETHOD.


  METHOD set_sort.

    DATA(lv_index) = grid_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_oalv INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_grid>).
    <ls_grid>-sort = it_sort.

  ENDMETHOD.


  METHOD set_filter.

    DATA(lv_index) = grid_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_oalv INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_grid>).
    <ls_grid>-filter = it_filter.

  ENDMETHOD.


  METHOD set_excluding.

    DATA(lt_excluded) = grid_exclusions( iv_type ).
    CHECK lt_excluded IS NOT INITIAL.

    DATA(lv_index) = grid_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_oalv INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_grid>).
    <ls_grid>-toolbar_exclusion = lt_excluded.

  ENDMETHOD.


  METHOD grid_exclusions.

    CASE iv_type.
      WHEN c_grid_bar_display OR c_grid_bar_no_aggregate
        OR c_grid_bar_no_sum OR c_grid_bar_edit.
        " Common floor of every profile: the detail popup, the graphic
        " and info windows, and the local clipboard functions that write
        " into a grid the report did not mean to be edited.
        rt_functions = VALUE #( ( cl_gui_alv_grid=>mc_fc_detail )
                                ( cl_gui_alv_grid=>mc_fc_graph )
                                ( cl_gui_alv_grid=>mc_fc_info )
                                ( cl_gui_alv_grid=>mc_fc_check )
                                ( cl_gui_alv_grid=>mc_fc_loc_append_row )
                                ( cl_gui_alv_grid=>mc_fc_loc_cut )
                                ( cl_gui_alv_grid=>mc_fc_loc_copy )
                                ( cl_gui_alv_grid=>mc_fc_loc_undo )
                                ( cl_gui_alv_grid=>mc_fc_loc_paste_new_row )
                                ( cl_gui_alv_grid=>mc_fc_loc_paste )
                                ( cl_gui_alv_grid=>mc_fc_views )
                                ( cl_gui_alv_grid=>mc_fc_print ) ).

      WHEN OTHERS.
        " An unknown profile says nothing, and the caller then leaves the
        " grid with whatever it already had.
        RETURN.
    ENDCASE.

    IF iv_type <> c_grid_bar_edit.
      " Copying, deleting and inserting rows only make sense where the
      " grid is editable, and so does the refresh button beside them.
      rt_functions = VALUE #( BASE rt_functions
                              ( cl_gui_alv_grid=>mc_fc_refresh )
                              ( cl_gui_alv_grid=>mc_fc_loc_copy_row )
                              ( cl_gui_alv_grid=>mc_fc_loc_delete_row )
                              ( cl_gui_alv_grid=>mc_fc_loc_insert_row ) ).
    ENDIF.

    IF iv_type = c_grid_bar_no_aggregate OR iv_type = c_grid_bar_no_sum.
      " Sorting reorders the rows and totalling folds them, either of
      " which breaks a report that reasons about its own row order.
      rt_functions = VALUE #( BASE rt_functions
                              ( cl_gui_alv_grid=>mc_fc_sort_asc )
                              ( cl_gui_alv_grid=>mc_fc_sort_dsc )
                              ( cl_gui_alv_grid=>mc_mb_subtot )
                              ( cl_gui_alv_grid=>mc_mb_sum ) ).
    ENDIF.

  ENDMETHOD.


  METHOD set_quickinfo.

    DATA(lv_index) = grid_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_oalv INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_grid>).
    <ls_grid>-quickinfo = it_quickinfo.

  ENDMETHOD.


  METHOD set_f4.

    DATA(lv_index) = grid_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_oalv INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_grid>).
    <ls_grid>-f4 = it_f4.

  ENDMETHOD.


  METHOD set_top_of_page.

    DATA(lv_index) = grid_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_oalv INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_grid>).

    " Built once. A second call on the same grid would dock a second
    " container above the first one and push the grid off the screen.
    CHECK <ls_grid>-topofpages-html_viewer IS NOT BOUND.

    eo_dock = NEW cl_gui_docking_container( repid     = iv_repid
                                            dynnr     = iv_dynnr
                                            side      = cl_gui_docking_container=>dock_at_top
                                            extension = iv_size ).

    eo_html = NEW #( parent = eo_dock ).
    eo_document = NEW #( style = 'ALV_GRID' ).

    <ls_grid>-topofpages-container = eo_dock.
    <ls_grid>-topofpages-html_viewer = eo_html.
    <ls_grid>-topofpages-dd_document = eo_document.

  ENDMETHOD.


  METHOD set_register_event.

    DATA(lv_index) = grid_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_oalv INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_grid>).

    " The grid is told directly, and the registry keeps a note of it so a
    " caller can see afterwards what was switched on.
    IF iv_enter = abap_true.
      APPEND cl_gui_alv_grid=>mc_evt_enter TO <ls_grid>-register_events.
      <ls_grid>-grid->register_edit_event( cl_gui_alv_grid=>mc_evt_enter ).
    ENDIF.

    IF iv_modified = abap_true.
      APPEND cl_gui_alv_grid=>mc_evt_modified TO <ls_grid>-register_events.
      <ls_grid>-grid->register_edit_event( cl_gui_alv_grid=>mc_evt_modified ).
    ENDIF.

  ENDMETHOD.


  METHOD set_ready_for_input.

    DATA(lv_index) = grid_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_oalv INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_grid>).

    <ls_grid>-grid->set_ready_for_input(
        i_ready_for_input = COND i( WHEN iv_input = abap_true THEN 1 ELSE 0 ) ).

  ENDMETHOD.


  METHOD set_drop_external.

    DATA(lv_index) = grid_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_oalv INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_grid>).

    <ls_grid>-grid->drag_accept_files( iv_accept_files ).

  ENDMETHOD.


  METHOD set_event_handler.

    DATA(lv_index) = grid_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_oalv INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_grid>).

    bind_grid_events( io_event = io_event
                      io_grid  = <ls_grid>-grid ).

  ENDMETHOD.


  METHOD bind_grid_events.

    " One arm per event, because SET HANDLER takes a written method name
    " and nothing else. The names below are the EVENT values the relay
    " class puts in MT_EVENTLIST, so the two sides are spelled alike.
    "
    " One name is missing on purpose: HANDLE_ONDROP has a row in
    " MT_EVENTLIST but no arm here, so claiming it registers nothing.
    " Giving it an arm would start delivering an event that reports
    " written against the current behaviour never receive, so the gap is
    " named here rather than closed.
    LOOP AT io_event->mt_eventlist ASSIGNING FIELD-SYMBOL(<ls_entry>).

      IF <ls_entry>-form IS INITIAL AND <ls_entry>-method IS INITIAL.
        " Nobody claimed this event.
        CONTINUE.
      ENDIF.

      CASE <ls_entry>-event.
        WHEN 'HANDLE_TOOLBAR'.
          SET HANDLER io_event->handle_toolbar FOR io_grid.
        WHEN 'HANDLE_USER_COMMAND'.
          SET HANDLER io_event->handle_user_command FOR io_grid.
        WHEN 'HANDLE_DATA_CHANGED'.
          SET HANDLER io_event->handle_data_changed FOR io_grid.
        WHEN 'HANDLE_DATA_CHANGED_FINISHED'.
          SET HANDLER io_event->handle_data_changed_finished FOR io_grid.
        WHEN 'HANDLE_HOTSPOT_CLICK'.
          SET HANDLER io_event->handle_hotspot_click FOR io_grid.
        WHEN 'HANDLE_DOUBLE_CLICK'.
          SET HANDLER io_event->handle_double_click FOR io_grid.
        WHEN 'HANDLE_ONF4'.
          SET HANDLER io_event->handle_onf4 FOR io_grid.
        WHEN 'HANDLE_TOP_OF_PAGE'.
          SET HANDLER io_event->handle_top_of_page FOR io_grid.
        WHEN 'HANDLE_ONDRAG'.
          SET HANDLER io_event->handle_ondrag FOR io_grid.
        WHEN 'HANDLE_ONDROPCOMPLETE'.
          SET HANDLER io_event->handle_ondropcomplete FOR io_grid.
        WHEN 'HANDLE_DROP_EXTERNAL_FILES'.
          " SET_DROP_EXTERNAL has to have run first, or the frontend
          " never offers the drop and the event cannot fire.
          SET HANDLER io_event->handle_drop_external_files FOR io_grid.
      ENDCASE.

    ENDLOOP.

  ENDMETHOD.


  METHOD display_alv.

    DATA(lv_index) = grid_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    IF lv_index = 0.
      zcx_sapkit_excp=>raise( iv_message = 'No ALV grid was built for this screen position' ).
    ENDIF.

    READ TABLE mt_oalv INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_grid>).
    CHECK <ls_grid>-grid IS BOUND.

    " F4 help is per column and has to be in place before the display.
    IF <ls_grid>-f4 IS NOT INITIAL.
      <ls_grid>-grid->register_f4_for_fields( it_f4 = <ls_grid>-f4 ).
    ENDIF.

    " Layout variants are stored per report and saved in every mode
    " unless the caller has already said otherwise.
    IF <ls_grid>-variant IS INITIAL.
      <ls_grid>-variant-report = iv_repid.
    ENDIF.

    IF <ls_grid>-savemode IS INITIAL.
      <ls_grid>-savemode = 'A'.
    ENDIF.

    " Everything the SET_* calls parked on the registry row is handed
    " over here, in the single call the grid accepts it in.
    <ls_grid>-grid->set_table_for_first_display(
      EXPORTING
        i_default                     = abap_true
        is_layout                     = <ls_grid>-layout
        is_variant                    = <ls_grid>-variant
        i_save                        = <ls_grid>-savemode
        it_toolbar_excluding          = <ls_grid>-toolbar_exclusion
        it_except_qinfo               = <ls_grid>-quickinfo
      CHANGING
        it_fieldcatalog               = <ls_grid>-fieldcat
        it_sort                       = <ls_grid>-sort
        it_filter                     = <ls_grid>-filter
        it_outtab                     = it_data
      EXCEPTIONS
        invalid_parameter_combination = 1
        program_error                 = 2
        too_many_lines                = 3
        OTHERS                        = 4 ).

  ENDMETHOD.


  METHOD refresh_alv.

    DATA(lv_index) = grid_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_oalv INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_grid>).

    <ls_grid>-grid->refresh_table_display( is_stable      = is_stable
                                           i_soft_refresh = space ).

    " The refresh is only queued until the control framework is flushed.
    cl_gui_cfw=>flush( ).

  ENDMETHOD.




  METHOD create_alv_tree.
    " ── tree ──

    DATA(lr_parent) = parent_container( io_parent      = io_parent
                                        io_parent_dock = io_parent_dock
                                        io_parent_cust = io_parent_cust
                                        iv_repid       = iv_repid
                                        iv_dynnr       = iv_dynnr
                                        iv_row         = iv_row
                                        iv_column      = iv_column ).

    IF lr_parent IS NOT BOUND.
      zcx_sapkit_excp=>raise( iv_message = 'No container to build the ALV tree in' ).
    ENDIF.

    " The four mode values cannot be changed afterwards, which is why
    " they are constructor parameters rather than SET_TREE_* methods.
    ro_otree = NEW #( parent              = lr_parent
                      node_selection_mode = iv_selection_mode
                      item_selection      = iv_item_selection
                      no_html_header      = iv_no_html_header
                      no_toolbar          = iv_no_toolbar ).

    ro_otree->mv_dynnr = iv_dynnr.
    ro_otree->mv_repid = iv_repid.

    APPEND VALUE #( repid             = iv_repid
                    dynnr             = iv_dynnr
                    row               = iv_row
                    column            = iv_column
                    container         = io_parent
                    docking_container = io_parent_dock
                    custom_container  = io_parent_cust
                    tree              = ro_otree ) TO mt_otree.

    mv_active_row = iv_row.
    mv_active_column = iv_column.

  ENDMETHOD.


  METHOD set_tree_fieldcat.

    DATA(lv_index) = tree_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_otree INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_tree>).
    <ls_tree>-fieldcat = it_fcat.

  ENDMETHOD.


  METHOD set_tree_header.

    DATA(lv_index) = tree_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_otree INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_tree>).

    <ls_tree>-hierarchy_header = is_hierarchy_header.
    <ls_tree>-list_commentary = it_list_commentary.
    <ls_tree>-logo = iv_logo.

  ENDMETHOD.


  METHOD set_tree_filter.

    DATA(lv_index) = tree_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_otree INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_tree>).
    <ls_tree>-filter = it_filter.

  ENDMETHOD.


  METHOD set_tree_excluding.

    DATA(lt_excluded) = tree_exclusions( iv_type ).
    CHECK lt_excluded IS NOT INITIAL.

    DATA(lv_index) = tree_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_otree INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_tree>).
    <ls_tree>-toolbar_exclusion = lt_excluded.

  ENDMETHOD.


  METHOD tree_exclusions.

    CASE iv_type.
      WHEN c_tree_bar_display OR c_tree_bar_bare.
        " Aggregation, graphics, help and the print functions go in both
        " profiles: a tree built by a report totals in the report, not in
        " the toolbar.
        rt_functions = VALUE #( ( cl_gui_alv_tree=>mc_fc_calculate )
                                ( cl_gui_alv_tree=>mc_fc_calculate_avg )
                                ( cl_gui_alv_tree=>mc_fc_calculate_max )
                                ( cl_gui_alv_tree=>mc_fc_calculate_min )
                                ( cl_gui_alv_tree=>mc_fc_calculate_sum )
                                ( cl_gui_alv_tree=>mc_fc_graphics )
                                ( cl_gui_alv_tree=>mc_fc_help )
                                ( cl_gui_alv_tree=>mc_fc_print_back )
                                ( cl_gui_alv_tree=>mc_fc_print_back_all )
                                ( cl_gui_alv_tree=>mc_fc_print_prev )
                                ( cl_gui_alv_tree=>mc_fc_settop ) ).

      WHEN OTHERS.
        RETURN.
    ENDCASE.

    IF iv_type = c_tree_bar_display.
      " Navigation, layout and find stay; only the value help goes.
      rt_functions = VALUE #( BASE rt_functions ( cl_gui_alv_tree=>mc_fc_f4 ) ).
      RETURN.
    ENDIF.

    " The bare profile leaves nothing on the toolbar: expanding, column
    " layout, variants and find are taken away as well.
    rt_functions = VALUE #( BASE rt_functions
                            ( cl_gui_alv_tree=>mc_fc_collapse )
                            ( cl_gui_alv_tree=>mc_fc_expand )
                            ( cl_gui_alv_tree=>mc_fc_col_invisible )
                            ( cl_gui_alv_tree=>mc_fc_col_optimize )
                            ( cl_gui_alv_tree=>mc_fc_current_variant )
                            ( cl_gui_alv_tree=>mc_fc_load_variant )
                            ( cl_gui_alv_tree=>mc_fc_maintain_variant )
                            ( cl_gui_alv_tree=>mc_fc_save_variant )
                            ( cl_gui_alv_tree=>mc_fc_detail )
                            ( cl_gui_alv_tree=>mc_fc_find )
                            ( cl_gui_alv_tree=>mc_fc_find_more )
                            ( cl_gui_alv_tree=>mc_fc_print_prev_all ) ).

  ENDMETHOD.


  METHOD set_tree_quickinfo.

    DATA(lv_index) = tree_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_otree INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_tree>).
    <ls_tree>-quickinfo = it_qinfo.

  ENDMETHOD.


  METHOD set_tree_event_handler.

    DATA lt_events TYPE cntl_simple_events.

    DATA(lv_index) = tree_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_otree INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_tree>).

    " Start from what the tree already reports, so a second call adds to
    " the list instead of replacing it.
    <ls_tree>-tree->get_registered_events( IMPORTING events = lt_events ).

    bind_tree_events( EXPORTING io_event  = io_event
                                io_tree   = <ls_tree>-tree
                      CHANGING  ct_events = lt_events ).

    <ls_tree>-tree->set_registered_events( events = lt_events ).

  ENDMETHOD.


  METHOD bind_tree_events.

    " Two things happen per claimed event: the handler is registered, and
    " the event id is added to the list the tree will be told to report.
    " Drag and drop is the exception - those events are always reported,
    " so they only need the handler.
    LOOP AT io_event->mt_eventlist ASSIGNING FIELD-SYMBOL(<ls_entry>).

      IF <ls_entry>-form IS INITIAL AND <ls_entry>-method IS INITIAL.
        CONTINUE.
      ENDIF.

      CASE <ls_entry>-event.
        WHEN 'HANDLE_NODE_DOUBLE_CLICK'.
          require_event_id( EXPORTING iv_eventid = cl_gui_column_tree=>eventid_node_double_click
                            CHANGING  ct_events  = ct_events ).
          SET HANDLER io_event->handle_node_double_click FOR io_tree.

        WHEN 'HANDLE_ITEM_DOUBLE_CLICK'.
          require_event_id( EXPORTING iv_eventid = cl_gui_column_tree=>eventid_item_double_click
                            CHANGING  ct_events  = ct_events ).
          SET HANDLER io_event->handle_item_double_click FOR io_tree.

        WHEN 'HANDLE_LINK_CLICK'.
          require_event_id( EXPORTING iv_eventid = cl_gui_column_tree=>eventid_link_click
                            CHANGING  ct_events  = ct_events ).
          SET HANDLER io_event->handle_link_click FOR io_tree.

        WHEN 'HANDLE_HEADER_CLICK'.
          require_event_id( EXPORTING iv_eventid = cl_gui_column_tree=>eventid_header_click
                            CHANGING  ct_events  = ct_events ).
          SET HANDLER io_event->handle_header_click FOR io_tree.

        WHEN 'HANDLE_SELECTION_CHANGED'.
          require_event_id( EXPORTING iv_eventid = cl_gui_column_tree=>eventid_selection_changed
                            CHANGING  ct_events  = ct_events ).
          SET HANDLER io_event->handle_selection_changed FOR io_tree.

        WHEN 'HANDLE_CHECKBOX_CHANGE'.
          require_event_id( EXPORTING iv_eventid = cl_gui_column_tree=>eventid_checkbox_change
                            CHANGING  ct_events  = ct_events ).
          SET HANDLER io_event->handle_checkbox_change FOR io_tree.

        WHEN 'HANDLE_EXPAND_NC'.
          require_event_id( EXPORTING iv_eventid = cl_gui_column_tree=>eventid_expand_no_children
                            CHANGING  ct_events  = ct_events ).
          SET HANDLER io_event->handle_expand_nc FOR io_tree.

        WHEN 'HANDLE_NODE_KEYPRESS'.
          require_event_id( EXPORTING iv_eventid = cl_gui_column_tree=>eventid_node_keypress
                            CHANGING  ct_events  = ct_events ).
          SET HANDLER io_event->handle_node_keypress FOR io_tree.

        WHEN 'HANDLE_ITEM_KEYPRESS'.
          require_event_id( EXPORTING iv_eventid = cl_gui_column_tree=>eventid_item_keypress
                            CHANGING  ct_events  = ct_events ).
          SET HANDLER io_event->handle_item_keypress FOR io_tree.

        WHEN 'HANDLE_NODE_CONTEXT_MENU_RQ'.
          require_event_id( EXPORTING iv_eventid = cl_gui_column_tree=>eventid_node_context_menu_req
                            CHANGING  ct_events  = ct_events ).
          SET HANDLER io_event->handle_node_context_menu_rq FOR io_tree.

        WHEN 'HANDLE_NODE_CONTEXT_MENU_SEL'.
          require_event_id( EXPORTING iv_eventid = cl_gui_column_tree=>eventid_node_context_menu_req
                            CHANGING  ct_events  = ct_events ).
          SET HANDLER io_event->handle_node_context_menu_sel FOR io_tree.

        WHEN 'HANDLE_ITEM_CONTEXT_MENU_RQ'.
          require_event_id( EXPORTING iv_eventid = cl_gui_column_tree=>eventid_item_context_menu_req
                            CHANGING  ct_events  = ct_events ).
          SET HANDLER io_event->handle_item_context_menu_rq FOR io_tree.

        WHEN 'HANDLE_ITEM_CONTEXT_MENU_SEL'.
          require_event_id( EXPORTING iv_eventid = cl_gui_column_tree=>eventid_header_context_men_req
                            CHANGING  ct_events  = ct_events ).
          SET HANDLER io_event->handle_item_context_menu_sel FOR io_tree.

        WHEN 'HANDLE_ON_DRAG'.
          SET HANDLER io_event->handle_on_drag FOR io_tree.

        WHEN 'HANDLE_ON_DRAG_MULTIPLE'.
          SET HANDLER io_event->handle_on_drag_multiple FOR io_tree.

        WHEN 'HANDLE_ON_DROP'.
          SET HANDLER io_event->handle_on_drop FOR io_tree.

        WHEN 'HANDLE_ON_DROP_COMPLETE'.
          SET HANDLER io_event->handle_on_drop_complete FOR io_tree.

        WHEN 'HANDLE_ON_DROP_COMPLETE_MULT'.
          SET HANDLER io_event->handle_on_drop_complete_mult FOR io_tree.

        WHEN 'HANDLE_ON_DROP_EXTERNAL_FILES'.
          SET HANDLER io_event->handle_on_drop_external_files FOR io_tree.

        WHEN 'HANDLE_ON_DROP_GET_FLAVOR'.
          SET HANDLER io_event->handle_on_drop_get_flavor FOR io_tree.
      ENDCASE.

    ENDLOOP.

  ENDMETHOD.


  METHOD require_event_id.

    READ TABLE ct_events TRANSPORTING NO FIELDS WITH KEY eventid = iv_eventid.
    CHECK sy-subrc <> 0.

    APPEND VALUE #( eventid = iv_eventid ) TO ct_events.

  ENDMETHOD.


  METHOD set_tree_add_node.

    DATA(lv_index) = tree_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_otree INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_tree>).

    " An empty relation key makes this a root node; otherwise the node
    " hangs off the key given, in the relationship asked for.
    <ls_tree>-tree->add_node(
      EXPORTING
        i_relat_node_key = iv_relat_node_key
        i_relationship   = iv_relationship
        i_node_text      = iv_node_text
        is_outtab_line   = is_outtab_line
        is_node_layout   = is_node_layout
        it_item_layout   = it_item_layout
      IMPORTING
        e_new_node_key   = rv_new_node_key ).

  ENDMETHOD.


  METHOD display_tree.

    DATA(lv_index) = tree_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    IF lv_index = 0.
      zcx_sapkit_excp=>raise( iv_message = 'No ALV tree was built for this screen position' ).
    ENDIF.

    READ TABLE mt_otree INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_tree>).
    CHECK <ls_tree>-tree IS BOUND.

    IF <ls_tree>-variant IS INITIAL.
      <ls_tree>-variant-report = iv_repid.
    ENDIF.

    IF <ls_tree>-savemode IS INITIAL.
      <ls_tree>-savemode = 'A'.
    ENDIF.

    " The tree is shown empty here. Nodes are added afterwards, with
    " SET_TREE_ADD_NODE, and REFRESH_TREE sends them to the frontend.
    <ls_tree>-tree->set_table_for_first_display(
      EXPORTING
        is_hierarchy_header  = <ls_tree>-hierarchy_header
        it_list_commentary   = <ls_tree>-list_commentary
        i_logo               = <ls_tree>-logo
        is_variant           = <ls_tree>-variant
        i_save               = <ls_tree>-savemode
        is_exception_field   = <ls_tree>-exceptionfield
        it_toolbar_excluding = <ls_tree>-toolbar_exclusion
        it_except_qinfo      = <ls_tree>-quickinfo
        i_background_id      = 'ALV_BACKGROUND'
      CHANGING
        it_fieldcatalog      = <ls_tree>-fieldcat
        it_filter            = <ls_tree>-filter
        it_outtab            = it_data ).

  ENDMETHOD.


  METHOD refresh_tree.

    DATA(lv_index) = tree_index( iv_repid  = iv_repid
                                 iv_dynnr  = iv_dynnr
                                 iv_row    = iv_row
                                 iv_column = iv_column ).
    CHECK lv_index > 0.

    READ TABLE mt_otree INDEX lv_index ASSIGNING FIELD-SYMBOL(<ls_tree>).

    IF iv_columnoptimization = abap_true.
      <ls_tree>-tree->column_optimize( ).
    ENDIF.

    " Totals first, then the frontend, or the tree shows figures that no
    " longer match the nodes above them.
    <ls_tree>-tree->update_calculations( ).
    <ls_tree>-tree->frontend_update( ).

  ENDMETHOD.




  METHOD zif_sapkit_cm~create_dynamic_table.
    " ── interface ──

    DATA lt_fieldcat TYPE lvc_t_fcat.

    " Either source describes the table; the DDIC name is preferred when
    " the caller supplied one. IT_REFITAB is part of the interface but
    " has no reading here: a caller holding a table already knows its
    " type and does not need one built.
    IF iv_tabname IS SUPPLIED.
      CALL FUNCTION 'LVC_FIELDCATALOG_MERGE'
        EXPORTING
          i_structure_name       = iv_tabname
        CHANGING
          ct_fieldcat            = lt_fieldcat
        EXCEPTIONS
          inconsistent_interface = 1
          OTHERS                 = 2.
    ELSE.
      lt_fieldcat = it_fieldcat.
    ENDIF.

    cl_alv_table_create=>create_dynamic_table(
      EXPORTING
        it_fieldcatalog = lt_fieldcat
      IMPORTING
        ep_table        = ro_table ).

  ENDMETHOD.


  METHOD zif_sapkit_cm~salv_get_selected_rows.
    " SALV displays are driven by CL_SALV_TABLE, not by this class.
  ENDMETHOD.


  METHOD zif_sapkit_cm~salv_on_link_click.
    " SALV displays are driven by CL_SALV_TABLE, not by this class.
  ENDMETHOD.


  METHOD zif_sapkit_cm~salv_on_double_click.
    " SALV displays are driven by CL_SALV_TABLE, not by this class.
  ENDMETHOD.


  METHOD zif_sapkit_cm~salv_on_function_click.
    " SALV displays are driven by CL_SALV_TABLE, not by this class.
  ENDMETHOD.


  METHOD zif_sapkit_cm~salv_before_salv_function.
    " SALV displays are driven by CL_SALV_TABLE, not by this class.
  ENDMETHOD.


  METHOD zif_sapkit_cm~salv_after_salv_function.
    " SALV displays are driven by CL_SALV_TABLE, not by this class.
  ENDMETHOD.


  METHOD zif_sapkit_cm~salv_top_of_page.
    " SALV displays are driven by CL_SALV_TABLE, not by this class.
  ENDMETHOD.


  METHOD zif_sapkit_cm~salv_end_of_page.
    " SALV displays are driven by CL_SALV_TABLE, not by this class.
  ENDMETHOD.

ENDCLASS.
