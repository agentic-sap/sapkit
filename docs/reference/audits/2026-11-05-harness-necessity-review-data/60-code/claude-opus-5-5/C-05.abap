*&---------------------------------------------------------------------*
*& Report ZJUDGE_C05
*&---------------------------------------------------------------------*
*& Lists customers from KNA1 grouped by country.
*& For each country: a header line with country key and customer count,
*& followed by one line per customer. Classic WRITE list (ABAP 7.02).
*&---------------------------------------------------------------------*
REPORT zjudge_c05 LINE-SIZE 120 NO STANDARD PAGE HEADING.

TABLES kna1.

TYPES: BEGIN OF ty_cust,
         land1 TYPE kna1-land1,
         kunnr TYPE kna1-kunnr,
         name1 TYPE kna1-name1,
         ort01 TYPE kna1-ort01,
       END OF ty_cust,
       ty_cust_tab TYPE STANDARD TABLE OF ty_cust,
       BEGIN OF ty_count,
         land1 TYPE kna1-land1,
         count TYPE i,
       END OF ty_count,
       ty_count_tab TYPE STANDARD TABLE OF ty_count.

DATA: gt_cust  TYPE ty_cust_tab,
      gs_cust  TYPE ty_cust,
      gt_count TYPE ty_count_tab,
      gs_count TYPE ty_count,
      gv_land1 TYPE kna1-land1.

SELECT-OPTIONS s_land1 FOR kna1-land1.

START-OF-SELECTION.

  SELECT land1 kunnr name1 ort01
    FROM kna1
    INTO TABLE gt_cust
    WHERE land1 IN s_land1.

  IF gt_cust IS INITIAL.
    MESSAGE 'No customers found for the selection.' TYPE 'S'.
    RETURN.
  ENDIF.

  SORT gt_cust BY land1 kunnr.

* Build customer count per country
  LOOP AT gt_cust INTO gs_cust.
    CLEAR gs_count.
    gs_count-land1 = gs_cust-land1.
    gs_count-count = 1.
    COLLECT gs_count INTO gt_count.
  ENDLOOP.
  SORT gt_count BY land1.

* Output grouped list
  LOOP AT gt_cust INTO gs_cust.
    AT NEW land1.
      gv_land1 = gs_cust-land1.
      CLEAR gs_count.
      READ TABLE gt_count INTO gs_count
           WITH KEY land1 = gv_land1 BINARY SEARCH.
      SKIP.
      FORMAT COLOR COL_GROUP INTENSIFIED ON.
      WRITE: / 'Country:', gv_land1,
               'Number of customers:', gs_count-count.
      FORMAT COLOR OFF INTENSIFIED OFF.
      ULINE.
    ENDAT.

    WRITE: /5 gs_cust-kunnr,
           20 gs_cust-name1,
           60 gs_cust-ort01,
           100 gs_cust-land1.
  ENDLOOP.

TOP-OF-PAGE.
  FORMAT COLOR COL_HEADING INTENSIFIED ON.
  WRITE: /5 'Customer',
         20 'Name',
         60 'City',
         100 'Country'.
  FORMAT COLOR OFF INTENSIFIED OFF.
  ULINE.
