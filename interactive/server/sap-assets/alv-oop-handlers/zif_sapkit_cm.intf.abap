INTERFACE zif_sapkit_cm
  PUBLIC.

*----------------------------------------------------------------------
* Shared vocabulary of the ALV helper classes.
*
* An ALV report written with these helpers is split between a class that
* builds the grid or the tree and a report that owns the data. The two
* halves have to agree on where the displayed table lives, on which SALV
* events are handled, and on how a dynamic table is built when the field
* catalogue is only known at runtime. This interface is that agreement
* and nothing more: it declares, it does not implement.
*
* Two properties of the declarations below are load bearing.
*
* First, the four attributes are CLASS-DATA, not instance data. An
* interface attribute declared this way exists once per interface, not
* once per implementing class, so the report and the handler class see
* the same MO_TABLE without either of them holding a reference to the
* other. That is what keeps the helpers usable from a plain report.
*
* Second, the eight event handler methods are bound to the events of
* CL_SALV_EVENTS_TABLE with FOR EVENT. Their parameter names are dictated
* by those events - ROW, COLUMN, SENDER and the rest are the names SAP
* gave the event parameters, not names chosen here - so an implementing
* class cannot rename them and neither can this declaration.
*----------------------------------------------------------------------

  " One column of a runtime-built field catalogue: the component name,
  " the heading shown for it, and the width reserved on screen.
  TYPES:
    BEGIN OF ty_alv_column,
      name   TYPE string,
      text   TYPE string,
      length TYPE lvc_outlen,
    END OF ty_alv_column.
  TYPES:
    tt_alv_column TYPE TABLE OF ty_alv_column WITH EMPTY KEY.

  " The table currently on display, as a data reference because its row
  " type is not known until the field catalogue is.
  CLASS-DATA mo_table TYPE REF TO data.
  " The SALV instance showing that table.
  CLASS-DATA mo_salv TYPE REF TO cl_salv_table.
  " Set when the user left the display without confirming, so the caller
  " can tell an empty selection from an abandoned one.
  CLASS-DATA mv_cancel TYPE abap_bool.
  " Field catalogue behind the display, kept in the ALV grid form.
  CLASS-DATA mt_fcat TYPE lvc_t_fcat.

  " Builds an internal table whose row type is decided at runtime. The
  " three importing parameters are three ways of saying the same thing
  " and the caller supplies whichever it happens to have: a DDIC name,
  " a field catalogue, or an existing table to copy the shape of.
  CLASS-METHODS create_dynamic_table
    IMPORTING
      !iv_tabname     TYPE fieldname OPTIONAL
      !it_fieldcat    TYPE lvc_t_fcat OPTIONAL
      !it_refitab     TYPE STANDARD TABLE OPTIONAL
    RETURNING
      VALUE(ro_table) TYPE REF TO data.

  " Hands out the rows the user marked. Generic INDEX TABLE, because the
  " row type is only known to the caller.
  METHODS salv_get_selected_rows
    EXPORTING
      !et_list TYPE INDEX TABLE.

  " --- SALV events -----------------------------------------------------
  " Cell level: a hotspot was clicked, or a row was double clicked.

  METHODS salv_on_link_click
    FOR EVENT link_click OF cl_salv_events_table
    IMPORTING
      !row
      !column
      !sender.

  METHODS salv_on_double_click
    FOR EVENT double_click OF cl_salv_events_table
    IMPORTING
      !row
      !column
      !sender.

  " Toolbar level: E_SALV_FUNCTION names the button that was pressed.
  " ADDED_FUNCTION is raised for buttons the report added itself, while
  " the BEFORE and AFTER pair brackets the functions SALV handles on its
  " own and lets a report veto or follow up on one.

  METHODS salv_on_function_click
    FOR EVENT added_function OF cl_salv_events_table
    IMPORTING
      !e_salv_function
      !sender.

  METHODS salv_before_salv_function
    FOR EVENT before_salv_function OF cl_salv_events_table
    IMPORTING
      !e_salv_function
      !sender.

  METHODS salv_after_salv_function
    FOR EVENT after_salv_function OF cl_salv_events_table
    IMPORTING
      !e_salv_function
      !sender.

  " Print layout: raised once per page while a list is being produced.

  METHODS salv_top_of_page
    FOR EVENT top_of_page OF cl_salv_events_table
    IMPORTING
      !r_top_of_page
      !page
      !table_index
      !sender.

  METHODS salv_end_of_page
    FOR EVENT end_of_page OF cl_salv_events_table
    IMPORTING
      !r_end_of_page
      !page
      !sender.

ENDINTERFACE.
