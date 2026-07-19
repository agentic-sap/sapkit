# vsp verify 패턴 정본 — VERIFY-PATTERNS.md

## ① 헤더

- **실측 일자**: 2026-07-11 (Phase 0b)
- **vsp 버전**: `vsp version v2.38.1-86-gaab1275 (commit: aab1275, built: 2026-07-11T05:38:44Z)`
- **시스템**: IDES-DEV, SID S4H, client 100
- **참조**: 명령 시그니처·실행 로그 전문은 `adapters/vsp/COMMANDS.md`, 버전/바이너리
  고정은 `adapters/vsp/vsp.lock.json`. 본 문서는 DESIGN.md §10이 예약한 verify 패턴
  정본이며, `.harness/VERIFY-PATTERNS.md`는 이 문서를 가리키는 포인터 스텁이다
  (harness-plan이 참조하는 위치가 `.harness/`이므로 스텁을 유지한다).
- 이 문서는 DESIGN.md §9(verify 사다리·실패 분류 설계)의 실측 완성판이다. §9의 설계
  의도와 이 문서의 실측이 충돌하면 실측이 우선한다.

## ② verify 사다리 (DESIGN §9 6층 — 실측 주석 포함)

아래로 갈수록 강하고 느리다. 각 층은 이전 층을 대체하지 않고 보강한다.

1. **`vsp lint --file <f>`** — 오프라인, 초안 게이트.
   연결 불필요. 규칙 7종(line_length, empty_statement, obsolete_statement,
   max_one_statement, preferred_compare_operator, colon_missing_space,
   naming/LocalVariableNames) 중 **Error 4종만 exit≠0을 유발**
   (line_length>255·empty_statement·max_one_statement·preferred_compare_operator).
   나머지 3종(obsolete·colon·naming)은 Warning이라 exit 0으로 통과한다 — 게이트가
   막는 결함 범위는 "구문 오류"가 아니라 이 4종뿐임을 전제로 삼을 것.

2. **`vsp lint <TYPE> <NAME>`** — 연결, SAP에서 소스를 fetch해 같은 린트를 돌린다.
   drift check 겸용 후보(§14-2 결론 — 실제로는 `vsp source read`가 더 적합, 아래 참조).
   연결 실패 시 CODE_FAIL이 아니라 ENV_FAIL/LOCK_FAIL로 갈릴 수 있으므로 반드시
   `scripts/verify-sap.ps1` 경유(§③).

3. **`vsp deploy <file> $TMP`** — 문법 검사를 겸하는 쓰기 경로(read-only syntax check가
   부재하므로 §14-9, 사실상 이 층이 "서버측 문법 검사"의 대체재). **주의**: 문법
   오류가 있어도 객체는 생성/갱신된다(`Object created but has N syntax errors`) — 배포
   성공(exit 0에 가까운 겉모습)과 코드 정상은 별개다. 채택 여부는 Phase 1에서 결정
   (DESIGN §13 Phase 1.5 참조).

4. **`vsp atc <TYPE> <NAME>`** — ATC 검사. **findings가 있어도 exit code는 0** —
   exit code만으로는 품질 판정이 불가능하고 출력의 `Total: N finding(s)` 줄을
   파싱해야 한다. Error급 finding이 실제로 exit≠0을 유발하는지는 이번 세션에서
   미확인(테스트 대상에 Error급 finding이 없었음) — Phase 1 재확인 대상.

5. **`vsp test [TYPE] [NAME] [--package]`** — ABAP Unit 실행. 유닛 테스트가 없는
   객체는 `No test classes found.`를 exit 0으로 낸다 — "테스트 없음"과 "테스트
   통과"를 exit code로 구분할 수 없으므로 출력 문자열 확인이 필요하다.

6. **`vsp health --package`** — tests+ATC+boundaries+staleness 종합 감사.
   **소요 27.4초(`--fast`) ~ 34.0초(full)** 실측(대형/유령객체 혼재 패키지 `$TMP`
   기준) — 매 스텝 verify에 넣기엔 느리므로 **step verify가 아니라 phase 말미
   감사용**으로 쓴다. findings가 있어도(`atc: FINDINGS {...}`) exit code는 0 —
   4번과 같은 이유로 출력 파싱이 필수.

