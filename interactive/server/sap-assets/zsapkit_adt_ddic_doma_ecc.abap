FUNCTION zsapkit_adt_ddic_doma
  IMPORTING
    VALUE(iv_action)       TYPE string
    VALUE(iv_name)         TYPE string
    VALUE(iv_devclass)     TYPE string OPTIONAL
    VALUE(iv_transport)    TYPE string OPTIONAL
    VALUE(iv_payload_json) TYPE string OPTIONAL
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZSAPKIT_ADT_DDIC_DOMA - domain maintenance bridge for ECC.
*
* ECC exposes no ADT REST endpoint for DDIC writes, so domain create,
* update and delete travel through this RFC-enabled wrapper around the
* standard DDIF_DOMA_PUT / RS_DD_DELETE_OBJ pair. Not installed on
* S/4HANA - ADT covers DDIC writes there natively.
*
* Import
*   iv_action        CREATE, UPDATE or DELETE
*   iv_name          domain name, upper-cased here
*   iv_devclass      target package. Blank or $TMP means keep it local
*   iv_transport     workbench request, only used for a real package
*   iv_payload_json  mandatory for CREATE and UPDATE, see shape below
*
* Export
*   ev_subrc   0 clean, 4 caller error, 8 unexpected exception, otherwise
*              the sy-subrc of whichever standard module refused
*   ev_message readable detail
*   ev_result  write  { "saved": true, "state": "I", "name": "<NAME>" }
*              delete { "deleted": true, "name": "<NAME>" }
*
* Payload shape
*   { "dd01v": { "DOMNAME": "Y...", "DDLANGUAGE": "E",
*                "DATATYPE": "CHAR", "LENG": "000010",
*                "OUTPUTLEN": "000010", "DDTEXT": "..." },
*     "dd07v": [ { "VALPOS": "0001", "DOMVALUE_L": "A",
*                  "DDTEXT": "Alpha" } ] }
*   DOMNAME is stamped onto the header and onto every fixed value from
*   iv_name, so the payload cannot point at a different domain.
*
* Package and transport handling
*   Local object (iv_devclass blank or $TMP) - PUT only. The TADIR entry
*   is created for us later, when ZSAPKIT_ADT_DDIC_ACTIVATE runs.
*   Real package - four steps, in this order
*     1 RS_CORR_INSERT               claim TADIR with package and owner
*     2 DDIF_DOMA_PUT                store the inactive version
*     3 TR_RECORD_OBJ_CHANGE_TO_REQ  attach the object to the request
*                                    (skipped when iv_transport is blank)
*     4 WB_TREE_ACTUALIZE            invalidate the SE80 browser cache
*                                    for EU_<package>, so the object
*                                    appears without a manual refresh
*   Either way the object stays inactive on purpose - the caller finishes
*   with ZSAPKIT_ADT_DDIC_ACTIVATE, type DOMA.

  TYPES: BEGIN OF ty_doma_payload,
           dd01v TYPE dd01v,
           dd07v TYPE STANDARD TABLE OF dd07v WITH DEFAULT KEY,
         END OF ty_doma_payload.

  DATA ls_payload       TYPE ty_doma_payload.
  DATA ls_header        TYPE dd01v.
  DATA lt_fixvals       TYPE STANDARD TABLE OF dd07v WITH DEFAULT KEY.
  DATA lv_obj           TYPE ddobjname.
  DATA lv_ddtype        TYPE rsedd0-ddobjtype.
  DATA lv_corr          TYPE e070-trkorr.
  DATA lv_transportable TYPE abap_bool.
  DATA lr_failure       TYPE REF TO cx_root.
  FIELD-SYMBOLS <ls_fixval> TYPE dd07v.

  CLEAR: ev_subrc, ev_message, ev_result.

  lv_obj    = to_upper( iv_name ).
  lv_ddtype = 'DOMA'.
  lv_corr   = iv_transport.

