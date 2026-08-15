REPORT zdemo_commit_loop_neg.

DATA lt_rows TYPE STANDARD TABLE OF zdemo_tab.
DATA ls_row TYPE zdemo_tab.

LOOP AT lt_rows INTO ls_row.
  MODIFY zdemo_tab FROM ls_row.
ENDLOOP.

COMMIT WORK.
