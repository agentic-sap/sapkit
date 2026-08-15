REPORT zdemo_local_names_pos.

CLASS zcl_demo_names DEFINITION.
  PUBLIC SECTION.
    METHODS run.
ENDCLASS.

CLASS zcl_demo_names IMPLEMENTATION.
  METHOD run.
    DATA lo_helper TYPE REF TO object.
    DATA counter TYPE i.
    CONSTANTS gc_limit TYPE i VALUE 10.
    FIELD-SYMBOLS <lv_row> TYPE i.
    counter = gc_limit.
  ENDMETHOD.
ENDCLASS.
