*&---------------------------------------------------------------------*
*& Include ZSAPKIT_OOP_EXTST
*&---------------------------------------------------------------------*
*& What    : FOR TESTING classes. One test class covering LCL_DATA -
*&           the skeleton a real program grows its unit tests in.
*& How     : SETUP builds a fresh LCL_DATA per test method, so the two
*&           methods below cannot influence one another and no TEARDOWN
*&           is needed. Each method names its given-when-then and
*&           asserts once.
*& Caution : Only what runs without a database belongs here. GET_DATA
*&           reads EKKO and EKPO, so it is not covered - the part worth
*&           asserting was pulled out into BUILD_HEADER, which is pure.
*&           A test that needs GET_DATA needs a test double first.
*&---------------------------------------------------------------------*

CLASS lcl_test_data DEFINITION FINAL FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    DATA cut TYPE REF TO lcl_data.

    METHODS setup.

    METHODS constructor_fills_mode_texts FOR TESTING.

    METHODS build_header_maps_every_item FOR TESTING.

ENDCLASS.


CLASS lcl_test_data IMPLEMENTATION.

  METHOD setup.
    cut = NEW #( ).
  ENDMETHOD.

  METHOD constructor_fills_mode_texts.
    cl_abap_unit_assert=>assert_not_initial(
        act = gv_tgrid
        msg = 'CONSTRUCTOR leaves the grid comment text empty' ).

    cl_abap_unit_assert=>assert_not_initial(
        act = gv_ttree
        msg = 'CONSTRUCTOR leaves the tree comment text empty' ).
  ENDMETHOD.

  METHOD build_header_maps_every_item.
    DATA(lt_item) = VALUE ty_items(
        bsart = 'NB'
        ( ebeln = '4500000001' ebelp = '00010' )
        ( ebeln = '4500000001' ebelp = '00020' )
        ( ebeln = '4500000002' ebelp = '00010' ) ).

    DATA(lt_header) = cut->build_header( lt_item ).

    cl_abap_unit_assert=>assert_equals(
        act = lines( lt_header )
        exp = 3
        msg = 'BUILD_HEADER returns one header row per item row' ).
  ENDMETHOD.

ENDCLASS.
