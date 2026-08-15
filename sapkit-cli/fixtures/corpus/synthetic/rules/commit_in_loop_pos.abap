REPORT zdemo_commit_loop_pos.

DATA lt_rows TYPE STANDARD TABLE OF zdemo_tab.
DATA ls_row TYPE zdemo_tab.
DATA lv_i TYPE i.

LOOP AT lt_rows INTO ls_row.
  MODIFY zdemo_tab FROM ls_row.
  COMMIT WORK.
ENDLOOP.

DO 3 TIMES.
  COMMIT WORK AND WAIT.
ENDDO.

WHILE lv_i < 3.
  lv_i = lv_i + 1.
  COMMIT WORK.
ENDWHILE.
