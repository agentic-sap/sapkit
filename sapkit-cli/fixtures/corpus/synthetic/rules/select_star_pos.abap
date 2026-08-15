REPORT zdemo_select_star_pos.

DATA lt_rows TYPE STANDARD TABLE OF zdemo_tab.
DATA ls_row TYPE zdemo_tab.
DATA lv_key TYPE c LENGTH 10.

SELECT * FROM zdemo_tab INTO TABLE lt_rows.
SELECT SINGLE * FROM zdemo_tab INTO ls_row WHERE id = lv_key.
