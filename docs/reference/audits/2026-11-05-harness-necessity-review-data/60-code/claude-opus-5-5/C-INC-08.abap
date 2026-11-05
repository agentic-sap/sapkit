*&---------------------------------------------------------------------*
*& Global Class ZSAPKIT_DEMO_CLAS
*&---------------------------------------------------------------------*
*& F4 (POV) helper for business place (BUPLA), restricted by the
*& company code (BUKRS) the user has just typed on the screen but has
*& not yet sent with ENTER (read via DYNP_VALUES_READ).
*&
*& Usage in the calling report:
*&
*&   PARAMETERS: pa_bukrs TYPE bukrs,
*&               pa_bupla TYPE bupla.
*&
*&   AT SELECTION-SCREEN ON VALUE-REQUEST FOR pa_bupla.
*&     zsapkit_demo_clas=>f4_bupla(
*&       EXPORTING iv_repid = sy-repid
*&                 iv_dynnr = sy-dynnr
*&       CHANGING  cv_bupla = pa_bupla ).
*&
*& Note: sy-repid / sy-dynnr must be passed from the caller, because
*&       inside the class pool sy-repid is the class pool's own name.
*&---------------------------------------------------------------------*
CLASS zsapkit_demo_clas DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.

    TYPES:
      BEGIN OF ty_s_bupla,
        bukrs  TYPE j_1bbranch-bukrs,
        branch TYPE j_1bbranch-branch,
        name   TYPE j_1bbranch-name,
      END OF ty_s_bupla,
      ty_t_bupla TYPE STANDARD TABLE OF ty_s_bupla WITH DEFAULT KEY.

    CONSTANTS:
      gc_field_bukrs TYPE dynpread-fieldname VALUE 'PA_BUKRS',
      gc_field_bupla TYPE dynpread-fieldname VALUE 'PA_BUPLA'.

    "! F4 help for business place, filtered by the company code
    "! currently entered (unsent) on the calling screen.
    "! @parameter iv_repid       | Calling program (sy-repid of caller)
    "! @parameter iv_dynnr       | Calling screen  (sy-dynnr of caller)
    "! @parameter iv_bukrs_field | Screen field name holding company code
    "! @parameter iv_bupla_field | Screen field name receiving business place
    "! @parameter cv_bupla       | Selected business place
    CLASS-METHODS f4_bupla
      IMPORTING
        !iv_repid       TYPE sy-repid
        !iv_dynnr       TYPE sy-dynnr
        !iv_bukrs_field TYPE dynpread-fieldname DEFAULT gc_field_bukrs
        !iv_bupla_field TYPE dynpread-fieldname DEFAULT gc_field_bupla
      CHANGING
        !cv_bupla       TYPE bupla.

    "! Reads the current (not yet transported) value of a screen field.
    CLASS-METHODS read_screen_bukrs
      IMPORTING
        !iv_repid       TYPE sy-repid
        !iv_dynnr       TYPE sy-dynnr
        !iv_bukrs_field TYPE dynpread-fieldname
      RETURNING
        VALUE(rv_bukrs) TYPE bukrs.

  PROTECTED SECTION.

  PRIVATE SECTION.

    CLASS-METHODS select_bupla
      IMPORTING
        !iv_bukrs       TYPE bukrs
      RETURNING
        VALUE(rt_bupla) TYPE ty_t_bupla.

ENDCLASS.



CLASS zsapkit_demo_clas IMPLEMENTATION.


  METHOD f4_bupla.

    DATA: lt_bupla  TYPE ty_t_bupla,
          lt_return TYPE STANDARD TABLE OF ddshretval,
          ls_return TYPE ddshretval,
          lv_bukrs  TYPE bukrs,
          lv_title  TYPE c LENGTH 80.

    " 1) Company code as currently typed on the screen (not yet sent)
    lv_bukrs = read_screen_bukrs( iv_repid       = iv_repid
                                  iv_dynnr       = iv_dynnr
                                  iv_bukrs_field = iv_bukrs_field ).

    " 2) Value list restricted by that company code
    lt_bupla = select_bupla( lv_bukrs ).

    IF lt_bupla IS INITIAL.
      IF lv_bukrs IS INITIAL.
        MESSAGE 'No business places found' TYPE 'S' DISPLAY LIKE 'W'.
      ELSE.
        MESSAGE |No business places found for company code { lv_bukrs }|
          TYPE 'S' DISPLAY LIKE 'W'.
      ENDIF.
      RETURN.
    ENDIF.

    IF lv_bukrs IS INITIAL.
      lv_title = 'Business Place (all company codes)'.
    ELSE.
      lv_title = |Business Place - Company Code { lv_bukrs }|.
    ENDIF.

    " 3) Show F4 popup
    CALL FUNCTION 'F4IF_INT_TABLE_VALUE_REQUEST'
      EXPORTING
        retfield        = 'BRANCH'
        window_title    = lv_title
        value_org       = 'S'
      TABLES
        value_tab       = lt_bupla
        return_tab      = lt_return
      EXCEPTIONS
        parameter_error = 1
        no_values_found = 2
        OTHERS          = 3.

    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    READ TABLE lt_return INTO ls_return INDEX 1.
    IF sy-subrc = 0.
      cv_bupla = ls_return-fieldval.
    ENDIF.

  ENDMETHOD.


  METHOD read_screen_bukrs.

    DATA: lt_dynpfields TYPE STANDARD TABLE OF dynpread,
          ls_dynpfield  TYPE dynpread.

    CLEAR rv_bukrs.

    ls_dynpfield-fieldname = iv_bukrs_field.
    APPEND ls_dynpfield TO lt_dynpfields.

    CALL FUNCTION 'DYNP_VALUES_READ'
      EXPORTING
        dyname               = iv_repid
        dynumb               = iv_dynnr
        translate_to_upper   = abap_true
      TABLES
        dynpfields           = lt_dynpfields
      EXCEPTIONS
        invalid_abapworkarea = 1
        invalid_dynprofield  = 2
        invalid_dynproname   = 3
        invalid_dynpronummer = 4
        invalid_request      = 5
        no_fielddescription  = 6
        invalid_parameter    = 7
        undefind_error       = 8
        double_conversion    = 9
        stepl_not_found      = 10
        OTHERS               = 11.

    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    READ TABLE lt_dynpfields INTO ls_dynpfield
         WITH KEY fieldname = iv_bukrs_field.
    IF sy-subrc = 0.
      rv_bukrs = ls_dynpfield-fieldvalue.
      CONDENSE rv_bukrs NO-GAPS.
    ENDIF.

  ENDMETHOD.


  METHOD select_bupla.

    CLEAR rt_bupla.

    IF iv_bukrs IS INITIAL.
      SELECT bukrs branch name
        FROM j_1bbranch
        INTO TABLE rt_bupla
        ORDER BY bukrs branch.
    ELSE.
      SELECT bukrs branch name
        FROM j_1bbranch
        INTO TABLE rt_bupla
        WHERE bukrs = iv_bukrs
        ORDER BY bukrs branch.
    ENDIF.

  ENDMETHOD.

ENDCLASS.