* One decision, made once, instead of repeating the same pair of tests at
* every step that cares about it.
  IF iv_devclass IS INITIAL OR iv_devclass = '$TMP'.
    lv_transportable = abap_false.
  ELSE.
    lv_transportable = abap_true.
  ENDIF.

  TRY.
      CASE iv_action.

        WHEN 'CREATE' OR 'UPDATE'.
          IF iv_payload_json IS INITIAL.
            ev_subrc   = 4.
            ev_message = |CREATE and UPDATE need iv_payload_json|.
            RETURN.
          ENDIF.

          IF lv_transportable = abap_true.
            PERFORM tadir_claim_doma USING lv_obj iv_devclass iv_transport
                                  CHANGING ev_subrc ev_message.
            IF ev_subrc <> 0.
              RETURN.
            ENDIF.
          ENDIF.

          /ui2/cl_json=>deserialize(
            EXPORTING json = iv_payload_json
            CHANGING  data = ls_payload ).

          ls_header         = ls_payload-dd01v.
          lt_fixvals        = ls_payload-dd07v.
          ls_header-domname = lv_obj.

          LOOP AT lt_fixvals ASSIGNING <ls_fixval>.
            <ls_fixval>-domname = lv_obj.
          ENDLOOP.

          CALL FUNCTION 'DDIF_DOMA_PUT'
            EXPORTING
              name              = lv_obj
              dd01v_wa          = ls_header
            TABLES
              dd07v_tab         = lt_fixvals
            EXCEPTIONS
              doma_not_found    = 1
              name_inconsistent = 2
              doma_inconsistent = 3
              put_failure       = 4
              put_refused       = 5
              OTHERS            = 6.
          ev_subrc = sy-subrc.

          IF ev_subrc <> 0.
            ev_message = |DDIF_DOMA_PUT refused { lv_obj }, sy-subrc={ ev_subrc }|.
            RETURN.
          ENDIF.

          IF lv_transportable = abap_true.
            IF iv_transport IS NOT INITIAL.
              PERFORM request_attach_doma USING lv_obj iv_devclass iv_transport
                                       CHANGING ev_subrc ev_message.
              IF ev_subrc <> 0.
                RETURN.
              ENDIF.
            ENDIF.
            PERFORM browser_refresh_doma USING iv_devclass.
          ENDIF.

          ev_subrc   = 0.
          ev_message = |Domain { lv_obj } written in the inactive version. | &&
                       |Finish with ZSAPKIT_ADT_DDIC_ACTIVATE type DOMA.|.
          ev_result  = |\{"saved":true,"state":"I","name":"{ lv_obj }"\}|.

        WHEN 'DELETE'.
          CALL FUNCTION 'RS_DD_DELETE_OBJ'
            EXPORTING
              no_ask               = 'X'
              objname              = lv_obj
              objtype              = lv_ddtype
            CHANGING
              corrnum              = lv_corr
            EXCEPTIONS
              not_executed         = 1
              object_not_found     = 2
              object_not_specified = 3
              permission_failure   = 4
              dialog_needed        = 5
              OTHERS               = 6.
          ev_subrc = sy-subrc.

          IF ev_subrc <> 0.
            ev_message = |RS_DD_DELETE_OBJ could not drop DOMA { lv_obj }, sy-subrc={ ev_subrc }|.
            RETURN.
          ENDIF.

          IF lv_transportable = abap_true.
            PERFORM browser_refresh_doma USING iv_devclass.
          ENDIF.
          ev_message = |Domain { lv_obj } deleted|.
          ev_result  = |\{"deleted":true,"name":"{ lv_obj }"\}|.

        WHEN OTHERS.
          ev_subrc   = 4.
          ev_message = |Action { iv_action } is not supported. Use CREATE, UPDATE or DELETE.|.

      ENDCASE.

    CATCH cx_root INTO lr_failure.
      ev_subrc   = 8.
      ev_message = lr_failure->get_text( ).
  ENDTRY.

ENDFUNCTION.


*----------------------------------------------------------------------*
* tadir_claim_doma - reserve the TADIR entry so the object lands in the
* requested package with an owner, before anything is written. The FORM
* name carries the object-type suffix because every function module of
* this group shares one subroutine pool; a shared name would collide at
* the group-wide syntax check.
*----------------------------------------------------------------------*
FORM tadir_claim_doma
  USING    iv_obj       TYPE ddobjname
           iv_devclass  TYPE string
           iv_transport TYPE string
  CHANGING cv_subrc     TYPE i
           cv_message   TYPE string.

  DATA lv_e071_obj  TYPE e071-obj_name.
  DATA lv_package   TYPE tadir-devclass.
  DATA lv_request   TYPE e070-trkorr.
  DATA lv_got_pkg   TYPE tadir-devclass.
  DATA lv_got_req   TYPE e070-trkorr.
  DATA lv_got_order TYPE e070-trkorr.
  DATA lv_got_owner TYPE sy-uname.
  DATA lr_failure   TYPE REF TO cx_root.

  lv_e071_obj = iv_obj.
  lv_package  = iv_devclass.
  lv_request  = iv_transport.

  TRY.
      CALL FUNCTION 'RS_CORR_INSERT'
        EXPORTING
          object                   = lv_e071_obj
          object_class             = 'DOMA'
          mode                     = 'I'
          global_lock              = 'X'
          devclass                 = lv_package
          korrnum                  = lv_request
          use_korrnum_immediatedly = 'X'
          master_language          = sy-langu
          suppress_dialog          = 'X'
        IMPORTING
          devclass                 = lv_got_pkg
          korrnum                  = lv_got_req
          ordernum                 = lv_got_order
          author                   = lv_got_owner
        EXCEPTIONS
          cancelled                = 1
          permission_failure       = 2
          unknown_objectclass      = 3
          OTHERS                   = 4.

      IF sy-subrc <> 0.
        cv_subrc   = sy-subrc.
        cv_message = |RS_CORR_INSERT refused { iv_obj }, sy-subrc={ sy-subrc } | &&
                     |msgno={ sy-msgno } { sy-msgv1 } { sy-msgv2 } | &&
                     |{ sy-msgv3 } { sy-msgv4 }|.
        RETURN.
      ENDIF.

      cv_subrc = 0.

    CATCH cx_root INTO lr_failure.
      cv_subrc   = 8.
      cv_message = |RS_CORR_INSERT threw an exception - { lr_failure->get_text( ) }|.
  ENDTRY.

