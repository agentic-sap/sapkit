CLASS zcl_sapkit_cm_oalv DEFINITION
  PUBLIC
  INHERITING FROM cl_gui_alv_grid
  CREATE PUBLIC.

*----------------------------------------------------------------------
* CL_GUI_ALV_GRID with the screen it lives on, plus a way in to the
* display settings the parent keeps to itself.
*
* Two things are added here and nothing else.
*
* First, the two attributes. A grid instance is always tied to one
* container on one dynpro of one program, but CL_GUI_ALV_GRID does not
* remember which, so callers end up carrying that pairing beside the
* grid reference. Keeping the dynpro number and the calling program on
* the instance means a PBO module that has the grid also has everything
* it needs to talk about it.
*
* Second, the wrappers. Several of the parent's display settings -
* fixing the leading columns, widening columns to their content, letting
* rows be resized, moving the cursor, marking cells as faulty - are
* PROTECTED, so no caller outside the inheritance tree can reach them.
* A subclass can, and that is the whole reason this class exists. Each
* method below is one such door and deliberately holds no logic of its
* own: anything decided here would be a decision made behind the back of
* the report that owns the grid.
*----------------------------------------------------------------------

  PUBLIC SECTION.

    " Dynpro the grid is displayed on.
    DATA mv_dynnr TYPE sy-dynnr.
    " Program that dynpro belongs to.
    DATA mv_repid TYPE sy-cprog.

    " Freezes the leading columns so they stay in view while the rest
    " scrolls sideways. The count is fixed at five, which is as many as
    " a normal key block takes.
    METHODS set_fixed_column.

    " Widens every column to fit its widest cell, headings included.
    METHODS set_optimizer.

    " Same, for one column only.
    METHODS set_optimizer_col_id
      IMPORTING
        !col TYPE lvc_s_col.

    " Lets the user drag row heights.
    METHODS set_row_resize.

    " Puts the cursor on one cell, addressed by position.
    METHODS set_cursor
      IMPORTING
        !row TYPE i
        !col TYPE i.

    " Marks the listed cells as faulty so the grid colours them and
    " refuses to leave them.
    METHODS set_error_cell
      IMPORTING
        !cell_table TYPE lvc_t_err.

  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_sapkit_cm_oalv IMPLEMENTATION.

  METHOD set_fixed_column.

    me->set_fixed_cols( cols = 5 ).

  ENDMETHOD.


  METHOD set_optimizer.

    " INCLUDE_HEADER = 1 measures the heading as well, so a short column
    " with a long title does not come out clipped.
    me->optimize_all_cols( include_header = 1 ).

  ENDMETHOD.


  METHOD set_optimizer_col_id.

    me->optimize_col_id( include_header = 1
                         col_id         = col ).

  ENDMETHOD.


  METHOD set_row_resize.

    me->set_resize_rows( enable = 1 ).

  ENDMETHOD.


  METHOD set_cursor.

    " The BASE variant addresses the cell by row and column number
    " rather than by field name, which is what a caller working from a
    " loop index has.
    me->set_current_cell_base( row = row
                               col = col ).

  ENDMETHOD.


  METHOD set_error_cell.

    me->set_error_cells( cell_table ).

  ENDMETHOD.

ENDCLASS.
