*&---------------------------------------------------------------------*
*& Report ZSAPKIT_ADT_FLUSH_CACHE
*&---------------------------------------------------------------------*
*& Bench work on the OData service ZSAPKIT_ADT_SRV, which is how the
*& sapkit MCP server reaches the ADT bridge function modules over HTTP.
*&
*& Three jobs live here, each behind its own checkbox, and each of them
*& is safe to run on its own.
*&
*&   p_flush  drop the Gateway caches. Reach for this first whenever a
*&            model change refuses to show up: the runtime keeps the
*&            metadata it has already read, so the service goes on
*&            answering from the old picture until the caches are let go.
*&   p_reg    write the backend registration rows by hand. This is the
*&            exception, not the routine. Registration belongs in
*&            /IWBEP/REG_SERVICE, and only when that transaction is out
*&            of reach and the Backend Service tab of
*&            /IWFND/MAINT_SERVICE has come up empty is it worth putting
*&            the rows in directly.
*&   p_diag   call the data provider straight, with no HTTP in the way.
*&            When the service misbehaves this says which half is at
*&            fault: if the direct call is clean, the fault is in the
*&            Gateway hop rather than in the ABAP underneath it.
*&
*& Nothing here talks to the function modules through the service. That
*& is deliberate; a diagnostic that needs the thing it diagnoses cannot
*& tell you much.
*&---------------------------------------------------------------------*
REPORT zsapkit_adt_flush_cache.

* The registration rows point at four names. Keeping them here means a
* rename touches one place instead of nine.
CONSTANTS gc_model_name   TYPE string VALUE 'ZSAPKIT_ADT_MDL'.
CONSTANTS gc_service_name TYPE string VALUE 'ZSAPKIT_ADT_SRV'.
CONSTANTS gc_model_class  TYPE string VALUE 'ZCL_ZSAPKIT_ADT_MPC_EXT'.
CONSTANTS gc_dpc_class    TYPE string VALUE 'ZCL_ZSAPKIT_ADT_DPC_EXT'.
CONSTANTS gc_version      TYPE string VALUE '0001'.

PARAMETERS: p_flush TYPE abap_bool DEFAULT abap_true  AS CHECKBOX,
            p_reg   TYPE abap_bool DEFAULT abap_false AS CHECKBOX,
            p_diag  TYPE abap_bool DEFAULT abap_true  AS CHECKBOX.

START-OF-SELECTION.

  WRITE / 'sapkit OData gateway bench'.
  ULINE.

* Registration comes before the flush on purpose. Rows written into the
* registration tables are only picked up once the caches let go of the
* picture they were holding when the rows went in.
  IF p_reg = abap_true.
    PERFORM register_service_metadata.
    ULINE.
  ENDIF.

  IF p_flush = abap_true.
    PERFORM purge_gateway_caches.

  DATA lr_error  TYPE REF TO cx_root.
  DATA lv_class  TYPE string.
  DATA lo_first  TYPE REF TO object.
  DATA lo_second TYPE REF TO object.

  WRITE / 'Dropping gateway caches'.

* Two of the three are reached by name rather than by a static call.
* The classes behind them ship with later Gateway stacks than the one
* this report has to run on, and a static call to a class the system
* does not have is a syntax error at compile time, not a runtime miss.
* Naming them keeps the report loadable everywhere and turns an absent
* cache into a skipped line.
  TRY.
      CALL METHOD ('/IWBEP/CL_V2_CP_FACADE_FACTORY')=>('CREATE')
        RECEIVING rv_instance = lo_first.
      CALL METHOD lo_first->('CREATE_CONFIG_FACADE')
        RECEIVING rv_result = lo_second.
      CALL METHOD lo_second->('DELETE_ALL_MODEL_DATA_CACHE').
      WRITE / '[ok]   proxy model data cache dropped'.
    CATCH cx_root INTO lr_error.
      WRITE / '[skip] proxy model data cache not on this release'.
  ENDTRY.

