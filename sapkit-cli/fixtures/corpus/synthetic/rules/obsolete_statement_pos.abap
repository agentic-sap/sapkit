REPORT zdemo_obsolete_pos.

DATA lv_a TYPE i.
DATA lv_b TYPE i.
DATA lt_items TYPE STANDARD TABLE OF i.
DATA ls_src TYPE zdemo_row.
DATA ls_dst TYPE zdemo_row.

COMPUTE lv_a = 1 + 2.
ADD 1 TO lv_a.
SUBTRACT 1 FROM lv_a.
MULTIPLY lv_a BY 2.
DIVIDE lv_a BY 2.
MOVE lv_a TO lv_b.
MOVE-CORRESPONDING ls_src TO ls_dst.
REFRESH lt_items.
