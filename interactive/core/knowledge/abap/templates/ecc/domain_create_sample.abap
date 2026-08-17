*&---------------------------------------------------------------------*
*& Report  YCREATE_DOMA_ZMMD_MMINPTYPE
*&---------------------------------------------------------------------*
*& What    : Stages DDIC domain ZMMD_MMINPTYPE from ABAP code, for ECC
*&           stacks whose ADT surface exposes no DDIC endpoint.
*& How     : One DDIF_DOMA_PUT call, inactive version only. Activation
*&           and the transport decision stay with the developer in SE11.
*& Caution : DDIF_* is SAP-internal and unreleased - no upgrade
*&           guarantee. Leave the dry-run pass as the first run.
*&---------------------------------------------------------------------*
REPORT ycreate_doma_zmmd_mminptype.

CONSTANTS: gc_doma_name TYPE domname VALUE 'ZMMD_MMINPTYPE'.

PARAMETERS: p_dryrun AS CHECKBOX DEFAULT 'X'.

DATA: ls_doma_head TYPE dd01v,
      lt_domvalues TYPE STANDARD TABLE OF dd07v WITH DEFAULT KEY,
      ls_domvalue  TYPE dd07v,
      lv_next_pos  TYPE i.

*-- Domain attributes -------------------------------------------------*
ls_doma_head-domname    = gc_doma_name.
ls_doma_head-ddlanguage = sy-langu.
ls_doma_head-datatype   = 'CHAR'.
ls_doma_head-leng       = '000002'.
ls_doma_head-outputlen  = '000002'.
ls_doma_head-decimals   = '000000'.
ls_doma_head-valexi     = 'X'.        " a fixed-value list follows
ls_doma_head-ddtext     = 'Material Input Type'.

*-- Fixed-value list --------------------------------------------------*
DEFINE append_domvalue.
  lv_next_pos = lv_next_pos + 1.
  CLEAR ls_domvalue.
  ls_domvalue-domname    = gc_doma_name.
  ls_domvalue-ddlanguage = sy-langu.
  ls_domvalue-valpos     = lv_next_pos.
  ls_domvalue-domvalue_l = &1.
  ls_domvalue-ddtext     = &2.
  APPEND ls_domvalue TO lt_domvalues.
END-OF-DEFINITION.

"               code text
append_domvalue 'IL' 'Initial load'.
append_domvalue 'PP' 'Production posting'.
append_domvalue 'TR' 'Transfer posting'.

*-- Dry-run preview ---------------------------------------------------*
WRITE: / '=== YCREATE_DOMA_ZMMD_MMINPTYPE ===',
       / 'Domain     :', gc_doma_name,
       / 'Data type  :', ls_doma_head-datatype,
       / 'Length     :', ls_doma_head-leng,
       / 'Dry-run    :', p_dryrun.
ULINE.
WRITE: / 'Pos', 'Code', 'Description'.
LOOP AT lt_domvalues INTO ls_domvalue.
  WRITE: / ls_domvalue-valpos, ls_domvalue-domvalue_l, ls_domvalue-ddtext.
ENDLOOP.
ULINE.

IF p_dryrun IS NOT INITIAL.
  WRITE: / 'Dry-run is on - DDIC was left untouched.'.
  WRITE: / 'Uncheck p_dryrun and re-run to stage the domain.'.
  RETURN.
ENDIF.

*-- Stage the inactive version - activate in SE11 ---------------------*
CALL FUNCTION 'DDIF_DOMA_PUT'
  EXPORTING  name              = gc_doma_name
             dd01v_wa          = ls_doma_head
  TABLES     dd07v_tab         = lt_domvalues
  EXCEPTIONS doma_not_found    = 1
             name_inconsistent = 2
             doma_inconsistent = 3
             put_failure       = 4
             put_refused       = 5
             OTHERS            = 6.
IF sy-subrc <> 0.
  WRITE: / 'DDIF_DOMA_PUT refused the domain. sy-subrc =', sy-subrc.
  RETURN.
ENDIF.

WRITE: / 'Domain', gc_doma_name, 'staged as an inactive version.'.
WRITE: / 'Next steps: open SE11 -> activate -> assign to transport.'.
