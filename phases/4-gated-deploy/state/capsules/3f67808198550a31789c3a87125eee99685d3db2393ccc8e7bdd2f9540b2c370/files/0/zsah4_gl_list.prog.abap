REPORT zsah4_gl_list.

PARAMETERS p_ktopl TYPE ska1-ktopl OBLIGATORY DEFAULT 'INT'.

CLASS lcl_gl_list DEFINITION FINAL.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_account,
             saknr TYPE ska1-saknr,
             xbilk TYPE ska1-xbilk,
             txt50 TYPE skat-txt50,
           END OF ty_account.
    TYPES ty_accounts TYPE STANDARD TABLE OF ty_account WITH EMPTY KEY.
    TYPES: BEGIN OF ty_summary,
             total_count TYPE i,
             bs_count    TYPE i,
             pl_count    TYPE i,
           END OF ty_summary.
    CLASS-METHODS summarize
      IMPORTING it_accounts       TYPE ty_accounts
      RETURNING VALUE(rs_summary) TYPE ty_summary.
ENDCLASS.

CLASS lcl_gl_list IMPLEMENTATION.
  METHOD summarize.
    rs_summary-total_count = lines( it_accounts ).
    LOOP AT it_accounts INTO DATA(ls_account).
      IF ls_account-xbilk = abap_true.
        rs_summary-bs_count = rs_summary-bs_count + 1.
      ENDIF.
    ENDLOOP.
    rs_summary-pl_count = rs_summary-total_count - rs_summary-bs_count.
  ENDMETHOD.
ENDCLASS.

START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'F_SKA1_KTP'
    ID 'KTOPL' FIELD p_ktopl
    ID 'ACTVT' FIELD '03'.
  IF sy-subrc <> 0.
    WRITE / 'No authorization to display G/L accounts for this chart of accounts.'.
    RETURN.
  ENDIF.

  DATA lt_accounts TYPE lcl_gl_list=>ty_accounts.
  SELECT ska1~saknr, ska1~xbilk, skat~txt50
    FROM ska1
    LEFT OUTER JOIN skat ON skat~ktopl = ska1~ktopl
                        AND skat~saknr = ska1~saknr
                        AND skat~spras = @sy-langu
    WHERE ska1~ktopl = @p_ktopl
    INTO TABLE @lt_accounts.

  LOOP AT lt_accounts INTO DATA(ls_account).
    WRITE: / ls_account-saknr, ls_account-xbilk, ls_account-txt50.
  ENDLOOP.

  DATA(ls_summary) = lcl_gl_list=>summarize( it_accounts = lt_accounts ).
  WRITE: / 'Total accounts:', ls_summary-total_count.
  WRITE: / 'Balance sheet accounts:', ls_summary-bs_count.
  WRITE: / 'P&L accounts:', ls_summary-pl_count.

CLASS ltc_gl_list DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    METHODS mixed_accounts FOR TESTING.
    METHODS all_balance_sheet FOR TESTING.
    METHODS all_profit_and_loss FOR TESTING.
    METHODS empty_input FOR TESTING.
    METHODS ignores_text_presence FOR TESTING.
ENDCLASS.

CLASS ltc_gl_list IMPLEMENTATION.

  METHOD mixed_accounts.
    DATA(lt_accounts) = VALUE lcl_gl_list=>ty_accounts(
      ( saknr = '0000100000' xbilk = abap_true  txt50 = 'Cash' )
      ( saknr = '0000200000' xbilk = abap_false txt50 = 'Sales Revenue' )
      ( saknr = '0000300000' xbilk = abap_true  txt50 = 'Accounts Payable' ) ).
    DATA(ls_summary) = lcl_gl_list=>summarize( it_accounts = lt_accounts ).
    cl_abap_unit_assert=>assert_equals( act = ls_summary-total_count exp = 3 ).
    cl_abap_unit_assert=>assert_equals( act = ls_summary-bs_count exp = 2 ).
    cl_abap_unit_assert=>assert_equals( act = ls_summary-pl_count exp = 1 ).
  ENDMETHOD.

  METHOD all_balance_sheet.
    DATA(lt_accounts) = VALUE lcl_gl_list=>ty_accounts(
      ( saknr = '0000100000' xbilk = abap_true txt50 = 'Cash' )
      ( saknr = '0000300000' xbilk = abap_true txt50 = 'Accounts Payable' ) ).
    DATA(ls_summary) = lcl_gl_list=>summarize( it_accounts = lt_accounts ).
    cl_abap_unit_assert=>assert_equals( act = ls_summary-total_count exp = 2 ).
    cl_abap_unit_assert=>assert_equals( act = ls_summary-bs_count exp = 2 ).
    cl_abap_unit_assert=>assert_equals( act = ls_summary-pl_count exp = 0 ).
  ENDMETHOD.

  METHOD all_profit_and_loss.
    DATA(lt_accounts) = VALUE lcl_gl_list=>ty_accounts(
      ( saknr = '0000200000' xbilk = abap_false txt50 = 'Sales Revenue' )
      ( saknr = '0000400000' xbilk = abap_false txt50 = 'Material Expense' ) ).
    DATA(ls_summary) = lcl_gl_list=>summarize( it_accounts = lt_accounts ).
    cl_abap_unit_assert=>assert_equals( act = ls_summary-total_count exp = 2 ).
    cl_abap_unit_assert=>assert_equals( act = ls_summary-bs_count exp = 0 ).
    cl_abap_unit_assert=>assert_equals( act = ls_summary-pl_count exp = 2 ).
  ENDMETHOD.

  METHOD empty_input.
    DATA(lt_accounts) = VALUE lcl_gl_list=>ty_accounts( ).
    DATA(ls_summary) = lcl_gl_list=>summarize( it_accounts = lt_accounts ).
    cl_abap_unit_assert=>assert_equals( act = ls_summary-total_count exp = 0 ).
    cl_abap_unit_assert=>assert_equals( act = ls_summary-bs_count exp = 0 ).
    cl_abap_unit_assert=>assert_equals( act = ls_summary-pl_count exp = 0 ).
  ENDMETHOD.

  METHOD ignores_text_presence.
    DATA(lt_accounts) = VALUE lcl_gl_list=>ty_accounts(
      ( saknr = '0000100000' xbilk = abap_true  txt50 = '' )
      ( saknr = '0000200000' xbilk = abap_false txt50 = '' ) ).
    DATA(ls_summary) = lcl_gl_list=>summarize( it_accounts = lt_accounts ).
    cl_abap_unit_assert=>assert_equals( act = ls_summary-total_count exp = 2 ).
    cl_abap_unit_assert=>assert_equals( act = ls_summary-bs_count exp = 1 ).
    cl_abap_unit_assert=>assert_equals( act = ls_summary-pl_count exp = 1 ).
  ENDMETHOD.

ENDCLASS.