* This one is static because it is the cache that matters and it has
* been present for as long as the service has. It takes no arguments.
  TRY.
      /iwfnd/cl_med_mdl_cache_persis=>clean_up( ).
      WRITE / '[ok]   metadata model cache cleaned'.
    CATCH cx_root INTO lr_error.
      WRITE: / '[fail] metadata model cache', lr_error->get_text( ).
  ENDTRY.

  TRY.
      CALL METHOD ('/IWBEP/CL_V4_SERVICE_ALIAS_FAC')=>('CREATE_FOR_RUNTIME')
        RECEIVING rv_instance = lo_first.
      CALL METHOD lo_first->('CLEAR_CACHE').
      WRITE / '[ok]   V4 service alias cache dropped'.
    CATCH cx_root INTO lr_error.
      WRITE / '[skip] V4 service alias cache not on this release'.
  ENDTRY.

ENDFORM.


FORM store_model_row USING iv_stamp TYPE tzntstmps.

  DATA ls_model TYPE /iwbep/i_mgw_ohd.
  DATA lv_subrc TYPE i.
  DATA lr_error TYPE REF TO cx_root.

  ls_model-technical_name   = gc_model_name.
  ls_model-version          = gc_version.
  ls_model-class_name       = gc_model_class.
  ls_model-created_by       = sy-uname.
  ls_model-created_timestmp = iv_stamp.
  ls_model-changed_by       = sy-uname.
  ls_model-changed_timestmp = iv_stamp.

  TRY.
      MODIFY /iwbep/i_mgw_ohd FROM ls_model.
      lv_subrc = sy-subrc.
      PERFORM report_row_write USING 'model' lv_subrc.
    CATCH cx_root INTO lr_error.
      WRITE: / '[fail] model row raised', lr_error->get_text( ).
  ENDTRY.

ENDFORM.


FORM store_service_row USING iv_stamp TYPE tzntstmps.

  DATA ls_service TYPE /iwbep/i_mgw_srh.
  DATA lv_subrc   TYPE i.
  DATA lr_error   TYPE REF TO cx_root.

  ls_service-technical_name   = gc_service_name.
  ls_service-version          = gc_version.
  ls_service-external_name    = gc_service_name.
  ls_service-class_name       = gc_dpc_class.
  ls_service-created_by       = sy-uname.
  ls_service-created_timestmp = iv_stamp.
  ls_service-changed_by       = sy-uname.
  ls_service-changed_timestmp = iv_stamp.
  ls_service-service_type     = '0'.

* The flag marks the service as customer-owned. Leaving it set would
* claim SAP ownership and change how the Gateway treats the rows.
  ls_service-is_sap_service   = abap_false.

  TRY.
      MODIFY /iwbep/i_mgw_srh FROM ls_service.
      lv_subrc = sy-subrc.
      PERFORM report_row_write USING 'service' lv_subrc.
    CATCH cx_root INTO lr_error.
      WRITE: / '[fail] service row raised', lr_error->get_text( ).
  ENDTRY.

ENDFORM.


FORM store_group_row.

  DATA ls_group TYPE /iwbep/i_mgw_srg.
  DATA lv_subrc TYPE i.
  DATA lr_error TYPE REF TO cx_root.

  ls_group-group_tech_name = gc_service_name.
  ls_group-group_version   = gc_version.
  ls_group-model_tech_name = gc_model_name.
  ls_group-model_version   = gc_version.

  TRY.
      MODIFY /iwbep/i_mgw_srg FROM ls_group.
      lv_subrc = sy-subrc.
      PERFORM report_row_write USING 'group' lv_subrc.
    CATCH cx_root INTO lr_error.
      WRITE: / '[fail] group row raised', lr_error->get_text( ).
  ENDTRY.

ENDFORM.


FORM report_row_write USING iv_what  TYPE string
                            iv_subrc TYPE i.

  IF iv_subrc = 0.
    WRITE: / '[ok]  ', iv_what, 'row stored'.
    RETURN.
  ENDIF.

  WRITE: / '[fail]', iv_what, 'row rejected, sy-subrc =', iv_subrc.

ENDFORM.


