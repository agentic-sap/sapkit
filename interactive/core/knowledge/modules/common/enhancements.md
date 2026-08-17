# Common - Cross-Module Enhancements
# 공통 - 교차 모듈 향상

사용자 출구와 BAdI, 향상점 가운데 모든 SAP 모듈이 공통으로 쓰는 것들을 모은 참조.
User exits, BAdIs, and enhancement spots that every SAP module uses in common.

## Authorization Check Enhancements / 권한 점검 향상

| Enhancement | System | Description / 설명 |
|-------------|--------|---------------------|
| SUSR0001 | ECC/S4 | User exit that checks the password / 비밀번호를 검사하는 사용자 출구 |
| SUSR0002 | ECC/S4 | User exit placed in user maintenance / 사용자 유지에 놓인 출구 |
| BADI_CCM_AUTHORITY | ECC/S4 | Authorization checks defined by the user / 사용자가 정의하는 권한 점검 |
| AUTHORITY_CHECK | ECC/S4 | ABAP statement, which can be enhanced by wrapping it / ABAP 명령문 |

## Number Range Enhancements / 번호 범위 향상

| Enhancement | System | Description / 설명 |
|-------------|--------|---------------------|
| NUMBER_RANGE_NR_DATE | ECC/S4 | BAdI for number ranges / 번호 범위용 BAdI |
| SAPLSNR3 customer exit | ECC/S4 | 고객 출구 |
| BAdI EXIT_SAPLSNR3_001 | ECC/S4 | SAPLSNR3에 딸린 BAdI |

## IDoc Processing (Generic) / IDoc 처리 (범용)

| Enhancement | System | Description / 설명 |
|-------------|--------|---------------------|
| IDOC_DATA_MAPPER | ECC/S4 | BAdI that maps IDoc data generically / 범용으로 IDoc을 매핑하는 매퍼 |
| EDI_IDOC_INPUT | ECC/S4 | Exit for inbound IDocs / 수신되는 IDoc에 걸리는 출구 |
| BD_BADI_IDOC_DATA_MAPPER | ECC/S4 | Maps IDocs / IDoc을 매핑한다 |
| Change view for inbound: WE57 | ECC/S4 | 수신 IDoc의 뷰를 변경한다 |
| Outbound exit per message type | ECC/S4 | 메시지 유형마다 따로 두는 발신 출구 |
| ZXEDIZZZ | ECC | IDoc user exit wired through CMOD; legacy / CMOD로 거는 레거시 IDoc 출구 |

## Change Document Enhancements / 변경 문서 향상

| Enhancement | System | Description / 설명 |
|-------------|--------|---------------------|
| CHANGEDOCUMENT_OPEN | ECC/S4 | Opens the change document / 변경 문서를 연다 |
| CHANGEDOCUMENT_SINGLE_CASE | ECC/S4 | Single case / 단일 케이스 |
| CHANGEDOCUMENT_CLOSE | ECC/S4 | Closes / 닫는다 |
| Object-specific CHANGEDOCUMENT_* | ECC/S4 | 오브젝트마다 따로 있는 변경 문서 FM |
| SCDO | ECC/S4 | Change document object transaction / 변경 문서 오브젝트에 쓰는 트랜잭션 |

## Application Log Enhancements / 애플리케이션 로그 향상

| Enhancement | System | Description / 설명 |
|-------------|--------|---------------------|
| BAL_LOG_CREATE | ECC/S4 | FM that creates a log / 로그를 만드는 FM |
| BAL_LOG_MSG_ADD | ECC/S4 | Adds a message / 메시지를 덧붙인다 |
| BAL_CALLBACK_SETUP | ECC/S4 | BAdI for setting up the callback / 콜백을 설정하는 BAdI |

## Workflow Enhancements / 워크플로우 향상

