# Common - Cross-Module BAPIs & Function Modules
# 공통 - 교차 모듈 BAPI 및 기능 모듈

SAP 모듈을 가리지 않고 공통으로 쓰이는 범용 BAPI/FM을 모아 둔 참조.
A reference for the generic BAPIs/FMs that every SAP module draws on.

## IDOC Processing / IDOC 처리

| BAPI/FM | System | Description / 설명 |
|---------|--------|---------------------|
| IDOC_INBOUND_SYNCHRONOUS | ECC/S4 | Process inbound IDoc synchronously / 수신 IDoc을 동기 방식으로 처리 |
| IDOC_INBOUND_ASYNCHRONOUS | ECC/S4 | Inbound IDoc arriving asynchronously / 비동기 방식으로 들어오는 수신 IDoc |
| IDOC_INBOUND_WRITE_TO_DB | ECC/S4 | Write the IDoc into the DB / IDoc을 DB에 적재 |
| IDOC_OUTPUT_CALL_TRIGGER | ECC/S4 | Initiate an outbound IDoc / 발신 IDoc을 촉발 |
| MASTER_IDOC_DISTRIBUTE | ECC/S4 | Master-data IDoc distribution / 마스터 데이터 IDoc의 배포 |
| EDI_DOCUMENT_OPEN_FOR_PROCESS | ECC/S4 | IDoc opened for processing / 처리 대상 IDoc 열기 |
| IDOC_STATUS_WRITE_TO_DATABASE | ECC/S4 | Record the IDoc status / IDoc 상태 기입 |
| BAPI_IDOC_INPUT1 | ECC/S4 | All-purpose BAPI for the inbound IDoc side / 수신 IDoc 쪽에 쓰는 범용 BAPI |
| ALE_MODEL_INFO_GET | ECC/S4 | Read out the ALE distribution model / ALE 배포 모델 읽기 |

## Number Range / 번호 범위

| BAPI/FM | System | Description / 설명 |
|---------|--------|---------------------|
| NUMBER_GET_NEXT | ECC/S4 | Draw the next number out of the range / 다음 번호 받기 |
| NUMBER_GET_INFO | ECC/S4 | Read information about the number range / 번호 범위 정보 읽기 |
| NUMBER_RANGE_UPDATE | ECC/S4 | Change a number range / 번호 범위 갱신 |
| NUMBER_RANGE_INTERVAL_LIST | ECC/S4 | Enumerate the intervals / 구간 나열 |
| NUMBER_CHECK | ECC/S4 | Verify a number falls within the range / 범위 내 유효 여부 확인 |

## User / Authorization / 사용자 및 권한

| BAPI/FM | System | Description / 설명 |
|---------|--------|---------------------|
| BAPI_USER_CREATE1 | ECC/S4 | Set up a new SAP user / SAP 사용자 신규 생성 |
| BAPI_USER_CHANGE | ECC/S4 | Modify an existing user / 기존 사용자 변경 |
| BAPI_USER_GETLIST | ECC/S4 | Pull a list of users / 사용자 목록 추출 |
| BAPI_USER_GET_DETAIL | ECC/S4 | Read out a user's details / 사용자 상세 정보 읽기 |
| BAPI_USER_LOCK/UNLOCK | ECC/S4 | Lock a user, or release the lock / 사용자를 잠그거나 잠금 해제 |
| AUTHORITY_CHECK | ECC/S4 | Authority check in ABAP (statement) / ABAP에서의 권한 점검 |
| AUTH_CHECK_TCODE | ECC/S4 | Test whether a TCode is authorized / TCode 권한 여부 확인 |
| AUTHORITY_CHECK_DATASET | ECC/S4 | Authorization check on file access / 파일 접근 권한 점검 |
| SUSR_USER_READ | ECC/S4 | Fetch a user's data / 사용자 데이터 조회 |

## Currency / Exchange Rate / 통화 및 환율

| BAPI/FM | System | Description / 설명 |
|---------|--------|---------------------|
| BAPI_EXCHANGERATE_GETDETAIL | ECC/S4 | Fetch an exchange rate / 환율 읽기 |
| BAPI_EXCHANGERATE_SAVEREPLICA | ECC/S4 | Store a replicated rate / 환율 복제본 저장 |
| BAPI_EXCHANGERATE_GETLISTRATES | ECC/S4 | Fetch rates as a list / 환율을 목록으로 조회 |
| BAPI_CURRENCY_CONV_TO_EXTERNAL | ECC/S4 | Conversion into display format / 외부 표시 형식으로 변환 |
| BAPI_CURRENCY_CONV_TO_INTERNAL | ECC/S4 | Conversion into internal format / 내부 형식으로 변환 |
| CONVERT_TO_LOCAL_CURRENCY | ECC/S4 | Convert into local currency / 현지 통화로 환산 |
| CONVERT_TO_FOREIGN_CURRENCY | ECC/S4 | Convert into foreign currency / 외화로 환산 |
| READ_EXCHANGE_RATE | ECC/S4 | Read from TCURR / TCURR에서 읽기 |

## Country / Language / Units / 국가, 언어, 단위

