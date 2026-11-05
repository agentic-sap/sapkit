*&---------------------------------------------------------------------*
*& Report ZSAPKIT_DEMO_PROG2
*&---------------------------------------------------------------------*
*& The selection key (gv_key) no longer depends on a fixed offset of
*& sy-repid. It comes from a constant, can be overridden on the
*& selection screen, and is validated before the SELECT runs. Renaming
*& or copying the program therefore no longer changes or empties the
*& WHERE condition.
*&---------------------------------------------------------------------*
REPORT zsapkit_demo_prog2.

CONSTANTS:
  gc_default_key TYPE c LENGTH 4 VALUE 'DEMO',
  gc_prefix      TYPE c LENGTH 8 VALUE 'ZSAPKIT_'.

TYPES:
  BEGIN OF ty_result,
    obj_name TYPE tadir-obj_name,
    object   TYPE tadir-object,
    devclass TYPE tadir-devclass,
    author   TYPE tadir-author,
  END OF ty_result,
  tt_result TYPE STANDARD TABLE OF ty_result WITH EMPTY KEY.

DATA:
  gv_key     TYPE c LENGTH 4,
  gv_pattern TYPE tadir-obj_name,
  gt_result  TYPE tt_result.

PARAMETERS p_key TYPE c LENGTH 4 DEFAULT gc_default_key OBLIGATORY.

*----------------------------------------------------------------------*
AT SELECTION-SCREEN.
  IF condense( val = CONV string( p_key ) ) IS INITIAL.
    MESSAGE 'Selection key must not be empty.' TYPE 'E'.
  ENDIF.

*----------------------------------------------------------------------*
START-OF-SELECTION.
  PERFORM determine_key.

  IF gv_key IS INITIAL.
    MESSAGE 'No valid selection key could be determined.' TYPE 'S' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  PERFORM select_data.
  PERFORM display_data.

*&---------------------------------------------------------------------*
*& Form DETERMINE_KEY
*&---------------------------------------------------------------------*
*& Key resolution order:
*&   1. Value from selection screen (p_key)
*&   2. Fixed constant gc_default_key
*& sy-repid is intentionally NOT used, so the key is independent of
*& the program name.
*&---------------------------------------------------------------------*
FORM determine_key.
  gv_key = to_upper( condense( val = CONV string( p_key ) ) ).

  IF gv_key IS INITIAL.
    gv_key = gc_default_key.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SELECT_DATA
*&---------------------------------------------------------------------*
FORM select_data.
  CLEAR gt_result.

  gv_pattern = |{ gc_prefix }{ gv_key }%|.

  SELECT obj_name, object, devclass, author
    FROM tadir
    WHERE pgmid    = 'R3TR'
      AND object   = 'PROG'
      AND obj_name LIKE @gv_pattern
    ORDER BY obj_name
    INTO TABLE @gt_result.

  IF sy-subrc <> 0.
    CLEAR gt_result.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form DISPLAY_DATA
*&---------------------------------------------------------------------*
FORM display_data.
  WRITE: / 'Program     :', sy-repid,
         / 'Key (gv_key):', gv_key,
         / 'Pattern     :', gv_pattern.
  ULINE.

  IF gt_result IS INITIAL.
    WRITE / 'No entries found.'.
    RETURN.
  ENDIF.

  LOOP AT gt_result INTO DATA(ls_result).
    WRITE: / ls_result-obj_name,
             ls_result-object,
             ls_result-devclass,
             ls_result-author.
  ENDLOOP.

  ULINE.
  WRITE: / 'Rows:', lines( gt_result ).
ENDFORM.
