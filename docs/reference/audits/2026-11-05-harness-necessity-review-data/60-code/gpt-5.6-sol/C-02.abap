CLASS lcx_invalid_discount_input DEFINITION
  INHERITING FROM cx_static_check
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    DATA reason TYPE string READ-ONLY.

    METHODS constructor
      IMPORTING
        iv_reason TYPE string.
ENDCLASS.


CLASS lcx_invalid_discount_input IMPLEMENTATION.
  METHOD constructor.
    super->constructor( ).
    reason = iv_reason.
  ENDMETHOD.
ENDCLASS.


CLASS zcl_judge_c02_discount DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES ty_amount
      TYPE p LENGTH 16 DECIMALS 2.

    TYPES ty_percentage
      TYPE p LENGTH 5 DECIMALS 2.

    METHODS calculate
      IMPORTING
        iv_gross      TYPE ty_amount
        iv_percentage TYPE ty_percentage
      RETURNING
        VALUE(rv_net) TYPE ty_amount
      RAISING
        lcx_invalid_discount_input.
ENDCLASS.


CLASS zcl_judge_c02_discount IMPLEMENTATION.
  METHOD calculate.
    IF iv_gross < 0.
      RAISE EXCEPTION TYPE lcx_invalid_discount_input
        EXPORTING
          iv_reason = 'Gross amount must not be negative'.
    ENDIF.

    IF iv_percentage < 0 OR iv_percentage > 100.
      RAISE EXCEPTION TYPE lcx_invalid_discount_input
        EXPORTING
          iv_reason = 'Discount percentage must be between 0 and 100'.
    ENDIF.

    DATA(lv_gross) = CONV decfloat34( iv_gross ).
    DATA(lv_percentage) = CONV decfloat34( iv_percentage ).

    DATA(lv_net) =
      lv_gross * ( CONV decfloat34( 100 ) - lv_percentage )
               / CONV decfloat34( 100 ).

    rv_net = round(
      val  = lv_net
      dec  = 2
      mode = cl_abap_math=>round_half_up ).
  ENDMETHOD.
ENDCLASS.


CLASS ltc_judge_c02_discount DEFINITION
  FINAL
  FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    DATA cut TYPE REF TO zcl_judge_c02_discount.

    METHODS setup.
    METHODS normal_discount FOR TESTING.
    METHODS full_discount FOR TESTING.
    METHODS rejected_input FOR TESTING.
ENDCLASS.


CLASS ltc_judge_c02_discount IMPLEMENTATION.
  METHOD setup.
    cut = NEW #( ).
  ENDMETHOD.

  METHOD normal_discount.
    DATA(lv_actual) = cut->calculate(
      iv_gross      = '100.00'
      iv_percentage = '15.00' ).

    cl_abap_unit_assert=>assert_equals(
      act = lv_actual
      exp = CONV zcl_judge_c02_discount=>ty_amount( '85.00' ) ).
  ENDMETHOD.

  METHOD full_discount.
    DATA(lv_actual) = cut->calculate(
      iv_gross      = '249.99'
      iv_percentage = '100.00' ).

    cl_abap_unit_assert=>assert_equals(
      act = lv_actual
      exp = CONV zcl_judge_c02_discount=>ty_amount( '0.00' ) ).
  ENDMETHOD.

  METHOD rejected_input.
    TRY.
        DATA(lv_actual) = cut->calculate(
          iv_gross      = '-1.00'
          iv_percentage = '10.00' ).

        cl_abap_unit_assert=>fail(
          msg = |Expected exception, received { lv_actual }| ).

      CATCH lcx_invalid_discount_input INTO DATA(lx_invalid).
        cl_abap_unit_assert=>assert_bound(
          act = lx_invalid ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
