FUNCTION zsapkit_adt_dispatch.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(IV_ACTION) TYPE  STRING
*"     VALUE(IV_PARAMS) TYPE  STRING
*"  EXPORTING
*"     VALUE(EV_SUBRC) TYPE  I
*"     VALUE(EV_MESSAGE) TYPE  STRING
*"     VALUE(EV_RESULT) TYPE  STRING
*"----------------------------------------------------------------------
* One remote entry point for screen (dynpro) and GUI status (CUA) work.
*
* The caller names the operation in IV_ACTION and packs every operand of
* that operation into IV_PARAMS as a JSON object. Keeping the operands in
* one string is what lets a single RFC signature carry six unrelated
* Workbench calls, so the signature never has to grow when an action is
* added.
*
* Actions understood here, and the Workbench call each one lands on.
*
*   DYNPRO_READ     read a screen         RPY_DYNPRO_READ
*   DYNPRO_INSERT   create a screen       RPY_DYNPRO_INSERT
*   DYNPRO_DELETE   remove a screen       RPY_DYNPRO_DELETE
*   CUA_FETCH       read a GUI status     RS_CUA_INTERNAL_FETCH
*   CUA_WRITE       write a GUI status    RS_CUA_INTERNAL_WRITE
*   CUA_DELETE      remove a GUI status   RS_CUA_DELETE
*
* What the caller gets back.
*
*   EV_SUBRC    0 when the Workbench call went through, 4 when this
*               module refused the request on its own, 8 when an
*               exception reached the outer handler.
*   EV_RESULT   JSON payload. Reads answer with the object or array the
*               action produces, writes answer with a small confirmation
*               object, and a refusal leaves it empty.
*   EV_MESSAGE  one line of prose for a human reader. Never parse it.
*
* Field names inside EV_RESULT come straight from the ABAP component
* names, because /UI2/CL_JSON is called without a name-mapping mode.
* Renaming a component therefore renames a wire field, so treat the
* structures below as the published contract, not as private detail.
*----------------------------------------------------------------------

  CLEAR ev_subrc.
  CLEAR ev_message.
  CLEAR ev_result.

  TRY.
      CASE iv_action.
        WHEN 'DYNPRO_READ'.
          PERFORM collect_screen_source USING iv_params
                                        CHANGING ev_subrc ev_message ev_result.

        WHEN 'DYNPRO_INSERT'.
          PERFORM apply_screen_source USING iv_params
                                      CHANGING ev_subrc ev_message ev_result.

        WHEN 'DYNPRO_DELETE'.
          PERFORM drop_screen USING iv_params
                              CHANGING ev_subrc ev_message ev_result.

        WHEN 'CUA_FETCH'.
          PERFORM collect_status_source USING iv_params
                                        CHANGING ev_subrc ev_message ev_result.

        WHEN 'CUA_WRITE'.
          PERFORM apply_status_source USING iv_params
                                      CHANGING ev_subrc ev_message ev_result.

        WHEN 'CUA_DELETE'.
          PERFORM drop_status USING iv_params
                              CHANGING ev_subrc ev_message ev_result.

        WHEN OTHERS.
          ev_subrc   = 4.
          ev_message = |{ iv_action } is not an action this dispatcher serves|.
      ENDCASE.

    CATCH cx_root INTO DATA(lx_unhandled).
*     Anything that escapes a Workbench call becomes a plain answer. A
*     remote caller must never get a short dump instead of a subrc.
      ev_subrc   = 8.
      ev_message = lx_unhandled->get_text( ).
  ENDTRY.

ENDFUNCTION.


*----------------------------------------------------------------------*
* Shapes shared by the routines below.
*
* These live at function group level so that read and write agree on one
* description of a screen and one description of a status. The ty_adt_
* prefix keeps them clear of the type names the DDIC bridge modules
* declare inside their own bodies.
*----------------------------------------------------------------------*

* Operands of the three screen actions. DYNPRO_READ and DYNPRO_DELETE
* simply leave dynpro_data empty; unknown JSON members are ignored.
TYPES: BEGIN OF ty_adt_screen_call,
         program     TYPE string,
         dynpro      TYPE string,
         dynpro_data TYPE string,
       END OF ty_adt_screen_call.

