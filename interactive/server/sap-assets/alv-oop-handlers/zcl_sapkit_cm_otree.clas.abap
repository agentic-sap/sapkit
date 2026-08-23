CLASS zcl_sapkit_cm_otree DEFINITION
  PUBLIC
  INHERITING FROM cl_gui_alv_tree
  CREATE PUBLIC.

*----------------------------------------------------------------------
* CL_GUI_ALV_TREE that remembers the screen it lives on.
*
* The tree counterpart of ZCL_SAPKIT_CM_OALV, and the same reasoning:
* a tree instance belongs to one container on one dynpro of one program,
* the parent class does not record that pairing, and callers otherwise
* have to carry it alongside the tree reference. Holding it here means a
* PBO module that has the tree also knows where the tree is.
*
* Nothing is overridden. Unlike the grid, the tree's display settings
* are already public, so there is nothing a subclass has to unlock. If
* that changes, wrappers belong here for the same reason they belong in
* the grid class.
*----------------------------------------------------------------------

  PUBLIC SECTION.

    " Dynpro the tree is displayed on.
    DATA mv_dynnr TYPE sy-dynnr.
    " Program that dynpro belongs to.
    DATA mv_repid TYPE sy-cprog.

  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_sapkit_cm_otree IMPLEMENTATION.
ENDCLASS.