## 객체 유형별 offline 커버리지 (Phase 1 실측, 2026-07-11)

Phase 0b는 `vsp lint --file`/`vsp parse --file`이 완전 오프라인임을 확인했을 뿐, 객체
유형별로 실제 무엇을 잡고 무엇을 놓치는지는 미실측이었다. 본 절은 4개 유형(ABAP
리포트/클래스, CDS View, RAP BDEF, AMDP)에 각각 정상 샘플 + 전형적 결함 샘플을 만들어
lint·parse를 실행한 실측이다. 샘플 전문은 스크래치패드(세션 한정 임시 경로 —
레포에 커밋되지 않음)에서 작성·실행했다.

### 실측 표

| 유형 | 확장자 | lint가 잡는 것 | lint가 놓치는 것 (치명적 미탐) | 오탐 여부 | parse 거동 | 판정 |
|---|---|---|---|---|---|---|
| ABAP 리포트/클래스 | `.prog.abap`/`.clas.abap` | 규칙 7종 그대로: Error 4종(line_length>255·empty_statement·max_one_statement·preferred_compare_operator) + Warning 3종. 실측: `IF lv_count EQ 1.` → `E [preferred_compare_operator] Use "=" instead of "EQ"`, exit 1 / `MOVE lv_a TO lv_b.` → `W [obsolete_statement] MOVE is obsolete, use direct assignment`, exit 0 | **닫히지 않은 IF(ENDIF 누락)** — lint `No issues found` exit 0, parse도 에러 없이 exit 0(단지 `EndIf` 태그가 안 나올 뿐, 조용히 통과) — 스타일 린트일 뿐 syntax 유효성 검사가 아님 | 없음(정상 샘플 clean) | 문장 단위로 정확히 태깅(Report/Data/If/Write/EndIf 등) | **부분 실효** — 4개 Error 규칙 한정 게이트, 구조적 syntax 오류는 무방비 |
| CDS View | `.ddls.asddls` | 없음(정상·결함 3개 샘플 전부 lint `No issues found`, exit 0) | **빠진 중괄호**·**오타 키워드(`defne view`)** 둘 다 무탐지 — lint·parse 모두 exit 0, 정상 CDS와 구분 불가 | 없음(정상 CDS도 clean이라 과탐은 관측 안 됨 — 다만 탐지 자체가 없으므로 오탐/미탐 구분이 무의미한 수준) | 전 statement가 `Move`(ABAP 기본 폴백 태그)로 뭉뚱그려짐 — `@Annotation.value: 'x'` 시퀀스와 `{ }` 블록을 CDS 문법으로 전혀 인식하지 않고 `.`(period) 등장 시점까지를 그냥 한 ABAP 문장으로 취급 | **무의미** — 구조적 CDS 문법 검증 기능이 전무. §15-V3 가설과 정확히 일치 |
| RAP BDEF | `.bdef.asbdef` | 없음(정상·결함 3개 샘플 전부 lint `No issues found`, exit 0) | **빠진 중괄호**·**오타 키워드(`defne behavior`)** 둘 다 무탐지 | 없음(정상 BDEF도 clean) | BDEF는 ABAP 문장 종결자(`.`)가 없어 전체가 한 덩어리로 뭉침(정상본은 `Move`, 깨진 두 본은 `Call` 태그 — 태그가 갈리는 원인은 불명이고 오류 신호가 아님, 셋 다 exit 0) | **무의미** — CDS와 동일하게 구조 검증 전무. 태그 구분조차 신뢰 불가한 부산물 |
| AMDP (`.clas.abap` 내 SQLScript) | `.clas.abap` | 외곽 ABAP 골격(클래스/메서드 시그니처)은 유형 1과 완전히 동일하게 커버됨 — `BY DATABASE PROCEDURE ... LANGUAGE SQLSCRIPT ...` 헤더까지는 정상 ABAP 문장으로 인식·검사 대상 | **SQLScript 본문은 통째로 불투명**: `ev_count = SELCT COUNT(*) FRO t000`(키워드 오타 + 세미콜론 누락)이 lint `No issues found` exit 0, parse도 `NativeSQL` 태그로 원문 그대로 통과 — SQL 키워드 철자·문법 검증 전무 | 없음 | **AMDP 블록 경계는 정확히 인식**한다 — `MethodImplementation`으로 시그니처를 태깅하고 본문 전체를 `NativeSQL` 한 덩어리로 분리(ABAP 문장으로 잘못 쪼개지 않음) — 구조 인식은 정확하나 내용 검증은 없음 | **부분 실효(외곽 ABAP)/무의미(SQLScript 본문)** — 클래스 골격은 유형 1 수준 커버, HANA SQL 본문은 CDS/BDEF와 동일하게 완전 사각지대 |

