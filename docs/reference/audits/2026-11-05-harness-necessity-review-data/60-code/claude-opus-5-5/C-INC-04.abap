REPORT zsapkit_demo_prog.

TYPES tt_words TYPE STANDARD TABLE OF string WITH EMPTY KEY.

DATA lt_words TYPE tt_words.

START-OF-SELECTION.
  lt_words = VALUE #( ( `banana` ) ( `apple` ) ( `cherry` ) ( `apple` )
                      ( `banana` ) ( `date` ) ( `cherry` ) ).

  PERFORM dedup CHANGING lt_words.

  LOOP AT lt_words INTO DATA(lv_word).
    WRITE: / lv_word.
  ENDLOOP.

*&---------------------------------------------------------------------*
*& Form DEDUP
*&---------------------------------------------------------------------*
*& Sorts the word table and removes duplicate entries.
*& With EMPTY KEY, SORT and DELETE ADJACENT DUPLICATES must specify
*& the comparison explicitly via TABLE_LINE.
*&---------------------------------------------------------------------*
FORM dedup CHANGING ct_words TYPE tt_words.
  SORT ct_words BY table_line ASCENDING.
  DELETE ADJACENT DUPLICATES FROM ct_words COMPARING table_line.
ENDFORM.
