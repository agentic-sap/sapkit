*&---------------------------------------------------------------------*
*& Include ZSAPKIT_OOP_EXC
*&---------------------------------------------------------------------*
*& What    : LCL_DATA - the data half of the two-class split. It reads
*&           purchase orders and derives the tree outtab from them.
*& How     : GET_DATA joins EKKO and EKPO once, capped at GC_MAX_ROWS
*&           rows, then hands the result to BUILD_HEADER. Nothing in
*&           this class knows about a screen, a container or a grid -
*&           that side of the program lives in LCL_ALV.
*& Caution : BUILD_HEADER touches no database on purpose. That is what
*&           lets ZSAPKIT_OOP_EX_TST assert on it without a test double.
*&---------------------------------------------------------------------*

CLASS lcl_data DEFINITION.

  PUBLIC SECTION.
    DATA mt_item TYPE ty_items.
    DATA mt_header TYPE ty_headers.

    METHODS constructor.

    METHODS get_data.

    METHODS build_header
      IMPORTING it_item          TYPE ty_items
      RETURNING VALUE(rt_header) TYPE ty_headers.

ENDCLASS.


CLASS lcl_data IMPLEMENTATION.

  METHOD constructor.
    gv_tgrid = 'ALV grid 0100'.
    gv_ttree = 'PO tree 0200'.
  ENDMETHOD.

  METHOD get_data.
    SELECT ekko~ebeln,
           ekko~bsart,
           ekko~lifnr,
           ekpo~ebelp,
           ekpo~menge,
           ekpo~meins,
           ekpo~netpr
      FROM ekko
           INNER JOIN ekpo ON ekpo~ebeln = ekko~ebeln
      WHERE ekko~lifnr <> @space
      INTO CORRESPONDING FIELDS OF TABLE @mt_item
      UP TO @gc_max_rows ROWS.

    mt_header = build_header( mt_item ).
  ENDMETHOD.

  METHOD build_header.
    rt_header = VALUE #( FOR ls_item IN it_item
                         ( ebeln = ls_item-ebeln
                           ebelp = ls_item-ebelp
                           bsart = ls_item-bsart ) ).
  ENDMETHOD.

ENDCLASS.
