# ABAP RULES.seed — 후보 풀

후보 풀 — `.harness/RULES.md` 승격은 사람 승인 게이트(PROTOCOL.md) 경유, 자동 주입 금지
(DESIGN §12). 이 파일 자체는 무인 step에 주입되지 않는다. 실전 실패(LESSONS)가 이 중
하나를 재확인하면 harness-lesson 절차로 `.harness/RULES.md`에 개별 승격을 검토한다.

원천 3곳(DESIGN §10): ① **vsp embedded standards** — `vsp.exe`를 `--offline` 플래그로
MCP stdio 서버 모드 기동 시 `ListStandards`/`GetStandard` 도구로 조회 가능(SAP 연결
불요). 이 풀에서는 본문을 복사하지 않고 표준 제목만 인용 — 실제 적용 시 위 두 도구로
전문을 조회할 것. ② `interactive/core/knowledge/abap/`(지식 정본, 읽기 전용) — vsp
표준에 없는 심화 ABAP 언어 주제만 발췌. ③ **JNC 교훈 팩 층3(방법론 시드)** — 라이브 S/4 관통에서 실패 부검으로 확정한 방법론
교훈(R-001~R-013 계열)의 일반화본 중, 무인 step에 부정형 제약으로 강제할 가치가 있는
소수 항목만 발췌(정본 감사: `docs/reference/audits/2026-07-18-5-13-layer3-audit.md`).

형식: `- S-NNN [area] <부정형 규칙> — <실패 모드> (출처: ...)`

---