| BAPI/FM | System | Description / 설명 |
|---------|--------|---------------------|
| BAPI_COUNTRY_GETLIST | ECC/S4 | Countries as a list (T005) / 국가 목록 조회 |
| BAPI_COUNTRY_GETDETAIL | ECC/S4 | Details for a country / 국가 상세 정보 |
| BAPI_LANGUAGE_GETLIST | ECC/S4 | Languages as a list / 언어 목록 조회 |
| BAPI_UNIT_OF_MEASURE_GETLIST | ECC/S4 | UoM as a list / 측정 단위 목록 조회 |
| UNIT_CONVERSION_SIMPLE | ECC/S4 | Conversion from one UoM to another / 단위 간 변환 |
| UNIT_CONVERSION_WITH_FACTOR | ECC/S4 | Conversion factor applied / 변환 계수 적용 |

## Calendar / 달력

| BAPI/FM | System | Description / 설명 |
|---------|--------|---------------------|
| FACTORYDATE_CONVERT_TO_DATE | ECC/S4 | Turn a factory date into a date / 공장 날짜를 날짜로 변환 |
| DATE_CONVERT_TO_FACTORYDATE | ECC/S4 | Turn a date into a factory date / 날짜를 공장 날짜로 변환 |
| DATE_COMPUTE_DAY | ECC/S4 | Work out the day of the week / 요일 산출 |
| DATE_CHECK_PLAUSIBILITY | ECC/S4 | Check that a date is valid / 날짜 유효성 검사 |
| FACTORYDATE_GET_NEXT | ECC/S4 | Factory day that comes next / 이어지는 공장 영업일 |
| HOLIDAY_CHECK_AND_GET_INFO | ECC/S4 | Decide whether a date is a holiday / 날짜의 휴일 여부 확인 |
| BAPI_BUPA_BIRTHDATE_CHANGE | ECC/S4 | (example calendar-related) / 달력 관련 예시 |

## Transaction Control / 트랜잭션 제어

| BAPI/FM | System | Description / 설명 |
|---------|--------|---------------------|
| BAPI_TRANSACTION_COMMIT | ECC/S4 | Commit the current SAP LUW (CRITICAL for all BAPIs) / SAP LUW 커밋 (필수) |
| BAPI_TRANSACTION_ROLLBACK | ECC/S4 | Roll the work back / 작업 내용 롤백 |
| ENQUEUE_* | ECC/S4 | Lock objects ahead of modification / 수정에 앞서 잠금 설정 |
| DEQUEUE_* | ECC/S4 | Drop the locks / 잠금 풀기 |

## Generic Data Access / 범용 데이터 액세스

| BAPI/FM | System | Description / 설명 |
|---------|--------|---------------------|
| RFC_READ_TABLE | ECC/S4 | Read a table generically over RFC (USE WITH CAUTION — performance) / RFC를 통한 범용 테이블 읽기 (성능 주의) |
| RFC_GET_TABLE_ENTRIES | ECC/S4 | Pull entries out of a table / 테이블 항목 읽기 |
| DDIF_FIELDINFO_GET | ECC/S4 | Read DDIC field information / DDIC 필드 정보 조회 |
| DDIF_TABL_GET | ECC/S4 | Read a table's metadata / 테이블 메타데이터 조회 |
| RS_COMPLEX_OBJECT_BUILD | ECC/S4 | Assemble complex objects / 복합 오브젝트 구성 |

## Output / Messages / 출력 및 메시지

| BAPI/FM | System | Description / 설명 |
|---------|--------|---------------------|
| MESSAGE_TEXT_BUILD | ECC/S4 | Assemble the message from ID/Number / 메시지 ID/번호로 텍스트 구성 |
| BAL_LOG_CREATE | ECC/S4 | Create an application log / 애플리케이션 로그 만들기 |
| BAL_LOG_MSG_ADD | ECC/S4 | Append a message onto the log / 로그에 메시지 덧붙이기 |
| BAL_DB_SAVE | ECC/S4 | Persist the app log into the DB / 앱 로그를 DB에 적재 |
| BAL_DSP_LOG_DISPLAY | ECC/S4 | Put the log on display / 로그 보여 주기 |

## Workflow / 워크플로우

| BAPI/FM | System | Description / 설명 |
|---------|--------|---------------------|
| SAP_WAPI_CREATE_EVENT | ECC/S4 | Raise a workflow event / 워크플로우 이벤트 발생 |
| SAP_WAPI_WORKITEM_COMPLETE | ECC/S4 | Mark a workitem as done / 작업 항목을 완료 처리 |
| SAP_WAPI_START_WORKFLOW | ECC/S4 | Launch a workflow / 워크플로우 개시 |

## S/4HANA Specific / S/4HANA 전용

| BAPI/FM/Class | System | Description / 설명 |
|---------------|--------|---------------------|
| CL_ABAP_CONTEXT_INFO=>GET_USER_TECHNICAL_NAME | S4 | Get the user in a cloud-compatible way / 클라우드 호환 방식으로 사용자 조회 |
| /UI2/CL_JSON | S4 | Parsing of JSON / JSON 파싱 담당 |
| CL_HTTP_CLIENT | ECC/S4 | HTTP client / HTTP 클라이언트 |
