*&---------------------------------------------------------------------*
*& Report ZJUDGE_C01
*&---------------------------------------------------------------------*
*& Lists purchasing document headers (EKKO) in an ALV grid (SALV).
*&---------------------------------------------------------------------*
REPORT zjudge_c01.

TYPES: BEGIN OF ty_header,
         ebeln TYPE ekko-ebeln,
         bukrs TYPE ekko-bukrs,
         ekorg TYPE ekko-ekorg,
         lifnr TYPE ekko-lifnr,
         bedat TYPE ekko-bedat,
         bsart TYPE ekko-bsart,
         ekgrp TYPE ekko-ekgrp,
       END OF ty_header,
       tt_header TYPE STANDARD TABLE OF ty_header WITH EMPTY KEY.

DATA gt_header TYPE tt_header.

*---------------------------------------------------------------------*
* Selection screen
*---------------------------------------------------------------------*
DATA gv_ekorg TYPE ekko-ekorg.
DATA gv_bedat TYPE ekko-bedat.

SELECTION-SCREEN BEGIN OF BLOCK b01 WITH FRAME TITLE TEXT-b01.
  SELECTION-SCREEN BEGIN OF LINE.
    SELECTION-SCREEN COMMENT 1(30) cm_ekorg FOR FIELD s_ekorg.
    SELECT-OPTIONS s_ekorg FOR gv_ekorg.
  SELECTION-SCREEN END OF LINE.
  SELECTION-SCREEN BEGIN OF LINE.
    SELECTION-SCREEN COMMENT 1(30) cm_bedat FOR FIELD s_bedat.
    SELECT-OPTIONS s_bedat FOR gv_bedat.
  SELECTION-SCREEN END OF LINE.
  SELECTION-SCREEN BEGIN OF LINE.
    SELECTION-SCREEN COMMENT 1(30) cm_max FOR FIELD p_max.
    PARAMETERS p_max TYPE i DEFAULT 500.
  SELECTION-SCREEN END OF LINE.
SELECTION-SCREEN END OF BLOCK b01.

INITIALIZATION.
  cm_ekorg = 'Purchasing organization'(c01).
  cm_bedat = 'Document date'(c02).
  cm_max   = 'Maximum number of rows'(c03).

START-OF-SELECTION.
  PERFORM select_data.
  IF gt_header IS INITIAL.
    MESSAGE 'No purchasing documents found for the selection.'(m01)
            TYPE 'S' DISPLAY LIKE 'I'.
    RETURN.
  ENDIF.
  PERFORM display_alv.

*---------------------------------------------------------------------*
FORM select_data.

  IF p_max <= 0.
    MESSAGE 'Maximum number of rows must be greater than zero.'(m02)
            TYPE 'S' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  SELECT ebeln, bukrs, ekorg, lifnr, bedat, bsart, ekgrp
    FROM ekko
    WHERE ekorg IN @s_ekorg
      AND bedat IN @s_bedat
    ORDER BY ebeln
    INTO TABLE @gt_header
    UP TO @p_max ROWS.

ENDFORM.

*---------------------------------------------------------------------*
FORM display_alv.

  DATA lo_alv     TYPE REF TO cl_salv_table.
  DATA lo_columns TYPE REF TO cl_salv_columns_table.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv
                              CHANGING  t_table      = gt_header ).

      lo_alv->get_functions( )->set_all( abap_true ).
      lo_alv->get_display_settings( )->set_striped_pattern( abap_true ).

      lo_columns = lo_alv->get_columns( ).

      PERFORM set_heading USING lo_columns 'EBELN'
                                'Doc.'(h01) 'Purch. Doc.'(h02) 'Purchasing Document'(h03).
      PERFORM set_heading USING lo_columns 'BUKRS'
                                'CoCd'(h04) 'Company Code'(h05) 'Company Code'(h06).
      PERFORM set_heading USING lo_columns 'EKORG'
                                'POrg'(h07) 'Purch. Org.'(h08) 'Purchasing Organization'(h09).
      PERFORM set_heading USING lo_columns 'LIFNR'
                                'Vendor'(h10) 'Vendor'(h11) 'Vendor Account Number'(h12).
      PERFORM set_heading USING lo_columns 'BEDAT'
                                'Doc.Date'(h13) 'Document Date'(h14) 'Purchasing Document Date'(h15).
      PERFORM set_heading USING lo_columns 'BSART'
                                'Type'(h16) 'Doc. Type'(h17) 'Purchasing Document Type'(h18).
      PERFORM set_heading USING lo_columns 'EKGRP'
                                'PGrp'(h19) 'Purch. Group'(h20) 'Purchasing Group'(h21).

      lo_columns->set_optimize( abap_true ).

      lo_alv->display( ).

    CATCH cx_salv_msg cx_salv_not_found cx_salv_data_error INTO DATA(lx_salv).
      MESSAGE lx_salv->get_text( ) TYPE 'S' DISPLAY LIKE 'E'.
  ENDTRY.

ENDFORM.

*---------------------------------------------------------------------*
FORM set_heading USING po_columns TYPE REF TO cl_salv_columns_table
                       pv_name    TYPE lvc_fname
                       pv_short   TYPE scrtext_s
                       pv_medium  TYPE scrtext_m
                       pv_long    TYPE scrtext_l
                 RAISING cx_salv_not_found.

  DATA(lo_column) = po_columns->get_column( pv_name ).
  lo_column->set_short_text( pv_short ).
  lo_column->set_medium_text( pv_medium ).
  lo_column->set_long_text( pv_long ).

ENDFORM.
