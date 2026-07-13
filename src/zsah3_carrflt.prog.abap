REPORT zsah3_carrflt.

" Carrier flight-count summary report.
" For each carrier (SCARR) it reports how many scheduled flights (SFLIGHT)
" the carrier operates. A carrier that operates no flights must still appear
" in the result, with a flight count of zero (LEFT OUTER semantics).

CLASS lcl_report DEFINITION FINAL.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_row,
             carrid      TYPE scarr-carrid,
             carrname    TYPE scarr-carrname,
             flightcount TYPE i,
           END OF ty_row.
    TYPES ty_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
    CLASS-METHODS collect
      RETURNING VALUE(rt_rows) TYPE ty_rows.
ENDCLASS.

CLASS lcl_report IMPLEMENTATION.
  METHOD collect.
    SELECT FROM scarr AS c
           LEFT OUTER JOIN sflight AS f ON f~carrid = c~carrid
         FIELDS c~carrid,
                c~carrname,
                COUNT( f~fldate ) AS flightcount
         GROUP BY c~carrid, c~carrname
         ORDER BY c~carrid
         INTO TABLE @rt_rows.
  ENDMETHOD.
ENDCLASS.

START-OF-SELECTION.
  DATA(lt_rows) = lcl_report=>collect( ).
  LOOP AT lt_rows INTO DATA(ls_row).
    WRITE: / ls_row-carrid, ls_row-carrname, ls_row-flightcount.
  ENDLOOP.

CLASS ltc_report DEFINITION FINAL FOR TESTING
  RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    CLASS-DATA go_osql TYPE REF TO if_osql_test_environment.
    CLASS-METHODS class_setup.
    CLASS-METHODS class_teardown.
    METHODS setup.
    METHODS zero_flight_carrier_present FOR TESTING.
ENDCLASS.

CLASS ltc_report IMPLEMENTATION.

  METHOD class_setup.
    go_osql = cl_osql_test_environment=>create(
      i_dependency_list = VALUE #( ( 'SCARR' ) ( 'SFLIGHT' ) ) ).
  ENDMETHOD.

  METHOD class_teardown.
    go_osql->destroy( ).
  ENDMETHOD.

  METHOD setup.
    go_osql->clear_doubles( ).
  ENDMETHOD.

  METHOD zero_flight_carrier_present.
    " Fixtures: three carriers, one of which (ZZ) operates no flights.
    DATA lt_scarr   TYPE STANDARD TABLE OF scarr.
    DATA lt_sflight TYPE STANDARD TABLE OF sflight.
    lt_scarr = VALUE #(
      ( mandt = sy-mandt carrid = 'AA' carrname = 'Test Air A' )
      ( mandt = sy-mandt carrid = 'LH' carrname = 'Test Air L' )
      ( mandt = sy-mandt carrid = 'ZZ' carrname = 'No Flights' ) ).
    lt_sflight = VALUE #(
      ( mandt = sy-mandt carrid = 'AA' connid = '0017' fldate = '20240101' )
      ( mandt = sy-mandt carrid = 'AA' connid = '0017' fldate = '20240102' )
      ( mandt = sy-mandt carrid = 'LH' connid = '0400' fldate = '20240101' ) ).
    go_osql->insert_test_data( lt_scarr ).
    go_osql->insert_test_data( lt_sflight ).

    DATA(lt_rows) = lcl_report=>collect( ).

    cl_abap_unit_assert=>assert_equals(
      act = lines( lt_rows )
      exp = 3
      msg = 'all three carriers must appear, incl. the zero-flight carrier' ).
    READ TABLE lt_rows WITH KEY carrid = 'ZZ' INTO DATA(ls_zz).
    cl_abap_unit_assert=>assert_subrc(
      msg = 'zero-flight carrier ZZ must be present (LEFT OUTER JOIN)' ).
    cl_abap_unit_assert=>assert_equals(
      act = ls_zz-flightcount
      exp = 0
      msg = 'zero-flight carrier must show flight count 0' ).
  ENDMETHOD.

ENDCLASS.
