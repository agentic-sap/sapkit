FUNCTION zsapkit_adt_ddic_activate
  IMPORTING
    VALUE(iv_type) TYPE string
    VALUE(iv_name) TYPE string
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZSAPKIT_ADT_DDIC_ACTIVATE - second half of the ECC DDIC write flow.
*
* The sibling write bridges (ZSAPKIT_ADT_DDIC_TABL / _DTEL / _DOMA) park
* their object in the inactive version and stop there. This module turns
* one such object active by handing it to the matching DDIF_*_ACTIVATE.
* Never installed on S/4HANA, where ADT activates DDIC objects itself.
*
* Import
*   iv_type   TABL, DTEL or DOMA - case does not matter
*   iv_name   DDIC object name, upper-cased here
*
* Export
*   ev_subrc   0 clean
*              4 iv_type outside the accepted set
*              8 unexpected exception
*              1 / 2 / 3 the exception raised by DDIF_*_ACTIVATE
*              other the activation return code DDIC handed back
*   ev_message readable detail for whichever of those happened
*   ev_result  { "activated": <bool>, "type": "<TYPE>", "name": "<NAME>", "rc": <n> }
*
* Two failure channels, kept apart on purpose. An EXCEPTIONS hit means the
* standard module refused to run at all; a non-zero RC means it ran and
* graded the result as not fully activated. Collapsing them would hide
* which of the two happened.
*
* Fixed call attributes - AUTH_CHK asks for the regular authority check,
* PRID -1 keeps the activation log dictionary-internal rather than opening
* a protocol screen. The table flavour additionally requests an external
* commit; the data element and domain flavours do not take that parameter.

  DATA lv_kind    TYPE string.
  DATA lv_obj     TYPE ddobjname.
  DATA lv_raised  TYPE sy-subrc.
  DATA lv_act_rc  TYPE sy-subrc.
  DATA lr_failure TYPE REF TO cx_root.

  CLEAR: ev_subrc, ev_message, ev_result.

  lv_kind = to_upper( iv_type ).
  lv_obj  = to_upper( iv_name ).

  IF lv_kind <> 'TABL' AND lv_kind <> 'DTEL' AND lv_kind <> 'DOMA'.
    ev_subrc   = 4.
    ev_message = |iv_type { iv_type } is not one of TABL, DTEL, DOMA|.
    RETURN.
  ENDIF.

  TRY.
      IF lv_kind = 'TABL'.
        CALL FUNCTION 'DDIF_TABL_ACTIVATE'
          EXPORTING
            name        = lv_obj
            auth_chk    = 'X'
            prid        = -1
            excommit    = 'X'
          IMPORTING
            rc          = lv_act_rc
          EXCEPTIONS
            not_found   = 1
            put_failure = 2
            OTHERS      = 3.
        lv_raised = sy-subrc.

      ELSEIF lv_kind = 'DTEL'.
        CALL FUNCTION 'DDIF_DTEL_ACTIVATE'
          EXPORTING
            name        = lv_obj
            auth_chk    = 'X'
            prid        = -1
          IMPORTING
            rc          = lv_act_rc
          EXCEPTIONS
            not_found   = 1
            put_failure = 2
            OTHERS      = 3.
        lv_raised = sy-subrc.

      ELSE.
        CALL FUNCTION 'DDIF_DOMA_ACTIVATE'
          EXPORTING
            name        = lv_obj
            auth_chk    = 'X'
            prid        = -1
          IMPORTING
            rc          = lv_act_rc
          EXCEPTIONS
            not_found   = 1
            put_failure = 2
            OTHERS      = 3.
        lv_raised = sy-subrc.
      ENDIF.

*     Channel one - the standard module never got as far as activating.
      IF lv_raised <> 0.
        ev_subrc   = lv_raised.
        ev_message = |DDIF_{ lv_kind }_ACTIVATE raised sy-subrc={ lv_raised }| &&
                     | (1 = not_found, 2 = put_failure)|.
        RETURN.
      ENDIF.

*     Channel two - it ran, and RC carries the verdict.
      IF lv_act_rc = 0.
        ev_subrc   = 0.
        ev_message = |{ lv_kind } { lv_obj } is active|.
        ev_result  = |\{"activated":true,"type":"{ lv_kind }","name":"{ lv_obj }","rc":0\}|.
      ELSE.
        ev_subrc   = lv_act_rc.
        ev_message = |{ lv_kind } { lv_obj } is not cleanly activated, DDIC returned rc={ lv_act_rc }|.
        ev_result  = |\{"activated":false,"type":"{ lv_kind }","name":"{ lv_obj }","rc":{ lv_act_rc }\}|.
      ENDIF.

    CATCH cx_root INTO lr_failure.
      ev_subrc   = 8.
      ev_message = lr_failure->get_text( ).
  ENDTRY.

ENDFUNCTION.
