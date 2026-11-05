*&---------------------------------------------------------------------*
*& File: zsapkit_demo_clas.abap
*& Part 1: Global class ZSAPKIT_DEMO_CLAS (SE24 / abapGit class pool)
*& Part 2: Demo report ZSAPKIT_DEMO_F4 (separate program object)
*&---------------------------------------------------------------------*

*======================================================================*
* PART 1 - GLOBAL CLASS
*======================================================================*
CLASS zsapkit_demo_clas DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    CLASS-METHODS f4_bupla
      IMPORTING
        !iv_repid     TYPE sy-repid
        !iv_dynnr     TYPE sy-dynnr
        !iv_fld_bukrs TYPE dynfnam DEFAULT 'PA_BUKRS'
        !iv_fld_bupla TYPE dynfnam DEFAULT 'PA_BUPLA'.

  PROTECTED SECTION.
  PRIVATE SECTION.
    TYPES:
      BEGIN OF ty_value,
        bukrs  TYPE j_1bbranch-bukrs,
        branch TYPE j_1bbranch-branch,
        name   TYPE j_1bbranch-name,
      END OF ty_value,
      tt_value TYPE STANDARD TABLE OF ty_value WITH DEFAULT KEY.
ENDCLASS.


CLASS zsapkit_demo_clas IMPLEMENTATION.

  METHOD f4_bupla.
    DATA: lt_dynpfields TYPE STANDARD TABLE OF dynpread,
          ls_dynpfield  TYPE dynpread,
          lt_value      TYPE tt_value,
          lt_return     TYPE STANDARD TABLE OF ddshretval,
          lv_bukrs      TYPE j_1bbranch-bukrs.

    " 1) Read the not-yet-transmitted value of PA_BUKRS from the screen
    ls_dynpfield-fieldname = iv_fld_bukrs.
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
    IF sy-subrc = 0.
      READ TABLE lt_dynpfields INTO ls_dynpfield INDEX 1.
      IF sy-subrc = 0.
        lv_bukrs = ls_dynpfield-fieldvalue.
      ENDIF.
    ENDIF.

    " 2) Select branches restricted by the entered company code
    IF lv_bukrs IS NOT INITIAL.
      SELECT bukrs branch name
        FROM j_1bbranch
        WHERE bukrs = @lv_bukrs
        ORDER BY branch
        INTO TABLE @lt_value.
    ELSE.
      SELECT bukrs branch name
        FROM j_1bbranch
        ORDER BY bukrs, branch
        INTO TABLE @lt_value.
    ENDIF.

    IF lt_value IS INITIAL.
      MESSAGE s398(00) WITH 'No business places found' DISPLAY LIKE 'W'.
      RETURN.
    ENDIF.

    " 3) Show F4 help and write the selection back to PA_BUPLA
    CALL FUNCTION 'F4IF_INT_TABLE_VALUE_REQUEST'
      EXPORTING
        retfield        = 'BRANCH'
        dynpprog        = iv_repid
        dynpnr          = iv_dynnr
        dynprofield     = iv_fld_bupla
        value_org       = 'S'
      TABLES
        value_tab       = lt_value
        return_tab      = lt_return
      EXCEPTIONS
        parameter_error = 1
        no_values_found = 2
        OTHERS          = 3.
    IF sy-subrc <> 0 AND sy-subrc <> 2.
      MESSAGE s398(00) WITH 'F4 help could not be displayed' DISPLAY LIKE 'E'.
    ENDIF.
  ENDMETHOD.

ENDCLASS.


*======================================================================*
* PART 2 - DEMO REPORT (create as separate program ZSAPKIT_DEMO_F4)
*======================================================================*
REPORT zsapkit_demo_f4.

PARAMETERS: pa_bukrs TYPE j_1bbranch-bukrs,
            pa_bupla TYPE j_1bbranch-branch.

AT SELECTION-SCREEN ON VALUE-REQUEST FOR pa_bupla.
  zsapkit_demo_clas=>f4_bupla(
    iv_repid = sy-repid
    iv_dynnr = sy-dynnr ).

START-OF-SELECTION.
  WRITE: / 'Company code:', pa_bukrs,
         / 'Business place:', pa_bupla.