* A whole screen. RPY_DYNPRO_READ fills it and RPY_DYNPRO_INSERT consumes
* it, so what a read hands out can be fed straight back into a write.
TYPES: BEGIN OF ty_adt_screen,
         header               TYPE rpy_dyhead,
         containers           TYPE TABLE OF rpy_dycatt WITH DEFAULT KEY,
         fields_to_containers TYPE TABLE OF rpy_dyfield WITH DEFAULT KEY,
         flow_logic           TYPE swbse_max_line_tab,
       END OF ty_adt_screen.

* Operands of CUA_FETCH and CUA_WRITE. A fetch leaves cua_data empty.
TYPES: BEGIN OF ty_adt_status_call,
         program  TYPE string,
         language TYPE string,
         cua_data TYPE string,
       END OF ty_adt_status_call.

* Operands of CUA_DELETE. RS_CUA_DELETE clears the whole status pool of
* one program, so status is accepted for symmetry but not acted on.
TYPES: BEGIN OF ty_adt_status_id,
         program TYPE string,
         status  TYPE string,
       END OF ty_adt_status_id.

* The twelve tables that make up the GUI status pool of one program. A
* single declaration serves both directions: RS_CUA_INTERNAL_FETCH fills
* it and RS_CUA_INTERNAL_WRITE reads it back out.
TYPES: BEGIN OF ty_adt_status,
         adm TYPE rsmpe_adm,
         sta TYPE TABLE OF rsmpe_stat WITH DEFAULT KEY,
         fun TYPE TABLE OF rsmpe_funt WITH DEFAULT KEY,
         men TYPE TABLE OF rsmpe_men WITH DEFAULT KEY,
         mtx TYPE TABLE OF rsmpe_mnlt WITH DEFAULT KEY,
         act TYPE TABLE OF rsmpe_act WITH DEFAULT KEY,
         but TYPE TABLE OF rsmpe_but WITH DEFAULT KEY,
         pfk TYPE TABLE OF rsmpe_pfk WITH DEFAULT KEY,
         set TYPE TABLE OF rsmpe_staf WITH DEFAULT KEY,
         doc TYPE TABLE OF rsmpe_atrt WITH DEFAULT KEY,
         tit TYPE TABLE OF rsmpe_tit WITH DEFAULT KEY,
         biv TYPE TABLE OF rsmpe_buts WITH DEFAULT KEY,
       END OF ty_adt_status.


*----------------------------------------------------------------------*
* DYNPRO_READ
*----------------------------------------------------------------------*
FORM collect_screen_source USING iv_params TYPE string
                           CHANGING cv_subrc   TYPE i
                                    cv_message TYPE string
                                    cv_result  TYPE string.

  DATA ls_call   TYPE ty_adt_screen_call.
  DATA ls_screen TYPE ty_adt_screen.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params
                             CHANGING  data = ls_call ).

* The four parts of a screen are collected straight into the answer
* structure, so no second copying step can quietly drop one of them.
  CALL FUNCTION 'RPY_DYNPRO_READ'
    EXPORTING
      progname             = CONV syrepid( to_upper( ls_call-program ) )
      dynnr                = CONV sydynnr( ls_call-dynpro )
    IMPORTING
      header               = ls_screen-header
    TABLES
      containers           = ls_screen-containers
      fields_to_containers = ls_screen-fields_to_containers
      flow_logic           = ls_screen-flow_logic
    EXCEPTIONS
      cancelled            = 1
      not_found            = 2
      permission_error     = 3
      OTHERS               = 4.

  cv_subrc = sy-subrc.
  IF cv_subrc <> 0.
    cv_message = |RPY_DYNPRO_READ declined with sy-subrc { cv_subrc }|.
    RETURN.
  ENDIF.

  cv_result  = /ui2/cl_json=>serialize( data = ls_screen ).
  cv_message = |Screen { ls_call-program }/{ ls_call-dynpro } read|.

ENDFORM.


