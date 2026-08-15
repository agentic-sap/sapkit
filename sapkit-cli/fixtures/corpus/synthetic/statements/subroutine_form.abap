REPORT zdemo_cov_form.

DATA gv_total TYPE i.
FIELD-SYMBOLS <gv_any> TYPE any.

PERFORM add_value USING 5 CHANGING gv_total.
PERFORM show_value.

FORM add_value USING iv_value TYPE i CHANGING cv_total TYPE i.
  cv_total = cv_total + iv_value.
ENDFORM.

FORM show_value.
  ASSIGN gv_total TO <gv_any>.
  IF <gv_any> IS ASSIGNED.
    WRITE gv_total.
  ENDIF.
  UNASSIGN <gv_any>.
ENDFORM.
