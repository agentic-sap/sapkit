*&---------------------------------------------------------------------*
*& Include ZSAPKIT_OOP_EXI
*&---------------------------------------------------------------------*
*& What    : PAI modules - the exit command both screens share, and the
*&           user-command dispatcher of screen 0200.
*& How     : EXIT runs AT EXIT-COMMAND, so BACK, EXIT and CANC leave
*&           the screen before anything else is processed. Every other
*&           function code reaches USER_COMMAND_0200, which does no
*&           more than PERFORM the routine in ZSAPKIT_OOP_EXF.
*& Caution : Screen 0100 has no user-command module because its status
*&           offers nothing but the three exit functions. Give that
*&           status a button and this include gains USER_COMMAND_0100
*&           built the same way.
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Module EXIT INPUT
*&---------------------------------------------------------------------*
MODULE exit INPUT.
  LEAVE TO SCREEN 0.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module USER_COMMAND_0200 INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0200 INPUT.
  PERFORM user_command_0200.
ENDMODULE.
