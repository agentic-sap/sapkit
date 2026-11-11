*&---------------------------------------------------------------------*
*& Include ZSAPKIT_OOP_EXO
*&---------------------------------------------------------------------*
*& What    : PBO modules of screen 0100 and screen 0200 - the GUI
*&           status and the control that fills the screen.
*& How     : Each ALV module hands over to the matching SHOW_* method.
*&           On the first pass that builds the container; every later
*&           pass only refreshes what is already there.
*& Caution : A module belongs in the flow logic and nowhere else. Keep
*&           it a two-line dispatcher - the moment a module starts
*&           carrying logic, that logic has left the class it belongs
*&           to and stops being testable.
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Module STATUS_0100 OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS gc_status_0100.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module ALV_0100 OUTPUT
*&---------------------------------------------------------------------*
MODULE alv_0100 OUTPUT.
  go_alv->show_0100( ).
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module STATUS_0200 OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0200 OUTPUT.
  SET PF-STATUS gc_status_0200.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module ALV_0200 OUTPUT
*&---------------------------------------------------------------------*
MODULE alv_0200 OUTPUT.
  go_alv->show_0200( ).
ENDMODULE.
