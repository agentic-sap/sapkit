CLASS zcl_demo_amdp DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_amdp_marker_hdb.
    CLASS-METHODS get_rows
      EXPORTING VALUE(et_rows) TYPE zdemo_tab_tt.
ENDCLASS.

CLASS zcl_demo_amdp IMPLEMENTATION.
  METHOD get_rows BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT.
    et_rows = SELECT id, name FROM zdemo_tab;
  ENDMETHOD.
ENDCLASS.
