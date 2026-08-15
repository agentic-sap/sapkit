REPORT zdemo_catch_root_neg.

DATA lr_err TYPE REF TO cx_sy_zerodivide.

TRY.
    WRITE 'work'.
  CATCH cx_sy_zerodivide INTO lr_err.
    WRITE 'caught'.
  CATCH cx_sy_conversion_no_number.
    WRITE 'caught'.
ENDTRY.