| Enhancement | System | Description / 설명 |
|-------------|--------|---------------------|
| SAP_WAPI_CREATE_EVENT | ECC/S4 | Triggers an event / 이벤트를 발생시킨다 |
| SWO1 | ECC/S4 | Maintains business objects / 비즈니스 오브젝트를 유지한다 |
| WF_BADI_BACKGROUND | ECC/S4 | BAdI for background processing / 백그라운드 처리용 BAdI |
| WORKITEM_CHANGE | ECC/S4 | BAdI for changing a work item / 작업 항목을 변경하는 BAdI |

## Batch Input Enhancements / 배치 입력 향상

| Enhancement | System | Description / 설명 |
|-------------|--------|---------------------|
| BDC_OPEN_GROUP | ECC/S4 | Opens a BDC session / BDC 세션을 연다 |
| BDC_INSERT | ECC/S4 | Inserts BDC data / BDC 데이터를 넣는다 |
| BDC_CLOSE_GROUP | ECC/S4 | Closes the BDC session / BDC 세션을 닫는다 |
| Custom BDC session handling | ECC/S4 | 사용자가 정의하는 BDC 세션 처리 |

## Output Determination (NACE generic) / 출력 결정 (NACE 범용)

| Enhancement | System | Description / 설명 |
|-------------|--------|---------------------|
| EXIT_SAPLV61B_001 | ECC/S4 | Customer exit for output determination data / 출력 결정 데이터용 고객 출구 |
| OUTPUT_DETERMINATION | ECC/S4 | Output determination BAdI / 출력 결정에 쓰는 BAdI |
| VOFM routines | ECC/S4 | Common in SD; used in MM and FI as well / SD에서 흔히 쓰이고 MM과 FI에서도 쓰이는 VOFM 루틴 |

## CDS / RAP Common Extensions (S/4HANA) / CDS 및 RAP 확장

| Enhancement | System | Description / 설명 |
|-------------|--------|---------------------|
| CDS View Extension | S4 | @AbapCatalog.extensibility / CDS 뷰 확장 |
| Meta-extension annotations | S4 | @Metadata.ignorePropagatedAnnotations / 메타 확장 어노테이션 |
| Behavior Definition extensions | S4 | RAP behavior extensions / RAP 동작 정의 확장 |
| Core Data Services annotations | S4 | CDS 어노테이션 |

## Global Class Enhancements (Method Additions) / 글로벌 클래스 향상

| Enhancement | System | Description / 설명 |
|-------------|--------|---------------------|
| Enhancement Implementations (SE19) | ECC/S4 | Aimed at global classes / 글로벌 클래스를 대상으로 한다 |
| Method Extensions | ECC/S4 | Pre/post/overwrite methods / 전/후/덮어쓰기 메서드 |
| Implicit Enhancements | ECC/S4 | ENHANCEMENT-POINT / 암시적 향상점 |

## Archive Enhancements / 아카이브 향상

| Enhancement | System | Description / 설명 |
|-------------|--------|---------------------|
| ARCHIVE_OPEN_* | ECC/S4 | FMs that open the archive / 아카이브를 여는 FM |
| ARCHIVE_WRITE_* | ECC/S4 | FMs that write to the archive / 아카이브에 쓰는 FM |
| ARCHIVE_SAVE | ECC/S4 | Saves the archive / 아카이브를 저장한다 |
| Archive Object-specific programs | ECC/S4 | 아카이브 오브젝트마다 따로 있는 프로그램 |
| BAdI ARCHIVE_RELOAD | ECC/S4 | 아카이브를 되불러오는 BAdI |

## Common SAP Enhancement Spots (ES_*) / 공통 SAP 향상점

| Enhancement Spot | System | Description / 설명 |
|------------------|--------|---------------------|
| ES_SAPUSER | ECC/S4 | User exits / 사용자 출구 |
| ES_SAPLSNR3 | ECC/S4 | Number ranges / 번호 범위 |
| ES_SAPLEINA | ECC/S4 | General purchasing / 일반 구매 |
| ES_SAPLKKBL | ECC/S4 | Document display / 문서 표시 |
