*&---------------------------------------------------------------------*
*& Report  ZSAPKIT_DEMO_PROG2
*&---------------------------------------------------------------------*
*& Renamed from ZSAPKIT_DEMO_PROG.
*& The old logic derived the selection key from a fixed offset of
*& sy-repid (e.g. gv_key = sy-repid+4(4)). That broke on rename because
*& the substring changed and the WHERE clause no longer matched.
*& The key is now independent of the program name: it comes from a
*& selection parameter, with a constant as fallback.
*&---------------------------------------------------------------------*
REPORT zsapkit_demo_prog2.

CONSTANTS: gc_default_key TYPE t001-bukrs VALUE '1000'.

TABLES: t001.

PARAMETERS: p_key TYPE t001-bukrs DEFAULT gc_default_key.

DATA: gv_key TYPE t001-bukrs,
      gt_t001 TYPE STANDARD TABLE OF t001 WITH DEFAULT KEY,
      gs_t001 TYPE t001.

START-OF-SELECTION.

  PERFORM determine_key CHANGING gv_key.

  SELECT * FROM t001
    INTO TABLE gt_t001
    WHERE bukrs = gv_key.

  IF sy-subrc <> 0 OR gt_t001 IS INITIAL.
    WRITE: / 'Keine Daten gefunden für Schlüssel:', gv_key.
    RETURN.
  ENDIF.

  LOOP AT gt_t001 INTO gs_t001.
    WRITE: / gs_t001-bukrs, gs_t001-butxt, gs_t001-ort01.
  ENDLOOP.

*&---------------------------------------------------------------------*
*&      Form  DETERMINE_KEY
*&---------------------------------------------------------------------*
*& Key determination independent of sy-repid:
*& 1. user input (parameter)
*& 2. fallback to constant default
*&---------------------------------------------------------------------*
FORM determine_key CHANGING cv_key TYPE t001-bukrs.

  IF p_key IS NOT INITIAL.
    cv_key = p_key.
  ELSE.
    cv_key = gc_default_key.
  ENDIF.

ENDFORM.
