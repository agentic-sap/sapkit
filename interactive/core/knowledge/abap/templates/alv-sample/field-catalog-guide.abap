*&---------------------------------------------------------------------*
*& Field catalog build-up for a CL_GUI_ALV_GRID screen - excerpt only.
*&
*& Screen 0100 fills its grid in two steps, in this order:
*&   1. CONVERT_FCAT_DATA_GRID      - SALV reads the row structure of the
*&                                   output table and hands back LVC_T_FCAT.
*&   2. MODIFY_FCAT_DATA_GRID1_0100 - per-column tuning on top of it.
*&
*& The globals seen at the call site (GT_OUTTAB_0100, GT_FCAT_GRID1_0100)
*& and the aggregation-level radio buttons read further down belong to the
*& TOP include of the owning report. This file carries the two FORMs only.
*&---------------------------------------------------------------------*

PERFORM convert_fcat_data_grid USING gt_outtab_0100
                               CHANGING gt_fcat_grid1_0100.

PERFORM modify_fcat_data_grid1_0100.

*&---------------------------------------------------------------------*
*& Form CONVERT_FCAT_DATA_GRID
*&---------------------------------------------------------------------*
*& Derives an LVC field catalog from the row type of PT_TABLE and returns
*& it in PT_FIELDCAT. Reads no global and writes none - being screen
*& independent, it carries no _{screen_no} suffix.
*&---------------------------------------------------------------------*
FORM convert_fcat_data_grid USING pt_table TYPE STANDARD TABLE
                            CHANGING pt_fieldcat TYPE lvc_t_fcat.

  DATA lr_probe TYPE REF TO data.
  DATA lr_salv TYPE REF TO cl_salv_table.

  " SALV has to bind to a table of its own, and PT_TABLE arrives
  " generically typed. An empty twin of it serves as the probe - only the
  " row type is read from it, never the contents.
  CREATE DATA lr_probe LIKE pt_table.
  ASSIGN lr_probe->* TO FIELD-SYMBOL(<fs_probe>).

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lr_salv
                              CHANGING t_table = <fs_probe> ).

      pt_fieldcat = cl_salv_controller_metadata=>get_lvc_fieldcatalog(
                      r_columns = lr_salv->get_columns( )
                      r_aggregations = lr_salv->get_aggregations( ) ).
    CATCH cx_salv_msg.
      " Row type not displayable by SALV: PT_FIELDCAT stays as the caller
      " left it, and the caller decides whether a grid is still possible.
  ENDTRY.

ENDFORM.

*&---------------------------------------------------------------------*
*& Form MODIFY_FCAT_DATA_GRID1_0100
*&---------------------------------------------------------------------*
*& Tunes the catalog the FORM above produced, one FIELDNAME at a time.
*& Changes GT_FCAT_GRID1_0100 in place; reads the aggregation-level radio
*& buttons P_TOT / P_GRP / P_CUST.
*&---------------------------------------------------------------------*
FORM modify_fcat_data_grid1_0100.

  LOOP AT gt_fcat_grid1_0100 ASSIGNING FIELD-SYMBOL(<fs_fieldcat>).

    CASE <fs_fieldcat>-fieldname.

      WHEN 'ZZNOTE1' OR 'ZZNOTE2'.
        " free-text appends: cap the width so the grid stays readable
        <fs_fieldcat>-outputlen = 20.

      WHEN 'KUNNR'.
        " one customer number only carries meaning per-customer
        IF p_tot = abap_true OR p_grp = abap_true.
          <fs_fieldcat>-no_out = abap_true.
        ENDIF.

      WHEN 'NAME1'.
        IF p_tot = abap_true OR p_grp = abap_true.
          <fs_fieldcat>-no_out = abap_true.
        ELSEIF p_cust = abap_true.
          <fs_fieldcat>-outputlen = 15.
        ENDIF.

      WHEN 'VKGRP'.
        IF p_tot = abap_true.
          <fs_fieldcat>-no_out = abap_true.
        ENDIF.

      WHEN 'BEZEI'.
        IF p_tot = abap_true.
          <fs_fieldcat>-no_out = abap_true.
        ELSEIF p_grp = abap_true OR p_cust = abap_true.
          <fs_fieldcat>-outputlen = 15.
        ENDIF.

      " quantity and amount columns: caption out of the text pool, the
      " reference field carrying the unit or the currency, a column total,
      " and a hotspot wherever the cell drills down
      WHEN 'KWMENG'.
        <fs_fieldcat>-coltext = text-f01.
        <fs_fieldcat>-qfieldname = 'MEINS'.
        <fs_fieldcat>-do_sum = abap_true.
        <fs_fieldcat>-hotspot = abap_true.

      WHEN 'NETWR'.
        <fs_fieldcat>-coltext = text-f02.
        <fs_fieldcat>-cfieldname = 'WAERK'.
        <fs_fieldcat>-do_sum = abap_true.

      WHEN 'LABST'.
        <fs_fieldcat>-coltext = text-f03.
        <fs_fieldcat>-qfieldname = 'MEINS'.
        <fs_fieldcat>-do_sum = abap_true.

      WHEN 'LABST_ATP'.
        <fs_fieldcat>-coltext = text-f04.
        <fs_fieldcat>-qfieldname = 'MEINS'.
        <fs_fieldcat>-do_sum = abap_true.
        <fs_fieldcat>-hotspot = abap_true.

      WHEN 'MEINS' OR 'WAERK'.
        " reference fields for the columns above - hidden, never dropped
        <fs_fieldcat>-no_out = abap_true.

    ENDCASE.

  ENDLOOP.

ENDFORM.