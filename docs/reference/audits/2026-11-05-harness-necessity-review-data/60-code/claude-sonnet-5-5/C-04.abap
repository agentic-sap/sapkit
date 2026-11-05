*&---------------------------------------------------------------------*
*& Report  ZJUDGE_C04
*&---------------------------------------------------------------------*
*& Totals goods-movement quantities per material and plant.
*&---------------------------------------------------------------------*
REPORT zjudge_c04 LINE-SIZE 100 NO STANDARD PAGE HEADING.

TABLES: mseg, mkpf.

TYPES: BEGIN OF ty_result,
         matnr TYPE mseg-matnr,
         werks TYPE mseg-werks,
         menge TYPE mseg-menge,
         meins TYPE mseg-meins,
         cnt   TYPE i,
       END OF ty_result.

TYPES: BEGIN OF ty_item,
         matnr TYPE mseg-matnr,
         werks TYPE mseg-werks,
         menge TYPE mseg-menge,
         meins TYPE mseg-meins,
       END OF ty_item.

DATA: gt_item   TYPE STANDARD TABLE OF ty_item,
      gs_item   TYPE ty_item,
      gt_result TYPE STANDARD TABLE OF ty_result,
      gs_result TYPE ty_result.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
SELECT-OPTIONS: s_werks FOR mseg-werks,
                s_budat FOR mkpf-budat,
                s_bwart FOR mseg-bwart.
SELECTION-SCREEN END OF BLOCK b1.

START-OF-SELECTION.
  PERFORM get_data.
  PERFORM aggregate_data.
  PERFORM display_data.

*&---------------------------------------------------------------------*
FORM get_data.
  SELECT mseg~matnr mseg~werks mseg~menge mseg~meins
    FROM mseg
    INNER JOIN mkpf
       ON mkpf~mblnr = mseg~mblnr
      AND mkpf~mjahr = mseg~mjahr
    INTO TABLE gt_item
    WHERE mseg~werks IN s_werks
      AND mseg~bwart IN s_bwart
      AND mkpf~budat IN s_budat.
  IF sy-subrc <> 0.
    CLEAR gt_item.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
FORM aggregate_data.
  SORT gt_item BY matnr werks meins.

  LOOP AT gt_item INTO gs_item.
    IF gs_result-matnr <> gs_item-matnr
       OR gs_result-werks <> gs_item-werks
       OR gs_result-meins <> gs_item-meins.
      IF gs_result-matnr IS NOT INITIAL
         OR gs_result-werks IS NOT INITIAL.
        APPEND gs_result TO gt_result.
      ENDIF.
      CLEAR gs_result.
      gs_result-matnr = gs_item-matnr.
      gs_result-werks = gs_item-werks.
      gs_result-meins = gs_item-meins.
    ENDIF.
    gs_result-menge = gs_result-menge + gs_item-menge.
    gs_result-cnt   = gs_result-cnt + 1.
  ENDLOOP.

  IF gs_result-matnr IS NOT INITIAL
     OR gs_result-werks IS NOT INITIAL.
    APPEND gs_result TO gt_result.
  ENDIF.

  SORT gt_result BY matnr werks meins.
ENDFORM.

*&---------------------------------------------------------------------*
FORM display_data.
  IF gt_result IS INITIAL.
    WRITE: / 'No data found for the given selection.'.
    RETURN.
  ENDIF.

  WRITE: / 'Material', 20 'Plant', 28 'Total quantity', 52 'Unit', 60 'Items'.
  ULINE.

  LOOP AT gt_result INTO gs_result.
    WRITE: / gs_result-matnr,
             gs_result-werks UNDER 'Plant',
             gs_result-menge UNIT gs_result-meins,
             gs_result-meins,
             gs_result-cnt.
  ENDLOOP.

  ULINE.
  WRITE: / 'Lines:', lines( gt_result ).
ENDFORM.