*&---------------------------------------------------------------------*
*& Cache flush
*&---------------------------------------------------------------------*
* Three caches sit between a model change and what a client sees, and
* they are cleared by three unrelated classes. Each one is attempted on
* its own so that a release without a given cache, or a user without the
* rights to clear it, does not stop the other two from being cleared.
FORM purge_gateway_caches.

  DATA lr_error TYPE REF TO cx_root.

  WRITE / 'Dropping gateway caches'.

  TRY.
      /iwbep/cl_v2_cp_facade_factory=>create(
        )->create_config_facade(
        )->delete_all_model_data_cache( ).
      WRITE / '[ok]   proxy model data cache dropped'.
    CATCH cx_root INTO lr_error.
      WRITE: / '[fail] proxy model data cache', lr_error->get_text( ).
  ENDTRY.

  TRY.
      /iwfnd/cl_med_mdl_cache_persis=>clean_up(
        iv_log_description = CONV #( 'Dropped by ZSAPKIT_ADT_FLUSH_CACHE' ) ).
      WRITE / '[ok]   metadata model cache cleaned'.
    CATCH cx_root INTO lr_error.
      WRITE: / '[fail] metadata model cache', lr_error->get_text( ).
  ENDTRY.

  TRY.
      /iwbep/cl_v4_service_alias_fac=>create_for_runtime(
        )->clear_cache( ).
      WRITE / '[ok]   V4 service alias cache dropped'.
    CATCH cx_root INTO lr_error.
      WRITE: / '[fail] V4 service alias cache', lr_error->get_text( ).
  ENDTRY.

ENDFORM.


*&---------------------------------------------------------------------*
*& Direct call on the data provider
*&---------------------------------------------------------------------*
* The probe reads the text pool of RSPARAM, a standard report that is on
* every system and that nothing here owns. A read costs nothing and
* changes nothing, which is what makes it usable as a heartbeat.
*
* Two things are being asked, in this order. Can the data provider be
* instantiated at all, and does a call reach the function module behind
* it without raising. A refusal from the function module itself is still
* a pass for this probe: the wiring carried the call either way.
FORM probe_data_provider.

  DATA lr_provider  TYPE REF TO zcl_zsapkit_adt_dpc_ext.
  DATA lt_parameter TYPE /iwbep/t_mgw_name_value_pair.
  DATA lr_payload   TYPE REF TO data.
  DATA lr_error     TYPE REF TO cx_root.

  TYPES: BEGIN OF ty_probe_answer,
           ev_result  TYPE string,
           ev_subrc   TYPE i,
           ev_message TYPE string,
         END OF ty_probe_answer.

  DATA ls_answer TYPE ty_probe_answer.

  WRITE / 'Calling the data provider directly'.

  TRY.
      CREATE OBJECT lr_provider.
      WRITE / '[ok]   data provider instantiated'.
    CATCH cx_root INTO lr_error.
      WRITE: / '[fail] data provider', lr_error->get_text( ).
*     Without an instance there is nothing left to ask.
      RETURN.
  ENDTRY.

  PERFORM add_parameter USING 'IV_ACTION' 'READ'
                        CHANGING lt_parameter.
  PERFORM add_parameter USING 'IV_PROGRAM' 'RSPARAM'
                        CHANGING lt_parameter.
  PERFORM add_parameter USING 'IV_LANGUAGE' 'EN'
                        CHANGING lt_parameter.
  PERFORM add_parameter USING 'IV_TEXTPOOL_JSON' ''
                        CHANGING lt_parameter.

* The runtime fills the answer through this reference, so it has to point
* at a structure shaped like the one the action returns.
  GET REFERENCE OF ls_answer INTO lr_payload.

  TRY.
      lr_provider->/iwbep/if_mgw_appl_srv_runtime~execute_action(
        EXPORTING iv_action_name = 'Textpool'
                  it_parameter   = lt_parameter
        IMPORTING er_data        = lr_payload ).
      WRITE / '[ok]   action returned without raising'.
    CATCH cx_root INTO lr_error.
      WRITE: / '[fail] action raised', lr_error->get_text( ).
  ENDTRY.

ENDFORM.


FORM add_parameter USING iv_name  TYPE string
                         iv_value TYPE string
                   CHANGING ct_parameter TYPE /iwbep/t_mgw_name_value_pair.

  DATA ls_pair TYPE /iwbep/s_mgw_name_value_pair.

  ls_pair-name  = iv_name.
  ls_pair-value = iv_value.
  APPEND ls_pair TO ct_parameter.

ENDFORM.
