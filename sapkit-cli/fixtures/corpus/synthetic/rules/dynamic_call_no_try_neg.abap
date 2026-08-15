REPORT zdemo_dynamic_call_neg.

DATA lv_fm_name TYPE c LENGTH 30.

CALL FUNCTION 'ZDEMO_FM'.

TRY.
    CALL FUNCTION lv_fm_name.
  CATCH cx_sy_dyn_call_illegal_func.
    WRITE 'missing'.
ENDTRY.
