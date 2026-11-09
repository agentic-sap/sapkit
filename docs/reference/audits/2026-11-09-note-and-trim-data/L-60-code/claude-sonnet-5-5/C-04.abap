*&---------------------------------------------------------------------*
*& Report ZJUDGE_C04 - Goods-movement quantities per material and plant
*& Assumed ABAP_RELEASE >= 7.40 SP08 (not configured; stated assumption).
*& Text pool (E + logon language): R title, I 001-005, S so_werks/so_budat/so_bwart.
*&   001 Selection  002 Material  003 Plant  004 Quantity  005 Items
*&   006 No data found  007 No plant authorization  008 Too many items, narrow selection
*&---------------------------------------------------------------------*
REPORT zjudge_c04.

TABLES: mseg, mkpf.

TYPES: BEGIN OF ty_total,
         matnr      TYPE mseg-matnr,
         werks      TYPE mseg-werks,
         meins      TYPE mseg-meins,
         menge      TYPE p LENGTH 15 DECIMALS 3,
         item_count TYPE i,
       END OF ty_total.
TYPES ty_totals TYPE STANDARD TABLE OF ty_total WITH EMPTY KEY.
TYPES ty_plant_range TYPE RANGE OF mseg-werks.

CONSTANTS: gc_max_items TYPE i VALUE 1000000,
           gc_activity_display TYPE c LENGTH 2 VALUE '03',
           gc_auth_object TYPE c LENGTH 10 VALUE 'M_MSEG_WER'.

DATA: gt_totals TYPE ty_totals,
      gt_plants TYPE ty_plant_range.

SELECTION-SCREEN BEGIN OF BLOCK b01 WITH FRAME TITLE TEXT-001.
SELECT-OPTIONS: so_werks FOR mseg-werks,
                so_budat FOR mkpf-budat,
                so_bwart FOR mseg-bwart.
SELECTION-SCREEN END OF BLOCK b01.

START-OF-SELECTION.
  PERFORM f_authorized_plants CHANGING gt_plants.
  IF gt_plants IS INITIAL.
    MESSAGE TEXT-007 TYPE 'S' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.
  PERFORM f_read_totals USING gt_plants CHANGING gt_totals.

END-OF-SELECTION.
  PERFORM f_write_list USING gt_totals.

*---------------------------------------------------------------------*
* In: so_werks / Out: authorized plants as range / Globals: none
*---------------------------------------------------------------------*
FORM f_authorized_plants CHANGING pt_plants TYPE ty_plant_range.
  DATA: lt_werks TYPE SORTED TABLE OF t001w-werks WITH UNIQUE KEY table_line,
        ls_plant LIKE LINE OF pt_plants.

  SELECT werks FROM t001w
    WHERE werks IN @so_werks
    INTO TABLE @lt_werks.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  LOOP AT lt_werks INTO DATA(lv_werks).
    AUTHORITY-CHECK OBJECT gc_auth_object
      ID 'WERKS' FIELD lv_werks
      ID 'ACTVT' FIELD gc_activity_display.
    IF sy-subrc = 0.
      ls_plant = VALUE #( sign = 'I' option = 'EQ' low = lv_werks ).
      APPEND ls_plant TO pt_plants.
    ENDIF.
  ENDLOOP.
ENDFORM.

*---------------------------------------------------------------------*
* In: plant range / Out: totals per material+plant+unit, sorted
*---------------------------------------------------------------------*
FORM f_read_totals USING    pt_plants TYPE ty_plant_range
                   CHANGING pt_totals TYPE ty_totals.
  DATA lv_item_count TYPE i.

  SELECT COUNT(*)
    FROM mseg AS m
    INNER JOIN mkpf AS k ON k~mblnr = m~mblnr AND k~mjahr = m~mjahr
    WHERE m~werks IN @pt_plants
      AND k~budat IN @so_budat
      AND m~bwart IN @so_bwart
    INTO @lv_item_count.
  IF sy-subrc <> 0 OR lv_item_count = 0.
    MESSAGE TEXT-006 TYPE 'S' DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.
  IF lv_item_count > gc_max_items.
    MESSAGE TEXT-008 TYPE 'S' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  SELECT m~matnr, m~werks, m~meins,
         SUM( m~menge ) AS menge,
         COUNT( * ) AS item_count
    FROM mseg AS m
    INNER JOIN mkpf AS k ON k~mblnr = m~mblnr AND k~mjahr = m~mjahr
    WHERE m~werks IN @pt_plants
      AND k~budat IN @so_budat
      AND m~bwart IN @so_bwart
    GROUP BY m~matnr, m~werks, m~meins
    ORDER BY m~matnr, m~werks, m~meins
    INTO CORRESPONDING FIELDS OF TABLE @pt_totals.
  IF sy-subrc <> 0.
    MESSAGE TEXT-006 TYPE 'S' DISPLAY LIKE 'W'.
  ENDIF.
ENDFORM.

*---------------------------------------------------------------------*
* In: totals / Out: classic WRITE list
*---------------------------------------------------------------------*
FORM f_write_list USING pt_totals TYPE ty_totals.
  IF pt_totals IS INITIAL.
    RETURN.
  ENDIF.

  WRITE: / TEXT-002, 20 TEXT-003, 27 TEXT-004, 52 TEXT-005.
  ULINE.
  LOOP AT pt_totals INTO DATA(ls_total).
    WRITE: / ls_total-matnr,
           20 ls_total-werks,
           27 ls_total-menge UNIT ls_total-meins,
           45 ls_total-meins,
           52 ls_total-item_count.
  ENDLOOP.
ENDFORM.