*----------------------------------------------------------------------*
* DYNPRO_INSERT
*----------------------------------------------------------------------*
FORM apply_screen_source USING iv_params TYPE string
                         CHANGING cv_subrc   TYPE i
                                  cv_message TYPE string
                                  cv_result  TYPE string.

  DATA ls_call    TYPE ty_adt_screen_call.
  DATA ls_screen  TYPE ty_adt_screen.
  DATA lv_program TYPE string.
  DATA lv_dynpro  TYPE string.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params
                             CHANGING  data = ls_call ).

  lv_program = to_upper( ls_call-program ).
  lv_dynpro  = ls_call-dynpro.

* The screen travels as a JSON document nested inside the operands, so it
* takes a second pass to open. It is read into the very shape DYNPRO_READ
* hands out, and that is what makes the pair round-trip.
  /ui2/cl_json=>deserialize( EXPORTING json = ls_call-dynpro_data
                             CHANGING  data = ls_screen ).

* Existence checks stay suppressed because the caller has already decided
* the screen belongs there; letting them run turns a deliberate overwrite
* into a refusal.
  CALL FUNCTION 'RPY_DYNPRO_INSERT'
    EXPORTING
      header                = ls_screen-header
      suppress_exist_checks = abap_true
    TABLES
      containers            = ls_screen-containers
      fields_to_containers  = ls_screen-fields_to_containers
      flow_logic            = ls_screen-flow_logic
    EXCEPTIONS
      already_exists        = 1
      cancelled             = 2
      permission_error      = 3
      name_not_allowed      = 4
      not_found             = 5
      OTHERS                = 6.

  cv_subrc = sy-subrc.
  IF cv_subrc <> 0.
    cv_message = |RPY_DYNPRO_INSERT declined with sy-subrc { cv_subrc }|.
    RETURN.
  ENDIF.

  cv_message = |Screen { lv_program }/{ lv_dynpro } created|.
  cv_result  = '{}'.

ENDFORM.


*----------------------------------------------------------------------*
* DYNPRO_DELETE
*----------------------------------------------------------------------*
FORM drop_screen USING iv_params TYPE string
                 CHANGING cv_subrc   TYPE i
                          cv_message TYPE string
                          cv_result  TYPE string.

  DATA ls_call TYPE ty_adt_screen_call.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params
                             CHANGING  data = ls_call ).

  CALL FUNCTION 'RPY_DYNPRO_DELETE'
    EXPORTING
      progname         = CONV syrepid( to_upper( ls_call-program ) )
      dynnr            = CONV sydynnr( ls_call-dynpro )
    EXCEPTIONS
      cancelled        = 1
      not_found        = 2
      permission_error = 3
      OTHERS           = 4.

  cv_subrc = sy-subrc.
  IF cv_subrc <> 0.
    cv_message = |RPY_DYNPRO_DELETE declined with sy-subrc { cv_subrc }|.
    RETURN.
  ENDIF.

  cv_message = |Screen { ls_call-program }/{ ls_call-dynpro } removed|.
  cv_result  = '{}'.

ENDFORM.


*----------------------------------------------------------------------*
* CUA_FETCH
*----------------------------------------------------------------------*
FORM collect_status_source USING iv_params TYPE string
                           CHANGING cv_subrc   TYPE i
                                    cv_message TYPE string
                                    cv_result  TYPE string.

  DATA ls_call     TYPE ty_adt_status_call.
  DATA ls_status   TYPE ty_adt_status.
  DATA lv_language TYPE sy-langu.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params
                             CHANGING  data = ls_call ).

  PERFORM resolve_language USING ls_call-language
                           CHANGING lv_language.

