REPORT zdemo_cov_oo.

CLASS zcl_demo_worker DEFINITION DEFERRED.

INTERFACE zif_demo_runner.
  METHODS run.
ENDINTERFACE.

CLASS zcl_demo_worker DEFINITION.
  PUBLIC SECTION.
    INTERFACES zif_demo_runner.
    CLASS-DATA gv_instances TYPE i.
    CLASS-METHODS factory RETURNING VALUE(rr_worker) TYPE REF TO zcl_demo_worker.
    METHODS constructor.
  PROTECTED SECTION.
    DATA mv_state TYPE i.
  PRIVATE SECTION.
    METHODS reset.
ENDCLASS.

CLASS zcl_demo_worker IMPLEMENTATION.
  METHOD factory.
    CREATE OBJECT rr_worker.
  ENDMETHOD.

  METHOD constructor.
    mv_state = 0.
  ENDMETHOD.

  METHOD reset.
    CLEAR mv_state.
    RETURN.
  ENDMETHOD.

  METHOD zif_demo_runner~run.
    DATA lr_worker TYPE REF TO zcl_demo_worker.
    DATA lr_box TYPE REF TO data.
    lr_worker = zcl_demo_worker=>factory( ).
    lr_worker->reset( ).
    CREATE DATA lr_box TYPE REF TO i.
  ENDMETHOD.
ENDCLASS.
