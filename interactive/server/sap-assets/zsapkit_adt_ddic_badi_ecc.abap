FUNCTION zsapkit_adt_ddic_badi
  IMPORTING
    VALUE(iv_badi_definition) TYPE string
    VALUE(iv_customer_only)   TYPE string DEFAULT 'X'
    VALUE(iv_active_only)     TYPE string DEFAULT 'X'
    VALUE(iv_include_methods) TYPE string DEFAULT 'X'
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZSAPKIT_ADT_DDIC_BADI - read-only discovery of the implementations
* behind one classic BAdI definition, for ECC 7.40 and later.
*
* About the name. DDIC here marks the ECC-bridge family this module
* belongs to, alongside DDIC_TABL / DTEL / DOMA / ACTIVATE. A BAdI is not
* a DDIC object, but the answer is assembled from DDIC-managed tables of
* the SXS_ / SXC_ family, so the family name is not a lie either.
*
* What is covered
*   Classic BAdI - the SE18 / SE19 kind reached through
*   CL_EXITHANDLER=>GET_INSTANCE. Fully covered.
*   Kernel BAdI - the SE20 / enhancement-spot kind. NOT covered. Reading
*   it needs a CL_ENH_FACTORY walk over the ENHO repository, which this
*   module does not do. A definition that is not in SXS_ATTR comes back
*   with kind "unknown" and an empty implementation list, and ev_subrc
*   stays 0 - "no classic BAdI by that name" is an answer, not a failure.
*
* Tables and how they join
*   SXS_ATTR    definition header. INSTANCE_GENERATION and
*               IS_FILTER_DEPENDEND are read through ASSIGN COMPONENT
*               because this structure does vary between kernels.
*   SXS_INTER   definition to interface name.
*   SXC_EXIT    the definition-to-implementation link, one row per filter
*               value, hence the DISTINCT.
*   SXC_ATTR    implementation header. Carries the active flag and
*               nothing that points back at a definition.
*   SXC_CLASS   implementation to implementing class. Joined on
*               INTER_NAME, not on the definition name.
*   SXC_IMPSWH  the method names an implementation actually redefines.
*
* Import
*   iv_badi_definition  definition name, upper-cased here
*   iv_customer_only    X keeps only Z* and Y* implementations
*   iv_active_only      X drops implementations that are not active
*   iv_include_methods  X fills methods_redefined per implementation
*
* Export
*   ev_subrc   0 answered, 4 caller error, 8 unexpected exception
*   ev_message readable detail
*   ev_result  JSON document, lower-case field names, initial fields
*              dropped, shaped as
*              { "badi_definition": "ME_PROCESS_PO_CUST",
*                "kind": "classic",
*                "interface": "IF_EX_ME_PROCESS_PO_CUST",
*                "multi_use": true,
*                "filter_dependent": false,
*                "implementations": [
*                  { "impl_name": "ZIM_PO_VALIDATE",
*                    "impl_class": "ZCL_IM_ME_PROCESS_PO_VAL",
*                    "active": true,
*                    "package": "ZMM_PO",
*                    "methods_redefined": [ "PROCESS_HEADER" ] } ] }

  TYPES: BEGIN OF ty_badi_impl,
           impl_name         TYPE c LENGTH 30,
           impl_class        TYPE c LENGTH 30,
           active            TYPE abap_bool,
           package           TYPE devclass,
           methods_redefined TYPE STANDARD TABLE OF string WITH DEFAULT KEY,
         END OF ty_badi_impl.

  TYPES: BEGIN OF ty_badi_out,
           badi_definition  TYPE string,
           kind             TYPE string,
           interface        TYPE string,
           multi_use        TYPE abap_bool,
           filter_dependent TYPE abap_bool,
           implementations  TYPE STANDARD TABLE OF ty_badi_impl WITH DEFAULT KEY,
         END OF ty_badi_out.

  DATA ls_out       TYPE ty_badi_out.
  DATA ls_impl      TYPE ty_badi_impl.
  DATA lv_def       TYPE c LENGTH 30.
  DATA ls_sxs_attr  TYPE sxs_attr.
  DATA lt_impl      TYPE STANDARD TABLE OF sxc_exit-imp_name WITH DEFAULT KEY.
  DATA lv_impl      TYPE sxc_exit-imp_name.
  DATA lv_interface TYPE sxs_inter-inter_name.
  DATA lv_class     TYPE sxc_class-imp_class.
  DATA lv_active    TYPE sxc_attr-active.
  DATA lv_package   TYPE devclass.
  DATA lt_methods   TYPE STANDARD TABLE OF sxc_impswh-metho_name WITH DEFAULT KEY.
  DATA lv_method    TYPE sxc_impswh-metho_name.
  DATA lv_method_tx TYPE string.
  DATA lr_failure   TYPE REF TO cx_root.
  FIELD-SYMBOLS <lv_instgen> TYPE any.
  FIELD-SYMBOLS <lv_filtdep> TYPE any.

  CLEAR: ev_subrc, ev_message, ev_result.

  IF iv_badi_definition IS INITIAL.
    ev_subrc   = 4.
    ev_message = 'iv_badi_definition is required'.
    RETURN.
  ENDIF.

  lv_def                 = to_upper( iv_badi_definition ).
  ls_out-badi_definition = lv_def.
  ls_out-kind            = 'unknown'.

  TRY.
      SELECT SINGLE * FROM sxs_attr INTO ls_sxs_attr
        WHERE exit_name = lv_def.

      IF sy-subrc <> 0.