ENDFORM.


*----------------------------------------------------------------------*
* request_attach_doma - put the object on the workbench request. Runs
* after the PUT, so a rejected write never leaves an entry behind.
*----------------------------------------------------------------------*
FORM request_attach_doma
  USING    iv_obj       TYPE ddobjname
           iv_devclass  TYPE string
           iv_transport TYPE string
  CHANGING cv_subrc     TYPE i
           cv_message   TYPE string.

  DATA lv_request  TYPE trkorr.
  DATA lt_entries  TYPE tredt_objects.
  DATA ls_entry    TYPE ko200.
  DATA lt_tadir    TYPE scts_tadir.
  DATA lv_recorded TYPE i.
  DATA lr_failure  TYPE REF TO cx_root.

  lv_request = iv_transport.

  ls_entry-pgmid      = 'R3TR'.
  ls_entry-object     = 'DOMA'.
  ls_entry-obj_name   = iv_obj.
  ls_entry-author     = sy-uname.
  ls_entry-masterlang = sy-langu.
  ls_entry-devclass   = iv_devclass.
  ls_entry-operation  = 'I'.
  APPEND ls_entry TO lt_entries.

  TRY.
      CALL FUNCTION 'TR_RECORD_OBJ_CHANGE_TO_REQ'
        EXPORTING
          iv_request = lv_request
          it_objects = lt_entries
        IMPORTING
          et_tadir   = lt_tadir
        EXCEPTIONS
          cancel     = 1
          OTHERS     = 2.

      IF sy-subrc <> 0.
        cv_subrc   = sy-subrc.
        cv_message = |TR_RECORD_OBJ_CHANGE_TO_REQ refused { iv_obj }, | &&
                     |sy-subrc={ sy-subrc } msgno={ sy-msgno } | &&
                     |{ sy-msgv1 } { sy-msgv2 } { sy-msgv3 } { sy-msgv4 }|.
        RETURN.
      ENDIF.

      lv_recorded = lines( lt_tadir ).
      cv_subrc    = 0.
      cv_message  = |DOMA { iv_obj } to { iv_transport }, | &&
                    |{ lv_recorded } TADIR entry/entries recorded|.

    CATCH cx_root INTO lr_failure.
      cv_subrc   = 8.
      cv_message = |TR_RECORD_OBJ_CHANGE_TO_REQ threw an exception - | &&
                   |{ lr_failure->get_text( ) }|.
  ENDTRY.

ENDFORM.


*----------------------------------------------------------------------*
* browser_refresh_doma - rebuild the SE80 object list for the package so
* the staged or removed object shows up without a manual refresh. Purely
* cosmetic: the DDIC object is already persisted when we get here, so any
* failure is swallowed rather than reported back to the caller.
*----------------------------------------------------------------------*
FORM browser_refresh_doma USING iv_devclass TYPE string.

  DATA lv_tree     TYPE string.
  DATA lv_syn_flag TYPE flag.

  lv_tree = |EU_{ iv_devclass }|.

  TRY.
      CALL FUNCTION 'WB_TREE_ACTUALIZE'
        EXPORTING
          tree_name              = lv_tree
          without_crossreference = 'X'
        IMPORTING
          syntax_error           = lv_syn_flag.

    CATCH cx_root.                                     "#EC NO_HANDLER
  ENDTRY.

ENDFORM.
