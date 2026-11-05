REPORT zjudge_c04.

TABLES:
  mseg,
  mkpf.

SELECT-OPTIONS:
  s_werks FOR mseg-werks OBLIGATORY,
  s_budat FOR mkpf-budat OBLIGATORY,
  s_bwart FOR mseg-bwart.

TYPES:
  BEGIN OF ty_result,
    matnr      TYPE mseg-matnr,
    werks      TYPE mseg-werks,
    meins      TYPE mseg-meins,
    total_qty  TYPE mseg-menge,
    item_count TYPE i,
  END OF ty_result.

DATA:
  gt_result TYPE STANDARD TABLE OF ty_result,
  gs_result TYPE ty_result.

START-OF-SELECTION.

  IF s_bwart[] IS INITIAL.
    SELECT m~matnr,
           m~werks,
           m~meins,
           SUM( m~menge ) AS total_qty,
           COUNT( * )     AS item_count
      FROM mseg AS m
      INNER JOIN mkpf AS k
        ON  k~mblnr = m~mblnr
        AND k~mjahr = m~mjahr
      WHERE m~werks IN @s_werks
        AND k~budat IN @s_budat
      GROUP BY m~matnr, m~werks, m~meins
      ORDER BY m~matnr, m~werks
      INTO TABLE @gt_result.
  ELSE.
    SELECT m~matnr,
           m~werks,
           m~meins,
           SUM( m~menge ) AS total_qty,
           COUNT( * )     AS item_count
      FROM mseg AS m
      INNER JOIN mkpf AS k
        ON  k~mblnr = m~mblnr
        AND k~mjahr = m~mjahr
      WHERE m~werks IN @s_werks
        AND k~budat IN @s_budat
        AND m~bwart IN @s_bwart
      GROUP BY m~matnr, m~werks, m~meins
      ORDER BY m~matnr, m~werks
      INTO TABLE @gt_result.
  ENDIF.

END-OF-SELECTION.

  IF gt_result IS INITIAL.
    WRITE: / 'No goods movements found for the selection.'.
    RETURN.
  ENDIF.

  FORMAT COLOR COL_HEADING INTENSIFIED ON.
  WRITE: / sy-vline,
           (18) 'Material',
           sy-vline,
           (6)  'Plant',
           sy-vline,
           (20) 'Total Quantity' RIGHT-JUSTIFIED,
           sy-vline,
           (5)  'Unit',
           sy-vline,
           (12) 'Item Count' RIGHT-JUSTIFIED,
           sy-vline.
  FORMAT RESET.

  ULINE.

  LOOP AT gt_result INTO gs_result.
    WRITE: / sy-vline,
             (18) gs_result-matnr,
             sy-vline,
             (6)  gs_result-werks,
             sy-vline,
             (20) gs_result-total_qty,
             sy-vline,
             (5)  gs_result-meins,
             sy-vline,
             (12) gs_result-item_count,
             sy-vline.
  ENDLOOP.

  ULINE.
