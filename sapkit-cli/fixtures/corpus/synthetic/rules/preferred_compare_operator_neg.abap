REPORT zdemo_prefer_compare_neg.

DATA lv_a TYPE i.
DATA lv_b TYPE i.

IF lv_a = 1.
  WRITE 'one'.
ELSEIF lv_a <> 2.
  WRITE 'not two'.
ENDIF.

WHILE lv_b < 10.
  lv_b = lv_b + 1.
ENDWHILE.

* CHECK is named in the rule's conditional set, but no matcher ever yields
* the Check statement type, so the EQ below stays out of scope.
CHECK lv_a EQ 1.
