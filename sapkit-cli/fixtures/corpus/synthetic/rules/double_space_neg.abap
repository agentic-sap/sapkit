REPORT zdemo_double_space_neg.

DATA lv_a TYPE i.
DATA lv_b TYPE i.

*  A full-line comment may hold double  spaces - the rule skips it.
"  A quote-comment line is skipped as well.
lv_a = 1.
lv_b = 2. " a trailing  comment sits outside the code part
  lv_a = lv_b.
