# PM - Plant Maintenance BAPIs & Function Modules
# PM - 설비 관리 BAPI 및 기능 모듈

## Core BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_ALM_ORDER_MAINTAIN | ECC/S4 | Create/Change PM Order / PM 오더 생성/변경 | Handles PM order maintenance across the board — creating an order, changing one, or appending operations/components |
| BAPI_ALM_ORDER_GET_DETAIL | ECC/S4 | Get PM Order Detail / PM 오더 상세 조회 | Returns a PM order's header, operations, components and costs (AUFK, AFKO, AFVC, RESB) |
| BAPI_ALM_ORDER_CONFIRM_ADD | ECC/S4 | Add Order Confirmation / 오더 확인 추가 | Books a time confirmation against PM order operations |
| BAPI_ALM_NOTIF_CREATE | ECC/S4 | Create PM Notification / PM 알림 생성 | Sets up a maintenance notification of type M1/M2/S1, carrying items and causes |
| BAPI_ALM_NOTIF_SAVE | ECC/S4 | Save PM Notification / PM 알림 저장 | Persists changes made to a notification, and must be called after BAPI_ALM_NOTIF_MODIFY |
| BAPI_ALM_NOTIF_GET_DETAIL | ECC/S4 | Get Notification Detail / 알림 상세 조회 | Returns a notification's header, items, causes and activities (QMEL, QMFE, QMUR) |
| BAPI_EQUI_CREATE | ECC/S4 | Create Equipment / 설비 생성 | Writes an equipment master record (EQUI, ITOB) |
| BAPI_EQUI_CHANGE | ECC/S4 | Change Equipment / 설비 변경 | Changes data held on an equipment master |
| BAPI_EQUI_GETDETAIL | ECC/S4 | Get Equipment Detail / 설비 상세 조회 | Returns an equipment master, classification included |
| BAPI_FUNCLOC_CREATE | ECC/S4 | Create Functional Location / 기능 위치 생성 | Writes an FL master record (IFLOT, IFLOTX) |
| BAPI_FUNCLOC_CHANGE | ECC/S4 | Change Functional Location / 기능 위치 변경 | Updates the data on an FL master |
| BAPI_FUNCLOC_GETDETAIL | ECC/S4 | Get Functional Location Detail / 기능 위치 상세 조회 | Returns FL master data together with its structure |

## Measurement BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_MEASUREPOINT_CREATE | ECC/S4 | Create Measuring Point / 측정점 생성 | Sets up a measuring point on a piece of equipment or on an FL |
| BAPI_MEASUREDOCUMENT_CREATE | ECC/S4 | Create Measurement Document / 측정 문서 생성 | Records a reading taken off a counter/gauge |
| BAPI_MEASUREDOCUMENT_GETLIST | ECC/S4 | Get Measurement Document List / 측정 문서 목록 조회 | Fetches the measurement history behind a measuring point |

## Maintenance Plan BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_MAINTPLAN_CREATE | ECC/S4 | Create Maintenance Plan / 유지보수 계획 생성 | Sets up a maintenance plan driven either by time or by performance |
| BAPI_MAINTPLAN_GETDETAIL | ECC/S4 | Get Maintenance Plan Detail / 유지보수 계획 상세 조회 | Returns a maintenance plan (MPLAN, MPLA, MPOS) |

## Utility FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| RIIFLO20 | ECC/S4 | Functional Location: Mass Change / 기능 위치 대량 변경 | Updates functional locations in one batch |
| PM_ORDER_READ | ECC/S4 | Read PM Order (Internal) / PM 오더 조회 (내부) | A low-level internal read straight off PM order data |
| BAPI_GOODSMVT_CREATE | ECC/S4 | Post Goods for PM Order / PM 오더 재고 이동 | Issues goods to a PM order (mvt 261), or receives them in as a GR (mvt 101) |
| CS_BOM_EXPL_MAT_V2 | ECC/S4 | BOM Explosion for PM Object / PM 개체 BOM 전개 | Explodes an equipment BOM to reach the spare parts |
| BAPI_TRANSACTION_COMMIT | ECC/S4 | Commit PM Transaction / PM 트랜잭션 커밋 | Must follow every PM BAPI if the changes are to persist |
