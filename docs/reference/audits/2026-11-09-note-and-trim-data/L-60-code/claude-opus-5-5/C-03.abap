FUNCTION z_judge_c03_get_material_text
  IMPORTING
    VALUE(iv_material_number) TYPE matnr
    VALUE(iv_language)        TYPE spras DEFAULT sy-langu
  EXPORTING
    VALUE(ev_description)     TYPE maktx
  EXCEPTIONS
    material_not_found
    description_not_found.

  DATA lv_material_number TYPE matnr.
  DATA lv_language        TYPE spras.

  CLEAR ev_description.

  IF iv_material_number IS INITIAL.
    RAISE material_not_found.
  ENDIF.

  lv_language = iv_language.
  IF lv_language IS INITIAL.
    lv_language = sy-langu.
  ENDIF.

  SELECT SINGLE matnr
    FROM mara
    INTO lv_material_number
    WHERE matnr = iv_material_number.
  IF sy-subrc <> 0.
    RAISE material_not_found.
  ENDIF.

  SELECT SINGLE maktx
    FROM makt
    INTO ev_description
    WHERE matnr = iv_material_number
      AND spras = lv_language.
  IF sy-subrc <> 0.
    CLEAR ev_description.
    RAISE description_not_found.
  ENDIF.

ENDFUNCTION.
