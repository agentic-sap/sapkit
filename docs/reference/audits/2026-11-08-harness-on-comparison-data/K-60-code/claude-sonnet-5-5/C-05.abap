*&---------------------------------------------------------------------*
*& Report  ZJUDGE_C05
*& Customer list from KNA1 grouped by country (classic WRITE list).
*& Syntax level: ABAP 7.02 (NetWeaver 7.0 EHP2) - no 7.40+ syntax.
*&---------------------------------------------------------------------*
REPORT zjudge_c05 LINE-SIZE 90 NO STANDARD PAGE HEADING.

TABLES: kna1.

TYPES: BEGIN OF ty_customer,
         land1 TYPE kna1-land1,
         kunnr TYPE kna1-kunnr,
         name1 TYPE kna1-name1,
         ort01 TYPE kna1-ort01,
       END OF ty_customer,
       ty_t_customer TYPE STANDARD TABLE OF ty_customer WITH DEFAULT KEY.

TYPES: BEGIN OF ty_count,
         land1 TYPE kna1-land1,
         cnt   TYPE i,
       END OF ty_count,
       ty_t_count TYPE STANDARD TABLE OF ty_count WITH DEFAULT KEY.

DATA: gt_customer TYPE ty_t_customer,
      gt_count    TYPE ty_t_count.

CONSTANTS: gc_line_char TYPE c LENGTH 1 VALUE '-'.

SELECT-OPTIONS: s_land1 FOR kna1-land1.

*---------------------------------------------------------------------*
START-OF-SELECTION.
  PERFORM read_customers.
  PERFORM count_customers.

END-OF-SELECTION.
  PERFORM write_list.

*---------------------------------------------------------------------*
* read_customers - fills gt_customer for the country selection
*---------------------------------------------------------------------*
FORM read_customers.
  SELECT land1 kunnr name1 ort01
    FROM kna1
    INTO TABLE gt_customer
    WHERE land1 IN s_land1.
  IF sy-subrc <> 0.
    CLEAR gt_customer.
  ENDIF.
  SORT gt_customer BY land1 kunnr.
ENDFORM.                    "read_customers

*---------------------------------------------------------------------*
* count_customers - customers per country into gt_count
*---------------------------------------------------------------------*
FORM count_customers.
  DATA: ls_customer TYPE ty_customer,
        ls_count    TYPE ty_count.

  LOOP AT gt_customer INTO ls_customer.
    CLEAR ls_count.
    ls_count-land1 = ls_customer-land1.
    ls_count-cnt   = 1.
    COLLECT ls_count INTO gt_count.
  ENDLOOP.
  SORT gt_count BY land1.
ENDFORM.                    "count_customers

*---------------------------------------------------------------------*
* write_list - header line per country, then one line per customer
*---------------------------------------------------------------------*
FORM write_list.
  DATA: ls_count    TYPE ty_count,
        ls_customer TYPE ty_customer.

  IF gt_count IS INITIAL.
    WRITE: / 'No customers found for the selection.'(004).
    RETURN.
  ENDIF.

  LOOP AT gt_count INTO ls_count.
    ULINE.
    WRITE: / 'Country'(001) COLOR COL_HEADING,
             ls_count-land1 COLOR COL_HEADING,
             'Customers:'(002) COLOR COL_HEADING,
             ls_count-cnt   COLOR COL_HEADING LEFT-JUSTIFIED.
    LOOP AT gt_customer INTO ls_customer
         WHERE land1 = ls_count-land1.
      WRITE: / ls_customer-kunnr,
               ls_customer-name1,
               ls_customer-ort01,
               ls_customer-land1.
    ENDLOOP.
  ENDLOOP.
  ULINE.
ENDFORM.                    "write_list

*---------------------------------------------------------------------*
TOP-OF-PAGE.
  WRITE: / 'Customer'(010), 'Name'(011), 'City'(012), 'Country'(013).
  ULINE.
