REPORT zdemo_local_names_neg.

DATA gv_outside TYPE i.

CLASS zcl_demo_names DEFINITION.
  PUBLIC SECTION.
    METHODS run.
ENDCLASS.

CLASS zcl_demo_names IMPLEMENTATION.
  METHOD run.
    DATA lv_count TYPE i.
    DATA lt_items TYPE STANDARD TABLE OF i.
    DATA lr_ref TYPE REF TO object.
    CONSTANTS lc_limit TYPE i VALUE 10.
    lv_count = lc_limit.
  ENDMETHOD.
ENDCLASS.
