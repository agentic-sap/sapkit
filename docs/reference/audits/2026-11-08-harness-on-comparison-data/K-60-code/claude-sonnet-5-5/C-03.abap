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
  DATA lv_spras TYPE spras.

  CLEAR ev_maktx.

  " Language is optional: fall back to the logon language if the caller passed an initial value
  lv_spras = iv_spras.
  IF lv_spras IS INITIAL.
    lv_spras = sy-langu.
  ENDIF.

  " 1) Does the material exist at all? -> MATERIAL_NOT_FOUND
  SELECT SINGLE matnr
    FROM mara
    WHERE matnr = @iv_matnr
    INTO @lv_matnr.
  IF sy-subrc <> 0.
    RAISE material_not_found.
  ENDIF.

  " 2) Material exists - is there a description in the requested language? -> TEXT_NOT_FOUND
  SELECT SINGLE maktx
    FROM makt
    WHERE matnr = @iv_matnr
      AND spras = @lv_spras
    INTO @ev_maktx.
  IF sy-subrc <> 0.
    CLEAR ev_maktx.
    RAISE text_not_found.
  ENDIF.

ENDFUNCTION.
