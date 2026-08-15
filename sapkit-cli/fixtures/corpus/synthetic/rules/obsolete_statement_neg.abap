REPORT zdemo_obsolete_neg.

DATA lv_a TYPE i.
DATA lv_b TYPE i.
DATA lt_items TYPE STANDARD TABLE OF i.

lv_a = 1 + 2.
lv_a = lv_a + 1.
lv_a = lv_a - 1.
lv_a = lv_a * 2.
lv_a = lv_a / 2.
lv_b = lv_a.
CLEAR lt_items.
