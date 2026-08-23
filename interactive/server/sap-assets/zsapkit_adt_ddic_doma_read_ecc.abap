FUNCTION zsapkit_adt_ddic_doma_read
  IMPORTING
    VALUE(iv_name)    TYPE string
    VALUE(iv_version) TYPE string DEFAULT 'A'
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZSAPKIT_ADT_DDIC_DOMA_READ - one domain with its fixed value list, read
* straight out of the DDIC catalogue.
*
* Why it exists. Old ECC kernels (BASIS below 7.50) never shipped the ADT
* read endpoint for DDIC objects. Falling through to it there yields a 404
* that reads like "object missing" when the endpoint is what is missing.
* This module answers from DD01L, DD01T, DD07L, DD07T and TADIR instead.
*
* Import
*   iv_name     domain name, upper-cased here
*   iv_version  A for the active version, I for the inactive one. DDIC
*               spells the inactive version 'N' in AS4LOCAL, so the value
*               is translated below rather than passed through.
*
* Export
*   ev_subrc   0 found, 4 caller error or nothing in DD01L,
*              8 unexpected exception
*   ev_message readable detail
*   ev_result  JSON document, lower-case field names, initial fields
*              dropped. A miss still returns a well formed document
*              carrying only "name".
*
* A fixed value is reported as low / high rather than as DOMVALUE_L and
* DOMVALUE_H, because a single value and an interval share the same two
* columns and only the second one being filled tells them apart.

  TYPES: BEGIN OF ty_doma_fixval,
           valpos      TYPE i,
           low         TYPE string,
           high        TYPE string,
           description TYPE string,
         END OF ty_doma_fixval.

  TYPES: BEGIN OF ty_doma_out,
           name         TYPE string,
           datatype     TYPE string,
           leng         TYPE i,
           decimals     TYPE i,
           outputlen    TYPE i,
           lowercase    TYPE abap_bool,
           signflag     TYPE abap_bool,
           convexit     TYPE string,
           value_table  TYPE string,
           description  TYPE string,
           package      TYPE devclass,
           fixed_values TYPE STANDARD TABLE OF ty_doma_fixval WITH DEFAULT KEY,
         END OF ty_doma_out.

  DATA ls_out     TYPE ty_doma_out.
  DATA ls_fixval  TYPE ty_doma_fixval.
  DATA lv_obj     TYPE c LENGTH 30.
  DATA lv_ver     TYPE c LENGTH 1.
  DATA ls_dd01l   TYPE dd01l.
  DATA ls_dd01t   TYPE dd01t.
  DATA lt_dd07l   TYPE STANDARD TABLE OF dd07l WITH DEFAULT KEY.
  DATA lt_dd07t   TYPE STANDARD TABLE OF dd07t WITH DEFAULT KEY.
  DATA ls_dd07t   TYPE dd07t.
  DATA lv_package TYPE devclass.
  DATA lr_failure TYPE REF TO cx_root.
  FIELD-SYMBOLS <ls_raw> TYPE dd07l.

  CLEAR: ev_subrc, ev_message, ev_result.

  IF iv_name IS INITIAL.
    ev_subrc   = 4.
    ev_message = 'iv_name is required'.
    RETURN.
  ENDIF.

  lv_obj      = to_upper( iv_name ).
  ls_out-name = lv_obj.

* AS4LOCAL spells the inactive version 'N', not 'I'.
  IF iv_version = 'I'.
    lv_ver = 'N'.
  ELSE.
    lv_ver = 'A'.
  ENDIF.

  TRY.
      SELECT SINGLE * FROM dd01l INTO ls_dd01l
        WHERE domname  = lv_obj
          AND as4local = lv_ver.

      IF sy-subrc <> 0.
        ev_subrc   = 4.
        ev_message = |Domain { lv_obj } not in DD01L (version { iv_version })|.

      ELSE.
        ls_out-datatype    = ls_dd01l-datatype.
        ls_out-leng        = ls_dd01l-leng.
        ls_out-decimals    = ls_dd01l-decimals.
        ls_out-outputlen   = ls_dd01l-outputlen.
        ls_out-convexit    = ls_dd01l-convexit.
        ls_out-value_table = ls_dd01l-entitytab.

