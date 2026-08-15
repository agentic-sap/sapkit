REPORT zdemo_dynamic_call_pos.

DATA lv_fm_name TYPE c LENGTH 30.
DATA lv_class_name TYPE c LENGTH 30.

CALL FUNCTION lv_fm_name.
CALL METHOD (lv_class_name)=>run.
