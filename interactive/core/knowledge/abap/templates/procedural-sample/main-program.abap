************************************************************************
* SOURCE OF TRUTH - the Procedural main program skeleton.
*
* Every Procedural ABAP program this kit produces is built on this file.
* create-program is the usual route to one; the rule holds for any other
* route just as firmly. A generated main program MUST reproduce what
* stands here exactly - the header comment block with its 6 fields, the
* INCLUDE order, and the event-block layout. A departure is written up
* in spec.md before the code is generated, and an undocumented
* departure is raised as a MAJOR finding in the Phase 6 review.
*
* Three parts make up the skeleton.
*   1. The 6-field header comment block, sitting directly above the
*      REPORT statement (Program / Author / Date / S/4HANA / Version /
*      Desc).
*   2. The INCLUDE statements, in the order this file lists them below
*      - t, c, s, o, i, a, f. An `e` include is never written for a
*      Procedural program; `e` belongs to OOP alone, where it holds
*      LCL_EVENT.
*   3. The event blocks, which belong in this main body and nowhere
*      else - INITIALIZATION, the AT SELECTION-SCREEN family,
*      START-OF-SELECTION and END-OF-SELECTION - laid out as shown
*      below. Each one does one thing only, which is to hand the work
*      to a FORM through PERFORM.
*
* What the skeleton does not carry, its two companion rule files do.
* ../../conventions/include-structure.md owns the include set, the
* activation protocol and the anti-patterns.
* ../../conventions/clean-code-procedural.md owns the mandatory header
* format and the Screen / GUI / Text completion protocols.
************************************************************************
*&---------------------------------------------------------------------*
*&  Module      : SD - Sales and Distribution
*&  Program ID  : ZSDR23070
*&  Tcode       : ZSDR23070
*&  Title       : Sales Order Status Overview
*&  Description : Sales orders and their status, for the warehouse desk
*&---------------------------------------------------------------------*
*&  Change History
*&---------------------------------------------------------------------*
*& Change No   |  Changed by  |  Change Date
*& CH-001      |  DEVUSER01   |  2026-02-03
*& Description : First version
*&---------------------------------------------------------------------*
REPORT  zsdr23070
        NO STANDARD PAGE HEADING
        MESSAGE-ID zsd11.

*&---------------------------------------------------------------------*
* TOP - global TYPES, DATA and CONSTANTS
*&---------------------------------------------------------------------*
INCLUDE zsdr23070t.

*&---------------------------------------------------------------------*
* Local class definitions
*&---------------------------------------------------------------------*
INCLUDE zsdr23070c.

*&---------------------------------------------------------------------*
* Selection screen - PARAMETERS and SELECT-OPTIONS
*&---------------------------------------------------------------------*
INCLUDE zsdr23070s.

*&---------------------------------------------------------------------*
* Screen PBO modules
*&---------------------------------------------------------------------*
INCLUDE zsdr23070o.

*&---------------------------------------------------------------------*
* Screen PAI modules
*&---------------------------------------------------------------------*
INCLUDE zsdr23070i.

*&---------------------------------------------------------------------*
* ALV grid setup and display
*&---------------------------------------------------------------------*
INCLUDE zsdr23070a.

*&---------------------------------------------------------------------*
* FORM routines - the business logic
*&---------------------------------------------------------------------*
INCLUDE zsdr23070f.

*----------------------------------------------------------------------*
* AT SELECTION-SCREEN
*----------------------------------------------------------------------*
AT SELECTION-SCREEN.
  PERFORM check_common_authority.

  PERFORM check_screen_input.

AT SELECTION-SCREEN OUTPUT.
  PERFORM set_screen_output.

AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_var.
  PERFORM set_screen_variant.

*----------------------------------------------------------------------*
* INITIALIZATION
*----------------------------------------------------------------------*
INITIALIZATION.
  PERFORM set_screen.

*----------------------------------------------------------------------*
* START-OF-SELECTION
*----------------------------------------------------------------------*
START-OF-SELECTION.
  PERFORM start_of_selection.

*----------------------------------------------------------------------*
* END-OF-SELECTION
*----------------------------------------------------------------------*
END-OF-SELECTION.
  IF p_bat = 'X'.
    PERFORM batch_data_collection.
  ELSE.
    PERFORM end_of_selection.
  ENDIF.