*       Stored as 'X' or blank; the document wants booleans, and a blank
*       one drops out at serialisation.
        IF ls_dd01l-lowercase = 'X'.
          ls_out-lowercase = abap_true.
        ENDIF.
        IF ls_dd01l-signflag = 'X'.
          ls_out-signflag = abap_true.
        ENDIF.

*       Short text - logon language first, English as the fallback.
        SELECT SINGLE * FROM dd01t INTO ls_dd01t
          WHERE domname    = lv_obj
            AND ddlanguage = sy-langu
            AND as4local   = lv_ver.
        IF sy-subrc <> 0.
          SELECT SINGLE * FROM dd01t INTO ls_dd01t
            WHERE domname    = lv_obj
              AND ddlanguage = 'E'
              AND as4local   = lv_ver.
        ENDIF.
        IF sy-subrc = 0.
          ls_out-description = ls_dd01t-ddtext.
        ENDIF.

*       Owning package.
        SELECT SINGLE devclass FROM tadir INTO lv_package
          WHERE pgmid = 'R3TR' AND object = 'DOMA'
            AND obj_name = lv_obj.
        IF sy-subrc = 0.
          ls_out-package = lv_package.
        ENDIF.

*       Fixed values, in the order the domain declares them.
        SELECT * FROM dd07l INTO TABLE lt_dd07l
          WHERE domname  = lv_obj
            AND as4local = lv_ver
          ORDER BY valpos.

*       All value texts in one round trip. The per-value English fallback
*       inside the loop is the rare path.
        IF lt_dd07l IS NOT INITIAL.
          SELECT * FROM dd07t INTO TABLE lt_dd07t
            FOR ALL ENTRIES IN lt_dd07l
            WHERE domname    = lt_dd07l-domname
              AND ddlanguage = sy-langu
              AND as4local   = lt_dd07l-as4local
              AND valpos     = lt_dd07l-valpos.
        ENDIF.

        LOOP AT lt_dd07l ASSIGNING <ls_raw>.
          CLEAR ls_fixval.
          ls_fixval-valpos = <ls_raw>-valpos.
          ls_fixval-low    = <ls_raw>-domvalue_l.
          ls_fixval-high   = <ls_raw>-domvalue_h.

          READ TABLE lt_dd07t INTO ls_dd07t
            WITH KEY domname = <ls_raw>-domname
                     valpos  = <ls_raw>-valpos.
          IF sy-subrc = 0.
            ls_fixval-description = ls_dd07t-ddtext.
          ELSE.
            SELECT SINGLE ddtext FROM dd07t INTO ls_fixval-description
              WHERE domname    = <ls_raw>-domname
                AND ddlanguage = 'E'
                AND as4local   = lv_ver
                AND valpos     = <ls_raw>-valpos.
          ENDIF.

          APPEND ls_fixval TO ls_out-fixed_values.
        ENDLOOP.

        ev_subrc   = 0.
        ev_message = |DOMA { lv_obj }: type={ ls_out-datatype }({ ls_out-leng }), | &&
                     |{ lines( ls_out-fixed_values ) } fixed value(s)|.
      ENDIF.

*     Hit or miss, the caller gets a document. One place builds it.
      ev_result = /ui2/cl_json=>serialize(
        data        = ls_out
        compress    = abap_true
        pretty_name = /ui2/cl_json=>pretty_mode-low_case ).

    CATCH cx_root INTO lr_failure.
      ev_subrc   = 8.
      ev_message = lr_failure->get_text( ).
  ENDTRY.

ENDFUNCTION.
