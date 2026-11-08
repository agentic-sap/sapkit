*&---------------------------------------------------------------------*
*& zcl_judge_c02_discount.abap
*& Discounted net amount calculation with local exception and unit tests
*&---------------------------------------------------------------------*

*----------------------------------------------------------------------*
* Local exception class (static check - caller must handle or declare)
*----------------------------------------------------------------------*
CLASS lcx_discount_input DEFINITION
  INHERITING FROM cx_static_check
  CREATE PUBLIC.

  PUBLIC SECTION.
    CONSTANTS:
      BEGIN OF gc_reason,
        negative_gross TYPE i VALUE 1,
        bad_percentage TYPE i VALUE 2,
      END OF gc_reason.

    DATA mv_reason TYPE i READ-ONLY.

    METHODS constructor
      IMPORTING
        iv_reason   TYPE i
        iv_previous TYPE REF TO cx_root OPTIONAL.
ENDCLASS.

CLASS lcx_discount_input IMPLEMENTATION.
  METHOD constructor.
    super->constructor( previous = iv_previous ).
    mv_reason = iv_reason.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Global class
*----------------------------------------------------------------------*
CLASS zcl_judge_c02_discount DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES ty_amount     TYPE p LENGTH 15 DECIMALS 2.
    TYPES ty_percentage TYPE p LENGTH 5 DECIMALS 2.

    CLASS-METHODS calculate
      IMPORTING
        iv_gross      TYPE ty_amount
        iv_percentage TYPE ty_percentage
      RETURNING
        VALUE(rv_net) TYPE ty_amount
      RAISING
        lcx_discount_input.

  PRIVATE SECTION.
    CONSTANTS:
      gc_zero    TYPE i VALUE 0,
      gc_hundred TYPE i VALUE 100,
      gc_decimals TYPE i VALUE 2.
ENDCLASS.

CLASS zcl_judge_c02_discount IMPLEMENTATION.
  METHOD calculate.
    DATA lv_factor TYPE decfloat34.

    IF iv_gross < gc_zero.
      RAISE EXCEPTION TYPE lcx_discount_input
        EXPORTING iv_reason = lcx_discount_input=>gc_reason-negative_gross.
    ENDIF.

    IF iv_percentage < gc_zero OR iv_percentage > gc_hundred.
      RAISE EXCEPTION TYPE lcx_discount_input
        EXPORTING iv_reason = lcx_discount_input=>gc_reason-bad_percentage.
    ENDIF.

    lv_factor = ( gc_hundred - iv_percentage ) / gc_hundred.
    rv_net = round( val = iv_gross * lv_factor
                    dec = gc_decimals
                    mode = cl_abap_math=>round_half_up ).
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Local test class
*----------------------------------------------------------------------*
CLASS ltc_discount DEFINITION FINAL
  FOR TESTING
  RISK LEVEL HARMLESS
  DURATION SHORT.

  PRIVATE SECTION.
    METHODS normal_discount     FOR TESTING RAISING cx_static_check.
    METHODS full_discount       FOR TESTING RAISING cx_static_check.
    METHODS zero_discount       FOR TESTING RAISING cx_static_check.
    METHODS rounding_to_cents   FOR TESTING RAISING cx_static_check.
    METHODS negative_gross      FOR TESTING.
    METHODS percentage_too_high FOR TESTING.
    METHODS percentage_negative FOR TESTING.
ENDCLASS.

CLASS ltc_discount IMPLEMENTATION.
  METHOD normal_discount.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_judge_c02_discount=>calculate( iv_gross = '200.00' iv_percentage = '10.00' )
      exp = CONV zcl_judge_c02_discount=>ty_amount( '180.00' )
      msg = 'A 10 % discount on 200.00 must give 180.00' ).
  ENDMETHOD.

  METHOD full_discount.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_judge_c02_discount=>calculate( iv_gross = '99.99' iv_percentage = '100.00' )
      exp = CONV zcl_judge_c02_discount=>ty_amount( '0.00' )
      msg = 'A 100 % discount must give 0.00' ).
  ENDMETHOD.

  METHOD zero_discount.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_judge_c02_discount=>calculate( iv_gross = '50.25' iv_percentage = '0.00' )
      exp = CONV zcl_judge_c02_discount=>ty_amount( '50.25' )
      msg = 'A 0 % discount must leave the gross amount unchanged' ).
  ENDMETHOD.

  METHOD rounding_to_cents.
    " 19.99 * 0.85 = 16.9915 -> 16.99
    cl_abap_unit_assert=>assert_equals(
      act = zcl_judge_c02_discount=>calculate( iv_gross = '19.99' iv_percentage = '15.00' )
      exp = CONV zcl_judge_c02_discount=>ty_amount( '16.99' )
      msg = 'Result must be rounded to 2 decimals' ).
  ENDMETHOD.

  METHOD negative_gross.
    TRY.
        zcl_judge_c02_discount=>calculate( iv_gross = '-1.00' iv_percentage = '10.00' ).
        cl_abap_unit_assert=>fail( msg = 'Negative gross amount must be rejected' ).
      CATCH lcx_discount_input INTO DATA(lx_input).
        cl_abap_unit_assert=>assert_equals(
          act = lx_input->mv_reason
          exp = lcx_discount_input=>gc_reason-negative_gross ).
    ENDTRY.
  ENDMETHOD.

  METHOD percentage_too_high.
    TRY.
        zcl_judge_c02_discount=>calculate( iv_gross = '100.00' iv_percentage = '100.01' ).
        cl_abap_unit_assert=>fail( msg = 'Percentage above 100 must be rejected' ).
      CATCH lcx_discount_input INTO DATA(lx_input).
        cl_abap_unit_assert=>assert_equals(
          act = lx_input->mv_reason
          exp = lcx_discount_input=>gc_reason-bad_percentage ).
    ENDTRY.
  ENDMETHOD.

  METHOD percentage_negative.
    TRY.
        zcl_judge_c02_discount=>calculate( iv_gross = '100.00' iv_percentage = '-0.01' ).
        cl_abap_unit_assert=>fail( msg = 'Negative percentage must be rejected' ).
      CATCH lcx_discount_input INTO DATA(lx_input).
        cl_abap_unit_assert=>assert_equals(
          act = lx_input->mv_reason
          exp = lcx_discount_input=>gc_reason-bad_percentage ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
