REPORT zdemo_colon_neg.

DATA: lv_a TYPE i,
      lv_msg TYPE string.

* A colon inside a string literal is skipped by the rule.
lv_msg = 'window 10:30 to 11:45'.

WRITE: / lv_a.
