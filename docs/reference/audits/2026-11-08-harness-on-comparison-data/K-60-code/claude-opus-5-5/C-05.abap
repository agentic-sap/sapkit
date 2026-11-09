*&---------------------------------------------------------------------*
*& Report ZJUDGE_C05
*&---------------------------------------------------------------------*
*& Customers from KNA1 grouped by country (classic WRITE list).
*& Each country gets a header line with its key and customer count,
*& followed by one line per customer. Syntax limited to ABAP 7.02.
*&
*& Text elements expected in the text pool:
*&   R  : Customers by country
*&   S  : S_LAND1  -> Country
*&   001: Country
*&   002: Number of customers
*&   003: Customer
*&   004: Name
*&   005: City
*&   006: No customers found for the selection.
*&---------------------------------------------------------------------*
REPORT zjudge_c05 NO STANDARD PAGE HEADING LINE-SIZE 100.

TABLES kna1.

TYPES: BEGIN OF ty_cust,
         land1 TYPE kna1-land1,
         kunnr TYPE kna1-kunnr,
         name1 TYPE kna1-name1,
         ort01 TYPE kna1-ort01,
       END OF ty_cust,
       ty_t_cust TYPE STANDARD TABLE OF ty_cust WITH DEFAULT KEY,
       BEGIN OF ty_cnt,
         land1 TYPE kna1-land1,
         count TYPE i,
       END OF ty_cnt,
       ty_t_cnt TYPE HASHED TABLE OF ty_cnt WITH UNIQUE KEY land1.

CONSTANTS: gc_count_one TYPE i VALUE 1.

DATA: gt_cust TYPE ty_t_cust,
      gs_cust TYPE ty_cust,
      gt_cnt  TYPE ty_t_cnt,
      gs_cnt  TYPE ty_cnt.

SELECT-OPTIONS s_land1 FOR kna1-land1.

TOP-OF-PAGE.
  WRITE: / text-003, 15 text-004, 55 text-005, 90 text-001.
  ULINE.

START-OF-SELECTION.
  PERFORM select_data.
  PERFORM write_list.

*&---------------------------------------------------------------------*
*& Form SELECT_DATA
*&---------------------------------------------------------------------*
FORM select_data.
  SELECT land1 kunnr name1 ort01
    FROM kna1
    INTO TABLE gt_cust
    WHERE land1 IN s_land1.

  SORT gt_cust BY land1 kunnr.

  LOOP AT gt_cust INTO gs_cust.
    CLEAR gs_cnt.
    gs_cnt-land1 = gs_cust-land1.
    gs_cnt-count = gc_count_one.
    COLLECT gs_cnt INTO gt_cnt.
  ENDLOOP.
ENDFORM.                    "select_data

*&---------------------------------------------------------------------*
*& Form WRITE_LIST
*&---------------------------------------------------------------------*
FORM write_list.
  DATA: lv_prev_land1 TYPE kna1-land1,
        lv_first      TYPE abap_bool VALUE abap_true.

  IF gt_cust IS INITIAL.
    WRITE: / text-006.
    RETURN.
  ENDIF.

  LOOP AT gt_cust INTO gs_cust.
    IF lv_first = abap_true OR gs_cust-land1 <> lv_prev_land1.
      IF lv_first = abap_false.
        SKIP.
      ENDIF.
      CLEAR gs_cnt.
      READ TABLE gt_cnt INTO gs_cnt WITH TABLE KEY land1 = gs_cust-land1.
      FORMAT COLOR COL_GROUP INTENSIFIED ON.
      WRITE: / text-001, gs_cust-land1,
               30 text-002, gs_cnt-count.
      FORMAT RESET.
      lv_prev_land1 = gs_cust-land1.
      lv_first      = abap_false.
    ENDIF.

    WRITE: / gs_cust-kunnr,
          15 gs_cust-name1,
          55 gs_cust-ort01,
          90 gs_cust-land1.
  ENDLOOP.
ENDFORM.                    "write_list
