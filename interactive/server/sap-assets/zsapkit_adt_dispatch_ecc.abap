FUNCTION zsapkit_adt_dispatch
  IMPORTING
    VALUE(iv_action) TYPE string
    VALUE(iv_params) TYPE string
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZSAPKIT_ADT_DISPATCH, the ECC 7.40 build.
*
* Same contract as the S/4HANA build in zsapkit_adt_dispatch.abap: the
* caller names the operation in IV_ACTION, packs the operands into
* IV_PARAMS as JSON, and reads the outcome from EV_SUBRC, EV_MESSAGE and
* EV_RESULT. Only the SAP-side plumbing differs, and only where the older
* release forces it.
*
* Two places where this build has to differ, and why.
*
*   1. The signature is written out above instead of being declared in a
*      *"Local Interface: comment block. The ADT REST endpoint the
*      installer posts to will not accept the comment-block form, so the
*      parameters have to be spelled into the source itself.
*   2. Screen containers and fields are typed with the table types the
*      Workbench module itself publishes, dycatt_tab and dyfatc_tab,
*      because the line type rpy_dyfield exists only on S/4HANA. Flow
*      logic rows are rpy_dyflow for the same reason.
*
* Actions understood here, and the Workbench call each one lands on.
*
*   DYNPRO_READ     read a screen         RPY_DYNPRO_READ
*   DYNPRO_INSERT   create a screen       not carried on this release
*   DYNPRO_DELETE   remove a screen       RPY_DYNPRO_DELETE
*   CUA_FETCH       read a GUI status     RS_CUA_INTERNAL_FETCH
*   CUA_WRITE       write a GUI status    RS_CUA_INTERNAL_WRITE
*   CUA_DELETE      remove a GUI status   RS_CUA_DELETE
*
* Field names inside EV_RESULT come straight from the ABAP component
* names, because /UI2/CL_JSON is called without a name-mapping mode.
* Renaming a component therefore renames a wire field, so treat the
* structures below as the published contract, not as private detail.

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

* A whole screen, typed the way this release types it. Every component
* here is the table type RPY_DYNPRO_READ itself declares, which is what
* keeps the module from being handed a line layout it cannot fill.
TYPES: BEGIN OF ty_adt_screen,
         header               TYPE rpy_dyhead,
         containers           TYPE dycatt_tab,
         fields_to_containers TYPE dyfatc_tab,
         flow_logic           TYPE STANDARD TABLE OF rpy_dyflow WITH DEFAULT KEY,
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
* it and RS_CUA_INTERNAL_WRITE reads it back out. Every line type is the
* one those two modules declare for the table parameter of the same name.
* That matters most for tit, whose parameter is typed rsmpe_titt: the
* shorter rsmpe_tit is refused at run time, on reads and writes alike.
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
         tit TYPE TABLE OF rsmpe_titt WITH DEFAULT KEY,
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
* DYNPRO_INSERT, refused on this release
*----------------------------------------------------------------------*
* Creating a screen is the one action not carried over. The flow logic
* rows this release uses, rpy_dyflow, carry a different internal layout
* from the S/4HANA rows, so the JSON a caller sends cannot be mapped onto
* them without a round of measurement against a live ECC system that has
* not been done. Refusing outright is the honest answer: it keeps the
* refusal on the wire as subrc 4, where a caller can see it, instead of
* letting a half-mapped screen reach the Workbench.
*
* The other five actions are unaffected and install cleanly alongside it.
FORM apply_screen_source USING iv_params TYPE string
                         CHANGING cv_subrc   TYPE i
                                  cv_message TYPE string
                                  cv_result  TYPE string.

  cv_subrc   = 4.
  cv_message = 'DYNPRO_INSERT is not carried on the ECC build of this dispatcher'.
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

* TR_KEY names the repository object the pool belongs to, and
* RS_CUA_INTERNAL_WRITE declares it without a default. Leaving it out is
* not caught by the compiler; the call dies with
* CX_SY_DYN_CALL_PARAM_MISSING instead. The key built here is the one for
* an executable program or a module pool. The main program of a function
* group needs a different object type, and the Workbench call turns this
* key down for it as invalid_data.
  DATA(ls_tr_key) = VALUE trkey( obj_type = 'PROG'
                                 obj_name = to_upper( ls_call-program )
                                 sub_type = 'CUAD'
                                 sub_name = to_upper( ls_call-program ) ).

  CALL FUNCTION 'RS_CUA_INTERNAL_WRITE'
    EXPORTING
      program         = CONV syrepid( to_upper( ls_call-program ) )
      language        = lv_language
      tr_key          = ls_tr_key
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
      invalid_data    = 2
      OTHERS          = 3.

  cv_subrc = sy-subrc.
  IF cv_subrc <> 0.
    cv_message = |RS_CUA_INTERNAL_WRITE declined with sy-subrc { cv_subrc }|.
    RETURN.
  ENDIF.

* The write replaces the stored pool, but SET PF-STATUS and SET TITLEBAR
* read a generated runtime load, and the write does not rebuild it.
* Without this step the program keeps showing its old status until
* someone regenerates it by hand in the Menu Painter.
  CALL FUNCTION 'RS_CUA_INTERNAL_GENERATE'
    EXPORTING
      program           = CONV syrepid( to_upper( ls_call-program ) )
    EXCEPTIONS
      not_found         = 1
      syntax_error      = 2
      generation_failed = 3
      OTHERS            = 4.

  cv_subrc = sy-subrc.
  IF cv_subrc <> 0.
    cv_message = |Pool written, but RS_CUA_INTERNAL_GENERATE declined with sy-subrc { cv_subrc }|.
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
