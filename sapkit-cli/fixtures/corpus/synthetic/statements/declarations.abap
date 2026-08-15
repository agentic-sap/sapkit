REPORT zdemo_cov_decl.

TYPES: BEGIN OF ty_demo_row,
         id TYPE i,
         name TYPE string,
       END OF ty_demo_row.

TYPES ty_demo_tab TYPE STANDARD TABLE OF ty_demo_row WITH EMPTY KEY.

CONSTANTS gc_limit TYPE i VALUE 10.

DATA gs_row TYPE ty_demo_row.
DATA gt_rows TYPE ty_demo_tab.
DATA gt_textpool TYPE STANDARD TABLE OF textpool.

FIELD-SYMBOLS <gs_row> TYPE ty_demo_row.

PARAMETERS p_demo TYPE c LENGTH 1.
SELECT-OPTIONS s_demo FOR gs_row-id.
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
SELECTION-SCREEN END OF BLOCK b1.

INCLUDE zdemo_cov_incl IF FOUND.

START-OF-SELECTION.
  READ TEXTPOOL 'ZDEMO_COV_DECL' INTO gt_textpool LANGUAGE 'E'.
  INSERT TEXTPOOL 'ZDEMO_COV_DECL' FROM gt_textpool LANGUAGE 'E'.
  WRITE gc_limit.
