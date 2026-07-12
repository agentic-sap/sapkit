# vsp CLI 명령 실측 — COMMANDS.md

## ① 헤더

- **실측 일자**: 2026-07-11
- **vsp 버전**: `vsp version v2.38.1-86-gaab1275 (commit: aab1275, built: 2026-07-11T05:38:44Z)` —
  `adapters/vsp/vsp.lock.json`의 `verified_commit`/`binary.build_command`와 일치 확인
- **시스템**: IDES-DEV, SID S4H, client 100 (`vsp system info` 재실행으로 확인, §2-1)
- **바이너리**: `D:\Claude for SAP\vsp-custom\build\vsp.exe`
- **lock 참조**: `adapters/vsp/vsp.lock.json`(command_contract 10건) — 본 문서가 그 계약의
  실측 상세판. lock의 10건에 더해, `vsp --help` 전체 명령 표면(44개 top-level 명령)을
  1회 조사해 §14-2(drift/export)·§14-9(syntax check) 후보를 식별했다.
- **파일럿 범위**: SAP write는 `$TMP` 패키지 한정(IDES-DEV, dev tier). 생성 객체는 전부
  `ZSAH0B_` 프리픽스.

## ② 등재 명령 범위 목록 (이 목록이 전부)

Phase 0b 실측 대상은 아래 11개 그룹이며, COMMANDS.md는 이 범위만 다룬다(전체 vsp 명령
표면 44개 중 여기 등재되지 않은 것 — `search`/`grep`/`query`/`transport`/`api-surface`/
`boundaries`/`debug`/`graph`/`lsp`/`lua`/`compile`/`workflow` 등 — 은 대상 객체 선정 등
조사 보조 용도로만 1회씩 사용했고 정식 실측 절에는 없다):

1. `vsp system info`
2. `vsp lint --file <f>` (오프라인) / `vsp lint <TYPE> <NAME>` (연결 fetch)
3. `vsp parse --file <f>` (오프라인)
4. `vsp atc <type> <name>`
5. `vsp health --package $TMP`
6. `vsp test [type] [name] [--package]`
7. §14-2 drift/export 후보: `vsp source read <TYPE> <NAME>` (+ bare `vsp source <TYPE> <NAME>`), `vsp export <packages...> -o <file>`
8. `vsp deploy <file> <package>`
9. `vsp copy <archive.zip> --to <package>`
10. `vsp execute`
11. §14-9 조사: read-only SAP syntax check 명령 실재 여부 (실행형 명령 없음 — 판정 근거는 §11)

## ③ 명령별 실측

### 1. `vsp system info`

**시그니처**
```
Usage:
  vsp system [command]

Available Commands:
  info        Show SAP system information
```

**실행**: `vsp system info`
**출력**:
```
System:    S4H
Host:
Client:    100
SAP:       756
ABAP:      756
Kernel:    75G
Database:  HDB

ZADT_VSP:  installed
```
**exit code**: 0
**특이사항**: 없음. Host 필드가 비어 있음(서버가 값을 안 채움 — 보안상 자격증명은
출력에 없음, R-005 준수).

---

### 2. `vsp lint`

**시그니처**
```
Usage:
  vsp lint <type> <name> [flags]

Flags:
      --file string      Lint a local file instead of fetching from SAP
      --max-length int   Maximum line length (default 120)
      --stdin            Read source from stdin
```
규칙 7종: line_length, empty_statement, obsolete_statement, max_one_statement,
preferred_compare_operator, colon_missing_space, naming(LocalVariableNames) —
Error만 비-0 exit, Warning은 exit 0 (DESIGN.md §15-V2 근거 좌표와 일치).

**2-a. 오프라인 (`--file`)** — Phase 0a에서 7종 규칙 스니펫별 exit code를 전수
실측한 표가 이미 있음(`.harness/STATE.md` "lint 실측" 항목: E 4종
line_length>255·empty_statement·max_one_statement·preferred_compare_operator, W 3종
obsolete·colon·naming — line 120~255 사이 길이도 W). 본 세션은 재확인 1회만 수행:

