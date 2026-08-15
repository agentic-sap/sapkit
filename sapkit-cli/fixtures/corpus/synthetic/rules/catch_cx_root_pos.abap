REPORT zdemo_catch_root_pos.

DATA lr_err TYPE REF TO cx_root.

TRY.
    WRITE 'work'.
  CATCH cx_root INTO lr_err.
    WRITE 'caught'.
ENDTRY.

TRY.
    WRITE 'work'.
  CATCH cx_static_check.
    WRITE 'caught'.
  CATCH cx_no_check.
    WRITE 'caught'.
ENDTRY.
