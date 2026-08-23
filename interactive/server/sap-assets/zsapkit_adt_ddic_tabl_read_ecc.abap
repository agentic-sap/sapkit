FUNCTION zsapkit_adt_ddic_tabl_read
  IMPORTING
    VALUE(iv_name)    TYPE string
    VALUE(iv_version) TYPE string DEFAULT 'A'
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZSAPKIT_ADT_DDIC_TABL_READ - metadata for a transparent table or a
* structure, read straight out of the DDIC catalogue.
*
* Why it exists. Old ECC kernels (BASIS below 7.50) never shipped the ADT
* endpoint /sap/bc/adt/ddic/tables. Letting the MCP server fall through to
* it there produces a 404 that reads like "object missing" when in fact the
* endpoint is missing. This module answers the same question from DD02L,
* DD02T, DD03L, DD04T and TADIR instead.
*
* One module covers both shapes on purpose - DD02L holds tables and
* structures in the same catalogue, and TABCLASS is what tells them apart.
* The caller learns which it got from the "kind" field rather than from
* having picked a different module.
*
* Import
*   iv_name     table or structure name, upper-cased here
*   iv_version  A for the active version, I for the inactive one. DDIC
*               spells the inactive version 'N' in AS4LOCAL, so the value
*               is translated below rather than passed through.
*
* Export
*   ev_subrc   0 found, 4 caller error or nothing in DD02L,
*              8 unexpected exception
*   ev_message readable detail
*   ev_result  JSON document, lower-case field names, initial fields
*              dropped. A miss still returns a well formed document
*              carrying only "name", so the caller never has to handle an
*              empty string.
*
* Covered TABCLASS values - TRANSP, CLUSTER, POOL and VIEW report as
* kind TABL; STRUCTURE, INTTAB and APPEND report as kind STRU; anything
* else is passed through untranslated.

  TYPES: BEGIN OF ty_tabl_col,
           fieldname   TYPE c LENGTH 30,
           position    TYPE i,
           key         TYPE abap_bool,
           mandatory   TYPE abap_bool,
           rollname    TYPE c LENGTH 30,
           checktable  TYPE c LENGTH 30,
           datatype    TYPE c LENGTH 4,
           leng        TYPE i,
           decimals    TYPE i,
           domname     TYPE c LENGTH 30,
           comptype    TYPE c LENGTH 1,
           notnull     TYPE abap_bool,
           description TYPE string,
         END OF ty_tabl_col.

  TYPES: BEGIN OF ty_tabl_out,
           name           TYPE string,
           kind           TYPE string,
           tabclass       TYPE string,
           delivery_class TYPE string,
           buffered       TYPE string,
           description    TYPE string,
           package        TYPE devclass,
           fields         TYPE STANDARD TABLE OF ty_tabl_col WITH DEFAULT KEY,
         END OF ty_tabl_out.

  DATA ls_out     TYPE ty_tabl_out.
  DATA ls_col     TYPE ty_tabl_col.
  DATA lv_obj     TYPE c LENGTH 30.
  DATA lv_ver     TYPE c LENGTH 1.
  DATA ls_dd02l   TYPE dd02l.
  DATA ls_dd02t   TYPE dd02t.
  DATA lt_dd03l   TYPE STANDARD TABLE OF dd03l WITH DEFAULT KEY.
  DATA lt_dd04t   TYPE STANDARD TABLE OF dd04t WITH DEFAULT KEY.
  DATA ls_dd04t   TYPE dd04t.
  DATA lv_package TYPE devclass.
  DATA lr_failure TYPE REF TO cx_root.
  FIELD-SYMBOLS <ls_raw> TYPE dd03l.

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
      SELECT SINGLE * FROM dd02l INTO ls_dd02l
        WHERE tabname  = lv_obj
          AND as4local = lv_ver.

      IF sy-subrc <> 0.
        ev_subrc   = 4.
        ev_message = |Table/structure { lv_obj } not in DD02L (version { iv_version })|.

      ELSE.
        ls_out-tabclass       = ls_dd02l-tabclass.
        ls_out-delivery_class = ls_dd02l-contflag.
        ls_out-buffered       = ls_dd02l-buffered.

