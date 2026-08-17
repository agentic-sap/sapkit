# TM - Transportation Management BAPIs & Function Modules
# TM - 운송 관리 BAPI 및 기능 모듈

## Core BAPIs / APIs (S/4HANA TM)
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| /SCMTMS/CL_FO_BAPI=>CREATE | S4 | Create Freight Order / 화물 오더 생성 | An OO-style BAPI that writes a freight order along with its header, items and stages |
| /SCMTMS/CL_FO_BAPI=>CHANGE | S4 | Change Freight Order / 화물 오더 변경 | Changes fields on a freight order, assigns the carrier, and revises the dates |
| /SCMTMS/CL_FO_BAPI=>GET_LIST | S4 | Get Freight Order List / 화물 오더 목록 조회 | Fetches a list of freight orders that meet the selection criteria |
| /SCMTMS/CL_FO_BAPI=>GET_DETAIL | S4 | Get Freight Order Detail / 화물 오더 상세 조회 | Reads a freight order's data in full |
| /SCMTMS/CL_FU_BAPI=>CREATE | S4 | Create Freight Unit / 화물 단위 생성 | Builds a freight unit, either out of a delivery or by hand |
| /SCMTMS/CL_FU_BAPI=>GET_LIST | S4 | Get Freight Unit List / 화물 단위 목록 조회 | Lists freight units against any of several criteria |

## Shipment BAPIs (ECC LE-TRA)
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_SHIPMENT_CREATE | ECC | Create Shipment (LE-TRA) / 출하 생성 (LE-TRA) | Writes an LE-Transportation shipment document (VTTK). S/4HANA: Use /SCMTMS/ Freight Order APIs |
| BAPI_SHIPMENT_CHANGE | ECC | Change Shipment / 출하 변경 | Changes a shipment's header, stages and legs. S/4HANA: Use /SCMTMS/ APIs |
| BAPI_SHIPMENT_GETDETAIL | ECC | Get Shipment Detail / 출하 상세 조회 | Reads shipment data out of VTTK, VTTS and VTSP. S/4HANA: Use /SCMTMS/ APIs |

## Location / Route BAPIs (S/4HANA TM)
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| /SCMTMS/CL_LOC_BAPI=>CREATE | S4 | Create Location / 위치 생성 | Writes a TM location master record |
| /SCMTMS/CL_LOC_BAPI=>GET_DETAIL | S4 | Get Location Detail / 위치 상세 조회 | Reads the attributes held on a TM location |
| /SCMTMS/CL_LANE_BAPI=>GET_LIST | S4 | Get Lane List / 레인 목록 조회 | Lists the transportation lanes running between locations |

## Charge Calculation FMs (S/4HANA TM)
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| /SCMTMS/CL_FCC_BAPI=>CALCULATE | S4 | Calculate Freight Charges / 운임 계산 | Works out the freight charges on a freight order or a booking |
| /SCMTMS/CL_FCC_BAPI=>GET_RESULT | S4 | Get Calculation Result / 계산 결과 조회 | Reads back the freight charge amounts that were calculated |

## Event / Tracking FMs (S/4HANA TM)
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| /SCMTMS/CL_TTE_BAPI=>POST_EVENT | S4 | Post Tracking Event / 추적 이벤트 전기 | Books a location/status event onto a freight order (GPS update) |
| /SCMTMS/CL_TTE_BAPI=>GET_EVENTS | S4 | Get Tracking Events / 추적 이벤트 조회 | Reads the event history behind a shipment/freight order |

## Utility FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| /SCMTMS/CL_TEND_BAPI=>EXECUTE | S4 | Execute Tendering / 입찰 실행 | Launches the carrier tendering process for a freight order |
| /SCMTMS/CL_TEND_BAPI=>ACCEPT | S4 | Accept Tender / 입찰 수락 | Accepts the tender response that came back from a carrier |
| BAPI_TRANSACTION_COMMIT | ECC/S4 | Commit TM Transaction / TM 트랜잭션 커밋 | Commits every change made through the TM BAPIs |
