"! Raised when CALCULATE receives an invalid gross amount or discount percentage.
"! NOTE: a global class's PUBLIC section cannot reference a CCDEF-local type. When this file is
"! split into a class pool, move this class to a global ZCX_JUDGE_C02_INVALID_INPUT and keep the same body.
CLASS lcx_judge_c02_invalid_input DEFINITION INHERITING FROM cx_static_check FINAL.
  PUBLIC SECTION.
    DATA mv_reason TYPE string READ-ONLY.
    METHODS constructor
      IMPORTING iv_reason TYPE string
                previous  LIKE previous OPTIONAL.
    METHODS get_text REDEFINITION.
ENDCLASS.

CLASS lcx_judge_c02_invalid_input IMPLEMENTATION.
  METHOD constructor ##ADT_SUPPRESS_GENERATION.
    super->constructor( previous = previous ).
    mv_reason = iv_reason.
  ENDMETHOD.

  METHOD get_text.
    result = mv_reason.
  ENDMETHOD.
ENDCLASS.

"! Computes a discounted net amount from a gross amount and a discount percentage.
CLASS zcl_judge_c02_discount DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES ty_amount  TYPE p LENGTH 15 DECIMALS 2.
    TYPES ty_percent TYPE p LENGTH 5 DECIMALS 2.

    "! @parameter iv_gross   | Gross amount, must not be negative
    "! @parameter iv_percent | Discount percentage, 0 to 100 inclusive
    "! @parameter rv_net     | Net amount, commercially rounded to 2 decimals
    "! @raising lcx_judge_c02_invalid_input | Gross negative or percentage out of range
    METHODS calculate
      IMPORTING iv_gross      TYPE ty_amount
                iv_percent    TYPE ty_percent
      RETURNING VALUE(rv_net) TYPE ty_amount
      RAISING   lcx_judge_c02_invalid_input.

  PRIVATE SECTION.
    CONSTANTS gc_percent_min TYPE ty_percent VALUE '0.00'.
    CONSTANTS gc_percent_max TYPE ty_percent VALUE '100.00'.

    METHODS validate
      IMPORTING iv_gross   TYPE ty_amount
                iv_percent TYPE ty_percent
      RAISING   lcx_judge_c02_invalid_input.
ENDCLASS.

CLASS zcl_judge_c02_discount IMPLEMENTATION.
  METHOD calculate.
    validate( iv_gross   = iv_gross
              iv_percent = iv_percent ).

    " Compute in DECFLOAT34 so only the final result is rounded
    DATA(lv_net) = CONV decfloat34( iv_gross ) * ( gc_percent_max - iv_percent ) / gc_percent_max.
    rv_net = round( val  = lv_net
                    dec  = 2
                    mode = cl_abap_math=>round_half_up ).
  ENDMETHOD.

  METHOD validate.
    IF iv_gross < 0.
      RAISE EXCEPTION NEW lcx_judge_c02_invalid_input( iv_reason = |Gross amount { iv_gross } is negative| ).
    ENDIF.
    IF iv_percent < gc_percent_min OR iv_percent > gc_percent_max.
      RAISE EXCEPTION NEW lcx_judge_c02_invalid_input(
        iv_reason = |Discount percentage { iv_percent } is outside 0-100| ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.

CLASS ltc_discount DEFINITION FINAL FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    DATA cut TYPE REF TO zcl_judge_c02_discount.

    METHODS setup.
    METHODS normal_discount_reduces_gross FOR TESTING RAISING cx_static_check.
    METHODS result_rounded_to_2_decimals  FOR TESTING RAISING cx_static_check.
    METHODS full_discount_returns_zero    FOR TESTING RAISING cx_static_check.
    METHODS negative_gross_is_rejected    FOR TESTING.
    METHODS percent_over_100_is_rejected  FOR TESTING.
ENDCLASS.

CLASS ltc_discount IMPLEMENTATION.
  METHOD setup.
    cut = NEW #( ).
  ENDMETHOD.

  METHOD normal_discount_reduces_gross.
    DATA(lv_net) = cut->calculate( iv_gross = '200.00' iv_percent = '15.00' ).
    cl_abap_unit_assert=>assert_equals( act = lv_net exp = CONV zcl_judge_c02_discount=>ty_amount( '170.00' ) ).
  ENDMETHOD.

  METHOD result_rounded_to_2_decimals.
    " 10.01 * 66.67 % = 6.673667 -> 6.67
    DATA(lv_net) = cut->calculate( iv_gross = '10.01' iv_percent = '33.33' ).
    cl_abap_unit_assert=>assert_equals( act = lv_net exp = CONV zcl_judge_c02_discount=>ty_amount( '6.67' ) ).
  ENDMETHOD.

  METHOD full_discount_returns_zero.
    DATA(lv_net) = cut->calculate( iv_gross = '999.99' iv_percent = '100.00' ).
    cl_abap_unit_assert=>assert_equals( act = lv_net exp = CONV zcl_judge_c02_discount=>ty_amount( '0.00' ) ).
  ENDMETHOD.

  METHOD negative_gross_is_rejected.
    TRY.
        cut->calculate( iv_gross = '-1.00' iv_percent = '10.00' ).
        cl_abap_unit_assert=>fail( msg = 'Negative gross amount was not rejected' ).
      CATCH lcx_judge_c02_invalid_input INTO DATA(lx_error).
        cl_abap_unit_assert=>assert_not_initial( lx_error->get_text( ) ).
    ENDTRY.
  ENDMETHOD.

  METHOD percent_over_100_is_rejected.
    TRY.
        cut->calculate( iv_gross = '100.00' iv_percent = '100.01' ).
        cl_abap_unit_assert=>fail( msg = 'Percentage above 100 was not rejected' ).
      CATCH lcx_judge_c02_invalid_input ##NO_HANDLER.
        " Expected: invalid percentage must raise the exception
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