*       Not a classic definition. Say so plainly and leave kind at
*       "unknown" - this is not an error condition.
        ev_subrc   = 0.
        ev_message = |BAdI def { lv_def } not in SXS_ATTR (classic). | &&
                     |Kernel BAdI lookup not implemented|.

      ELSE.
        ls_out-kind = 'classic'.

*       Both flags are read defensively - the header layout is one of the
*       few things that genuinely differs between kernels, and a missing
*       component must not dump the whole read.
        ASSIGN COMPONENT 'INSTANCE_GENERATION' OF STRUCTURE ls_sxs_attr TO <lv_instgen>.
        IF sy-subrc = 0 AND <lv_instgen> = 'M'.
          ls_out-multi_use = abap_true.
        ENDIF.

        ASSIGN COMPONENT 'IS_FILTER_DEPENDEND' OF STRUCTURE ls_sxs_attr TO <lv_filtdep>.
        IF sy-subrc = 0 AND <lv_filtdep> = 'X'.
          ls_out-filter_dependent = abap_true.
        ENDIF.

*       The interface name is the join key for everything below, so it is
*       fetched once and reused.
        SELECT SINGLE inter_name FROM sxs_inter INTO lv_interface
          WHERE exit_name = lv_def.
        IF sy-subrc = 0.
          ls_out-interface = lv_interface.
        ENDIF.

*       SXC_EXIT holds one row per filter value, so the same
*       implementation can appear several times. DISTINCT folds them.
        SELECT DISTINCT imp_name FROM sxc_exit INTO TABLE lt_impl
          WHERE exit_name = lv_def.

        LOOP AT lt_impl INTO lv_impl.

          IF iv_customer_only = abap_true.
            IF lv_impl NP 'Z*' AND lv_impl NP 'Y*'.
              CONTINUE.
            ENDIF.
          ENDIF.

*         Cleared first so an implementation without an SXC_ATTR row
*         cannot inherit the previous one's state.
          CLEAR lv_active.
          SELECT SINGLE active FROM sxc_attr INTO lv_active
            WHERE imp_name = lv_impl AND version = 'A'.
          IF sy-subrc <> 0.
            SELECT SINGLE active FROM sxc_attr INTO lv_active
              WHERE imp_name = lv_impl.
          ENDIF.

          IF iv_active_only = abap_true AND lv_active <> 'X'.
            CONTINUE.
          ENDIF.

          CLEAR ls_impl.
          ls_impl-impl_name = lv_impl.
          IF lv_active = 'X'.
            ls_impl-active = abap_true.
          ENDIF.

*         Implementing class, and the package that owns it.
          IF lv_interface IS NOT INITIAL.
            SELECT SINGLE imp_class FROM sxc_class INTO lv_class
              WHERE imp_name   = lv_impl
                AND inter_name = lv_interface.
            IF sy-subrc = 0.
              ls_impl-impl_class = lv_class.

              SELECT SINGLE devclass FROM tadir INTO lv_package
                WHERE pgmid = 'R3TR' AND object = 'CLAS'
                  AND obj_name = lv_class.
              IF sy-subrc = 0.
                ls_impl-package = lv_package.
              ENDIF.
            ENDIF.
          ENDIF.

*         Redefined methods, only when asked for.
          IF iv_include_methods = abap_true AND lv_interface IS NOT INITIAL.
            CLEAR lt_methods.
            SELECT metho_name FROM sxc_impswh INTO TABLE lt_methods
              WHERE imp_name   = lv_impl
                AND inter_name = lv_interface.

            LOOP AT lt_methods INTO lv_method.
              lv_method_tx = lv_method.
              APPEND lv_method_tx TO ls_impl-methods_redefined.
            ENDLOOP.
          ENDIF.

          APPEND ls_impl TO ls_out-implementations.
        ENDLOOP.

        ev_subrc   = 0.
        ev_message = |BAdI { lv_def }: { lines( ls_out-implementations ) } impl(s), | &&
                     |kind={ ls_out-kind }|.
      ENDIF.

*     Classic or not, the caller gets a document. One place builds it.
      ev_result = /ui2/cl_json=>serialize(
        data        = ls_out
        compress    = abap_true
        pretty_name = /ui2/cl_json=>pretty_mode-low_case ).

    CATCH cx_root INTO lr_failure.
      ev_subrc   = 8.
      ev_message = lr_failure->get_text( ).
  ENDTRY.

ENDFUNCTION.