실행: `vsp lint --file zsah0b_lint_sample.abap` (샘플: 267자 WRITE 라인 1개 +
`DATA:lv_foo...` 콜론 뒤 공백 누락 1개)
```
zsah0b_lint_sample.abap:6:1: E [line_length] Maximum allowed line length of 255 exceeded, currently 267
zsah0b_lint_sample.abap:3:5: W [colon_missing_space] Missing space after colon

2 issues found
Error: 2 issues found
Usage:
  vsp lint <type> <name> [flags]
  ...(help 블록 전체 재출력)...
Error: 2 issues found
```
**exit code**: 1 — Phase 0a 표와 정합.
**특이사항 (결함 후보)**: Error가 있을 때 `Error: N issues found`를 **두 번** 출력하고
그 사이에 cobra 전체 `Usage` 블록을 끼워 넣는다(§⑤-1). 순수 린트 실패인데 CLI
사용법 오류처럼 보이는 노이즈 — verify 마커 파싱 시 앞의 `Error: N issues found`
줄만 잡도록 주의 필요.

**2-b. 연결 fetch (`<TYPE> <NAME>`, 인자만 주고 --file/--stdin 생략)** — 표준 객체
1개로 실측.

실행: `vsp lint PROG RSPARAM`
```
No issues found in RSPARAM
```
**exit code**: 0.

---

### 3. `vsp parse --file`

**시그니처**
```
Usage:
  vsp parse <type> <name> [flags]

Flags:
      --file string     Parse local file
      --format string   Output format: text, json, summary (default "text")
      --stdin           Read from stdin
```
오프라인 동작, 파일 미존재 외 항상 exit 0 (DESIGN.md §15-V4/V11).

실행: `vsp parse --file zsah0b_parse_sample.abap`
```
Report               REPORT zsah0b_parse_sample .
Data                 DATA lv_count TYPE i .
Move                 lv_count = 1 + 1 .
Write                WRITE / 'parse sample' ,
Write                WRITE lv_count .
```
**exit code**: 0. **특이사항**: 문장 유형별 태그(Report/Data/Move/Write)를 왼쪽 컬럼에
정렬 출력 — 구조 파싱이지 SAP syntax check가 아님(DESIGN.md §8.1/§15-V3 재확인).

---

### 4. `vsp atc <type> <name>`

**시그니처**
```
Usage:
  vsp atc <type> <name> [flags]

Flags:
      --max-findings int   Maximum number of findings (default 100)
      --variant string     ATC check variant (empty for system default)
```

**4-a. 표준/기존 객체** — 실행: `vsp atc PROG RSPARAM`
```
No findings.
```
exit code: 0.

**4-b. Phase 0b에서 만든 $TMP 객체** (8번 배포 이후) — 실행: `vsp atc PROG ZSAH0B_SMOKE`
```
PROG ZSAH0B_SMOKE ($TMP)
  INFO [line 1] Prerequisites for the extended program check (SLIN) — Inconsistency
    in the SAP configuration for the time zones in system S4H. ...
  INFO [line 3] Extended Program Check (SLIN) — Strings without text elements are
    not translated: 'ZSAH0B_SMOKE Phase 0b connectivity check'

Total: 2 finding(s)
```
exit code: 0.
**특이사항**: INFO 등급 findings가 있어도 exit code는 0 그대로 — Error 등급 findings가
실제로 비-0 exit를 유발하는지는 이번 세션에서 재현하지 못함(테스트 대상에 Error급
findings가 없었음). **미확인 사항으로 남김** — Phase 1(offline↔connected 갭 실측)에서
Error급 ATC finding이 있는 객체로 재확인 필요.

---

### 5. `vsp health --package $TMP`

