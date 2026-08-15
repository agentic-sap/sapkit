REPORT zmain.

* 서브루틴·클래스·DDIC 참조 해석은 범위 밖이다 — 여기서 아무 판정도 나오지 않는다.
DATA lo_obj TYPE REF TO zcl_also_missing.

START-OF-SELECTION.
  PERFORM missing_routine.
  CALL METHOD zcl_missing=>run.
