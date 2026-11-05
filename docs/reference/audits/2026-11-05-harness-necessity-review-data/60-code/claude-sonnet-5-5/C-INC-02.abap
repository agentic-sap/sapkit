CLASS zsapkit_demo_clas DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES ty_doc_id TYPE zsapkit_demo_bdef-DocId.
    TYPES ty_status TYPE zsapkit_demo_bdef-Status.

    CLASS-METHODS create_instance
      IMPORTING
        iv_doc_id        TYPE ty_doc_id
        iv_status        TYPE ty_status
      EXPORTING
        et_failed        TYPE RESPONSE FOR FAILED   zsapkit_demo_bdef
        et_reported      TYPE RESPONSE FOR REPORTED zsapkit_demo_bdef
      RETURNING
        VALUE(rv_success) TYPE abap_bool.

  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.



CLASS zsapkit_demo_clas IMPLEMENTATION.

  METHOD create_instance.
    DATA ls_failed   TYPE RESPONSE FOR FAILED   zsapkit_demo_bdef.
    DATA ls_reported TYPE RESPONSE FOR REPORTED zsapkit_demo_bdef.

    " External numbering: the key DocId is supplied by the caller,
    " so it must be part of %cid-independent %key and listed in the FIELDS.
    MODIFY ENTITIES OF zsapkit_demo_bdef
      ENTITY zsapkit_demo_bdef
        CREATE
          FIELDS ( DocId Status )
          WITH VALUE #( ( %cid   = 'CREATE_1'
                          DocId  = iv_doc_id
                          Status = iv_status ) )
      FAILED   ls_failed
      REPORTED ls_reported.

    et_failed   = ls_failed.
    et_reported = ls_reported.

    IF ls_failed IS INITIAL.
      COMMIT ENTITIES
        RESPONSE OF zsapkit_demo_bdef
        FAILED   DATA(ls_commit_failed)
        REPORTED DATA(ls_commit_reported).

      IF ls_commit_failed IS INITIAL.
        rv_success = abap_true.
      ELSE.
        et_failed   = ls_commit_failed.
        et_reported = ls_commit_reported.
        rv_success  = abap_false.
      ENDIF.
    ELSE.
      rv_success = abap_false.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