**시그니처**
```
Usage:
  vsp health [type] [name] [flags]

Flags:
      --details          Show full details: failing test methods, ATC findings
      --fast             Faster package snapshot: skip expensive checks like tests and boundary scan
      --format string    Output format: text, json, md, or html (default "text")
      --package string   Analyze an entire package
      --report string    Generate report file: md or html (writes to <package>.<ext>)
```

**5-a. `--fast`** (tests+boundaries 스킵, ATC+staleness만)
```
tests:      SKIPPED {"reason":"fast mode"}
atc:        FINDINGS {"errors":3,"findings":454,"infos":365,"warnings":86}
boundaries: SKIPPED {"reason":"fast mode"}
staleness:  ACTIVE {"age_days":0,"checked":0,"last_changed":"2026-07-11T00:00:00Z"}
```
exit code: 0. **소요 시간: 27.4초** (Stopwatch 실측, ELAPSED_MS=27355).

**5-b. full (플래그 없음)** — tests+ATC+boundaries+staleness 전부
```
tests:      NONE {"alerts":0,"classes":0,"methods":0,"packages_scanned":1}
atc:        FINDINGS {"errors":3,"findings":456,"infos":367,"warnings":86}
boundaries: CLEAN {"dynamic":6,"external":6,"objects_scanned":48,"packages_scanned":1}
staleness:  ACTIVE {"age_days":0,"checked":0,"last_changed":"2026-07-11T00:00:00Z"}
```
exit code: 0. **소요 시간: 34.0초** (ELAPSED_MS=34038). 전체 로그 104줄 —
`boundaries` 단계에서 TADIR엔 있으나 실제 소스가 없는 유령 항목(`%_HR3406` 등,
generated GUID 프로그램 다수) 조회 시 `ADT API error: status 404`를 다수 WARN으로
찍고 계속 진행(크래시 없음).

