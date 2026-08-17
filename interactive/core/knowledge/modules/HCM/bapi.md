# HCM - Human Capital Management BAPIs & Function Modules
# HCM - 인적 자본 관리 BAPI 및 기능 모듈

> **S/4HANA Cloud에서 HCM의 자리를 넘겨받는 것은 SAP SuccessFactors입니다. S/4HANA On-Premise에서는 HCM 기능이 대부분 그대로 남습니다.**
> **On S/4HANA Cloud, it is SAP SuccessFactors that takes over from HCM. On S/4HANA On-Premise, most HCM functionality stays in place.**

## Core BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_EMPLOYEE_GETDATA | ECC/S4 | Get Employee Data / 직원 데이터 조회 | Reads out an employee's infotype data once a personnel number and infotype are supplied |
| BAPI_EMPLOYEE_ENQUEUE | ECC/S4 | Lock Employee Record / 직원 레코드 잠금 | Takes a lock on the employee before changes are made |
| BAPI_EMPLOYEE_DEQUEUE | ECC/S4 | Unlock Employee Record / 직원 레코드 잠금 해제 | Releases the employee lock once the changes are done |
| BAPI_PERSDATA_CREATE | ECC/S4 | Create Personnel Data / 인사 데이터 생성 | Writes a new infotype record for an employee |
| BAPI_PERSDATA_CHANGE | ECC/S4 | Change Personnel Data / 인사 데이터 변경 | Changes an infotype record that already exists |
| BAPI_PERSDATA_DELETE | ECC/S4 | Delete Personnel Data / 인사 데이터 삭제 | Delimits an infotype record or deletes it outright |
| BAPI_PERSDATA_GETDETAIL | ECC/S4 | Get Personnel Data Detail / 인사 데이터 상세 조회 | Reads one particular infotype record (IT0001, IT0002, IT0007...) |
| BAPI_EMPLOYMENT_GETLIST | ECC/S4 | Get Employment List / 재직 목록 조회 | Fetches a list of employees selected on assorted criteria |
| BAPI_HRORGUNIT_GETLIST | ECC/S4 | Get Org Unit List / 조직 단위 목록 조회 | Lists the organizational units held in OM |
| BAPI_HRORGUNIT_GETDETAIL | ECC/S4 | Get Org Unit Detail / 조직 단위 상세 조회 | Reads out an org unit's attributes (HRP1000, HRP1001) |
| BAPI_ORGUNITREL_GETLIST | ECC/S4 | Get Org Unit Relationships / 조직 단위 관계 목록 조회 | Reads the relationship data held on org units |

## Organizational Management BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_POSITION_GETDETAIL | ECC/S4 | Get Position Detail / 직위 상세 조회 | Reads position data out of OM (HRP1000, HRP1001) |
| BAPI_POSITION_GETLIST | ECC/S4 | Get Position List / 직위 목록 조회 | Lists the positions sitting in the organizational structure |
| BAPI_ORGOBJECT_CREATE | ECC/S4 | Create OM Object / OM 개체 생성 | Sets up an org unit, a position or a job inside OM |
| BAPI_ORGOBJECT_CHANGE | ECC/S4 | Change OM Object / OM 개체 변경 | Changes the attributes on an OM object |

## Time Management BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_ABSENCE_CREATE | ECC/S4 | Create Absence Record / 결근 레코드 생성 | Writes an absence record on infotype IT2001 |
| BAPI_ABSENCE_GETLIST | ECC/S4 | Get Absence List / 결근 목록 조회 | Reads an employee's absence records |
| BAPI_TIMESHEETADM_APPROVE | ECC/S4 | Approve Time Sheet / 시간 기록 승인 | Approves time sheet entries in CATS |
| BAPI_TIMESHEETADM_REJECT | ECC/S4 | Reject Time Sheet / 시간 기록 거부 | Rejects time sheet entries in CATS |
| RPTQTA00 | ECC/S4 | Quota Generation / 할당량 생성 | Builds employees' leave quotas (program, not FM) |

## Payroll FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| PYXX_READ_PAYROLL_RESULT | ECC/S4 | Read Payroll Result / 급여 결과 조회 | Reads payroll cluster data (RT, CRT, BT tables) out of PCL2 |
| HR_DISPLAY_PAYRESULT | ECC/S4 | Display Payroll Result / 급여 결과 표시 | Shows the payroll result cluster in formatted form |
| CU_READ_RGDIR | ECC/S4 | Read Payroll Directory / 급여 디렉토리 조회 | Reads an employee's payroll run directory (RGDIR) |
| BAPI_PAYROLL_SIMULATION | ECC/S4 | Simulate Payroll / 급여 시뮬레이션 | Puts an employee through a payroll simulation |

## Utility FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| HR_READ_INFOTYPE | ECC/S4 | Read HR Infotype / HR 인포 유형 조회 | The generic internal FM for reading any infotype against a personnel number |
| RP_READ_ALL_TIME_ITY | ECC/S4 | Read All Time Infotypes / 모든 시간 인포 유형 조회 | Reads every time-relevant infotype an employee has |
| BAPI_HRPAYROLL_GETLIST | ECC/S4 | Get Payroll Area List / 급여 영역 목록 조회 | Lists the payroll areas held in T549A |
| RH_READ_OBJECT | ECC/S4 | Read OM Object / OM 개체 조회 | Reads any OM object, given its object type and ID |
