CLASS zsapkit_demo_clas DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    CLASS-METHODS create
      IMPORTING
        iv_docid  TYPE zsapkit_demo_bdef-DocId
        iv_status TYPE zsapkit_demo_bdef-Status.
ENDCLASS.

CLASS zsapkit_demo_clas IMPLEMENTATION.
  METHOD create.
    MODIFY ENTITIES OF zsapkit_demo_bdef
      ENTITY zsapkit_demo_bdef
        CREATE FIELDS ( DocId Status )
        WITH VALUE #(
          ( %cid   = 'DOC_1'
            DocId  = iv_docid
            Status = iv_status ) )
      MAPPED DATA(mapped)
      FAILED DATA(failed)
      REPORTED DATA(reported).
  ENDMETHOD.
ENDCLASS.
