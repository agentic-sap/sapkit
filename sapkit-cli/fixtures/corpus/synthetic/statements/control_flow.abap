REPORT zdemo_cov_control.

DATA gv_i TYPE i.
DATA gv_state TYPE c LENGTH 1.

IF gv_i > 0.
  WRITE 'positive'.
ELSEIF gv_i < 0.
  WRITE 'negative'.
ELSE.
  WRITE 'zero'.
ENDIF.

CASE gv_state.
  WHEN 'A'.
    WRITE 'a'.
  WHEN 'B'.
    WRITE 'b'.
  WHEN OTHERS.
    WRITE 'other'.
ENDCASE.

DO 3 TIMES.
  gv_i = gv_i + 1.
  IF gv_i = 2.
    CONTINUE.
  ENDIF.
  IF gv_i = 3.
    EXIT.
  ENDIF.
ENDDO.

WHILE gv_i > 0.
  gv_i = gv_i - 1.
ENDWHILE.

TRY.
    RAISE EXCEPTION TYPE cx_sy_zerodivide.
  CATCH cx_sy_zerodivide.
    WRITE 'caught'.
ENDTRY.