- S-001 [naming] Z/Y 접두사 없이 커스텀 오브젝트를 생성하지 마라 — 네임스페이스 충돌, 표준 오브젝트로 오인되어 SAP 업그레이드 시 덮어써질 수 있다 (출처: vsp standard "Naming Conventions")
- S-002 [ddic] 수량/금액/날짜/번호/상태값 필드에 raw CHAR·NUMC·DEC 타입을 직접 쓰지 마라 — F4 검색도움말·변환루틴(alpha/numc)·외래키 전파·통화·단위 연결이 전부 소실된다 (출처: vsp standard "Field Typing Rule — Data Element First")
- S-003 [alv] ALV 필드카탈로그를 `APPEND ls_fc TO pt_fcat` 반복으로 수기 구성하지 마라 — SALV factory + `cl_salv_controller_metadata=>get_lvc_fieldcatalog` 경유가 표준이며, 위반은 리뷰 단계 MAJOR 확정 이력이 있다 (출처: vsp standard "ALV Rules")
- S-004 [oop] 상속을 의도하지 않은 클래스를 FINAL 없이 두지 마라 — 의도치 않은 서브클래싱으로 계약이 깨지고 리뷰에서 되돌린다 (출처: vsp standard "Clean ABAP — OOP Paradigm")
- S-005 [procedural] PBO/PAI 모듈 본문에 로직을 직접 넣지 마라(FORM 위임 없이) — 화면과 로직이 결합돼 재사용·단위테스트가 불가능해진다 (출처: vsp standard "Clean ABAP — Procedural Paradigm")
- S-006 [text] 화면 라벨·MESSAGE 문에 하드코딩 리터럴을 쓰지 마라 — 번역 불가, 런타임에 `S_BUDAT`/`P_FILE` 같은 기술명이 노출되는 회귀가 리뷰 없이는 검출되지 않는다 (출처: vsp standard "Text Element Rule")
- S-007 [const] 기능 코드·상태값·화면번호·임계치를 CONSTANTS 선언 없이 매직 리터럴로 쓰지 마라 — 오타가 컴파일 시점에 안 잡히고 런타임에만 드러난다 (출처: vsp standard "Constant Rule")
- S-008 [include] Procedural 패러다임 프로그램에 `{PROG}E`(OOP 전용 이벤트 include)를 만들지 마라 — 패러다임 혼입으로 이벤트 블록이 잘못된 위치에 들어간다 (출처: vsp standard "Include Structure Convention")
- S-009 [release] 대상 시스템 ABAP 릴리스를 초과하는 문법을 쓰지 마라(예: 7.40 시스템에 RAP managed implementation) — 활성화 자체가 실패한다 (출처: vsp standard "ABAP Release Reference")
- S-010 [version] ECC 대상 개발에 S/4 전용 테이블·API(MATDOC, ACDOCA, BP용 BUT000 등)를 쓰지 마라 — 오브젝트 부재로 활성화 실패 (출처: vsp standard "SAP Version Reference (ECC vs S/4HANA)")
- S-011 [cloud] ABAP Cloud/S4HANA Cloud Public 대상에 Dynpro·EXEC SQL·BREAK-POINT 등 classic 문법을 쓰지 마라 — 신택스 체크 단계에서 즉시 거부된다 (출처: vsp standard "Cloud ABAP Constraints Reference")
- S-012 [function-module] Function Module 소스에 IMPORTING/EXPORTING/CHANGING/TABLES/EXCEPTIONS 시그니처를 인라인 선언 없이 placeholder로 방치하지 마라 — 파라미터가 실제로 존재하지 않아 호출부가 깨진다 (출처: vsp standard "Function Module Source Convention")
- S-013 [data-access] GetTableContents·RunQuery 등 row-data 조회를 블록 테이블 카테고리(PA*, USR*, BNKA, ACDOCA 등) 확인 없이 호출하지 마라 — PII·자격증명 유출, deny 카테고리는 무조건 차단해야 한다 (출처: vsp standard "Data Extraction Policy")
- S-014 [ecc] ECC 대상에서 DDIC 생성이 ADT 경로로 막히는 경우 helper 프로그램 fallback 절차를 건너뛰고 임의로 우회하지 마라 — 표준 미준수 오브젝트가 생성된다 (출처: vsp standard "ECC DDIC Fallback")
- S-015 [screen] OK_CODE를 CASE sy-ucomm으로 직접 분기하지 마라 — TOP include의 `gv_okcode` 바인딩 3단계 계약(선언·화면 필드 바인딩·PAI에서 로컬 복사 후 CLEAR)을 우회하면 코드 재입력 시 유령 커맨드가 남는다 (출처: vsp standard "OK_CODE Pattern for Procedural Screens")
- S-016 [sql] `FOR ALL ENTRIES`를 원본 내부테이블의 `IS NOT INITIAL` 체크 없이 실행하지 마라 — 빈 테이블이면 WHERE 조건이 무시되고 전체 테이블 풀스캔이 발생한다 (출처: interactive/core/knowledge/abap/reference/references/performance.md#for-all-entries-considerations)
- S-017 [itab] 대량 내부테이블을 free key(`READ TABLE ... WITH KEY`)로 조회하지 마라 — SORTED/HASHED 테이블의 키 접근(O(log n)/O(1)) 대비 O(n) 선형 탐색이 되어 성능이 무너진다 (출처: interactive/core/knowledge/abap/reference/references/performance.md#key-access-optimization)
- S-018 [exception] `CATCH cx_root`로 뭉뚱그려 잡지 마라 — 구체 예외 클래스가 은폐되어 실제 실패 원인을 알 수 없게 된다 (출처: interactive/core/knowledge/abap/reference/references/exceptions.md#best-practices)
- S-019 [unit-test] 프로덕션 클래스의 private 메서드에 접근하려고 `LOCAL FRIENDS`를 남용하지 마라 — 테스트가 public 계약이 아닌 구현 세부에 결합되어 사소한 리팩터링마다 깨진다 (출처: interactive/core/knowledge/abap/reference/references/unit-testing.md#best-practices)
- S-020 [authz] ABAP SQL이 DB 권한 검사를 우회한다는 사실을 무시하고 `AUTHORITY-CHECK` 없이 SELECT만으로 권한 통제가 된다고 가정하지 마라 — 프로그래머가 명시적으로 구현하지 않으면 무인가 접근이 그대로 통과한다 (출처: interactive/core/knowledge/abap/reference/references/authorization.md#important-notes)
- S-021 [cds-authz] CDS 뷰에 `@AccessControl.authorizationCheck: #NOT_REQUIRED`를 기본값처럼 쓰지 마라 — 해당 뷰는 권한 통제가 전무한 상태로 배포된다 (출처: interactive/core/knowledge/abap/reference/references/authorization.md#cds-access-control)
- S-022 [rap] Managed RAP BO의 표준 CRUD를 커스텀 SAVE 로직으로 임의 재구현하지 마라 — 트랜잭션 버퍼 계약을 위반하며, managed와 unmanaged를 섞으려면 hybrid를 명시적으로 선언해야 한다 (출처: interactive/core/knowledge/abap/reference/references/rap-eml.md#implementation-types)
- S-023 [dynamic] 동적 `ASSIGN`의 성공 여부(`sy-subrc` 또는 `IS ASSIGNED`)를 확인하지 않고 필드심볼을 바로 역참조하지 마라 — unassigned field-symbol 역참조는 런타임 덤프로 이어진다 (출처: interactive/core/knowledge/abap/reference/references/dynamic-programming.md#checking-assignment)
- S-024 [luw] `IN UPDATE TASK`로 업데이트 함수모듈을 등록해놓고 `COMMIT WORK` 없이 처리를 끝내지 마라 — 등록된 업데이트 요청이 그대로 유실된다 (출처: interactive/core/knowledge/abap/reference/references/sap-luw.md#calling-update-functions)
- S-025 [review] 활성화 성공을 코딩 컨벤션 준수의 증거로 삼지 마라 — 활성화는 문법·링크만 검증하고 필드카탈로그·텍스트요소·include 구조 등 컨벤션 위반은 잡지 못한다, 반드시 리뷰 체크리스트(§1~§12)를 거쳐야 한다 (출처: vsp standard "Code Review Checklist (MANDATORY, Unconditional)")
- S-026 [verify] 게이트가 검사하지 않는 산출물 유형의 green(Gradle·Node·offline lint 통과)을 완주·PASS 근거로 삼지 마라 — 유형별 검증 게이트 매핑 없이 "전량 통과"로 판정하면 실제로 미검증인 결함이 완주로 위장한다(무인 phase가 ABAP 21종을 green 판정했으나 서버에서 치명 22건). 완주/verify 보고에는 게이트가 커버하지 않는 유형을 "미검증"으로 매번 명시한다 (출처: JNC 교훈 팩 층3-1 (R-007))
- S-027 [verify] 실측 오라클(파서 출력·캐시 메타데이터)을 알려진 정답 1건의 단건 대조 없이 "실측 근거"로 삼지 마라 — 파서의 셀 드롭·시프트나 자기모순 메타(total_rows ≠ data.length)가 근거 자체를 오염시켜 육안·스키마 검사를 전부 통과시킨다. vsp는 engine과 별개 구현이므로 파싱 계약을 독립 재확인해야 한다 (출처: JNC 교훈 팩 층3-8 (R-009·R-010))

---

## verify Error 규칙 6종(offline lint 4 + connected ATC 2)은 별도 문서에서 관리

verify가 Error로 차단하는 규칙 키 6종은 검사기가 둘로 갈린다 — offline `vsp lint`가
등록·평가하는 4종(`line_length` 255자 초과 시·`empty_statement`·`max_one_statement`·
`preferred_compare_operator`)과, 연결이 필요한 ATC(codeanalysis) 채점 경로에서만
등록되는 2종(`hardcoded_credentials`·`commit_in_loop`)이다 — 뒤 2종은 offline
`vsp lint` 등록 목록에 없어 offline 게이트는 통과시킨다. 이 키들은 오프라인/연결
게이트의 실효 차단력 그 자체이며 규칙 후보라기보다 **초안 셀프체크 항목**이라
`CHECKLIST.md`에 실측 목록으로 옮겼다 — 이 파일에는 중복 등재하지 않는다.
