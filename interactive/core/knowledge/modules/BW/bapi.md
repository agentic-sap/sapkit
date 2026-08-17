# BW - Business Warehouse BAPIs & Function Modules
# BW - 비즈니스 웨어하우스 BAPI 및 기능 모듈

## Core BAPIs / APIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_IOBJ_GETLIST | ECC/S4 | Get InfoObject List / InfoObject 목록 조회 | Returns every InfoObject whose type matches the one requested (characteristic, key figure) |
| BAPI_IOBJ_GETDETAIL | ECC/S4 | Get InfoObject Detail / InfoObject 상세 조회 | Reads out an InfoObject's properties and attributes |
| BAPI_CUBE_GETLIST | ECC | Get InfoCube List / InfoCube 목록 조회 | Fetches InfoCubes as a list. BW/4HANA: InfoCubes deprecated, use ADSO |
| BAPI_CUBE_GETDETAIL | ECC | Get InfoCube Detail / InfoCube 상세 조회 | Returns an InfoCube's structure. BW/4HANA: Use ADSO |
| BAPI_ODSO_GETLIST | ECC/S4 | Get DSO List / DSO 목록 조회 | Enumerates the DataStore Objects |
| BAPI_ODSO_GETDETAIL | ECC/S4 | Get DSO Detail / DSO 상세 조회 | Reads a DSO's field structure |
| BAPI_QUERY_GETLIST | ECC/S4 | Get Query List / 쿼리 목록 조회 | Returns the BEx queries that belong to an InfoProvider |
| BAPI_QUERY_GETDETAIL | ECC/S4 | Get Query Detail / 쿼리 상세 조회 | Delivers a query's definition along with its characteristics and key figures |

## Data Loading FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| RSDMD_MASTERDATA_WRITE | ECC/S4 | Write Master Data / 마스터 데이터 쓰기 | Pushes characteristic master data (attributes, texts, hierarchies) into BW |
| RSDMD_MASTERDATA_READ | ECC/S4 | Read Master Data / 마스터 데이터 읽기 | Reads the BW master data held for a characteristic |
| RSIODS_WRITE_TO_ODSO | ECC/S4 | Write to DSO / DSO에 쓰기 | Puts records into a DataStore Object |
| RSIODS_READ_FROM_ODSO | ECC/S4 | Read from DSO / DSO에서 읽기 | Pulls data records out of a DSO's active table |
| RSB_API_IPAK_GET_LIST | ECC/S4 | Get InfoPackage List / InfoPackage 목록 조회 | Gathers the InfoPackages tied to a DataSource |
| RSB_API_IPAK_EXECUTE | ECC/S4 | Execute InfoPackage / InfoPackage 실행 | Kicks off the data load behind an InfoPackage (full or delta) |
| RSPC_API_CHAIN_START | ECC/S4 | Start Process Chain / 프로세스 체인 시작 | Launches a BW process chain from program code |
| RSPC_API_CHAIN_GET_STATE | ECC/S4 | Get Process Chain State / 프로세스 체인 상태 조회 | Reports the current run status of a process chain |

## Query / Reporting FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BICS_PROV_OPEN | ECC/S4 | Open BW Provider (BICS) / BW 공급자 열기 (BICS) | Opens an InfoProvider through the BICS interface so its data can be read |
| BICS_PROV_GET_RESULT_SET | ECC/S4 | Get Query Result Set / 쿼리 결과 집합 조회 | Runs the query and takes the result data back out of BICS |
| BICS_PROV_CLOSE | ECC/S4 | Close BW Provider / BW 공급자 닫기 | Closes the BICS provider once the reading is done |
| RSBOLAP_READ_DATA | ECC | Read OLAP Data / OLAP 데이터 읽기 | An older-generation API. BW/4HANA: Use BICS interface |

## Extractor / Delta FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| RSA3_DATASOURCE_TEST | ECC/S4 | Test DataSource Extraction / DataSource 추출 테스트 | Dry-runs a data extraction out of the source system (RSA3 equivalent) |
| RODPS_REPL_ODATA_SRV_CALL | ECC/S4 | Call ODP OData Service / ODP OData 서비스 호출 | Sets an ODP (Operational Data Provisioning) delta extraction running |
| BAPI_MASTERDATA_SEND | ECC/S4 | Send Master Data to BW / BW에 마스터 데이터 전송 | Sends master data out of ERP to BW over ALE/IDoc |

## Utility FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| RSDRI_INFOPROV_READ | ECC/S4 | Read InfoProvider Data / InfoProvider 데이터 읽기 | Reads data straight out of any BW InfoProvider (cube, DSO, CompositeProvider) |
| RSSEM_BPS_WRITE_DATA | ECC | Write BPS Planning Data / BPS 계획 데이터 쓰기 | BPS is deprecated. BW/4HANA: Use BPC or SAC Planning |
| RSZR_GET_OBJECTS | ECC/S4 | Get Query Objects / 쿼리 개체 조회 | Returns query metadata objects held in RSZCOMPDIR |
