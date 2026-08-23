CLASS zcl_zsapkit_adt_dpc DEFINITION
  PUBLIC
  INHERITING FROM /iwbep/cl_mgw_abs_data
  CREATE PUBLIC.

*----------------------------------------------------------------------
* Data provider of the OData service ZSAPKIT_ADT_SRV.
*
* The service exists for one reason: to reach the two RFC-enabled
* function modules ZSAPKIT_ADT_DISPATCH and ZSAPKIT_ADT_TEXTPOOL from a
* caller that speaks HTTP but has no RFC stack of its own. Everything
* those modules can do is already decided inside them, so nothing is
* decided here. This class only unpacks the FunctionImport parameters,
* calls the module, and hands the three outputs back to the framework.
*
* Because of that, the mapping below is a contract, not a preference.
*
*   FunctionImport   function module           input parameters
*   --------------   -----------------------   -------------------------
*   Dispatch         ZSAPKIT_ADT_DISPATCH      IV_ACTION, IV_PARAMS
*   Textpool         ZSAPKIT_ADT_TEXTPOOL      IV_ACTION, IV_PROGRAM,
*                                              IV_LANGUAGE,
*                                              IV_TEXTPOOL_JSON
*
* The names on the right are the ones the model class publishes and the
* ones the client sends; renaming either side breaks the caller without
* a syntax error to warn anyone. The same holds for the three components
* of TY_OUTCOME below, which are the ABAP field names the model binds
* its complex-type properties to.
*
* Errors are not translated here either. A refusal raised inside the
* function module comes back as EV_SUBRC together with EV_MESSAGE and
* travels out through the normal payload, so the HTTP status stays 200
* and the caller reads the outcome from the body. Only an unknown action
* name - which means the model and this class have drifted apart - is
* answered with a technical exception.
*----------------------------------------------------------------------

  PUBLIC SECTION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~execute_action REDEFINITION.

  PROTECTED SECTION.
  PRIVATE SECTION.

    " Shape both function modules answer in. The component names are the
    " ABAP field names the model class binds to, so they are fixed.
    TYPES:
      BEGIN OF ty_outcome,
        ev_result  TYPE string,
        ev_subrc   TYPE i,
        ev_message TYPE string,
      END OF ty_outcome.

    METHODS param_value
      IMPORTING it_parameter    TYPE /iwbep/t_mgw_name_value_pair
                iv_name         TYPE string
      RETURNING VALUE(rv_value) TYPE string.

    METHODS run_dispatch
      IMPORTING it_parameter      TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_outcome) TYPE ty_outcome.

    METHODS run_textpool
      IMPORTING it_parameter      TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_outcome) TYPE ty_outcome.

ENDCLASS.


CLASS zcl_zsapkit_adt_dpc IMPLEMENTATION.

  METHOD /iwbep/if_mgw_appl_srv_runtime~execute_action.

    CASE iv_action_name.

      WHEN 'Dispatch'.
        DATA(ls_dispatch) = run_dispatch( it_parameter ).
        copy_data_to_ref( EXPORTING is_data = ls_dispatch
                          CHANGING  cr_data = er_data ).

      WHEN 'Textpool'.
        DATA(ls_textpool) = run_textpool( it_parameter ).
        copy_data_to_ref( EXPORTING is_data = ls_textpool
                          CHANGING  cr_data = er_data ).

      WHEN OTHERS.
        " The model published an action this class does not serve. That
        " is a deployment fault, not a caller fault, so it leaves as a
        " technical exception rather than as a payload with a subrc.
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_tech_exception.

    ENDCASE.

  ENDMETHOD.


  METHOD param_value.

    " The framework hands the FunctionImport parameters over as an
    " unordered name/value table, and a parameter the client left out is
    " simply absent rather than present and empty. Reading each one by
    " name keeps a missing parameter equal to an empty one, which is what
    " the function modules expect.
    READ TABLE it_parameter INTO DATA(ls_pair) WITH KEY name = iv_name.
    IF sy-subrc = 0.
      rv_value = ls_pair-value.
    ENDIF.

  ENDMETHOD.


  METHOD run_dispatch.

    DATA(lv_action) = param_value( it_parameter = it_parameter
                                   iv_name      = 'IV_ACTION' ).
    DATA(lv_params) = param_value( it_parameter = it_parameter
                                   iv_name      = 'IV_PARAMS' ).

    CALL FUNCTION 'ZSAPKIT_ADT_DISPATCH'
      EXPORTING
        iv_action  = lv_action
        iv_params  = lv_params
      IMPORTING
        ev_subrc   = rs_outcome-ev_subrc
        ev_message = rs_outcome-ev_message
        ev_result  = rs_outcome-ev_result.

  ENDMETHOD.


  METHOD run_textpool.

    DATA(lv_action)   = param_value( it_parameter = it_parameter
                                     iv_name      = 'IV_ACTION' ).
    DATA(lv_program)  = param_value( it_parameter = it_parameter
                                     iv_name      = 'IV_PROGRAM' ).
    DATA(lv_language) = param_value( it_parameter = it_parameter
                                     iv_name      = 'IV_LANGUAGE' ).
    DATA(lv_payload)  = param_value( it_parameter = it_parameter
                                     iv_name      = 'IV_TEXTPOOL_JSON' ).

    CALL FUNCTION 'ZSAPKIT_ADT_TEXTPOOL'
      EXPORTING
        iv_action        = lv_action
        iv_program       = lv_program
        iv_language      = lv_language
        iv_textpool_json = lv_payload
      IMPORTING
        ev_subrc         = rs_outcome-ev_subrc
        ev_message       = rs_outcome-ev_message
        ev_result        = rs_outcome-ev_result.

  ENDMETHOD.

ENDCLASS.
