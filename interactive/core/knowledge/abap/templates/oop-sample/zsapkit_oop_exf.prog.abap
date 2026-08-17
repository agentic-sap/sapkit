*&---------------------------------------------------------------------*
*& Include ZSAPKIT_OOP_EXF
*&---------------------------------------------------------------------*
*& What    : FORM routines. In OOP mode this include stays thin - it
*&           holds the one routine the classical screen world reaches
*&           by name, and nothing else.
*& How     : USER_COMMAND_0200 is the middle step of the OK_CODE
*&           contract. It takes its own copy of GV_OKCODE, clears the
*&           global at once so a redraw cannot re-fire the same code,
*&           and hands the copy to LCL_ALV. Reading SY-UCOMM here
*&           instead would break the moment a popup overwrites it.
*& Caution : Business logic does not belong in this include. Anything
*&           longer than the hand-over below is a method of LCL_DATA or
*&           LCL_ALV that has drifted out of its class.
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form USER_COMMAND_0200
*&---------------------------------------------------------------------*
*& Routes the function code of screen 0200 into LCL_ALV.
*&---------------------------------------------------------------------*
FORM user_command_0200.

  DATA lv_fcode TYPE sy-ucomm.

  lv_fcode = gv_okcode.
  CLEAR gv_okcode.

  go_alv->handle_user_command( lv_fcode ).

ENDFORM.
