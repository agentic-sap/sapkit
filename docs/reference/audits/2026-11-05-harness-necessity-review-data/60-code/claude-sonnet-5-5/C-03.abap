FUNCTION z_judge_c03_get_material_text
  IMPORTING
    VALUE(iv_matnr) TYPE matnr
    VALUE(iv_spras) TYPE spras DEFAULT sy-langu
  EXPORTING
    VALUE(ev_maktx) TYPE maktx
  EXCEPTIONS
    material_not_found
    text_not_found.

  DATA lv_matnr TYPE mara-matnr.

  CLEAR ev_maktx.

  " Normalize material number to internal format (e.g. leading zeros)
  CALL FUNCTION 'CONVERSION_EXIT_MATN1_INPUT'
    EXPORTING
      input        = iv_matnr
    IMPORTING
      output       = lv_matnr
    EXCEPTIONS
      length_error = 1
      OTHERS       = 2.
  IF sy-subrc <> 0.
    lv_matnr = iv_matnr.
  ENDIF.

  " Check that the material exists in the material master
  SELECT SINGLE matnr
    FROM mara
    INTO @DATA(lv_exists)
    WHERE matnr = @lv_matnr.
  IF sy-subrc <> 0.
    RAISE material_not_found.
  ENDIF.

  " Read description in the requested language
  SELECT SINGLE maktx
    FROM makt
    INTO @ev_maktx
    WHERE matnr = @lv_matnr
      AND spras = @iv_spras.
  IF sy-subrc <> 0.
    CLEAR ev_maktx.
    RAISE text_not_found.
  ENDIF.

ENDFUNCTION.
