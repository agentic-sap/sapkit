FUNCTION zsapkit_adt_textpool
  IMPORTING
    VALUE(iv_action)        TYPE string
    VALUE(iv_program)       TYPE string
    VALUE(iv_language)      TYPE string
    VALUE(iv_textpool_json) TYPE string
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZSAPKIT_ADT_TEXTPOOL, the ECC 7.40 build.
*
* Same contract and same behaviour as the S/4HANA build in
* zsapkit_adt_textpool.abap. One thing differs, and it is not logic: the
* signature is written out above instead of being declared in a
* *"Local Interface: comment block, because the ADT REST endpoint the
* installer posts to will not accept the comment-block form. The
* statements this module leans on, READ TEXTPOOL and INSERT TEXTPOOL,
* have been in the language far longer than either release, so nothing
* below has to be held back for the older one.
*
* Actions understood here.
*
*   READ            hand out the active pool of IV_LANGUAGE
*   WRITE           replace the pool and mark it active at once
*   WRITE_INACTIVE  replace the pool but leave it inactive, so the next
*                   activation of the owning program promotes it
*
* Both writes replace the whole pool of one language, so a caller that
* wants to change a single row reads everything, edits the row it cares
* about, and sends everything back.
*
* Row shape on the wire. IV_TEXTPOOL_JSON is an array of objects and a
* READ answers with the same array. Each object carries four members.
*
*   ID      I text symbol, S selection text, R program title, H heading
*   KEY     the three-character symbol number, or the field name for S
*   ENTRY   the text itself
*   LENGTH  the width the Workbench reserves for that entry
*
* Those names are the components of the DDIC structure TEXTPOOL, and
* /UI2/CL_JSON is called without a name-mapping mode, so the component
* names are the wire names. Do not rename them.

  DATA lt_rows     TYPE TABLE OF textpool.
  DATA lv_program  TYPE syrepid.
  DATA lv_language TYPE sy-langu.
  DATA lv_state    TYPE c LENGTH 1.

  CLEAR ev_subrc.
  CLEAR ev_message.
  CLEAR ev_result.

  lv_program = to_upper( iv_program ).

* A SAP language key is one character wide, so the first character of
* whatever the caller sent wins and an empty operand falls back to the
* logon language.
  IF iv_language IS INITIAL.
    lv_language = sy-langu.
  ELSE.
    lv_language = iv_language(1).
  ENDIF.

  TRY.
      CASE iv_action.

        WHEN 'READ'.
          READ TEXTPOOL lv_program INTO lt_rows LANGUAGE lv_language.

          ev_subrc = sy-subrc.
          IF ev_subrc <> 0.
*           An absent pool is an ordinary outcome, not a breakdown: a
*           program may simply carry no texts in this language. The empty
*           array keeps the answer shaped like every other read.
            ev_message = |No { lv_language } text pool to read on { lv_program }|.
            ev_result  = '[]'.
            RETURN.
          ENDIF.

          ev_result  = /ui2/cl_json=>serialize( data = lt_rows ).
          ev_message = |{ lines( lt_rows ) } text pool rows read from { lv_program }|.

        WHEN 'WRITE' OR 'WRITE_INACTIVE'.
*         Both writes run the same statement and differ only in the
*         version they land on, so they share one path and part company
*         at the end, where the answer has to say which one happened.
          IF iv_textpool_json IS INITIAL.
            ev_subrc   = 4.
            ev_message = |{ iv_action } needs the rows in IV_TEXTPOOL_JSON|.
            RETURN.
          ENDIF.

          IF iv_action = 'WRITE'.
            lv_state = 'A'.
          ELSE.
            lv_state = 'I'.
          ENDIF.

          /ui2/cl_json=>deserialize( EXPORTING json = iv_textpool_json
                                     CHANGING  data = lt_rows ).

          INSERT TEXTPOOL lv_program FROM lt_rows
                 LANGUAGE lv_language STATE lv_state.

          ev_subrc = sy-subrc.
          IF ev_subrc <> 0.
            ev_message = |INSERT TEXTPOOL declined { lv_program } with sy-subrc { ev_subrc }|.
            RETURN.
          ENDIF.

          IF lv_state = 'I'.
            ev_message = |{ lines( lt_rows ) } text pool rows staged on { lv_program }, awaiting activation|.
            ev_result  = '{"written":true,"state":"I"}'.
          ELSE.
            ev_message = |{ lines( lt_rows ) } text pool rows written to { lv_program }|.
            ev_result  = '{"written":true}'.
          ENDIF.

        WHEN OTHERS.
          ev_subrc   = 4.
          ev_message = |{ iv_action } is not a text pool action. Use READ, WRITE or WRITE_INACTIVE|.

      ENDCASE.

    CATCH cx_root INTO DATA(lx_unhandled).
*     Anything that escapes becomes a plain answer. A remote caller must
*     never get a short dump instead of a subrc.
      ev_subrc   = 8.
      ev_message = lx_unhandled->get_text( ).
  ENDTRY.

ENDFUNCTION.
