REPORT zdemo_line_length_neg.

DATA lv_text TYPE string.

* The next line is exactly 120 bytes - the boundary, not over it.
lv_text = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'.

lv_text = 'short'.
