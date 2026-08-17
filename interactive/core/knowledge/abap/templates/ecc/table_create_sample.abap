*&---------------------------------------------------------------------*
*& Report  YCREATE_ZMMT44021
*&---------------------------------------------------------------------*
*& What    : Builds transparent table ZMMT44021 (Raw Material Input
*&           History) from ABAP code, for ECC stacks whose ADT surface
*&           offers no Dictionary endpoint to create it with.
*& How     : A single DDIF_TABL_PUT call. That stores the inactive
*&           version and stops there. Activation, package and
*&           transport assignment stay a manual SE11 step.
*& Caution : The DDIF_* family is SAP-internal and unreleased.
*&           No API contract covers it; run it knowing that.
*&---------------------------------------------------------------------*
REPORT ycreate_zmmt44021.

CONSTANTS: gc_table TYPE tabname VALUE 'ZMMT44021'.

PARAMETERS: p_dryrun AS CHECKBOX DEFAULT 'X'.

*---------------------------------------------------------------------*
* Three work areas feed the PUT: DD02V holds the table attributes,
* DD09L the technical settings, DD03P one row per field.
*---------------------------------------------------------------------*
DATA: ls_head  TYPE dd02v,
      ls_tech  TYPE dd09l,
      lt_field TYPE STANDARD TABLE OF dd03p,
      ls_field TYPE dd03p,
      lv_seq   TYPE i.

*-- Table attributes ---------------------------------------------------
ls_head-tabname    = gc_table.
ls_head-ddlanguage = sy-langu.
ls_head-tabclass   = 'TRANSP'.    " transparent table
ls_head-mainflag   = 'X'.         " display/maintenance allowed
ls_head-contflag   = 'A'.         " delivery class A - application data
ls_head-exclass    = '1'.         " enhancement category: not enhanceable
ls_head-ddtext     = 'Raw Material Input History'.

*-- Technical settings -------------------------------------------------
ls_tech-tabname  = gc_table.
ls_tech-as4local = 'A'.
ls_tech-tabkat   = '0'.        " size category 0
ls_tech-tabart   = 'APPL1'.    " data class: transaction data
ls_tech-bufallow = 'N'.        " buffering not allowed

*-- Field list ---------------------------------------------------------
* MANDT leads and is flagged as key: the client field is what makes the
* table client-dependent. Every field takes its type from a data element
* through ROLLNAME rather than spelling out a primitive type inline.
*---------------------------------------------------------------------*
DEFINE add_field.
  lv_seq = lv_seq + 1.
  CLEAR ls_field.
  ls_field-tabname    = gc_table.
  ls_field-fieldname  = &1.
  ls_field-keyflag    = &2.
  ls_field-rollname   = &3.
  ls_field-position   = lv_seq.
  ls_field-ddlanguage = sy-langu.
  APPEND ls_field TO lt_field.
END-OF-DEFINITION.

"         field name     key  data element
add_field 'MANDT'        'X'  'MANDT'.
add_field 'DOC_NO'       'X'  'BELNR_D'.
add_field 'ITEM_NO'      'X'  'POSNR'.
add_field 'MATNR'        ' '  'MATNR'.
add_field 'WERKS'        ' '  'WERKS_D'.
add_field 'LGORT'        ' '  'LGORT_D'.
add_field 'CHARG'        ' '  'CHARG_D'.
add_field 'MENGE'        ' '  'MENGE_D'.
add_field 'MEINS'        ' '  'MEINS'.
add_field 'BUDAT'        ' '  'BUDAT'.
add_field 'USNAM'        ' '  'USNAM'.
add_field 'CPUDT'        ' '  'CPUDT'.
add_field 'CPUTM'        ' '  'CPUTM'.

*---------------------------------------------------------------------*
* Preview, so the layout can be read before anything reaches the DDIC
*---------------------------------------------------------------------*
WRITE: / 'YCREATE_ZMMT44021 - table generator',
       / 'Target table :', gc_table,
       / 'Dry run      :', p_dryrun,
       / 'Fields       :', lines( lt_field ).
ULINE.
WRITE: / 'Pos', 'Field', 'Key', 'Data element'.
LOOP AT lt_field INTO ls_field.
  WRITE: / ls_field-position, ls_field-fieldname,
           ls_field-keyflag, ls_field-rollname.
ENDLOOP.
ULINE.

IF p_dryrun = 'X'.
  WRITE: / 'Dry run is on - the Dictionary was left untouched.'.
  WRITE: / 'Clear p_dryrun and run again to write the table.'.
  RETURN.
ENDIF.

*---------------------------------------------------------------------*
* Store the inactive version. Nothing below activates or transports it.
*---------------------------------------------------------------------*
CALL FUNCTION 'DDIF_TABL_PUT'
  EXPORTING  name              = gc_table
             dd02v_wa          = ls_head
             dd09l_wa          = ls_tech
  TABLES     dd03p_tab         = lt_field
  EXCEPTIONS tabl_not_found    = 1
             name_inconsistent = 2
             tabl_inconsistent = 3
             put_failure       = 4
             put_refused       = 5
             OTHERS            = 6.
IF sy-subrc <> 0.
  WRITE: / 'DDIF_TABL_PUT failed - sy-subrc', sy-subrc.
  RETURN.
ENDIF.

WRITE: / 'Inactive version of', gc_table, 'stored in the Dictionary.'.
WRITE: / 'Next steps: open SE11 -> activate -> assign to transport.'.
