*&---------------------------------------------------------------------*
*& Report  YCREATE_DTEL_ZMMD_MMINPTYPE
*&---------------------------------------------------------------------*
*& What   : Creates DDIC data element ZMMD_MMINPTYPE and binds it to
*&          domain ZMME_MMINPTYPE from ABAP code. Needed on ECC stacks
*&          that expose no ADT DDIC REST endpoint for data elements.
*& How    : One DDIF_DTEL_PUT call, which stores an inactive version.
*&          Activation and CTS assignment stay manual work in SE11.
*& Caution: The DDIF_* family is SAP-internal and unreleased - run it
*&          in a development client only, at your own risk. The
*&          referenced domain must already exist in active state.
*&---------------------------------------------------------------------*
REPORT ycreate_dtel_zmmd_mminptype.

CONSTANTS: gc_dtel   TYPE rollname VALUE 'ZMMD_MMINPTYPE',
           gc_domain TYPE domname  VALUE 'ZMME_MMINPTYPE'.

PARAMETERS: p_dryrun AS CHECKBOX DEFAULT 'X'.

DATA: ls_dtel_def TYPE dd04v.

*-- Definition: domain reference, label widths, label texts -----------*
ls_dtel_def-rollname   = gc_dtel.
ls_dtel_def-ddlanguage = sy-langu.
ls_dtel_def-domname    = gc_domain.    " data type comes from the domain
ls_dtel_def-headlen    = 55.           " heading width
ls_dtel_def-scrlen1    = 10.           " short label width
ls_dtel_def-scrlen2    = 20.           " medium label width
ls_dtel_def-scrlen3    = 40.           " long label width

ls_dtel_def-reptext    = 'Material Input Type'.
ls_dtel_def-scrtext_s  = 'InpType'.
ls_dtel_def-scrtext_m  = 'Input Type'.
ls_dtel_def-scrtext_l  = 'Material Input Type'.
ls_dtel_def-ddtext     = 'Material Input Type'.

*-- Show what would be sent, before anything is sent ------------------*
WRITE: / '=== ECC data element helper ===',
       / 'Data element :', gc_dtel,
       / 'Domain       :', gc_domain,
       / 'Dry-run      :', p_dryrun.
ULINE.
WRITE: / 'Heading      :', ls_dtel_def-reptext,
       / 'Short label  :', ls_dtel_def-scrtext_s,
       / 'Medium label :', ls_dtel_def-scrtext_m,
       / 'Long label   :', ls_dtel_def-scrtext_l.
ULINE.

IF p_dryrun = 'X'.
  WRITE: / 'Dry-run is on - DDIC was left untouched.'.
  WRITE: / 'Clear the checkbox and start again to write the element.'.
  RETURN.
ENDIF.

*-- Inactive PUT. SE11 does activation and transport. -----------------*
CALL FUNCTION 'DDIF_DTEL_PUT'
  EXPORTING  name              = gc_dtel
             dd04v_wa          = ls_dtel_def
  EXCEPTIONS dtel_not_found    = 1
             name_inconsistent = 2
             dtel_inconsistent = 3
             put_failure       = 4
             put_refused       = 5
             OTHERS            = 6.
IF sy-subrc <> 0.
  WRITE: / 'DDIF_DTEL_PUT wrote nothing. sy-subrc =', sy-subrc.
  RETURN.
ENDIF.

WRITE: / gc_dtel, 'is stored as an inactive version.'.
WRITE: / 'Finish in SE11: activate, then assign to a transport.'.
