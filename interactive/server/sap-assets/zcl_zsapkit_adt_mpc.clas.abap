CLASS zcl_zsapkit_adt_mpc DEFINITION
  PUBLIC
  INHERITING FROM /iwbep/cl_mgw_push_abs_model
  CREATE PUBLIC.

*----------------------------------------------------------------------
* Model of the OData service ZSAPKIT_ADT_SRV.
*
* The service carries no entity sets at all. It publishes two actions,
* each of which is a thin front door to one RFC-enabled function module,
* so the whole model is two complex types and two POST actions.
*
*   action     returns           input parameters
*   --------   ---------------   ----------------------------------------
*   Dispatch   DispatchResult    IV_ACTION, IV_PARAMS
*   Textpool   TextpoolResult    IV_ACTION, IV_PROGRAM, IV_LANGUAGE,
*                                IV_TEXTPOOL_JSON
*
* Every name written above appears verbatim in the URLs the client
* builds and in the JSON it reads back, so none of them may be changed
* on one side alone. The same applies to the three properties both
* result types carry:
*
*   EV_RESULT    Edm.String   payload of the call, itself JSON text
*   EV_SUBRC     Edm.Int32    0 when the function module succeeded
*   EV_MESSAGE   Edm.String   prose for a human reader
*
* Those three are also the components the data provider fills, and the
* ABAP field name of each property is what ties the two together.
*
* Note the two shapes are declared separately even though they are
* identical today. They belong to two independent calls, and folding
* them into one shared type would mean that widening one call's answer
* silently widens the other's.
*
* Everything here is declared as Edm.String except the return code.
* Both function modules take JSON text in and give JSON text out, so
* the OData layer has nothing to gain from a richer type and would only
* add a second place where a payload can be rejected.
*----------------------------------------------------------------------

  PUBLIC SECTION.
    METHODS define REDEFINITION.

  PROTECTED SECTION.
  PRIVATE SECTION.

    METHODS declare_result_types
      RAISING /iwbep/cx_mgw_med_exception.

    METHODS declare_dispatch_action
      RAISING /iwbep/cx_mgw_med_exception.

    METHODS declare_textpool_action
      RAISING /iwbep/cx_mgw_med_exception.

    " Adds the three properties every result type carries. Takes the
    " type that was just created rather than its name, so the caller
    " keeps the one thing that differs between the two.
    METHODS add_outcome_properties
      IMPORTING ir_type TYPE REF TO /iwbep/if_mgw_odata_cmplx_type
      RAISING   /iwbep/cx_mgw_med_exception.

ENDCLASS.


CLASS zcl_zsapkit_adt_mpc IMPLEMENTATION.

  METHOD define.

    " The superclass seeds the model. Declaring anything before that
    " call would be building on an empty model.
    super->define( ).

    declare_result_types( ).
    declare_dispatch_action( ).
    declare_textpool_action( ).

  ENDMETHOD.


  METHOD declare_result_types.

    DATA lr_cmplx TYPE REF TO /iwbep/if_mgw_odata_cmplx_type.

    lr_cmplx = model->create_complex_type( iv_cplx_type_name = 'DispatchResult' ).
    add_outcome_properties( lr_cmplx ).

    lr_cmplx = model->create_complex_type( iv_cplx_type_name = 'TextpoolResult' ).
    add_outcome_properties( lr_cmplx ).

  ENDMETHOD.


  METHOD add_outcome_properties.

    " The property name is what the client reads out of the JSON; the
    " ABAP field name is what the data provider fills. They are kept
    " equal on purpose, so a mismatch between the two classes shows up
    " as an obviously wrong pair rather than as a silent empty field.
    ir_type->create_property(
      iv_property_name  = 'EV_RESULT'
      iv_abap_fieldname = 'EV_RESULT' )->set_type_edm_string( ).

    ir_type->create_property(
      iv_property_name  = 'EV_SUBRC'
      iv_abap_fieldname = 'EV_SUBRC' )->set_type_edm_int32( ).

    ir_type->create_property(
      iv_property_name  = 'EV_MESSAGE'
      iv_abap_fieldname = 'EV_MESSAGE' )->set_type_edm_string( ).

  ENDMETHOD.


  METHOD declare_dispatch_action.

    DATA lr_action TYPE REF TO /iwbep/if_mgw_odata_action.

    lr_action = model->create_action( iv_action_name = 'Dispatch' ).
    lr_action->set_return_complex_type( iv_complex_type_name = 'DispatchResult' ).

    " POST rather than GET although the call reads as often as it
    " writes: the operand JSON in IV_PARAMS is far too long to survive
    " as a query string, and half of the actions do change the system.
    lr_action->set_http_method( iv_method_name = 'POST' ).

    lr_action->create_input_parameter(
      iv_parameter_name = 'IV_ACTION'
      iv_abap_fieldname = 'IV_ACTION' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lr_action->create_input_parameter(
      iv_parameter_name = 'IV_PARAMS'
      iv_abap_fieldname = 'IV_PARAMS' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

  ENDMETHOD.


  METHOD declare_textpool_action.

    DATA lr_action TYPE REF TO /iwbep/if_mgw_odata_action.

    lr_action = model->create_action( iv_action_name = 'Textpool' ).
    lr_action->set_return_complex_type( iv_complex_type_name = 'TextpoolResult' ).
    lr_action->set_http_method( iv_method_name = 'POST' ).

    lr_action->create_input_parameter(
      iv_parameter_name = 'IV_ACTION'
      iv_abap_fieldname = 'IV_ACTION' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lr_action->create_input_parameter(
      iv_parameter_name = 'IV_PROGRAM'
      iv_abap_fieldname = 'IV_PROGRAM' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lr_action->create_input_parameter(
      iv_parameter_name = 'IV_LANGUAGE'
      iv_abap_fieldname = 'IV_LANGUAGE' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    " A whole text pool travels in this one parameter, which is the
    " other reason the action is a POST.
    lr_action->create_input_parameter(
      iv_parameter_name = 'IV_TEXTPOOL_JSON'
      iv_abap_fieldname = 'IV_TEXTPOOL_JSON' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

  ENDMETHOD.

ENDCLASS.