### §15-V3 가설 검증 결과: 확인됨(confirmed)

lint/parse는 **파일 확장자를 전혀 참조하지 않고 모든 입력에 동일한 ABAP 토크나이저를
적용**한다 — 실측 근거:

- CDS(`.ddls.asddls`)·BDEF(`.bdef.asbdef`) 모두 동일하게 `No issues found`를 내는
  lint 거동과, `.`(period) 등장 시점만으로 문장을 끊는 parse 거동을 보였다. CDS 전용
  중괄호/애노테이션 문법도, BDEF 전용 세미콜론 문장 종결 규약도 별도로 인식하지
  않는다.
- 깨진 CDS·깨진 BDEF가 정상본과 **정확히 같은 lint 출력**(`No issues found`, exit 0)을
  냈다 — 확장자 기반 분기가 있었다면 이 둘의 결과가 갈렸을 것이다.
- 유일한 예외는 AMDP: `BY DATABASE PROCEDURE ... LANGUAGE SQLSCRIPT` 헤더를 인식해
  본문을 `NativeSQL`로 분리하는 거동이 있다 — 그러나 이것도 "CDS/BDEF 전용 문법
  검증"이 아니라 **ABAP 언어 자체에 내장된 AMDP 서브언어 경계 인식**이다. 즉 가설이
  말한 "확장자 무시"와 모순되지 않는다 — vsp는 여전히 `.clas.abap` 파일을 ABAP으로
  파싱했을 뿐이고, 그 ABAP 문법 안에 AMDP 서브언어 경계가 이미 정의돼 있었을 뿐이다.

### 결론: offline 게이트의 한계는 connected 검증(Phase 1.5)이 메운다

