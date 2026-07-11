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
    " Weekday parity is derived from a fixed reference date rather than a
    " function module call: 2024-01-01 is a known Monday (see ltc_workdays
    " fixtures below). ABAP TYPE D arithmetic (date - date) yields a signed
    " day-count delta, and ABAP MOD always returns a result in [0, divisor)
    " for a positive divisor (floor-mod semantics), so (delta MOD 7) stays
    " a stable weekday index whether iv_from lies before or after the
    " reference date. Mapping: 0=Mon 1=Tue 2=Wed 3=Thu 4=Fri 5=Sat 6=Sun,
    " so dow < 5 identifies a weekday.
    CONSTANTS lc_monday_ref TYPE d VALUE '20240101'.
    DATA lv_date TYPE d.
    DATA lv_dow TYPE i.
    rv_days = 0.
    IF iv_from > iv_to.
      RETURN.
    ENDIF.
    lv_date = iv_from.
    WHILE lv_date <= iv_to.
      lv_dow = ( lv_date - lc_monday_ref ) MOD 7.
      IF lv_dow < 5 AND NOT line_exists( it_holidays[ table_line = lv_date ] ).
        rv_days = rv_days + 1.
      ENDIF.
      lv_date = lv_date + 1.
    ENDWHILE.
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
