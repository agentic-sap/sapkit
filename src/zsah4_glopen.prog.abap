REPORT zsah4_glopen.

" G/L open-item balance report (S/4HANA).
" For a company code, fiscal year and ledger it sums the open-item amount
" (clearing document still blank) per G/L account and prints one line per
" account. Amounts come from ACDOCA (Universal Journal leading table);
" the ledger filter prevents double counting across parallel ledgers.

PARAMETERS p_bukrs TYPE bukrs OBLIGATORY.
PARAMETERS p_gjahr TYPE gjahr OBLIGATORY.
PARAMETERS p_rldnr TYPE acdoca-rldnr DEFAULT '0L'.

CLASS lcl_report DEFINITION FINAL.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_row,
             glaccount TYPE racct,
             amount    TYPE acdoca-hsl,
           END OF ty_row.
    TYPES ty_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
    CLASS-METHODS collect
      IMPORTING iv_bukrs       TYPE bukrs
                iv_gjahr       TYPE gjahr
                iv_rldnr       TYPE acdoca-rldnr
      RETURNING VALUE(rt_rows) TYPE ty_rows.
ENDCLASS.

CLASS lcl_report IMPLEMENTATION.
  METHOD collect.
    SELECT FROM acdoca
         FIELDS racct AS glaccount,
                SUM( hsl ) AS amount
         WHERE rbukrs = @iv_bukrs
           AND gjahr  = @iv_gjahr
           AND rldnr  = @iv_rldnr
           AND augbl  = @space
         GROUP BY racct
         ORDER BY racct
         INTO TABLE @rt_rows.
  ENDMETHOD.
ENDCLASS.

START-OF-SELECTION.
  DATA(lt_rows) = lcl_report=>collect( iv_bukrs = p_bukrs
                                       iv_gjahr = p_gjahr
                                       iv_rldnr = p_rldnr ).
  LOOP AT lt_rows INTO DATA(ls_row).
    WRITE: / ls_row-glaccount, ls_row-amount.
  ENDLOOP.

CLASS ltc_report DEFINITION FINAL FOR TESTING
  RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    CLASS-DATA go_osql TYPE REF TO if_osql_test_environment.
    CLASS-METHODS class_setup.
    CLASS-METHODS class_teardown.
    METHODS setup.
    METHODS open_and_leading_ledger_only FOR TESTING.
ENDCLASS.

CLASS ltc_report IMPLEMENTATION.

  METHOD class_setup.
    go_osql = cl_osql_test_environment=>create(
      i_dependency_list = VALUE #( ( 'ACDOCA' ) ) ).
  ENDMETHOD.

  METHOD class_teardown.
    go_osql->destroy( ).
  ENDMETHOD.

  METHOD setup.
    go_osql->clear_doubles( ).
  ENDMETHOD.

  METHOD open_and_leading_ledger_only.
    " Fixtures mix open/cleared lines and leading/extension ledgers.
    " Only open lines (augbl blank) on the leading ledger 0L must be summed.
    DATA lt_acdoca TYPE STANDARD TABLE OF acdoca.
    lt_acdoca = VALUE #(
      rclnt = sy-mandt rbukrs = '1000' gjahr = '2024'
      ( rldnr = '0L' racct = '0000400000' hsl = '100.00' augbl = '' )
      ( rldnr = '0L' racct = '0000400000' hsl = '50.00'  augbl = '' )
      ( rldnr = '0L' racct = '0000400000' hsl = '999.00' augbl = '0000000900' )
      ( rldnr = '2L' racct = '0000400000' hsl = '777.00' augbl = '' )
      ( rldnr = '0L' racct = '0000113100' hsl = '200.00' augbl = '' ) ).
    go_osql->insert_test_data( lt_acdoca ).

    DATA(lt_rows) = lcl_report=>collect( iv_bukrs = '1000'
                                         iv_gjahr = '2024'
                                         iv_rldnr = '0L' ).

    cl_abap_unit_assert=>assert_equals(
      act = lines( lt_rows )
      exp = 2
      msg = 'only leading-ledger G/L accounts with open items appear' ).
    READ TABLE lt_rows WITH KEY glaccount = '0000400000' INTO DATA(ls_a).
    cl_abap_unit_assert=>assert_equals(
      act = ls_a-amount
      exp = '150.00'
      msg = 'open 0L lines summed; cleared and 2L lines excluded' ).
    READ TABLE lt_rows WITH KEY glaccount = '0000113100' INTO DATA(ls_b).
    cl_abap_unit_assert=>assert_equals(
      act = ls_b-amount
      exp = '200.00'
      msg = 'second account open 0L balance' ).
  ENDMETHOD.

ENDCLASS.
