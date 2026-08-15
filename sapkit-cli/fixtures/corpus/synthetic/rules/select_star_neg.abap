REPORT zdemo_select_star_neg.

DATA lt_rows TYPE STANDARD TABLE OF zdemo_tab.
DATA lv_id TYPE c LENGTH 10.
DATA lv_key TYPE c LENGTH 10.
DATA lv_count TYPE i.

SELECT id name FROM zdemo_tab INTO CORRESPONDING FIELDS OF TABLE lt_rows.
SELECT SINGLE id FROM zdemo_tab INTO lv_id WHERE id = lv_key.
SELECT COUNT( * ) FROM zdemo_tab INTO lv_count.
