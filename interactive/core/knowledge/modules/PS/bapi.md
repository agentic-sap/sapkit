# PS - Project System BAPIs & Function Modules
# PS - 프로젝트 시스템 BAPI 및 기능 모듈

## Project Definition & WBS BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_PROJECTDEF_CREATE | ECC/S4 | Create Project Definition / 프로젝트 정의 생성 | Writes the header record into PROJ |
| BAPI_PROJECTDEF_UPDATE | ECC/S4 | Update Project Definition / 프로젝트 정의 변경 | Changes the attributes held on a project |
| BAPI_PROJECTDEF_GETDETAIL | ECC/S4 | Get Project Definition Detail / 프로젝트 정의 상세 | Fetches the PROJ record |
| BAPI_PROJECT_GETINFO | ECC/S4 | Get Project Info (multi-level) / 프로젝트 정보 조회 | Returns the project along with its WBS and network hierarchy |
| BAPI_PROJECT_MAINTAIN | ECC/S4 | Maintain Project Structure / 프로젝트 구조 유지 | Covers full CRUD over the project definition, the WBS and milestones |
| BAPI_BUS2001_CREATE | ECC/S4 | Create Project (BO) / 프로젝트 생성 (BO) | Creates a project the object-oriented way |
| BAPI_BUS2001_CHANGE | ECC/S4 | Change Project (BO) / 프로젝트 변경 | Applies the change through the BO wrapper |
| BAPI_BUS2001_DELETE | ECC/S4 | Delete Project (BO) / 프로젝트 삭제 | Operates through the deletion flag |
| BAPI_BUS2054_CREATE_MULTI | ECC/S4 | Create WBS Elements (multiple) / WBS 다중 생성 | Creates WBS elements in bulk beneath a project |
| BAPI_BUS2054_CHANGE_MULTI | ECC/S4 | Change WBS Elements / WBS 다중 변경 | Changes WBS elements in bulk |
| BAPI_BUS2054_GETDATA | ECC/S4 | Read WBS Detail / WBS 상세 조회 | Pulls the fields out of PRPS |
| BAPI_BUS2054_DELETE_MULTI | ECC/S4 | Delete WBS / WBS 삭제 | Turns the deletion flag on |

## Network & Activity BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_NETWORK_MAINTAIN | ECC/S4 | Create/Change Network / 네트워크 생성·변경 | Handles the whole of network maintenance (header, activities, relationships) |
| BAPI_NETWORK_GETLIST | ECC/S4 | List Networks / 네트워크 목록 | Narrows the selection by project, plant and dates |
| BAPI_NETWORK_GETDETAIL | ECC/S4 | Network Detail / 네트워크 상세 | Returns the header/activities/components |
| BAPI_NETWORK_COMP_ADD | ECC/S4 | Add Network Components / 자재 구성요소 추가 | Attaches materials to activities |
| BAPI_NETWORK_COMP_CHANGE | ECC/S4 | Change Components / 구성요소 변경 | Revises the data on a component |
| BAPI_BUS2002_ACT_CREATE_MULTI | ECC/S4 | Create Activities / 활동 다중 생성 | Appends activities beneath a network |
| BAPI_BUS2002_ACT_CHANGE_MULTI | ECC/S4 | Change Activities / 활동 변경 | Changes the AFVC/AFVV data |
| BAPI_ACTIVITY_ALLOC_POST | ECC/S4 | Post Activity Allocation / 활동 배분 포스팅 | Posts a CO allocation onto a WBS/network |

## Process & Commit BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_PS_INITIALIZATION | ECC/S4 | Initialize PS Buffers / PS 버퍼 초기화 | Required ahead of the project maintain BAPIs |
| BAPI_PS_PRECOMMIT | ECC/S4 | Pre-Commit Validation / 사전 커밋 검증 | Checks that the buffer is consistent before the COMMIT |
| BAPI_PS_POSTCOMMIT | ECC/S4 | Post-Commit Processing / 사후 커밋 처리 | Serves as the post-processing hook |
| BAPI_TRANSACTION_COMMIT | ECC/S4 | Commit Transaction / 트랜잭션 커밋 | Makes the PS changes permanent (wait=X recommended) |
| BAPI_TRANSACTION_ROLLBACK | ECC/S4 | Rollback Transaction / 롤백 | Throws away the uncommitted buffer |

## Milestone, Planning & Billing
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_BUS2040_CREATE | ECC/S4 | Create Milestone / 마일스톤 생성 | Writes into MLST |
| BAPI_BUS2040_CHANGE | ECC/S4 | Change Milestone / 마일스톤 변경 | Changes the fields held in MLST |
| BAPI_PROJECT_SIMULATION_CREATE | ECC/S4 | Create Project Simulation / 프로젝트 시뮬레이션 생성 | Serves version management |
| BAPI_PROJECT_SIMULATION_TRANSFER | ECC/S4 | Transfer Simulation to Operational / 시뮬레이션 전환 | Moves the simulated project across |
| BAPI_NETWORKCONF_CREATE_MULTI | ECC/S4 | Confirm Network Activities / 네트워크 확인 | Acts as the confirmation BAPI |
| BAPI_COSTACTPLN_POSTPRIMCOST | ECC/S4 | Post Primary Cost Planning / 1차 원가 계획 포스팅 | Plans cost elements WBS by WBS |
| CJ_MILESTONE_BILLING | ECC/S4 | Milestone Billing Release / 마일스톤 대금청구 승인 | Sets off the release of the billing plan |

## Utility FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| CJDB_PROJ_GET | ECC/S4 | Read Project Database / 프로젝트 DB 조회 | A wrapper that reads PROJ+PRPS |
| CNIF_PS_OBJECT_READ | ECC/S4 | Read PS Object / PS 객체 조회 | Reads project objects generically |
| CN_AC_LIST_SELECTION | ECC/S4 | Activity Selection / 활동 선택 | Called by the info system |
| K_WBS_ELEMENT_GET | ECC/S4 | Read WBS Element / WBS 조회 | Reads PRPS keyed on POSID |
| BAPI_BUS2054_PARTNER_ASSIGN | ECC/S4 | Assign Partners (BP) / 파트너 배정 | Attaches a BP to the WBS (S/4) |
