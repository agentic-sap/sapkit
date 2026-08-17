# QM - Quality Management BAPIs & Function Modules
# QM - 품질 관리 BAPI 및 기능 모듈

## Core BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_INSPLOT_CREATE | ECC/S4 | Create Inspection Lot / 검사 로트 생성 | Creates an inspection lot by hand for a material/plant |
| BAPI_INSPLOT_GETDETAIL | ECC/S4 | Get Inspection Lot Detail / 검사 로트 상세 조회 | Returns an inspection lot's header and its characteristics (QALS, QAVE) |
| BAPI_INSPLOT_GETLIST | ECC/S4 | Get Inspection Lot List / 검사 로트 목록 조회 | Lists inspection lots narrowed by material, plant, date and status |
| BAPI_QUALNOT_CREATE | ECC/S4 | Create Quality Notification / 품질 알림 생성 | Sets up a QM notification of type Q1/Q2/Q3, carrying items, causes and tasks |
| BAPI_QUALNOT_SAVE | ECC/S4 | Save Quality Notification / 품질 알림 저장 | Makes the changes to a quality notification permanent |
| BAPI_QUALNOT_GETDETAIL | ECC/S4 | Get Notification Detail / 알림 상세 조회 | Returns a quality notification's header, items and causes (QMEL, QMFE, QMUR) |
| BAPI_QUALNOT_CHANGE | ECC/S4 | Change Quality Notification / 품질 알림 변경 | Changes fields on a notification, and adds or changes its items |
| BAPI_INSPOPER_RECRESULTS | ECC/S4 | Record Inspection Results / 검사 결과 기록 | Records characteristic results against an inspection operation |
| BAPI_INSPLOT_USAGE_DECISION | ECC/S4 | Record Usage Decision / 사용 결정 기록 | Posts an inspection lot's usage decision, stock posting included |

## Inspection Plan BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_INSPPLAN_CREATE | ECC/S4 | Create Inspection Plan / 검사 계획 생성 | Creates an inspection plan complete with its header and characteristics |
| BAPI_INSPPLAN_CHANGE | ECC/S4 | Change Inspection Plan / 검사 계획 변경 | Changes an inspection plan that already exists |
| BAPI_INSPPLAN_GETDETAIL | ECC/S4 | Get Inspection Plan Detail / 검사 계획 상세 조회 | Reads an inspection plan out of PLKO/PLPO together with its QM characteristics |

## Sampling BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_SAMPLE_CREATE | ECC/S4 | Create Sample / 샘플 생성 | Creates a physical sample belonging to an inspection lot |
| BAPI_SAMPLE_GETLIST | ECC/S4 | Get Sample List / 샘플 목록 조회 | Lists the samples held against an inspection lot |

## Utility FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| QA_SET_INSPECTIONLOT_STATUS | ECC/S4 | Set Inspection Lot Status / 검사 로트 상태 설정 | Sets a status on an inspection lot internally (release, restrict, and so on) |
| QM_MOVE_STOCK_TO_UNRESTRICTED | ECC/S4 | Move QM Stock to Unrestricted / QM 재고를 비제한으로 이동 | Moves inspection lot stock over to unrestricted once the UD has been made |
| BAPI_QINFORECORD_CREATE | ECC/S4 | Create Q-Info Record / 품질 정보 레코드 생성 | Creates a QM procurement info record for a vendor-material |
| BAPI_QINFORECORD_CHANGE | ECC/S4 | Change Q-Info Record / 품질 정보 레코드 변경 | Changes the inspection settings on a Q-Info record |
| QI_QMEL_HEADER_READ | ECC/S4 | Read Notification Header / 알림 헤더 조회 | An internal FM that reads QMEL, the notification header |
| BAPI_VENDOREVALUATION_GETOVERAL | ECC/S4 | Get Vendor Evaluation / 공급업체 평가 조회 | Returns a vendor's QM evaluation scores |
