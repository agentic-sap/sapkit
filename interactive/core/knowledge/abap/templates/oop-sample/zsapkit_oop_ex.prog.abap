*&---------------------------------------------------------------------*
*& Report ZSAPKIT_OOP_EX
*&---------------------------------------------------------------------*
*& What    : Reference skeleton for an OOP-mode report. It lists
*&           purchase-order items either on one ALV grid (screen 0100)
*&           or on a tree standing beside a grid (screen 0200).
*& How     : Two local classes carry the work - LCL_DATA reads EKKO and
*&           EKPO, LCL_ALV puts the result on a screen. This main body
*&           holds nothing but the INCLUDE list and the event blocks,
*&           and every event block does one thing: hand over to a
*&           method. All nine includes named below really exist.
*& Caution : LCL_ALV inherits from ZCL_S4SAP_CM_ALV, and the event
*&           bridges name ZCL_S4SAP_CM_OALV / ZCL_S4SAP_CM_OTREE /
*&           ZCX_S4SAP_EXCP. Those global classes are not part of this
*&           template - install the reusable ALV handler set first, or
*&           the a and e includes will not compile.
*&---------------------------------------------------------------------*
REPORT zsapkit_oop_ex.

*-- Global TYPES, CONSTANTS and object references
INCLUDE zsapkit_oop_ext.

*-- Selection screen
INCLUDE zsapkit_oop_exs.

*-- LCL_DATA - selection and extraction
INCLUDE zsapkit_oop_exc.

*-- LCL_ALV - screen, grid and tree
INCLUDE zsapkit_oop_exa.

*-- LCL_EVENT_* - control event bridges
INCLUDE zsapkit_oop_exe.

*-- PBO modules
INCLUDE zsapkit_oop_exo.

*-- PAI modules
INCLUDE zsapkit_oop_exi.

*-- FORM routines
INCLUDE zsapkit_oop_exf.

*-- FOR TESTING classes
INCLUDE zsapkit_oop_ex_tst.


*&---------------------------------------------------------------------*
*& INITIALIZATION
*&---------------------------------------------------------------------*
INITIALIZATION.
  go_data = NEW #( ).
  go_alv = NEW #( ).


*&---------------------------------------------------------------------*
*& AT SELECTION-SCREEN
*&---------------------------------------------------------------------*
AT SELECTION-SCREEN.
* Input checks belong in a method of LCL_DATA and are called from here.
* This sample validates nothing, so the block stays empty.


*&---------------------------------------------------------------------*
*& AT SELECTION-SCREEN OUTPUT
*&---------------------------------------------------------------------*
AT SELECTION-SCREEN OUTPUT.
* LOOP AT SCREEN adjustments belong in a method as well. Nothing on
* this selection screen is hidden or made read-only, so nothing runs.


*&---------------------------------------------------------------------*
*& AT SELECTION-SCREEN ON RADIOBUTTON GROUP
*&---------------------------------------------------------------------*
AT SELECTION-SCREEN ON RADIOBUTTON GROUP mode.
* Fires while the display-mode group is processed. LCL_ALV reads the
* chosen mode again in DISPLAY, so nothing has to be remembered here.


*&---------------------------------------------------------------------*
*& START-OF-SELECTION
*&---------------------------------------------------------------------*
START-OF-SELECTION.
  go_data->get_data( ).


*&---------------------------------------------------------------------*
*& END-OF-SELECTION
*&---------------------------------------------------------------------*
END-OF-SELECTION.
  go_alv->display( ).