* Only the active version is ever handed out. An inactive status belongs
* to whoever is editing the program, not to a remote reader.
  CALL FUNCTION 'RS_CUA_INTERNAL_FETCH'
    EXPORTING
      program         = CONV syrepid( to_upper( ls_call-program ) )
      language        = lv_language
      state           = 'A'
    IMPORTING
      adm             = ls_status-adm
    TABLES
      sta             = ls_status-sta
      fun             = ls_status-fun
      men             = ls_status-men
      mtx             = ls_status-mtx
      act             = ls_status-act
      but             = ls_status-but
      pfk             = ls_status-pfk
      set             = ls_status-set
      doc             = ls_status-doc
      tit             = ls_status-tit
      biv             = ls_status-biv
    EXCEPTIONS
      not_found       = 1
      unknown_version = 2
      OTHERS          = 3.

  cv_subrc = sy-subrc.
  IF cv_subrc <> 0.
    cv_message = |RS_CUA_INTERNAL_FETCH declined with sy-subrc { cv_subrc }|.
    RETURN.
  ENDIF.

  cv_result  = /ui2/cl_json=>serialize( data = ls_status ).
  cv_message = |GUI status pool of { ls_call-program } read in { lv_language }|.

ENDFORM.


*----------------------------------------------------------------------*
* CUA_WRITE
*----------------------------------------------------------------------*
FORM apply_status_source USING iv_params TYPE string
                         CHANGING cv_subrc   TYPE i
                                  cv_message TYPE string
                                  cv_result  TYPE string.

  DATA ls_call     TYPE ty_adt_status_call.
  DATA ls_status   TYPE ty_adt_status.
  DATA lv_language TYPE sy-langu.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params
                             CHANGING  data = ls_call ).

* The pool arrives as a JSON document nested in the operands, in the same
* shape CUA_FETCH produced. A caller therefore edits what it fetched and
* sends the whole pool back; there is no partial update here.
  /ui2/cl_json=>deserialize( EXPORTING json = ls_call-cua_data
                             CHANGING  data = ls_status ).

  PERFORM resolve_language USING ls_call-language
                           CHANGING lv_language.

  CALL FUNCTION 'RS_CUA_INTERNAL_WRITE'
    EXPORTING
      program         = CONV syrepid( to_upper( ls_call-program ) )
      language        = lv_language
      adm             = ls_status-adm
      state           = 'A'
    TABLES
      sta             = ls_status-sta
      fun             = ls_status-fun
      men             = ls_status-men
      mtx             = ls_status-mtx
      act             = ls_status-act
      but             = ls_status-but
      pfk             = ls_status-pfk
      set             = ls_status-set
      doc             = ls_status-doc
      tit             = ls_status-tit
      biv             = ls_status-biv
    EXCEPTIONS
      not_found       = 1
      unknown_version = 2
      OTHERS          = 3.

  cv_subrc = sy-subrc.
  IF cv_subrc <> 0.
    cv_message = |RS_CUA_INTERNAL_WRITE declined with sy-subrc { cv_subrc }|.
    RETURN.
  ENDIF.

  cv_message = |GUI status pool of { ls_call-program } written|.
  cv_result  = '{"written":true}'.

ENDFORM.


*----------------------------------------------------------------------*
* CUA_DELETE
*----------------------------------------------------------------------*
FORM drop_status USING iv_params TYPE string
                 CHANGING cv_subrc   TYPE i
                          cv_message TYPE string
                          cv_result  TYPE string.

  DATA ls_call TYPE ty_adt_status_id.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params
                             CHANGING  data = ls_call ).

  CALL FUNCTION 'RS_CUA_DELETE'
    EXPORTING
      report    = CONV syrepid( to_upper( ls_call-program ) )
    EXCEPTIONS
      not_found = 1
      OTHERS    = 2.

  cv_subrc = sy-subrc.
  IF cv_subrc <> 0.
    cv_message = |RS_CUA_DELETE declined with sy-subrc { cv_subrc }|.
    RETURN.
  ENDIF.

  cv_message = |GUI status pool of { ls_call-program } removed|.
  cv_result  = '{"deleted":true}'.

ENDFORM.


*----------------------------------------------------------------------*
* Shared helper
*----------------------------------------------------------------------*
* A SAP language key is one character wide. Callers send anything from an
* empty string to a two-letter ISO code, so the first character wins and
* an empty operand falls back to the logon language.
FORM resolve_language USING iv_language TYPE string
                      CHANGING cv_language TYPE sy-langu.

  IF iv_language IS INITIAL.
    cv_language = sy-langu.
    RETURN.
  ENDIF.

  cv_language = iv_language(1).

ENDFORM.
