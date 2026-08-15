* DDIC 구조 포함은 프로그램 인클루드가 아니다 — check의 범위 밖이다.
TYPES: BEGIN OF ty_row.
        INCLUDE STRUCTURE zsflight_key.
TYPES: END OF ty_row.

DATA: BEGIN OF gs_amount.
        INCLUDE TYPE zty_amount.
DATA: END OF gs_amount.
