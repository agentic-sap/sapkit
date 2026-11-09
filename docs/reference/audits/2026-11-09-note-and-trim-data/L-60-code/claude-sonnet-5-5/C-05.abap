REPORT zjudge_c05.

TYPE-POOLS abap.

TYPES: BEGIN OF ty_country_count,
         land1          TYPE kna1-land1,
         customer_count TYPE i,
       END OF ty_country_count.

TYPES: BEGIN OF ty_customer,
         land1 TYPE kna1-land1,
         kunnr TYPE kna1-kunnr,
         name1 TYPE kna1-name1,
         ort01 TYPE kna1-ort01,
       END OF ty_customer.

TYPES: ty_country_count_table TYPE SORTED TABLE OF ty_country_count
                              WITH UNIQUE KEY land1.

TYPES: ty_customer_table TYPE SORTED TABLE OF ty_customer
                         WITH NON-UNIQUE KEY land1 kunnr.

CONSTANTS: gc_auth_object      TYPE xuobject VALUE 'F_KNA1_APP',
           gc_activity_display TYPE activ_auth VALUE '03',
           gc_volume_limit     TYPE i VALUE 1000000.

DATA: gv_country_filter  TYPE kna1-land1,
      gt_country_count   TYPE ty_country_count_table,
      gt_customer        TYPE ty_customer_table,
      gs_customer        TYPE ty_customer,
      gv_total_customers TYPE i,
      gv_is_authorized   TYPE abap_bool,
      gv_is_volume_ok    TYPE abap_bool.

SELECT-OPTIONS s_land FOR gv_country_filter.

START-OF-SELECTION.
  PERFORM check_authority CHANGING gv_is_authorized.
  IF gv_is_authorized = abap_false.
    MESSAGE 'No authorization to display customers'(e01) TYPE 'S' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  PERFORM read_country_counts.
  PERFORM check_volume CHANGING gv_is_volume_ok.
  IF gv_is_volume_ok = abap_false.
    MESSAGE 'Too many customers selected - narrow the country selection'(e02) TYPE 'S' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  IF gv_total_customers = 0.
    MESSAGE 'No customers found for the selection'(e03) TYPE 'S'.
    RETURN.
  ENDIF.

  PERFORM read_customers.
  PERFORM write_customer_list.

* In: none / Out: pv_is_authorized / Global side effects: none
FORM check_authority CHANGING pv_is_authorized TYPE abap_bool.
  pv_is_authorized = abap_false.

  AUTHORITY-CHECK OBJECT gc_auth_object
    ID 'APPLCLAS' DUMMY
    ID 'ACTVT'    FIELD gc_activity_display.
  IF sy-subrc = 0.
    pv_is_authorized = abap_true.
  ENDIF.
ENDFORM.

* In: s_land / Out: none / Global side effects: fills gt_country_count, gv_total_customers
FORM read_country_counts.
  DATA: ls_count TYPE ty_country_count.

  CLEAR: gt_country_count,
         gv_total_customers.

  SELECT land1 COUNT( * ) AS customer_count
    FROM kna1
    INTO TABLE gt_country_count
    WHERE land1 IN s_land
    GROUP BY land1.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  LOOP AT gt_country_count INTO ls_count.
    gv_total_customers = gv_total_customers + ls_count-customer_count.
  ENDLOOP.
ENDFORM.

* In: gv_total_customers / Out: pv_is_volume_ok / Global side effects: none
FORM check_volume CHANGING pv_is_volume_ok TYPE abap_bool.
  pv_is_volume_ok = abap_true.

  IF gv_total_customers > gc_volume_limit.
    pv_is_volume_ok = abap_false.
  ENDIF.
ENDFORM.

* In: s_land / Out: none / Global side effects: fills gt_customer
FORM read_customers.
  CLEAR gt_customer.

  SELECT land1 kunnr name1 ort01
    FROM kna1
    INTO TABLE gt_customer
    WHERE land1 IN s_land.
  IF sy-subrc <> 0.
    MESSAGE 'No customers found for the selection'(e03) TYPE 'S'.
  ENDIF.
ENDFORM.

* In: gt_customer / Out: classic list / Global side effects: writes list output
FORM write_customer_list.
  LOOP AT gt_customer INTO gs_customer.
    AT NEW land1.
      PERFORM write_country_header USING gs_customer-land1.
    ENDAT.
    PERFORM write_customer_line USING gs_customer.
  ENDLOOP.
ENDFORM.

* In: pv_land1 / Out: header line in list / Global side effects: reads gt_country_count
FORM write_country_header USING pv_land1 TYPE kna1-land1.
  DATA: ls_count TYPE ty_country_count.

  READ TABLE gt_country_count INTO ls_count WITH TABLE KEY land1 = pv_land1.
  IF sy-subrc <> 0.
    FORMAT COLOR COL_GROUP.
    WRITE: / 'Country'(001), pv_land1.
    FORMAT COLOR OFF.
    RETURN.
  ENDIF.

  FORMAT COLOR COL_GROUP.
  WRITE: / 'Country'(001), pv_land1, 'Customers'(002), ls_count-customer_count LEFT-JUSTIFIED.
  FORMAT COLOR OFF.
ENDFORM.

* In: ps_customer / Out: customer line in list / Global side effects: writes list output
FORM write_customer_line USING ps_customer TYPE ty_customer.
  WRITE: / ps_customer-kunnr,
           ps_customer-name1,
           ps_customer-ort01,
           ps_customer-land1.
ENDFORM.
