FUNCTION z_judge_c03_get_material_text
  IMPORTING
    VALUE(iv_matnr) TYPE matnr
    VALUE(iv_spras) TYPE spras OPTIONAL
  EXPORTING
    VALUE(ev_maktx) TYPE maktx
  EXCEPTIONS
    material_not_found
    text_not_found.

  DATA lv_matnr_checked TYPE matnr.
  DATA lv_language      TYPE spras.
  DATA lv_description   TYPE maktx.

  CLEAR ev_maktx.

  " Material master existence check, independent of the language
  SELECT SINGLE matnr
    FROM mara
    INTO lv_matnr_checked
    WHERE matnr = iv_matnr.
  IF sy-subrc <> 0.
    RAISE material_not_found.
  ENDIF.

  " Default to the logon language when the caller passes none
  IF iv_spras IS INITIAL.
    lv_language = sy-langu.
  ELSE.
    lv_language = iv_spras.
  ENDIF.

  SELECT SINGLE maktx
    FROM makt
    INTO lv_description
    WHERE matnr = iv_matnr
      AND spras = lv_language.
  IF sy-subrc <> 0.
    RAISE text_not_found.
  ENDIF.

  ev_maktx = lv_description.

ENDFUNCTION.
