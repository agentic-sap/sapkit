REPORT zsah1_workdays.

CLASS lcl_workdays DEFINITION FINAL.
  PUBLIC SECTION.
    TYPES ty_dates TYPE SORTED TABLE OF d WITH UNIQUE KEY table_line.
    CLASS-METHODS calc
      IMPORTING iv_from        TYPE d
                iv_to          TYPE d
                it_holidays    TYPE ty_dates OPTIONAL
      RETURNING VALUE(rv_days) TYPE i.
ENDCLASS.

CLASS lcl_workdays IMPLEMENTATION.
  METHOD calc.
    rv_days = -1.
  ENDMETHOD.
ENDCLASS.

CLASS ltc_workdays DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    METHODS weekdays_only FOR TESTING.
    METHODS spans_weekend FOR TESTING.
    METHODS excludes_holidays FOR TESTING.
    METHODS same_day FOR TESTING.
    METHODS inverted_range FOR TESTING.
ENDCLASS.

CLASS ltc_workdays IMPLEMENTATION.

  METHOD weekdays_only.
    DATA(lv_from) = CONV d( '20240101' ).
    DATA(lv_to) = CONV d( '20240105' ).
    DATA(lv_days) = lcl_workdays=>calc( iv_from = lv_from iv_to = lv_to ).
    cl_abap_unit_assert=>assert_equals( act = lv_days exp = 5 ).
  ENDMETHOD.

  METHOD spans_weekend.
    DATA(lv_from) = CONV d( '20240104' ).
    DATA(lv_to) = CONV d( '20240109' ).
    DATA(lv_days) = lcl_workdays=>calc( iv_from = lv_from iv_to = lv_to ).
    cl_abap_unit_assert=>assert_equals( act = lv_days exp = 4 ).
  ENDMETHOD.

  METHOD excludes_holidays.
    DATA(lv_from) = CONV d( '20240101' ).
    DATA(lv_to) = CONV d( '20240105' ).
    DATA(lt_holidays) = VALUE lcl_workdays=>ty_dates( ( CONV d( '20240101' ) ) ).
    DATA(lv_days) = lcl_workdays=>calc( iv_from = lv_from iv_to = lv_to it_holidays = lt_holidays ).
    cl_abap_unit_assert=>assert_equals( act = lv_days exp = 4 ).
  ENDMETHOD.

  METHOD same_day.
    DATA(lv_from) = CONV d( '20240103' ).
    DATA(lv_to) = CONV d( '20240103' ).
    DATA(lv_days) = lcl_workdays=>calc( iv_from = lv_from iv_to = lv_to ).
    cl_abap_unit_assert=>assert_equals( act = lv_days exp = 1 ).
  ENDMETHOD.

  METHOD inverted_range.
    DATA(lv_from) = CONV d( '20240105' ).
    DATA(lv_to) = CONV d( '20240101' ).
    DATA(lv_days) = lcl_workdays=>calc( iv_from = lv_from iv_to = lv_to ).
    cl_abap_unit_assert=>assert_equals( act = lv_days exp = 0 ).
  ENDMETHOD.

ENDCLASS.
