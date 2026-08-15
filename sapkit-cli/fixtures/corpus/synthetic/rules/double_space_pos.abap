REPORT zdemo_double_space_pos.

DATA lv_a TYPE i.
DATA lv_b TYPE i.

lv_a  = 1.
lv_b =  2.

IF lv_a  = lv_b.
  WRITE 'same'.
ENDIF.
