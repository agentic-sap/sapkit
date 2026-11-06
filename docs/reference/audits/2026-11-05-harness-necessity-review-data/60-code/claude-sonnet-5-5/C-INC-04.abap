*&---------------------------------------------------------------------*
*& Report ZSAPKIT_DEMO_PROG
*&---------------------------------------------------------------------*
REPORT zsapkit_demo_prog.

TYPES ty_words TYPE STANDARD TABLE OF string WITH EMPTY KEY.

START-OF-SELECTION.
  DATA lt_words TYPE ty_words.

  lt_words = VALUE #( ( `banana` ) ( `apple` ) ( `cherry` )
                      ( `apple` ) ( `banana` ) ( `date` ) ).

  WRITE / 'Before:'.
  LOOP AT lt_words INTO DATA(lv_before).
    WRITE / lv_before.
  ENDLOOP.

  PERFORM dedup CHANGING lt_words.

  SKIP.
  WRITE / 'After:'.
  LOOP AT lt_words INTO DATA(lv_after).
    WRITE / lv_after.
  ENDLOOP.

*&---------------------------------------------------------------------*
*& Form dedup
*&---------------------------------------------------------------------*
*& Sorts the table ascending and removes duplicate entries.
*&---------------------------------------------------------------------*
FORM dedup CHANGING ct_words TYPE ty_words.
  SORT ct_words BY table_line ASCENDING.
  DELETE ADJACENT DUPLICATES FROM ct_words COMPARING table_line.
ENDFORM.
