REPORT zdemo_cov_sql.

DATA gt_rows TYPE STANDARD TABLE OF zdemo_tab.
DATA gs_row TYPE zdemo_tab.

SELECT id name FROM zdemo_tab INTO CORRESPONDING FIELDS OF TABLE gt_rows.
SORT gt_rows BY id.
READ TABLE gt_rows INTO gs_row INDEX 1.
APPEND gs_row TO gt_rows.
INSERT gs_row INTO TABLE gt_rows.
DELETE gt_rows INDEX 1.

LOOP AT gt_rows INTO gs_row.
  WRITE / gs_row-id.
ENDLOOP.

LOOP AT gt_rows ASSIGNING FIELD-SYMBOL(<gs_line>).
  WRITE / <gs_line>-id.
ENDLOOP.

COMMIT WORK.
REFRESH gt_rows.
