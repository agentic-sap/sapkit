*&---------------------------------------------------------------------*
*& Report ZJUDGE_C01
*&---------------------------------------------------------------------*
*& Lists purchasing document headers (EKKO) in an ALV grid
*& (cl_salv_table), filtered by purchasing organization and
*& document date, limited to a maximum number of rows.
*&---------------------------------------------------------------------*
REPORT zjudge_c01.

TYPES: BEGIN OF ty_ekko,
         ebeln TYPE ekko-ebeln,
         bukrs TYPE ekko-bukrs,
         ekorg TYPE ekko-ekorg,
         lifnr TYPE ekko-lifnr,
         bedat TYPE ekko-bedat,
         bsart TYPE ekko-bsart,
         ekgrp TYPE ekko-ekgrp,
       END OF ty_ekko,
       tt_ekko TYPE STANDARD TABLE OF ty_ekko WITH DEFAULT KEY.

DATA: gt_ekko  TYPE tt_ekko,
      gv_ekorg TYPE ekko-ekorg,
      gv_bedat TYPE ekko-bedat.

*----------------------------------------------------------------------*
* Selection screen
*----------------------------------------------------------------------*
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME.
  SELECT-OPTIONS: s_ekorg FOR gv_ekorg,   " Purchasing organization
                  s_bedat FOR gv_bedat.   " Document date
  PARAMETERS:     p_max   TYPE i DEFAULT 500 OBLIGATORY. " Max. rows
SELECTION-SCREEN END OF BLOCK b1.

AT SELECTION-SCREEN.
  IF p_max <= 0.
    MESSAGE 'Maximum number of rows must be greater than zero' TYPE 'E'.
  ENDIF.

*----------------------------------------------------------------------*
* Main processing
*----------------------------------------------------------------------*
START-OF-SELECTION.
  PERFORM read_data.

  IF gt_ekko IS INITIAL.
    MESSAGE 'No purchasing documents found for the selection' TYPE 'I'.
    RETURN.
  ENDIF.

  PERFORM display_alv.

*&---------------------------------------------------------------------*
*& Form READ_DATA
*&---------------------------------------------------------------------*
FORM read_data.
  SELECT ebeln bukrs ekorg lifnr bedat bsart ekgrp
    FROM ekko
    INTO TABLE gt_ekko
    UP TO p_max ROWS
    WHERE ekorg IN s_ekorg
      AND bedat IN s_bedat
    ORDER BY PRIMARY KEY.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form DISPLAY_ALV
*&---------------------------------------------------------------------*
FORM display_alv.
  DATA: lo_alv     TYPE REF TO cl_salv_table,
        lo_columns TYPE REF TO cl_salv_columns_table,
        lx_msg     TYPE REF TO cx_salv_msg.

  TRY.
      cl_salv_table=>factory(
        IMPORTING r_salv_table = lo_alv
        CHANGING  t_table      = gt_ekko ).
    CATCH cx_salv_msg INTO lx_msg.
      MESSAGE lx_msg TYPE 'I' DISPLAY LIKE 'E'.
      RETURN.
  ENDTRY.

  lo_alv->get_functions( )->set_all( abap_true ).

  lo_columns = lo_alv->get_columns( ).
  lo_columns->set_optimize( abap_true ).

  PERFORM set_heading USING lo_columns:
    'EBELN' 'Doc.No.'   'Purch. Doc.'   'Purchasing Document',
    'BUKRS' 'CoCd'      'Company Code'  'Company Code',
    'EKORG' 'POrg'      'Purch. Org.'   'Purchasing Organization',
    'LIFNR' 'Vendor'    'Vendor'        'Vendor Account Number',
    'BEDAT' 'Doc.Date'  'Doc. Date'     'Purchasing Document Date',
    'BSART' 'Type'      'Doc. Type'     'Purchasing Document Type',
    'EKGRP' 'PGr'       'Purch. Group'  'Purchasing Group'.

  lo_alv->display( ).
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SET_HEADING
*&---------------------------------------------------------------------*
FORM set_heading USING io_columns TYPE REF TO cl_salv_columns_table
                       iv_name    TYPE lvc_fname
                       iv_short   TYPE scrtext_s
                       iv_medium  TYPE scrtext_m
                       iv_long    TYPE scrtext_l.
  DATA lo_column TYPE REF TO cl_salv_column.

  TRY.
      lo_column = io_columns->get_column( iv_name ).
      lo_column->set_short_text( iv_short ).
      lo_column->set_medium_text( iv_medium ).
      lo_column->set_long_text( iv_long ).
    CATCH cx_salv_not_found.
      " Column not present - ignore
  ENDTRY.
ENDFORM.
