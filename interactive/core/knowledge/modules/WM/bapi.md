# WM - Warehouse Management BAPIs & Function Modules
# WM - 창고 관리 BAPI 및 기능 모듈

> **⚠ LE-WM은 S/4HANA에서 지원 대상이 아닙니다. S/4HANA라면 EWM (Extended Warehouse Management)을 쓰십시오.**
> **⚠ S/4HANA has deprecated LE-WM. Turn to EWM (Extended Warehouse Management) in its place.**

## Core BAPIs (ECC LE-WM)
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_WHSE_TO_CREATE_STOCK | ECC | Create Transfer Order for Stock / 재고 TO 생성 | Raises a TO for a one-off movement inside the warehouse |
| BAPI_WHSE_TO_CREATE_TOREQ | ECC | Create TO from Transfer Requirement / TR로부터 TO 생성 | Turns a TR into a TO, whether the processing is outbound or inbound |
| BAPI_WHSE_TO_CONFIRM | ECC | Confirm Transfer Order / TO 확인 | Confirms a picked or putaway TO so that warehouse stock is updated |
| BAPI_WHSE_TO_CANCEL | ECC | Cancel Transfer Order / TO 취소 | Cancels a transfer order that is open or unconfirmed |
| BAPI_WHSE_TO_GETDETAIL | ECC | Get Transfer Order Detail / TO 상세 조회 | Reads a TO's header and items out of LTBK/LTBP |
| BAPI_WHSE_TO_GETLIST | ECC | Get Transfer Order List / TO 목록 조회 | Lists transfer orders selected by warehouse, date and status |
| BAPI_WHSE_TR_CREATE | ECC | Create Transfer Requirement / TR 생성 | Writes a transfer requirement into LTAK/LTAP |
| BAPI_WHSE_TR_GETDETAIL | ECC | Get Transfer Requirement Detail / TR 상세 조회 | Fetches a TR out of LTAK/LTAP |
| BAPI_WHSE_STORAGEBIN_GETLIST | ECC | Get Storage Bin List / 저장 빈 목록 조회 | Brings back the storage bins for a warehouse and storage type |
| BAPI_WHSE_STORAGEBIN_GETDETAIL | ECC | Get Storage Bin Detail / 저장 빈 상세 조회 | Reads the bin data held in LGPLA |

## Inventory BAPIs (ECC LE-WM)
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_WMINVDOC_CREATE | ECC | Create WM Inventory Document / WM 재고 실사 문서 생성 | Opens an inventory document for a physical count |
| BAPI_WMINVDOC_POSTCOUNT | ECC | Post Inventory Count / 재고 실사 전기 | Posts the counted quantities onto the inventory document |
| BAPI_WMINVDOC_POSTDIFFERENCES | ECC | Post Inventory Differences / 재고 차이 전기 | Posts the inventory differences once the count is done |

## Quant / Stock BAPIs (ECC LE-WM)
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_WHSE_QUANT_GETLIST | ECC | Get Quant List / 재고 목록 조회 | Returns the warehouse stock quants out of LGPLA/LQUA |
| BAPI_WHSE_QUANT_GETDETAIL | ECC | Get Quant Detail / 재고 상세 조회 | Reads quant information in detail (LQUA) |

## Utility FMs (ECC LE-WM)
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| L_TO_CREATE_TR | ECC | Create TO from TR (Internal) / TR로부터 TO 생성 (내부) | Internal FM that carries out the TR-to-TO conversion |
| L_TO_CONFIRM_ONE_TE | ECC | Confirm Single TO Item / 단일 TO 항목 확인 | Confirms an individual TO item, the equivalent of LT12 |
| WAREHOUSE_NUMBER_GET | ECC | Get Warehouse Number / 창고 번호 조회 | Works out the warehouse number for a plant and storage location |
| L_STOCK_OVERVIEW_READ | ECC | Read WM Stock Overview / WM 재고 개요 조회 | Reads out the WM-level stock held for a material and warehouse |
| L_BIN_LOCATE | ECC | Locate Storage Bin / 저장 빈 위치 확인 | Picks the best-suited bin according to the putaway strategy |
| WM_MOVE_STOCK | ECC | Move WM Stock / WM 재고 이동 | Carries out a low-level internal stock movement inside the warehouse |

## EWM BAPIs (S/4HANA)
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| /SCWM/API_WAREHOUSE_ORDER_CR | S4 | Create Warehouse Order / 창고 오더 생성 | Opens a warehouse order in EWM |
| /SCWM/API_WAREHOUSE_TASK_CR | S4 | Create Warehouse Task / 창고 태스크 생성 | Sets up an EWM warehouse task, which takes the place of the TO |
| /SCWM/API_STOCK_GETLIST | S4 | Get EWM Stock List / EWM 재고 목록 조회 | Returns the stock sitting in EWM storage bins |
| /SCWM/TO_READ_SINGLE | S4 | Read Warehouse Task / 창고 태스크 조회 | Reads out one individual EWM warehouse task |
