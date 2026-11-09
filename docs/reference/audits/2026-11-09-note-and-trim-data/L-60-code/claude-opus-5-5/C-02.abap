"! Computes the net amount after applying a percentage discount to a gross amount.
"! Assumes ABAP_RELEASE >= 7.52 and the global exception class ZCX_JUDGE_C02_DISCOUNT
"! (inheriting from CX_STATIC_CHECK). A public method of a global class cannot declare
"! a local exception class in its RAISING clause, so the global class is referenced.
CLASS zcl_judge_c02_discount DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES ty_amount     TYPE p LENGTH 15 DECIMALS 2.
    TYPES ty_percentage TYPE p LENGTH 5 DECIMALS 2.

    "! Returns the gross amount reduced by the discount percentage, rounded to 2 decimals.
    "! @parameter gross_amount        | Gross amount, must not be negative
    "! @parameter discount_percentage | Discount percentage, 0 to 100 inclusive
    "! @parameter result              | Net amount
    "! @raising   zcx_judge_c02_discount | Gross amount negative or percentage out of range
    METHODS calculate
      IMPORTING gross_amount        TYPE ty_amount
                discount_percentage TYPE ty_percentage
      RETURNING VALUE(result)       TYPE ty_amount
      RAISING   zcx_judge_c02_discount.

  PRIVATE SECTION.
    CONSTANTS minimum_percentage TYPE ty_percentage VALUE 0.
    CONSTANTS maximum_percentage TYPE ty_percentage VALUE 100.
    CONSTANTS minimum_amount     TYPE ty_amount VALUE 0.

    METHODS validate_input
      IMPORTING gross_amount        TYPE ty_amount
                discount_percentage TYPE ty_percentage
      RAISING   zcx_judge_c02_discount.
ENDCLASS.


CLASS zcl_judge_c02_discount IMPLEMENTATION.

  METHOD calculate.
    validate_input( gross_amount        = gross_amount
                    discount_percentage = discount_percentage ).

    " Net never exceeds gross, so the result fits the gross amount type.
    " Packed arithmetic keeps full intermediate precision and rounds commercially on assignment.
    result = gross_amount - gross_amount * discount_percentage / maximum_percentage.
  ENDMETHOD.


  METHOD validate_input.
    IF gross_amount < minimum_amount.
      RAISE EXCEPTION NEW zcx_judge_c02_discount( ).
    ENDIF.

    IF discount_percentage < minimum_percentage OR discount_percentage > maximum_percentage.
      RAISE EXCEPTION NEW zcx_judge_c02_discount( ).
    ENDIF.
  ENDMETHOD.

ENDCLASS.


CLASS ltc_discount DEFINITION FINAL
  FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    DATA calculator TYPE REF TO zcl_judge_c02_discount.

    METHODS setup.
    METHODS given_ten_pct_then_net_reduced FOR TESTING RAISING cx_static_check.
    METHODS given_full_pct_then_net_zero   FOR TESTING RAISING cx_static_check.
    METHODS given_fraction_then_rounded    FOR TESTING RAISING cx_static_check.
    METHODS given_negative_gross_then_fail FOR TESTING.
    METHODS given_pct_over_max_then_fail   FOR TESTING.
ENDCLASS.


CLASS ltc_discount IMPLEMENTATION.

  METHOD setup.
    calculator = NEW #( ).
  ENDMETHOD.


  METHOD given_ten_pct_then_net_reduced.
    DATA(net_amount) = calculator->calculate( gross_amount        = '200.00'
                                              discount_percentage = '10.00' ).

    cl_abap_unit_assert=>assert_equals( act = net_amount
                                        exp = CONV zcl_judge_c02_discount=>ty_amount( '180.00' ) ).
  ENDMETHOD.


  METHOD given_full_pct_then_net_zero.
    DATA(net_amount) = calculator->calculate( gross_amount        = '149.99'
                                              discount_percentage = '100.00' ).

    cl_abap_unit_assert=>assert_equals( act = net_amount
                                        exp = CONV zcl_judge_c02_discount=>ty_amount( '0.00' ) ).
  ENDMETHOD.


  METHOD given_fraction_then_rounded.
    " 10.01 * 12.5 % = 1.25125 discount, net 8.75875 rounds to 8.76
    DATA(net_amount) = calculator->calculate( gross_amount        = '10.01'
                                              discount_percentage = '12.50' ).

    cl_abap_unit_assert=>assert_equals( act = net_amount
                                        exp = CONV zcl_judge_c02_discount=>ty_amount( '8.76' ) ).
  ENDMETHOD.


  METHOD given_negative_gross_then_fail.
    TRY.
        calculator->calculate( gross_amount        = '-1.00'
                               discount_percentage = '10.00' ).
        cl_abap_unit_assert=>fail( msg = 'Negative gross amount was accepted' ).
      CATCH zcx_judge_c02_discount INTO DATA(rejection).
        cl_abap_unit_assert=>assert_bound( act = rejection ).
    ENDTRY.
  ENDMETHOD.


  METHOD given_pct_over_max_then_fail.
    TRY.
        calculator->calculate( gross_amount        = '100.00'
                               discount_percentage = '100.01' ).
        cl_abap_unit_assert=>fail( msg = 'Percentage above 100 was accepted' ).
      CATCH zcx_judge_c02_discount INTO DATA(rejection).
        cl_abap_unit_assert=>assert_bound( act = rejection ).
    ENDTRY.
  ENDMETHOD.

ENDCLASS.