offline lint/parse는 ABAP 리포트/클래스(및 AMDP의 외곽 골격)에 한해 스타일 수준
Error 4종만 잡는 좁은 게이트이며, CDS·BDEF·SQLScript 본문에는 구조적 문법 검증
능력이 전무하다. 이 공백은 오프라인 게이트를 확장해서 메울 수 있는 성격이 아니다
(vsp CLI에 CDS/BDEF 전용 오프라인 검사기가 없음 — COMMANDS.md §③-11의 "read-only SAP
syntax check 명령 부재" 판정과 정합). 따라서 DESIGN.md §13이 예약한 **Phase
1.5(ATC/health 기반 connected validation)**가 CDS/BDEF/AMDP 구조 오류를 잡는 유일한
실질 방어선이다 — offline 게이트를 "구문 오류 차단"으로 오인하지 말고, "ABAP
리포트/클래스의 4종 스타일 결함만 조기 차단하는 draft 게이트"로 범위를 좁혀 취급할 것.

### Phase 1.5 connected 실측 (2026-07-11)

대상: `src/zsah1_workdays.prog.abap` (PROG ZSAH1_WORKDAYS, `$TMP`) — offline으로
완성된 ABAP 프로그램을 실제 SAP 서버에서 red/green + connected 검출로 실증.

**red/green (ABAP Unit)**: step 0 스텁(`rv_days = -1`)을 `vsp deploy`로 최초 생성한
뒤 `vsp test PROG ZSAH1_WORKDAYS` 실행 — **5개 전부 FAIL**(`Total: 0 passed, 5
failed`, exit 1, ~2.0초). 현행 구현으로 `vsp deploy`(갱신) 후 재실행 — **5개 전부
PASS**(`Total: 5 passed, 0 failed`, exit 0, ~1.8초). red→green 전환 실증 완료.

**`vsp test`의 REPORT 로컬 테스트 클래스 지원**: **지원 확인**. PROG 내부
`FOR TESTING` 로컬 클래스(`ltc_workdays`)를 별도 설정 없이 정상 실행·리포트했다 —
COMMANDS.md §③-6의 "유닛 테스트가 없는 객체" 케이스(`No test classes found.`)와
달리, 있는 경우엔 클래스명·메서드명·PASS/FAIL·assertion 실패 상세까지 정확히
보고한다. lint와 동일한 이중 `Error: N test(s) failed` + cobra Usage 블록 삽입
패턴이 FAIL 케이스에서도 재현됨(§⑤-1과 동일 결함 계열).

**ATC 재확인**: `vsp atc PROG ZSAH1_WORKDAYS` — `Total: 1 finding(s)`(INFO 등급,
SLIN 시간대 설정 불일치 안내), exit 0. Error급 finding 미확인 상태는 이번 세션에도
유지(COMMANDS.md §④ 표 참조) — 테스트 대상에 Error급을 유발하는 코드가 없었음.

**offline 통과 · connected 검출 실증 (ENDIF 누락)**: `zsah15_broken.prog.abap`
(현재 구현을 복사해 프로그램명을 `zsah15_broken`으로 바꾸고 `calc` 메서드의
`IF iv_from > iv_to. RETURN. ENDIF.` 블록에서 `ENDIF.` 한 줄만 제거)로 시퀀스
실증:

1. `vsp lint --file zsah15_broken.prog.abap` → `No issues found`, **exit 0**
   (오프라인 게이트 통과, ~0.4초) — 위 표의 "닫히지 않은 IF" 치명적 미탐 사례를
   그대로 재현.
2. `scripts/verify-sap.ps1` 경유 `deploy` → **exit 1**, 마커
   **`CODE_FAIL: vsp exit 1`**(~7.2초, `system info` preflight 포함). 서버측
   문법 오류 메시지:
   ```
   Object created but has 1 syntax errors
   Syntax errors:
     Line 37: Incorrect nesting: Before the statement "ENDMETHOD", the control
     structure introduced by "IF" must be closed by "ENDIF".
   ```
   §②-3의 "문법 오류가 있어도 객체는 생성/갱신된다" 경고와 정합하되 세부가
   다르다: `vsp source read PROG ZSAH15_BROKEN`으로 재조회하면 제출한 깨진
   소스가 아니라 **SAP이 롤백한 기본 스켈레톤**(`REPORT zsah15_broken.`
   + 표준 주석 헤더)만 저장돼 있다 — 서버가 문법 오류 소스 자체는 거부하고
   대신 빈 골격으로 되돌리는 동작으로 보인다(§②-3의 "객체는 생성되지만
   소스는 원안대로 저장되지 않을 수 있다"로 갱신 필요). 재확인
   (`vsp lint PROG ZSAH15_BROKEN`, connected) 결과도 `No issues found`, exit
   0 — 현재 `$TMP`에 남은 PROG ZSAH15_BROKEN은 깨진 상태가 아니라 **빈
   스켈레톤 상태**로 잔존한다(vsp에 삭제 명령 없음, COMMANDS.md 부록과 동일
   사유).

offline lint(exit 0) → connected deploy(CODE_FAIL, exit 1)로 갈리는 사례를 1건
실측 확인 — "offline 통과, connected 검출"이 실제로 성립함을 실증했다.

**명령별 소요 시간**: `deploy`(생성) ~4.3초, `deploy`(갱신) ~3.4초, `test`(FAIL
5건) ~2.0초, `test`(PASS 5건) ~1.8초, `atc` ~6.0초, `lint --file` ~0.4초,
`verify-sap.ps1` 경유 `deploy`(CODE_FAIL) ~7.2초 — COMMANDS.md §③ 기존 실측(수 초
단위)과 정합, 파국적 지연 없음.

## ③ 마커 규약

`scripts/verify-sap.ps1`이 출력하는 3종 마커. vsp는 모든 오류를 일괄 exit 1로
반환하므로(§15-V10) **exit code로는 유형을 구분할 수 없고 출력 패턴 파싱이 유일한
길**이다.

- **CODE_FAIL** — 코드 결함. rule 승격 후보.
- **ENV_FAIL** — 연결/인증/시스템 실패. rule 승격 후보에서 항상 제외.
- **LOCK_FAIL** — transport/ENQUEUE 등 일시적 잠금 충돌. rule 승격 후보에서 항상 제외.

### 실패 패턴 실측 표 (2026-07-11, IDES-DEV S4H/100)

| 분류 | 세부 계열 | 마커 문자열(핵심 부분) | 실측 소요시간 |
|---|---|---|---|
| ENV_FAIL | DNS 실패 | `dial tcp: lookup <host>: no such host` | ~450ms |
| ENV_FAIL | 포트 드롭(방화벽) | `dial tcp <ip>:<port>: connectex: ... failed to respond` | **~21.4초** — 방화벽 드롭은 재시도/OS 타임아웃 때문에 즉시 실패가 아니라 타임아웃형이다. 짧은 exit을 가정하고 timeout을 짧게 잡으면 오탐한다 |
| ENV_FAIL | 인증 실패 | `authentication failed (401): check username/password` | ~1.5초 |
| ENV_FAIL | TLS 인증서 실패 | `tls: failed to verify certificate: x509: certificate signed by unknown authority` | 즉시 |
| CODE_FAIL | 문법 오류 deploy | `Object created but has N syntax errors` / `Source has N syntax errors` + `Syntax errors:` 블록 + `Error: deploy failed` | ~3.6초 |
| CODE_FAIL | 미존재 객체 | `ADT API error: status 404` — **본문 메시지는 신뢰 불가, status 코드만 신뢰**(vsp가 404 메시지 텍스트를 상황별로 다르게 조합하므로 문자열 매칭보다 status 코드 매칭이 안전) | — |
| LOCK_FAIL | 동시 deploy 경합(ENQUEUE) | `Failed to lock object: locking object: ADT API error: status 403 ... ExceptionResourceNoAccess ... User <x> is currently editing <object> ... (by an ENQUEUE lock)` — 선점 프로세스 종료 시 자동 해제 | — |

마커 재현 검증: ENV_FAIL·CODE_FAIL·LOCK_FAIL 각 exit 1, VERIFY_PASS exit 0 — 4건 전부
통과(2026-07-11).

**LOCK을 ENV보다 먼저 검사하는 근거**: 실측상 403의 유일 사례가 ENQUEUE 락이었다.
403을 ENV_FAIL의 키워드 폴백에 두면 실제로는 일시적 락인 실패가 "연결/인증
실패"로 오분류되어 rule 승격 후보에서 영구 제외되거나(원래도 제외 대상이라 결과는
같지만) 재시도하면 풀릴 실패를 환경 실패로 오인해 재시도 전략을 그르친다.
`scripts/verify-sap.ps1`의 분류 순서는 이 근거에 따라 **LOCK_FAIL → ENV_FAIL →
CODE_FAIL**(폴백)이다.

**연결 verify는 반드시 `scripts/verify-sap.ps1` 경유** — vsp를 직접 호출하면 마커가
없어 환경 실패가 코드 결함으로 둔갑해 LESSONS를 오염시킨다(DESIGN.md §9, §⑤ 안티패턴
참조).

## ④ 호출 규약

- **자격증명 자체 조달(사전 dot-source 폐지)**: `verify-sap.ps1`은 자기 프로세스
  안에서 `scripts/vsp-env.ps1`을 dot-source해 SAP_*를 스스로 조달한다 — 호출 셸에
  미리 `. vsp-env.ps1`을 실행할 필요가 없고, 해서도 안 된다(아래 엔진 기동 셸 관례).
  기본은 **read-only**(`SAP_READ_ONLY=true` 주입)이므로 read성 verify(lint connected·
  atc·test·source read)는 그대로 동작한다. 프로파일 지정은 `-ProfileName <name>`
  passthrough. 자식 프로세스로 실행되므로(`powershell -File …`) 자격증명은 그
  프로세스에만 스코프되고 부모 셸에는 SAP_*가 남지 않는다. 스크립트 자신은 시크릿을
  출력/기록하지 않고 프로세스 환경에만 주입한다.
- **write성 verify 체인은 `-Write` opt-in 필수**: 사다리 3층 `vsp deploy`처럼 write성
  명령을 verify로 쓰는 경로는 `verify-sap.ps1 -Write -- deploy <file> $TMP` 형태로
  호출한다. `-Write`는 vsp-env.ps1의 read-only를 해제하고 `SAP_TIER`(dev)를 전파해
  게이트를 통과시킨다. `-Write` 없이 write 명령을 넣으면 게이트가 `SAP_READ_ONLY`로
  거부(네트워크 이전)하고, 그 거부는 현행 분류상 CODE_FAIL로 뭉뚱그려지므로 write
  체인에는 반드시 `-Write`를 명시할 것. (아래 §②-3의 Phase 1.5 deploy 실측은 이 게이트
  신설 이전 캡처라 `-Write` 없이 CODE_FAIL을 얻은 기록 — 현행에서는 `-Write` 필수.)
- **엔진 기동 셸 관례(무인 워커 자격증명 미공급의 성립 조건)**: 무인 엔진
  (`python scripts/execute.py`)을 켜는 셸에는 SAP_*가 없어야 한다 — 사전 dot-source
  금지. execute.py는 워커/advisory/verify 서브프로세스에 부모 env를 **전량 상속**
  (`{**os.environ}`)시키므로, 기동 셸에 SAP_*가 없어야만 워커 스텝 env에 자격증명이
  실리지 않는다. verify 스텝은 위 자체 조달로 자기 프로세스 안에서만 자격증명을 얻고,
  그 밖의 워커 명령은 SAP에 접속할 수단이 없다.
- **배포 스텝 래퍼 관례**: write 자격증명은 배포 스텝 명령 래퍼에서만
  `. scripts\vsp-env.ps1 -Write`(또는 `verify-sap.ps1 -Write`)로 로딩한다 — 그 프로세스
  트리에만 스코프되고 기동 셸·다른 워커 스텝에는 전파되지 않는다.
- **vsp 게이트 의미론(v2.38.1-94, `adapters/vsp/vsp.lock.json` write_profile_gate 참조)**:
  `SAP_READ_ONLY` truthy → 모든 write성 서브커맨드를 네트워크 이전 클라이언트측 거부
  (마커 `blocked: SAP_READ_ONLY=true …`). `SAP_TIER`가 비어있지 않고 `dev`(대소문자
  무관)가 아니면 동일 거부(마커 `blocked: SAP_TIER=<tier> …`). 둘 다 미설정 = 무제약.
  read성 명령과 `vsp test`는 두 env에 무영향.
- **`-File`에 대시 인자 전달 불가(실측 함정)**: `vsp lint --file ...`처럼 vsp 인자에
  `--file` 등 대시로 시작하는 플래그가 있으면 `powershell -File scripts\verify-sap.ps1 --
  <args>` 형태는 PowerShell 5.1의 `-File` 바인딩 오류로 실패한다. 이 경우
  `powershell -Command "& 'scripts\verify-sap.ps1' -- <vsp args>"` 형태로 호출한다.
- **첫 `Error:` 라인만 파싱**: vsp의 모든 오류 출력은 `Error:` 라인이 **2회** 나타나고
  그 사이에 cobra의 전체 `Usage` 도움말 블록이 끼어든다(§⑤-주의 거동 ①). 두 번째
  `Error:` 줄이나 Usage 블록 내부 텍스트를 근거로 분류하면 노이즈에 오염되므로,
  파싱은 반드시 **첫 매치**만 신뢰한다. `verify-sap.ps1`은 전체 출력에 대해
  substring 매칭을 하므로 이 문제에 노출되지 않지만, 정확한 오류 개수를 뽑아내는
  후속 파서를 만들 경우 이 규칙을 지켜야 한다.

## ⑤ 안티패턴

- **존재 확인은 verify가 아니다**: `Test-Path`/`test -f` 류의 파일·객체 존재감시는
  내용 검증이 없으므로 통과해도 아무것도 보증하지 않는다.
- **vsp 직접 호출로 연결 verify 금지**(§9): 마커 없는 실패는 환경 실패가 코드 결함으로
  둔갑해 LESSONS를 오염시킨다. 연결이 필요한 모든 verify는 `scripts/verify-sap.ps1`을
  경유한다.
- **exit code만 믿지 말 것 (atc/health)**: `vsp atc`·`vsp health`는 findings가 있어도
  exit code 0을 반환한다(§②-4, §②-6). exit code는 "명령 실행 자체의 성공/실패"만
  보증하고 "품질 판정 결과"는 보증하지 않는다 — 출력의 finding 카운트/요약 라인을
  반드시 파싱해야 한다.
- **deploy 성공을 코드 정상으로 믿지 말 것**: `vsp deploy`는 문법 오류가 있어도 객체를
  생성/갱신한다(§②-3, COMMANDS.md §③-8 인접 실측). "배포됨"은 "SAP에 존재하게 됨"만
  의미하지 "문법이 정상"을 의미하지 않는다 — 반드시 §②-3의 출력(`Syntax errors:`
  블록 유무) 또는 후속 atc/health로 재확인한다.
- **게이트가 검사하지 않는 산출물 유형의 green을 완주로 오인하지 말 것** (JNC R-007):
  위 "객체 유형별 offline 커버리지" 표대로 offline lint/parse는 ABAP 리포트/클래스의
  Error 스타일 결함만 잡고 CDS/BDEF/SQLScript 구조 문법에는 무력하다. 배포 단위에 게이트가
  커버하지 않는 유형이 있으면 완주·verify 보고에 "이 유형은 미검증"을 매번 명시하고,
  없는 게이트를 green으로 대체하지 마라 — 상위 빌드(Gradle·Node)의 green이 ABAP 미검증을
  은폐한 실증이 있다(무인 phase 21종 green → 서버 치명 22건). 규칙 후보 = RULES.seed S-026.
- **실측 오라클 자체를 무조건 신뢰하지 말 것** (JNC R-009·R-010): verify가 의존하는
  파서·캐시가 결함일 수 있다 — 이 레포 엔진의 SQL 셀 파서도 self-closing NULL 셀을 드롭해
  남의 행 값을 내 행에 박던 결함을 5-13 층1(engine 4.13.13)에서 수리했다. 파싱·캐시 결과를
  근거로 삼기 전 알려진 정답 1건을 단건 조회로 대조하고, vsp는 engine과 별개 구현이므로
  파싱 계약을 독립 재확인하라(부록 caveat와 정합). 규칙 후보 = RULES.seed S-027.

## ⑥ 미완/보류

- **ENV_FAIL의 비-락 403 미실측**: 이번 세션에서 재현된 유일한 403 사례는 LOCK_FAIL
  (ENQUEUE 락)이었다. 권한 부족 등 락이 아닌 403 케이스는 아직 실측하지 못했으며,
  `scripts/verify-sap.ps1`의 `$envFallback` 키워드(`403` 포함)는 미검증 폴백으로만
  유지한다. Phase 1 이후 재현 시 §③ 표에 추가한다.
- **`vsp export` 결함(WebSocket 403)**: `vsp export <packages...> -o <file>`은
  `WebSocket connection failed (HTTP 403): websocket: bad handshake`로 항상 실패한다
  (2회 재현, COMMANDS.md §③-7-b). 같은 세션의 `vsp copy`는 동일 WebSocket 경로로
  정상 동작해 export 전용 핸드셰이크만 결함으로 보인다. 드리프트 체크는 당분간
  `vsp source read <TYPE> <NAME>`(표준 ADT REST, 객체 단위)로 잡고, export는 결함
  해소 후 재평가한다.
- **`vsp install abapgit` 보류**: 사용자 지시로 실제 실행(--dry-run 포함) 금지 —
  시스템 전역 설치(최대 576 objects)라 파일럿 범위 밖. `--help` 시그니처만 확인
  완료. verify 사다리에 편입할지는 사용자 결정 대기.
