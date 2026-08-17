# PP - Production Planning BAPIs & Function Modules
# PP - 생산 계획 BAPI 및 기능 모듈

## Core BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_PRODORD_CREATE | ECC/S4 | Create Production Order / 제조 오더 생성 | Builds a production order from a material and a routing |
| BAPI_PRODORD_CHANGE | ECC/S4 | Change Production Order / 제조 오더 변경 | Changes the dates, quantities, and status of a production order |
| BAPI_PRODORD_GET_DETAIL | ECC/S4 | Get Production Order Detail / 제조 오더 상세 조회 | Returns an order's header, operations, and components (AUFK, AFKO, AFPO) |
| BAPI_PRODORD_GETLIST | ECC/S4 | Get Production Order List / 제조 오더 목록 조회 | Fetches production orders for a given plant, material, and date range |
| BAPI_PRODORDCONF_CREATE_HDR | ECC/S4 | Create Confirmation (Header) / 확인 생성 (헤더) | Posts a header-level confirmation on a production order, quantities included |
| BAPI_PRODORDCONF_CREATE_TT | ECC/S4 | Create Confirmation (Time Ticket) / 확인 생성 (작업 시간표) | Confirms operations one by one, carrying time and quantities |
| BAPI_PRODORDCONF_CANCEL | ECC/S4 | Cancel Confirmation / 확인 취소 | Cancels a production order confirmation that was already posted |
| BAPI_GOODSMVT_CREATE | ECC/S4 | Post Goods for Production / 생산 재고 이동 | Issues goods to a production order (mvt 261) and posts the GR from production (mvt 101) |
| BAPI_MATERIAL_AVAILABILITY | ECC/S4 | Check Material Availability / 자재 가용성 검사 | Runs the ATP check on components before an order is released |

## BOM & Routing BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_BOM_GETDETAIL | ECC/S4 | Get BOM Detail / BOM 상세 조회 | Returns a BOM's header along with its items (MAST, STKO, STPO) |
| BAPI_ROUTING_GET_DETAIL | ECC/S4 | Get Routing Detail / 라우팅 상세 조회 | Returns the operations and sequences of a routing (PLKO, PLPO) |
| BAPI_WORKCENTER_GET_DETAIL | ECC/S4 | Get Work Center Detail / 작업장 상세 조회 | Returns capacity and scheduling data for a work center (CRHD, CRCA) |

## MRP BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_REQUIREMENTS_CREATE | ECC/S4 | Create Planned Independent Requirements / 독립 소요 계획 생성 | Writes a PIR that demand planning will use (PBHI/PBIM) |
| BAPI_REQUIREMENTS_CHANGE | ECC/S4 | Change Planned Independent Requirements / 독립 소요 계획 변경 | Changes a PIR that already exists |
| BAPI_PLANNEDORDER_CREATE | ECC/S4 | Create Planned Order / 계획 오더 생성 | Adds a planned order by hand |
| BAPI_PLANNEDORDER_CHANGE | ECC/S4 | Change Planned Order / 계획 오더 변경 | Revises the quantities/dates on a planned order |
| BAPI_PLANNEDORDER_GET_DETAIL | ECC/S4 | Get Planned Order Detail / 계획 오더 상세 조회 | Returns a planned order out of PLAF |

## Utility FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| CO_BO_PRODUCTION_ORDER_READ | ECC/S4 | Read Production Order / 제조 오더 조회 | Internal FM: reads a production order in full |
| CS_BOM_EXPL_MAT_V2 | ECC/S4 | BOM Explosion / BOM 전개 | Runs a multi-level BOM explosion for a given material/plant/usage |
| MD_MRP_PARAMETERS_MATERIAL | ECC/S4 | Read MRP Parameters / MRP 매개변수 조회 | Picks the MRP-relevant material fields out of MARC |
| BAPI_CAPACITY_REQUIREMENTS | ECC/S4 | Get Capacity Requirements / 용량 소요량 조회 | Returns the capacity requirements of work centers |
| CF_MATERIAL_PROPERTIES_GET | ECC/S4 | Get Material Properties for PP / PP용 자재 속성 조회 | Returns the material master fields that matter to PP |