**§9 가설(“step verify엔 느리다") 검증 결과**: `$TMP`처럼 유령/생성 객체가 대량 섞인
대형 패키지 기준으로도 27~34초 — 매 마이크로스텝 verify에 넣기엔 느리지만, 파국적으로
느리지는 않음(수 분 단위가 아니라 수십 초 단위). "느림"의 정도는 가설보다 완만하다는
것이 실측 결과이며, 최종 verify 배치 판단은 Phase 1/1.5 설계 몫으로 남긴다.
**특이사항**: `--fast`/full 모두 findings가 있어 요약이 `WARN`이어도 exit code는 0 —
health의 exit code는 실행 성공 여부만 반영하고 건강 판정 결과를 반영하지 않는다
(atc와 마찬가지 패턴).

---

### 6. `vsp test`

**시그니처**
```
Usage:
  vsp test [type] [name] [flags]

Flags:
      --package string   Run tests for entire package
```

실행: `vsp test PROG ZSAH0B_SMOKE` (8번에서 배포한 $TMP 객체, unit test 없음)
```
No test classes found.
```
**exit code**: 0. 유닛 테스트가 없는 객체에서는 이 출력 자체가 로그(과제 지시대로).

---

### 7. §14-2 drift/export 후보 (선행 조사)

`vsp --help` 전체 명령에서 소스 조회/export류로 `source`(read/write/edit/context)와
`export`를 식별했다.

**7-a. `vsp source read <TYPE> <NAME>`** (bare `vsp source <TYPE> <NAME>`도 동일 동작)

시그니처:
```
Usage:
  vsp source [type] [name] [flags]
  vsp source [command]

Available Commands:
  context     Get source with compressed dependency contracts
  edit        Edit ABAP source code (string replacement)
  read        Read ABAP source code
  write       Write ABAP source code from stdin
```

실행: `vsp source read PROG RSPARAM`
```
REPORT RSPARAM LINE-SIZE 254.
PARAMETERS: ALSOUSUB AS CHECKBOX DEFAULT ' '.
SUBMIT RSPFPAR.

*Commented as ALSOUSUB is not the parameter to be passed, ATC prio 1 error
*WITH ALSOUSUB EQ ALSOUSUB.
```
exit code: 0 (총 6줄). **표준 ADT REST 경로 사용 — ZADT_VSP WebSocket 불필요, 안정적으로
동작**. 드리프트 체크(§6 DESIGN.md)의 실질 후보는 이 명령이다: 객체 1개 단위 순정
소스 재조회이고 로컬 파일과 `git diff --no-index` 류로 바로 비교 가능한 텍스트를 낸다.

**7-b. `vsp export <packages...> -o <file>`**

시그니처:
```
Usage:
  vsp export <packages...> [flags]

Flags:
  -o, --output string   Output ZIP file path (default "export.zip")
  -r, --subpackages     Include subpackages (default true)
```

실행 대상: `$ZADT_VSP`(TADIR 조회로 4개 객체뿐인 소형 패키지 확인 후 선정 — `$TMP`는
동일 조회에서 수천 건 규모로 확인돼 제외):
```
vsp export '$ZADT_VSP' -o zadt_vsp_export.zip --subpackages=false
```
```
Error: failed to connect WebSocket: WebSocket connection failed (HTTP 403): websocket: bad handshake
```
exit code: 1. **2회 재실행해도 동일하게 재현**(§⑤-2 결함 후보). `export`는 ZADT_VSP
WebSocket 경로에 의존하는데, 같은 세션의 9번 `vsp copy`는 동일 WebSocket으로 정상
동작했다 — export 전용 핸드셰이크만 403으로 막힘.

**§14-2 결론**: 이번 환경 기준 `export`는 미가동이라 드리프트 설계는 `vsp source read`
(객체 단위) 경로로 잡아야 한다. `export`(ZIP 일괄)는 WS 핸드셰이크 결함이 해소된
뒤 재평가 대상.

---

### 8. `vsp deploy <file> <package>` — ZSAH0B_SMOKE 생성 + 왕복 확인

**시그니처**
```
Usage:
  vsp deploy <file> <package> [flags]

Flags:
      --transport string   Transport request number
```

**배포**: `vsp deploy zsah0b_smoke.prog.abap $TMP` (소스: `REPORT zsah0b_smoke.` +
`WRITE: / 'ZSAH0B_SMOKE Phase 0b connectivity check'.`)
```
Created PROG/P ZSAH0B_SMOKE
URL: /sap/bc/adt/programs/programs/zsah0b_smoke
Successfully created and activated PROG/P ZSAH0B_SMOKE from ...zsah0b_smoke.prog.abap
```
exit code: 0. 생성 + 활성화가 한 번에 이뤄짐(별도 activate 불요).

**왕복 확인** (7-a 명령으로 재조회): `vsp source read PROG ZSAH0B_SMOKE`
```
REPORT zsah0b_smoke.

WRITE: / 'ZSAH0B_SMOKE Phase 0b connectivity check'.
```
로컬 파일과 **바이트 단위로 완전 일치** — 배포→재조회 왕복이 손실 없이 성립함을
1회 실증.

---

### 9. `vsp copy <archive.zip> --to $TMP`

**시그니처**
```
Usage:
  vsp copy <source.zip> --to <$PACKAGE> [flags]

Flags:
      --dry-run           Show what would be deployed without deploying
      --embedded string   Use embedded dependency (abapgit-standalone, abapgit-full)
      --name string       Filter by object name pattern (e.g., ZCL_*)
      --to string         Target package (e.g., $ZGIT, $ZADT_VSP)
      --type string       Filter by object type (e.g., CLAS, PROG)
```

준비: `zsah0b_smoke2.prog.abap`(REPORT zsah0b_smoke2. + WRITE 한 줄)을
`Compress-Archive`로 `zsah0b_smoke2.zip`(222 bytes)에 담아 사용.

실행: `vsp copy zsah0b_smoke2.zip --to $TMP`
```
Source: ...zsah0b_smoke2.zip (222 bytes)
Target: $TMP

Found 1 objects in 1 files

Mode: WebSocket (ZADT_VSP available - full object type support)

Deployment Plan (1 objects):
------------------------------------------------------------
  ✓ PROG   ZSAH0B_SMOKE2
------------------------------------------------------------
Deployable: 1, Skipped: 0

Checking package $TMP...

Deploying objects...
  Deploying PROG ZSAH0B_SMOKE2... OK

Deployment complete: 1 success, 0 failed
```
exit code: 0. **특이사항**: `copy`는 WebSocket 핸드셰이크가 정상 동작 — 7-b의
`export` WS 403과 대비되는 결과라 export 쪽 결함이 WebSocket 자체가 아니라
export 커맨드의 핸드셰이크/권한 요청 방식에 국한된 문제로 보인다(§⑤-2).

---

### 10. `vsp execute` — 무해 스니펫 1회

**시그니처**
```
Usage:
  vsp execute [code|file] [flags]

Flags:
      --file string   Read ABAP code from file
      --stdin         Read ABAP code from stdin
```
"Execute arbitrary ABAP code via ExecuteABAP (unit test wrapper)."

실행: `vsp execute "WRITE 'ZSAH0B_SMOKE Phase 0b execute test'."`
```
Executed successfully (no output captured)
```
exit code: 0. **특이사항**: 유닛테스트 래퍼로 실행되기 때문에 WRITE의 화면 출력이
캡처되지 않는다("no output captured") — 실행 성공/실패 여부만 신뢰 가능하고, 화면
출력 검증에는 쓸 수 없다.

---

### 11. §14-9 — read-only SAP syntax check 명령 실재 여부

**조사 방법**: (a) `vsp --help` 최상위 44개 명령 전수 검토, (b) 관련 후보
(`lint`/`atc`/`compile`/`source edit`/`source write`) 각각 `--help`로 dry-run류 플래그
유무 확인, (c) vsp-custom 소스에서 `SyntaxCheck`/`syntax` 참조 위치 grep.

**결과**: `SyntaxCheck: true`가 실제로 쓰이는 곳은 `devops.go`의 write 경로
(`source edit`/`source write`/`deploy`에 해당하는 `EditSourceWithOptions`/유사 write
함수) 뿐이며, 모두 SAP 서버가 저장 시점에 함께 돌리는 문법 검사이지 별도 read-only
호출이 아니다. `source edit`/`source write` --help에도 `--dry-run` 류 플래그가 없다
(`install abapgit`에는 `--dry-run`이 있지만 write 자체를 skip할 뿐 syntax-check-only
모드가 아니고, 대상도 무관함).

**판정: 부재.** vsp CLI에는 "배포 없이 서버측 문법만 검사"하는 전용 명령이 없다.
현재 문법 신뢰도를 얻는 유일한 경로는 (i) 오프라인 lint(스타일 린트, syntax check
아님, §8.1) 아니면 (ii) `deploy`/`source write`/`source edit`처럼 **쓰기와 결합된**
서버측 검사뿐이다. DESIGN.md §14-9의 기존 계획대로 Phase 1.5는 ATC/health 기반
online validation으로 재정의해야 한다(순수 syntax gate가 아니라 품질 게이트로).

## ④ 미실행 항목과 사유

| 명령 | 사유 |
|---|---|
| `vsp install abapgit` (실제 실행, `--dry-run` 포함) | 사용자 지시로 실행 금지 — 시스템 전역 설치(`$ABAPGIT`/`$ZGIT` 패키지, edition에 따라 최대 576 objects)라 파일럿 범위 밖. `--help` 시그니처만 §③-4(9번 절 근처, install abapgit --help)로 실측 완료. 사용자 결정 대기 |
| transport 관련 명령(`vsp transport list`/`get`) | 이번 실측 범위(§②) 밖 — 안전 규칙엔 "조회만 허용"으로 언급됐으나 1~11번 실측 항목에 포함되지 않아 실행하지 않음. 필요 시 별도 세션에서 read-only로 1회 실측 권장 |
| ATC Error급 finding 케이스 재현 | 표준 객체(RSPARAM)·자체 배포 객체(ZSAH0B_SMOKE) 둘 다 Error급 finding이 없어, "ATC Error가 비-0 exit을 유발하는지"는 미확인 상태로 남음(§③-4 특이사항 참조) |

## ⑤ 실측 중 발견한 vsp 결함/특이 거동

1. **`vsp lint` 실패 시 이중 에러 출력 + cobra Usage 블록 삽입**: Error급 findings가
   있으면 `Error: N issues found`를 먼저 찍고, 그 사이에 lint와 무관한 전체 `Usage`
   블록(플래그 도움말)을 끼워 넣은 뒤 같은 에러 메시지를 다시 찍는다(§③-2-a 전문
   참조). 순수 lint 실패도 "CLI 사용법 오류"처럼 보이는 노이즈가 섞여 있어, 로그를
   파싱하는 verify 래퍼는 첫 번째 `Error: N issues found` 줄만 마커로 삼아야 한다.
2. **`vsp export`가 WebSocket 핸드셰이크 403으로 항상 실패, `vsp copy`는 동일
   WebSocket으로 정상 동작**: `system info`는 `ZADT_VSP: installed`로 보고하고
   `copy`도 "Mode: WebSocket (ZADT_VSP available)"로 정상 배포하는데, `export`만
   `WebSocket connection failed (HTTP 403): websocket: bad handshake`로 2회 재현
   실패(§③-7-b). export 전용 경로/권한 요청 방식의 결함으로 보이며, 드리프트 체크
   설계(§14-2)는 지금은 `export`가 아니라 `vsp source read`(객체 단위, 표준 ADT REST)
   로 잡아야 한다.
3. **`vsp health`의 boundaries 단계가 TADIR상 존재하나 실체 소스가 없는 유령 객체를
   다수 만나 WARN을 대량 출력**(`%_HR3406` 등 generated 임시 프로그램, `status 404`):
   크래시하지 않고 스킵하며 계속 진행하는 점은 견고하지만, `$TMP`처럼 정리 안 된
   대형 패키지에서는 로그가 매우 길어진다(104줄) — verify 로그로 그대로 쓰기엔
   신호 대비 노이즈가 큼.
4. **`vsp atc`/`vsp health` 모두 findings가 있어도(WARN 요약이어도) exit code는 0**:
   실행 성공 여부만 exit code에 반영되고 품질 판정 결과는 반영되지 않는다 — verify
   게이트는 exit code가 아니라 stdout의 findings 카운트/요약 라인을 파싱해야 한다.
5. **`vsp execute`는 unit test wrapper라 WRITE 등 화면 출력이 캡처되지 않는다**
   ("Executed successfully (no output captured)") — 실행 성공/실패만 확인 가능.
6. **`vsp deploy`의 CLAS 경로는 IDES에서 불가 + 고아 잠금 생산** (2026-07-12
   Phase 2 채점 실측, ZCL_SAH2_WORKDAYS 4회 재현): LOCK 응답이
   `modificationSupport="NoModification"`으로 돌아와 vsp의 NoModification 가드
   (업스트림 22517d4)가 중단시키는데, SM12로 잠금을 정리한 클린 상태에서도 재현
   (생성 직후 일시 상태 아님 — 이 시스템 CLAS 루트 lock 거동). 게다가 **가드가
   획득한 잠금을 해제하지 않고 에러 리턴**(pkg/adt/crud.go LockObject — 실패 경로
   unlock 부재)해 시도마다 고아 ENQUEUE가 남고 SM12 수동 정리로만 해소. PROG
   deploy는 동일 시스템에서 계속 정상 — 423 fix(642c03c)와는 별개 결함이다.
   → **잠금 누수는 수리됨 (vsp-custom `00b4b21`, 2026-07-12, lock v2.38.1-87)**:
   가드가 unlock 후 에러 리턴(원 에러 유지). 라이브 검증 — 연속 2회 시도에서 2차가
   EU510이 아닌 동일 NoModification = 잔존 잠금 없음. 수리 중 동일 패턴 누수 후보
   1건 추가 발견(미수정): `pkg/adt/workflows_fileio.go` RenameObject의 구객체 삭제
   실패 경로가 lock 획득 후 unlock 없이 리턴 — 후속 수리 후보.
   → **이 후보도 수리됨 (vsp-custom `7a2ef66`, 2026-07-12, lock v2.38.1-90)**:
   00b4b21과 동일 패턴 — DeleteObject 실패 시 UnlockObject 호출 후 원 에러 유지(정리
   unlock 자체가 실패하면 그 실패를 컨텍스트로 원 에러에 덧붙임, 원 에러를 가리지
   않음). RenameObject는 기존 테스트 커버리지가 전무해 00b4b21처럼 라이브/유닛
   검증을 미러링하지 못함 — **코드 리뷰 수준 검증**(패턴 대조 + `go build`/`go
   vet`/`go test ./pkg/adt/...` 전부 green)에 그침, 라이브 재현 미실시. 같은 파일의
   나머지 lock 획득 경로(신규 객체 lock, 92행)는 획득 직후 `defer` unlock이 걸려
   있어 안전 확인. 파일 밖(workflows.go/workflows_deploy.go/workflows_source.go)
   lock 사이트도 훑어봤으나 전부 defer 또는 명시적 unlock으로 이미 안전 — 추가 누수
   미발견(전수 감사는 아님, 눈에 띄는 실패 경로만 확인).
   → **전수 감사 완료 (vsp-custom `0b03ef2`, 2026-07-12, lock v2.38.1-91)**: 이번엔
   전수다 — 프로덕션 lock 획득 사이트 24곳 전부 열거(모든 LockObject 호출자 + raw
   `_action=LOCK` 요청 grep으로 우회 경로 부재 확인, CTS/transport는 잠금 획득
   없음·상태 필드만) 후 리턴 경로별 추적. 누수 1건 추가 확정·수리:
   `pkg/adt/workflows_execute.go` ExecuteABAP의 cleanup defer가 임시 프로그램
   MODIFY lock 획득 후 DeleteObject 에러를 버림 — 삭제 실패 시 잠금 누수 +
   `CleanedUp=true` 거짓 보고. 삭제 실패 시 unlock + CleanedUp은 실제 성공에만
   기록하도록 수리(00b4b21 패턴). 나머지 22곳 전부 안전(defer unlock ·
   unlocked-플래그 defer · 실패 분기 명시 unlock) — 유일한 잔존은 LockObject 자체의
   parseLockResult 실패 경로(LOCK 성공 후 XML 파싱 실패 시 핸들이 없어 unlock
   불가 — 클라이언트 측 수리 불가, 문서화로 갈음). 거짓 성공 스윕(322320f 후속)도
   병행: WriteSource의 "nil error + Success=false" 규약을 버리는 호출자 4곳
   확정·수리(cmd/vsp/devops.go 설치 루프 2곳 + internal/mcp
   handlers_install.go/handlers_install_alv.go — 실패를 "OK/✓ Deployed"로 집계).
   판단 유보 3건은 보고만: cli_extra.go runExecute가 Success=false에도 exit 0
   (실패 메시지는 정직 출력), RenameObject 부분 성공 경로("delete manually" 정직
   안내 + Success=true), CreateClassWithTests의 활성화 성공 후 테스트 실행 실패
   시 Success=true(정직 메시지). 검증 수준: `go build ./...`/`go vet ./...` clean,
   `go test ./...`는 수정 패키지(pkg/adt·internal/mcp) 전부 green — cmd/vsp·
   pkg/cache·pkg/jseval 3개 패키지 실패는 stash 전후 동일 재현으로 기존 환경
   결함(하드코딩 `/tmp`, SQLite 예제) 확인, 본 수리와 무관. 라이브 재현 미실시
   (코드 리뷰 수준 검증).
   → **NoModification 자체도 해소 (vsp-custom `8279a7c`, 2026-07-12, lock
   v2.38.1-89)**: 라이브 프로브(같은 LOCK을 Accept v1/v2로 2회 — 응답 값 동일)로
   **가드 오탐 확정** — 이 시스템은 CLAS MODIFY LOCK에 관성적으로 NoModification을
   반환하지만 실제 source write는 성공한다(엔진 4.13.3의 동일 조건 성공이 선행 증거).
   가드를 "stderr 경고 + 진행"으로 강등(진짜 read-only 객체는 후속 write의 423에서
   경고 맥락과 함께 드러남). 라이브 검증: `vsp deploy <f>.clas.abap '$TMP'` →
   "Successfully updated and activated CLAS/OC" exit 0 — **CLAS 배포 경로 개통**.
7. **`vsp copy`의 기존재 CLAS 경로는 3중 거짓 성공** (동일 세션 실측): ZADT_VSP
   WebSocket 모드가 "Deploying CLAS ... OK / 1 success / EXIT=0"을 보고하지만
   active·inactive 어느 버전에도 소스가 기록되지 않고(`source read` + ADT inactive
   조회로 확인), 그 과정에서 잠금까지 누수.
   → **수리됨 (vsp-custom `322320f`, 2026-07-12, lock v2.38.1-89)**: 원인 =
   deployClass/Interface/DDLS/BDEF/SRVD 5개 함수가 WriteSource의 실패 신호
   (nil error + result.Success=false 규약)를 버리고 err만 검사 — deployProgram만
   규약을 지키고 있었음. checkWriteSourceResult 헬퍼로 5개 전부 수리 + "Mode:
   WebSocket" 배너가 허구였던 것(WebSocket 분기는 미구현 TODO 스텁, 항상 ADT
   native 폴백)도 "Mode: ADT native (WebSocket planned …)"로 정직화. 라이브 검증:
   copy가 소스 실기록과 함께 정직한 성공(source read 대조). write 후 `source read`
   확인 관행은 유지 (.harness R-006).

## 부록 — `$TMP`에 생성된 객체 (본 세션)

vsp CLI 전체 명령 표면(44개)에 객체 삭제 명령이 없다(`recover-failed-create`는
"실패한 create가 남긴 좀비 객체" 전용 복구이지 정상 생성물의 일반 삭제가 아님 —
`--help` 확인 완료). 아래 2건은 삭제하지 못하고 잔존한다(파일럿 승인 범위인
IDES-DEV `$TMP`이므로 위험 없음, TADIR로 잔존 재확인 완료):

| OBJECT | OBJ_NAME | DEVCLASS | 생성 명령 |
|---|---|---|---|
| PROG | ZSAH0B_SMOKE | $TMP | `vsp deploy`(§③-8) |
| PROG | ZSAH0B_SMOKE2 | $TMP | `vsp copy`(§③-9) |
| CLAS | ZCL_SAH2_WORKDAYS | $TMP | `vsp deploy` 빈 스켈레톤 생성(⑤-6) → 소스는 GUI 수동 주입 (Phase 2 채점, 2026-07-12) |
| PROG | ZSAH2_DUEDATE | $TMP | `vsp deploy` (Phase 2 채점, 2026-07-12) |