*       TABCLASS is the only thing separating a table from a structure.
        CASE ls_dd02l-tabclass.
          WHEN 'TRANSP' OR 'CLUSTER' OR 'POOL' OR 'VIEW'.
            ls_out-kind = 'TABL'.
          WHEN 'STRUCTURE' OR 'INTTAB' OR 'APPEND'.
            ls_out-kind = 'STRU'.
          WHEN OTHERS.
            ls_out-kind = ls_dd02l-tabclass.
        ENDCASE.

*       Owning package.
        SELECT SINGLE devclass FROM tadir INTO lv_package
          WHERE pgmid = 'R3TR' AND object = 'TABL'
            AND obj_name = lv_obj.
        IF sy-subrc = 0.
          ls_out-package = lv_package.
        ENDIF.

*       Short text - logon language first, English as the fallback.
        SELECT SINGLE * FROM dd02t INTO ls_dd02t
          WHERE tabname    = lv_obj
            AND ddlanguage = sy-langu
            AND as4local   = lv_ver.
        IF sy-subrc <> 0.
          SELECT SINGLE * FROM dd02t INTO ls_dd02t
            WHERE tabname    = lv_obj
              AND ddlanguage = 'E'
              AND as4local   = lv_ver.
        ENDIF.
        IF sy-subrc = 0.
          ls_out-description = ls_dd02t-ddtext.
        ENDIF.

*       Columns, in catalogue order.
        SELECT * FROM dd03l INTO TABLE lt_dd03l
          WHERE tabname  = lv_obj
            AND as4local = lv_ver
          ORDER BY position.

*       All data element labels in one round trip instead of one per
*       column. The per-column English fallback inside the loop is the
*       rare path, kept only so a column is never left unlabelled.
        IF lt_dd03l IS NOT INITIAL.
          SELECT * FROM dd04t INTO TABLE lt_dd04t
            FOR ALL ENTRIES IN lt_dd03l
            WHERE rollname   = lt_dd03l-rollname
              AND ddlanguage = sy-langu
              AND as4local   = lv_ver.
        ENDIF.

        LOOP AT lt_dd03l ASSIGNING <ls_raw>.
          CLEAR ls_col.
          ls_col-fieldname  = <ls_raw>-fieldname.
          ls_col-position   = <ls_raw>-position.
          ls_col-rollname   = <ls_raw>-rollname.
          ls_col-checktable = <ls_raw>-checktable.
          ls_col-datatype   = <ls_raw>-datatype.
          ls_col-leng       = <ls_raw>-leng.
          ls_col-decimals   = <ls_raw>-decimals.
          ls_col-domname    = <ls_raw>-domname.
          ls_col-comptype   = <ls_raw>-comptype.

*         DDIC keeps these three as 'X' or blank; the document wants them
*         as booleans, and a blank one drops out at serialisation.
          IF <ls_raw>-keyflag = 'X'.
            ls_col-key = abap_true.
          ENDIF.
          IF <ls_raw>-mandatory = 'X'.
            ls_col-mandatory = abap_true.
          ENDIF.
          IF <ls_raw>-notnull = 'X'.
            ls_col-notnull = abap_true.
          ENDIF.

          IF <ls_raw>-rollname IS NOT INITIAL.
            READ TABLE lt_dd04t INTO ls_dd04t
              WITH KEY rollname = <ls_raw>-rollname.
            IF sy-subrc = 0.
              ls_col-description = ls_dd04t-ddtext.
            ELSE.
              SELECT SINGLE ddtext FROM dd04t INTO ls_col-description
                WHERE rollname   = <ls_raw>-rollname
                  AND ddlanguage = 'E'
                  AND as4local   = lv_ver.
            ENDIF.
          ENDIF.

          APPEND ls_col TO ls_out-fields.
        ENDLOOP.

        ev_subrc   = 0.
        ev_message = |{ ls_out-kind } { lv_obj }: { lines( ls_out-fields ) } field(s), | &&
                     |tabclass={ ls_out-tabclass }|.
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
