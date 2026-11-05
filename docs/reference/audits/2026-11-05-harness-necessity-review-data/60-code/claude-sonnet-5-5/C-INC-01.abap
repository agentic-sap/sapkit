*&---------------------------------------------------------------------*
*& Report zsapkit_demo_clas_main
*&---------------------------------------------------------------------*
REPORT zsapkit_demo_clas_main.

TYPES: BEGIN OF ty_slot,
         slot_id     TYPE i,
         reject_date TYPE d,
       END OF ty_slot.

CLASS zsapkit_demo_clas DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS is_open
      IMPORTING is_slot        TYPE ty_slot
      RETURNING VALUE(rv_open) TYPE abap_bool.
ENDCLASS.

CLASS zsapkit_demo_clas IMPLEMENTATION.
  METHOD is_open.
    " Open when reject_date is initial ('00000000') or blank ('        ').
    " Note: a DATS field holding spaces is not "initial" for type d,
    " so check both explicitly.
    IF is_slot-reject_date IS INITIAL
       OR is_slot-reject_date = '00000000'
       OR is_slot-reject_date CO ' '.
      rv_open = abap_true.
    ELSE.
      rv_open = abap_false.
    ENDIF.
  ENDMETHOD.
ENDCLASS.

START-OF-SELECTION.
  DATA(lo_demo) = NEW zsapkit_demo_clas( ).

  DATA ls_slot TYPE ty_slot.

  " Case 1: initial value
  CLEAR ls_slot.
  WRITE: / 'Initial   :', lo_demo->is_open( ls_slot ).

  " Case 2: blank value
  ls_slot-reject_date = '        '.
  WRITE: / 'Blank     :', lo_demo->is_open( ls_slot ).

  " Case 3: rejected date
  ls_slot-reject_date = sy-datum.
  WRITE: / 'Rejected  :', lo_demo->is_open( ls_slot ).
