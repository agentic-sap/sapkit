FUNCTION zsapkit_adt_textpool.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(IV_ACTION) TYPE  STRING
*"     VALUE(IV_PROGRAM) TYPE  STRING
*"     VALUE(IV_LANGUAGE) TYPE  STRING
*"     VALUE(IV_TEXTPOOL_JSON) TYPE  STRING
*"  EXPORTING
*"     VALUE(EV_SUBRC) TYPE  I
*"     VALUE(EV_MESSAGE) TYPE  STRING
*"     VALUE(EV_RESULT) TYPE  STRING
*"----------------------------------------------------------------------
* Reads and writes the text pool of one ABAP program.
*
* Text elements are not addressed one at a time by the ABAP statements
* underneath. READ TEXTPOOL hands out the whole pool of one language and
* INSERT TEXTPOOL replaces the whole pool of one language, so a caller
* that wants to change a single row reads everything, edits the row it
* cares about, and sends everything back. That is why IV_TEXTPOOL_JSON
* always carries the complete set.
*
* Actions understood here.
*
*   READ            hand out the active pool of IV_LANGUAGE
*   WRITE           replace the pool and mark it active at once
*   WRITE_INACTIVE  replace the pool but leave it inactive, so the next
*                   activation of the owning program promotes it
*
* WRITE_INACTIVE is the one to reach for while a freshly created program
* is still inactive. Registering many elements one activation at a time
* leaves the pool and the program out of step with each other for as long
* as the run takes; staging them instead lets every text type, the title
* R as much as the symbols I, the selection texts S and the list headings
* H, go live in the same activation as the program itself.
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
*
* EV_SUBRC is 0 when the statement went through, 4 when this module
* refused the request on its own, and 8 when an exception reached the
* outer handler. EV_MESSAGE is prose for a human reader; never parse it.
*----------------------------------------------------------------------

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
