REPORT zdemo_cov_lexical.

* A full-line comment in column one.
DATA: gv_a TYPE i,
      gv_b TYPE i,
      gv_text TYPE string.

gv_a = 1. " a trailing comment after code
gv_b = 2 ##NEEDED.

gv_text = |value is { gv_a } and { gv_b }|.
gv_text = `a ping string literal`.
gv_text = 'a quoted literal'.

DATA(gv_inline) = gv_a + gv_b.

WRITE: / gv_a, / gv_b, / gv_text.
