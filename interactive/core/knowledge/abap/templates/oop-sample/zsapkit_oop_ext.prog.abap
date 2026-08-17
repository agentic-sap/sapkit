*&---------------------------------------------------------------------*
*& Include ZSAPKIT_OOP_EXT
*&---------------------------------------------------------------------*
*& What    : TOP include - the TYPES, CONSTANTS and global references
*&           every other include of ZSAPKIT_OOP_EX builds on.
*& How     : Both local classes are announced DEFERRED first, which is
*&           what lets GO_DATA and GO_ALV be typed here instead of in
*&           the include that later defines the class.
*& Caution : GV_OKCODE is the single OK_CODE global of this program.
*&           Both screens name it as their OK_CODE field and the PAI
*&           side reads it - never add a second one, and never branch
*&           on SY-UCOMM instead.
*&---------------------------------------------------------------------*

CLASS lcl_data DEFINITION DEFERRED.
CLASS lcl_alv DEFINITION DEFERRED.


*-- Output row: one purchase-order item carrying its header fields.
*-- CELLSTYL and CELLSCOL stay empty here; they are the anchors the
*-- grid layout points at for per-cell edit state and colour.
TYPES: BEGIN OF ty_item,
         ebeln    TYPE ebeln,
         ebelp    TYPE ebelp,
         bsart    TYPE bsart,
         lifnr    TYPE lifnr,
         menge    TYPE menge_d,
         meins    TYPE meins,
         netpr    TYPE netpr,
         cellstyl TYPE lvc_t_styl,
         cellscol TYPE lvc_t_scol,
       END OF ty_item.
TYPES ty_items TYPE STANDARD TABLE OF ty_item WITH EMPTY KEY.

*-- Tree outtab row - the tree column set is header fields only.
TYPES: BEGIN OF ty_header,
         ebeln TYPE ebeln,
         ebelp TYPE ebelp,
         bsart TYPE bsart,
       END OF ty_header.
TYPES ty_headers TYPE STANDARD TABLE OF ty_header WITH EMPTY KEY.

*-- Node register - lets a tree event find the row behind a node key.
TYPES: BEGIN OF ty_node,
         ebeln    TYPE ebeln,
         ebelp    TYPE ebelp,
         node_key TYPE lvc_nkey,
       END OF ty_node.
TYPES ty_nodes TYPE STANDARD TABLE OF ty_node WITH EMPTY KEY.


CONSTANTS gc_max_rows TYPE i VALUE 100.

CONSTANTS: gc_dynnr_0100 TYPE sy-dynnr VALUE '0100',
           gc_dynnr_0200 TYPE sy-dynnr VALUE '0200'.

CONSTANTS: gc_status_0100 TYPE sy-pfkey VALUE 'STATUS_0100',
           gc_status_0200 TYPE sy-pfkey VALUE 'STATUS_0200'.

CONSTANTS gc_fcode_refresh TYPE sy-ucomm VALUE 'REFRESH'.

*-- Columns this program reasons about outside the field catalog.
CONSTANTS: gc_col_ebeln TYPE lvc_fname VALUE 'EBELN',
           gc_col_menge TYPE lvc_fname VALUE 'MENGE'.

*-- Jump target of the purchase-order hotspot.
CONSTANTS: gc_parid_ebeln TYPE c LENGTH 3 VALUE 'BES',
           gc_tcode_po TYPE tcode VALUE 'ME23N'.

*-- Message class of the reusable handler set.
CONSTANTS: gc_msgid TYPE sy-msgid VALUE 'S_UNIFIED_CON',
           gc_msgno TYPE sy-msgno VALUE '000'.

*-- Event names of the reusable handler set. An MT_EVENTLIST entry
*-- whose METHOD field is filled is dispatched to the local class
*-- method of that very name, so both sides must stay spelled alike.
CONSTANTS: gc_evt_hotspot_click TYPE formname VALUE 'HANDLE_HOTSPOT_CLICK',
           gc_evt_data_changed TYPE formname VALUE 'HANDLE_DATA_CHANGED'.

CONSTANTS: gc_evt_link_click TYPE formname VALUE 'HANDLE_LINK_CLICK',
           gc_evt_node_dbl_click TYPE formname VALUE 'HANDLE_NODE_DOUBLE_CLICK'.


DATA go_data TYPE REF TO lcl_data.
DATA go_alv TYPE REF TO lcl_alv.

*-- OK_CODE global. Screen 0100 and screen 0200 both name it.
DATA gv_okcode TYPE sy-ucomm.

*-- Texts of the two radio-button comments, filled in LCL_DATA
*-- CONSTRUCTOR so the wording travels with the code. The names are
*-- short because a selection-screen element name stops at 8 characters.
DATA gv_tgrid TYPE c LENGTH 15.
DATA gv_ttree TYPE c LENGTH 15.
