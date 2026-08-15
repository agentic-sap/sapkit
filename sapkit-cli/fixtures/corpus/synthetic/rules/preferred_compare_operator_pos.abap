REPORT zdemo_prefer_compare_pos.

DATA lv_a TYPE i.
DATA lv_b TYPE i.

IF lv_a EQ 1.
  WRITE 'one'.
ELSEIF lv_a NE 2.
  WRITE 'not two'.
ENDIF.

WHILE lv_b LT 10.
  lv_b = lv_b + 1.
ENDWHILE.

IF lv_a GE 1 AND lv_b LE 9.
  WRITE 'in range'.
ENDIF.

IF lv_a GT 0 AND lv_a >< 5.
  WRITE 'mixed'.
ENDIF.
