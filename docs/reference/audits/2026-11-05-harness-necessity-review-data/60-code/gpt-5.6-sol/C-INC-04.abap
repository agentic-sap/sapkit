REPORT zsapkit_demo_prog.

DATA lt_words TYPE STANDARD TABLE OF string WITH EMPTY KEY.

START-OF-SELECTION.
  PERFORM dedup CHANGING lt_words.

FORM dedup CHANGING ct_words LIKE lt_words.
  SORT ct_words BY table_line.
  DELETE ADJACENT DUPLICATES FROM ct_words COMPARING table_line.
ENDFORM.
