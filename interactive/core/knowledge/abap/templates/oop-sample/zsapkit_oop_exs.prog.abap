*&---------------------------------------------------------------------*
*& Include ZSAPKIT_OOP_EXS
*&---------------------------------------------------------------------*
*& What    : Selection screen - one radio-button group deciding which
*&           of the two display screens LCL_ALV DISPLAY calls up.
*& How     : Both comments take their text from GV_TGRID / GV_TTREE,
*&           which LCL_DATA CONSTRUCTOR fills at INITIALIZATION, before
*&           the selection screen is painted for the first time.
*& Caution : USER-COMMAND on the first radio button is what makes the
*&           group send a round trip. Drop it and the AT SELECTION-
*&           SCREEN ON RADIOBUTTON GROUP event never fires.
*&---------------------------------------------------------------------*

SELECTION-SCREEN BEGIN OF BLOCK b01.
  SELECTION-SCREEN BEGIN OF LINE.
    PARAMETERS p_grid RADIOBUTTON GROUP mode DEFAULT 'X' USER-COMMAND ucom.
    SELECTION-SCREEN COMMENT (15) gv_tgrid FOR FIELD p_grid.
    PARAMETERS p_tree RADIOBUTTON GROUP mode.
    SELECTION-SCREEN COMMENT (15) gv_ttree FOR FIELD p_tree.
  SELECTION-SCREEN END OF LINE.
SELECTION-SCREEN END OF BLOCK b01.
