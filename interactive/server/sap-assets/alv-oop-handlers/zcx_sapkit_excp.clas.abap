CLASS zcx_sapkit_excp DEFINITION
  PUBLIC
  INHERITING FROM cx_static_check
  FINAL
  CREATE PUBLIC.

*----------------------------------------------------------------------
* The one exception the ALV helpers throw.
*
* Its job is to take whatever account of a failure happens to be at hand
* - a sentence the caller wrote, an exception someone else raised, or
* nothing but the system fields left over from a MESSAGE statement - and
* turn all three into the same T100 message, so a caller only ever has
* to catch one type and read one text.
*
* The awkward part is the fitting. A T100 message holds at most four
* variables and each of those holds fifty characters, while GET_TEXT of
* an arbitrary exception is a string of any length. RAISE therefore cuts
* the text into four blocks of fifty and carries the blocks in ATTR1 to
* ATTR4 of the message key, which is also why a long text loses its tail
* at two hundred characters.
*
* Two names below are fixed and cannot be chosen freely:
*
*   ZCX_SAPKIT_EXCP  the constant carrying the class's own name is the
*                    default message key the Workbench looks for, so it
*                    always tracks the class name
*   S_UNIFIED_CON    the message class the two keys point into; it has to
*                    exist in the system this class is installed in
*
* NO_DATA is offered for the most common refusal so callers do not each
* invent their own wording for it.
*----------------------------------------------------------------------

  PUBLIC SECTION.

    INTERFACES if_t100_message.
    INTERFACES if_t100_dyn_msg.

    " Nothing came back for the requested selection.
    CONSTANTS:
      BEGIN OF no_data,
        msgid TYPE symsgid VALUE 'S_UNIFIED_CON',
        msgno TYPE symsgno VALUE '013',
        attr1 TYPE scx_attrname VALUE '',
        attr2 TYPE scx_attrname VALUE '',
        attr3 TYPE scx_attrname VALUE '',
        attr4 TYPE scx_attrname VALUE '',
      END OF no_data.

    " Default key. Message 000 is the free-text carrier: its four
    " placeholders are filled from the four MSGV attributes.
    CONSTANTS:
      BEGIN OF zcx_sapkit_excp,
        msgid TYPE symsgid VALUE 'S_UNIFIED_CON',
        msgno TYPE symsgno VALUE '000',
        attr1 TYPE scx_attrname VALUE 'MSGV1',
        attr2 TYPE scx_attrname VALUE 'MSGV2',
        attr3 TYPE scx_attrname VALUE 'MSGV3',
        attr4 TYPE scx_attrname VALUE 'MSGV4',
      END OF zcx_sapkit_excp.

    " The four blocks of the cut-up text, readable without going through
    " GET_TEXT again.
    CLASS-DATA mv_errmsg TYPE char255.
    CLASS-DATA mv_errmsg2 TYPE char255.
    CLASS-DATA mv_errmsg3 TYPE char255.
    CLASS-DATA mv_errmsg4 TYPE char255.

    METHODS constructor
      IMPORTING
        !textid     LIKE if_t100_message=>t100key OPTIONAL
        !previous   LIKE previous OPTIONAL
        !mv_errmsg  TYPE char255 OPTIONAL
        !mv_errmsg2 TYPE char255 OPTIONAL
        !mv_errmsg3 TYPE char255 OPTIONAL
        !mv_errmsg4 TYPE char255 OPTIONAL.

    " Preferred way in. Give it a sentence, or an exception to read a
    " sentence out of, or neither.
    CLASS-METHODS raise
      IMPORTING
        !iv_message     TYPE csequence OPTIONAL
        VALUE(io_error) TYPE REF TO cx_root OPTIONAL
      RAISING
        zcx_sapkit_excp.

  PROTECTED SECTION.
  PRIVATE SECTION.

    " Two hundred characters seen as the four message variables.
    TYPES:
      BEGIN OF ty_msg_parts,
        part1 TYPE symsgv,
        part2 TYPE symsgv,
        part3 TYPE symsgv,
        part4 TYPE symsgv,
      END OF ty_msg_parts.

    " Walks the PREVIOUS chain and answers with the first text found.
    CLASS-METHODS first_text
      IMPORTING VALUE(io_error) TYPE REF TO cx_root
      RETURNING VALUE(rv_text)  TYPE string.

ENDCLASS.


CLASS zcx_sapkit_excp IMPLEMENTATION.

  METHOD constructor.

    super->constructor( previous = previous ).

    me->mv_errmsg  = mv_errmsg.
    me->mv_errmsg2 = mv_errmsg2.
    me->mv_errmsg3 = mv_errmsg3.
    me->mv_errmsg4 = mv_errmsg4.

    " The inherited TEXTID addresses an OTR text, which is not how this
    " class describes itself. Clearing it and setting T100KEY instead is
    " what makes GET_TEXT read the T100 message.
    CLEAR me->textid.
    IF textid IS INITIAL.
      if_t100_message~t100key = zcx_sapkit_excp.
    ELSE.
      if_t100_message~t100key = textid.
    ENDIF.

  ENDMETHOD.


  METHOD first_text.

    WHILE rv_text IS INITIAL AND io_error IS NOT INITIAL.
      rv_text = io_error->get_text( ).
      io_error = io_error->previous.
    ENDWHILE.

  ENDMETHOD.


  METHOD raise.

    DATA ls_key   TYPE scx_t100key.
    DATA ls_parts TYPE ty_msg_parts.
    DATA lv_text  TYPE string.

    " What the caller said outranks what an earlier exception said, and
    " both outrank the system fields.
    lv_text = iv_message.
    IF lv_text IS INITIAL.
      lv_text = first_text( io_error ).
    ENDIF.

    IF lv_text IS INITIAL.
      " Nothing was handed over at all, so the last message the system
      " raised is the only account of the failure that exists. Its own
      " key is kept, because that key means something to whoever reads
      " the short dump or the log.
      MESSAGE ID sy-msgid TYPE 'E' NUMBER sy-msgno
              WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_text.
      ls_key-msgid = sy-msgid.
      ls_key-msgno = sy-msgno.
    ELSE.
      ls_key-msgid = zcx_sapkit_excp-msgid.
      ls_key-msgno = zcx_sapkit_excp-msgno.
    ENDIF.

    " Character assignment to a flat character structure is the cut: the
    " text is laid across the four fifty-character blocks in order.
    ls_parts = lv_text.
    ls_key-attr1 = ls_parts-part1.
    ls_key-attr2 = ls_parts-part2.
    ls_key-attr3 = ls_parts-part3.
    ls_key-attr4 = ls_parts-part4.

    RAISE EXCEPTION TYPE zcx_sapkit_excp
      EXPORTING
        textid     = ls_key
        mv_errmsg  = CONV #( ls_key-attr1 )
        mv_errmsg2 = CONV #( ls_key-attr2 )
        mv_errmsg3 = CONV #( ls_key-attr3 )
        mv_errmsg4 = CONV #( ls_key-attr4 ).

  ENDMETHOD.

ENDCLASS.
