FUNCTION zsapkit_adt_ddic_dtel_read
  IMPORTING
    VALUE(iv_name)    TYPE string
    VALUE(iv_version) TYPE string DEFAULT 'A'
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZSAPKIT_ADT_DDIC_DTEL_READ - metadata and screen texts for one data
* element, read straight out of the DDIC catalogue.
*
* Why it exists. Old ECC kernels (BASIS below 7.50) never shipped the ADT
* read endpoint for DDIC objects. Falling through to it there yields a 404
* that reads like "object missing" when the endpoint is what is missing.
* This module answers from DD04L, DD04T and TADIR instead.
*
* Import
*   iv_name     data element name, upper-cased here
*   iv_version  A for the active version, I for the inactive one. DDIC
*               spells the inactive version 'N' in AS4LOCAL, so the value
*               is translated below rather than passed through.
*
* Export
*   ev_subrc   0 found, 4 caller error or nothing in DD04L,
*              8 unexpected exception
*   ev_message readable detail
*   ev_result  JSON document, lower-case field names, initial fields
*              dropped. A miss still returns a well formed document
*              carrying only "name".
*
* The four label fields are kept apart rather than folded into one, since
* a caller building a screen needs to pick by width - heading is REPTEXT,
* then short, medium and long are SCRTEXT_S, _M and _L.

  TYPES: BEGIN OF ty_dtel_out,
           name         TYPE string,
           domname      TYPE string,
           datatype     TYPE string,
           leng         TYPE i,
           decimals     TYPE i,
           outputlen    TYPE i,
           lowercase    TYPE abap_bool,
           signflag     TYPE abap_bool,
           convexit     TYPE string,
           description  TYPE string,
           heading      TYPE string,
           short_label  TYPE string,
           medium_label TYPE string,
           long_label   TYPE string,
           package      TYPE devclass,
         END OF ty_dtel_out.

  DATA ls_out     TYPE ty_dtel_out.
  DATA lv_obj     TYPE c LENGTH 30.
  DATA lv_ver     TYPE c LENGTH 1.
  DATA ls_dd04l   TYPE dd04l.
  DATA ls_dd04t   TYPE dd04t.
  DATA lv_package TYPE devclass.
  DATA lr_failure TYPE REF TO cx_root.

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
      SELECT SINGLE * FROM dd04l INTO ls_dd04l
        WHERE rollname = lv_obj
          AND as4local = lv_ver.

      IF sy-subrc <> 0.
        ev_subrc   = 4.
        ev_message = |DataElement { lv_obj } not in DD04L (version { iv_version })|.

      ELSE.
        ls_out-domname   = ls_dd04l-domname.
        ls_out-datatype  = ls_dd04l-datatype.
        ls_out-leng      = ls_dd04l-leng.
        ls_out-decimals  = ls_dd04l-decimals.
        ls_out-outputlen = ls_dd04l-outputlen.
        ls_out-convexit  = ls_dd04l-convexit.

*       Stored as 'X' or blank; the document wants booleans, and a blank
*       one drops out at serialisation.
        IF ls_dd04l-lowercase = 'X'.
          ls_out-lowercase = abap_true.
        ENDIF.
        IF ls_dd04l-signflag = 'X'.
          ls_out-signflag = abap_true.
        ENDIF.

*       Texts - logon language first, English as the fallback. One row
*       carries all five, so a single read covers them.
        SELECT SINGLE * FROM dd04t INTO ls_dd04t
          WHERE rollname   = lv_obj
            AND ddlanguage = sy-langu
            AND as4local   = lv_ver.
        IF sy-subrc <> 0.
          SELECT SINGLE * FROM dd04t INTO ls_dd04t
            WHERE rollname   = lv_obj
              AND ddlanguage = 'E'
              AND as4local   = lv_ver.
        ENDIF.
        IF sy-subrc = 0.
          ls_out-description  = ls_dd04t-ddtext.
          ls_out-heading      = ls_dd04t-reptext.
          ls_out-short_label  = ls_dd04t-scrtext_s.
          ls_out-medium_label = ls_dd04t-scrtext_m.
          ls_out-long_label   = ls_dd04t-scrtext_l.
        ENDIF.

*       Owning package.
        SELECT SINGLE devclass FROM tadir INTO lv_package
          WHERE pgmid = 'R3TR' AND object = 'DTEL'
            AND obj_name = lv_obj.
        IF sy-subrc = 0.
          ls_out-package = lv_package.
        ENDIF.

        ev_subrc   = 0.
        ev_message = |DTEL { lv_obj }: domain={ ls_out-domname }, | &&
                     |type={ ls_out-datatype }({ ls_out-leng })|.
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
