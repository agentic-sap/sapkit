*&---------------------------------------------------------------------*
*& Report  ZJUDGE_C04
*& Goods-movement quantities totalled per material and plant
*&---------------------------------------------------------------------*
REPORT zjudge_c04 LINE-SIZE 90 NO STANDARD PAGE HEADING.

TABLES: mkpf, mseg.

TYPES: BEGIN OF ty_result,
         matnr TYPE mseg-matnr,
         werks TYPE mseg-werks,
         meins TYPE mseg-meins,
         menge TYPE mseg-menge,
         cnt   TYPE i,
       END OF ty_result,
       ty_t_result TYPE STANDARD TABLE OF ty_result WITH DEFAULT KEY.

DATA: gt_result TYPE ty_t_result,
      gv_total  TYPE i.

CONSTANTS: gc_x TYPE c LENGTH 1 VALUE 'X'.

SELECTION-SCREEN BEGIN OF BLOCK b01 WITH FRAME TITLE TEXT-001.
SELECT-OPTIONS: s_werks FOR mseg-werks,
                s_budat FOR mkpf-budat,
                s_bwart FOR mseg-bwart.
SELECTION-SCREEN END OF BLOCK b01.

START-OF-SELECTION.
  PERFORM read_data CHANGING gt_result.

END-OF-SELECTION.
  PERFORM display_list USING gt_result.

*--------------------------------------------------------------------*
* read_data - aggregates MSEG items (header date from MKPF) per
*   material/plant/base unit; s_bwart is optional (empty = all).
*--------------------------------------------------------------------*
FORM read_data CHANGING pt_result TYPE ty_t_result.

  CLEAR pt_result.

  SELECT mseg~matnr mseg~werks mseg~meins
         SUM( mseg~menge ) COUNT( * )
    FROM mseg
    INNER JOIN mkpf
       ON mkpf~mblnr = mseg~mblnr
      AND mkpf~mjahr = mseg~mjahr
    INTO TABLE pt_result
    WHERE mseg~werks IN s_werks
      AND mseg~bwart IN s_bwart
      AND mkpf~budat IN s_budat
    GROUP BY mseg~matnr mseg~werks mseg~meins
    ORDER BY mseg~matnr mseg~werks mseg~meins.
  IF sy-subrc <> 0.
    CLEAR pt_result.
    MESSAGE s398(00) WITH 'No data found'(002) space space space.
  ENDIF.

ENDFORM.

*--------------------------------------------------------------------*
* display_list - classic WRITE list, one line per material + plant.
*--------------------------------------------------------------------*
FORM display_list USING pt_result TYPE ty_t_result.

  DATA: ls_result TYPE ty_result,
        lv_lines  TYPE i.

  DESCRIBE TABLE pt_result LINES lv_lines.
  IF lv_lines = 0.
    RETURN.
  ENDIF.

  WRITE: / 'Material'(003) COLOR COL_HEADING,
           22 'Plant'(004) COLOR COL_HEADING,
           30 'Total quantity'(005) COLOR COL_HEADING,
           55 'Unit'(006) COLOR COL_HEADING,
           62 'Items'(007) COLOR COL_HEADING.
  ULINE.

  LOOP AT pt_result INTO ls_result.
    WRITE: / ls_result-matnr,
             22 ls_result-werks,
             28 ls_result-menge UNIT ls_result-meins,
             55 ls_result-meins,
             60 ls_result-cnt.
    gv_total = gv_total + ls_result-cnt.
  ENDLOOP.

  ULINE.
  WRITE: / 'Lines'(008), lv_lines,
         / 'Total items'(009), gv_total.

ENDFORM.
