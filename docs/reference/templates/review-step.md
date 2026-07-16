# 리뷰 스텝 템플릿 — attended P3 write 전 새-컨텍스트 리뷰 게이트

> **v2 축 (2026-07-16, 로드맵 S2-B)**: 축은 **run**이다(구 phase 축 폐기). 계약 산출물은
> `.harness/runs/{run-id}/` 아래에 살고, 검사기는 `-RunId`를 받는다. 이 게이트는
> **attended** 실행에서 돈다 — `unattended=sealed`(D-025)이므로 "무인 게이트"가 아니라
> **사람이 참관하는 run의 기계 게이트**다.
>
> 이 파일은 **템플릿**이다. harness-plan이 run을 계획할 때 이 내용을
> `.harness/runs/{run-id}/stepN.md`(실제 리뷰 스텝 파일)로 복사하고 `{run-id}`·`{TYPE}`·
> `{NAME}` 등 플레이스홀더를 채운다. 배치·verify 배선 규약은 같은 폴더의
> `review-gate-plan-conventions.md`, 현행 순서 정본은
> `docs/reference/designs/2026-07-16-integration-hardening-roadmap.md`(구 스펙
> `2026-07-13-unattended-review-gate.md`는 역사 근거).
>
> 이 파일 자체는 `docs/*.md`(비재귀) 주입 글롭 밖이라 매 스텝에 자동 주입되지 않는다 —
> 주입되는 것은 계획이 생성한 `.harness/runs/{run-id}/stepN.md`뿐이다.

---

# Step {N}: review-gate — {p}

## 너의 역할

너는 **리뷰어**다. 이 코드를 만든 impl 세션과는 **완전히 분리된 새 컨텍스트**에서
돈다. 문법 통과·ATC·활성화·유닛테스트 PASS는 코드가 **컴파일·연결됨**만 증명하지,
**업무로직이 옳음**을 증명하지 않는다 — 기계 verify를 전부 통과한 INNER vs LEFT JOIN
급 시맨틱 결함이 실제로 있었다(트랙 B E2E 실증). 그 급을 **첫 vsp write 전에** 잡는
것이 이 스텝의 유일한 존재 이유다.

너는 **판정만 한다. 고치지 않는다.** 수정은 이후 impl 세션의 몫이다.

## 독립 재도출 원칙 (신뢰하지 말 것)

impl 세션이 index.json `summary`/`contract`에 남긴 **자기보고를 근거로 삼지 마라.**
"desk-check 5케이스 전부 일치"라는 보고가 있어도 그것을 믿지 말고, 아래 원천에서
**네가 직접 재도출**해 판정하라:

1. **main 대비 diff** — 이 phase가 무엇을 바꿨는지의 1차 사실:
   ```
   git diff --stat main -- src/
   git diff main -- src/
   ```
2. **`src/` 소스** — 배포 대상 소스 정본(abapGit 파일). diff에 걸린 파일을 통째로 읽어라.
3. **(연결 시) vsp read 계열 라이브 참조** — 아래 "vsp read 명령" 절. 이미 SAP에 있는
   객체(재사용 대상·기존 객체)의 순정 소스를 교차 확인할 때만. 리뷰 스텝은 **첫 write
   전**에 돌기 때문에 이 phase가 새로 만드는 객체는 아직 SAP에 없을 수 있다(404 정상) —
   **게이트는 SAP 연결에 의존하지 않는다.** 연결 실패 시 1·2번(로컬)만으로 판정하라.

run의 기대 동작 기준은 `.harness/runs/{run-id}/index.json`의 각 step `contract`, 그리고
(있으면) `contract.md`·`ltc_*` 테스트 클래스의 고정 기대값이다 — 이것을 **정답지**로 삼아
코드가 그 값을 실제로 산출하는지 손으로 추적하라.

## Read first

- `git diff main -- src/` 출력 (이 run의 변경 전체)
- diff에 걸린 `src/*.abap` 파일 전문
- `.harness/runs/{run-id}/index.json` — 각 step의 `contract`(기대 계약)·`summary`
  (자기보고 — 검증 대상이지 근거 아님)
- `.harness/runs/{run-id}/contract.md`(있으면) — 승격 계약·답사 근거·설계 결정
- `domain/abap/CHECKLIST.md`·`domain/abap/RULES.seed.md` — ABAP 관례 규칙 시드
- `docs/reference/templates/review-verdict.schema.json` — 네가 쓸 verdict 파일 계약

## vsp read 명령 (연결 시 교차 참조 전용 — 게이트 아님)

바이너리는 `vsp.lock.json` 고정본 `D:\Claude for SAP\vsp-custom\build\vsp.exe`. 아래는
**read 계열만** — write(deploy/copy/execute)는 **절대 금지**(Forbidden 절).

| 용도 | 명령 | 근거·주의 |
|---|---|---|
| 라이브 소스 재조회 | `vsp source read <TYPE> <NAME>` | 표준 ADT REST, 안정 동작, exit 0. `src/` 로컬 소스와 `git diff --no-index` 류로 대조. (근거: COMMANDS.md §③-7-a, VERIFY-PATTERNS §⑥, R-006) |
| 연결·버전 맥락 | `vsp system info` | SAP/ABAP 릴리스(예: 756/S4)·client 확인 — §9·§10 판정 맥락. (command_contract) |
| ATC finding | `vsp atc <TYPE> <NAME>` | **findings 있어도 exit 0** — 출력의 `Total: N finding(s)` 줄을 파싱하라. (command_contract) |
| 패키지 감사 | `vsp health --package <pkg>` | 느림(~27-34s)·findings 있어도 exit 0 — 출력 파싱. 필요할 때만. (command_contract) |

주의: 연결 verify는 원칙적으로 `scripts/verify-sap.ps1` 경유가 규약이나(VERIFY-PATTERNS
§③ 마커 규율), 위 read는 **게이트가 아니라 교차 참조**이므로 직접 호출로 소스를 읽어도
된다 — 다만 그 read의 성공/실패로 verdict를 가르지 마라(연결 실패는 코드 결함이 아니다,
R-001). `vsp source read`는 lock의 command_contract 표에는 없으나 COMMANDS.md·
VERIFY-PATTERNS·R-006이 실측·상시 사용을 입증하는 트랙 A의 라이브 소스 read 명령이다.

## 체크리스트 (트랙 B 12항목 이식 + 시맨틱 신규 — 전부 판정하라)

각 항목: **PASS / FINDING(s) / N/A(사유)** 중 하나로 판정. **증거의 부재는 PASS가 아니라
FAIL이다**(아래 오탐 패턴 참조). 접근 수단은 트랙 A용으로 치환했다 — 트랙 A는 MCP 미사용
(D-001), 원천은 `src/` 소스·diff·(연결 시) vsp read.

### B1 — ALV + UI

**§1 ALV 표시 규칙 + 화면/GUI**
- 필드 카탈로그: SALV 팩토리 추출 + `cl_salv_controller_metadata=>get_lvc_fieldcatalog`
  변환. 반복 `APPEND ls_fc TO pt_fcat` 인라인 구성 → **MAJOR**. 컨테이너는
  `CL_GUI_DOCKING_CONTAINER`(Custom Control 아님).
- 접근(재기술): 화면 flow logic·GUI status에는 **vsp read 대응이 없다**(트랙 A vsp read
  표면 밖). 화면/상태 객체를 이 phase가 만든다면 `src/`의 abapGit 화면/상태 소스 파일로
  판정하고, 없으면(현행 REPORT/CLASS 범위) `N/A`.

**§2 텍스트 엘리먼트 규칙 (I/S/R/H)**
- 화면·MESSAGE의 하드코딩 리터럴 금지 → `TEXT-Txx`. `counts.S` = SELECT-OPTIONS+
  PARAMETERS 수(런타임 기술명 노출 방지, 최빈 누락).
- 접근(재기술): **vsp에 텍스트 풀 read 명령이 없다**. `src/`의 abapGit 텍스트 풀 파일로
  판정하고, 텍스트 풀이 이 phase 범위 밖이면 `N/A`.

### B2 — Logic Hygiene (+ 업무로직 정합)

**§3 상수 규칙** — 업무 로직의 매직 리터럴(function code·상태명·분기 임계값) → TOP
include `CONSTANTS`. `'X'`/`''` 대신 `abap_true`/`abap_false`/`space`. 접근: `src/` 소스.

**§8 Clean ABAP (기준 + 패러다임)** — `SELECT *` 금지·명시 필드, LOOP 내 SELECT 금지,
값 세팅 문장 뒤 `SY-SUBRC` 확인, 내부 테이블 타입이 접근 패턴과 일치(DEFAULT KEY 금지),
주석처리 코드·`BREAK-POINT` 잔존 금지. 패러다임 게이트: `interview.md`/`contract`의
Paradigm(OOP/Procedural)에 맞는 규칙만 적용. 접근: `src/` 소스 + `git diff main`.

**§13 (신규) JOIN 카디널리티 · 행집합 무결성** — 스펙 Decisions #4. 기계 verify가 못
잡는 급을 명시 커버:
- JOIN 종류가 업무 의도와 일치하는가 — 매칭 없는 행을 **살려야** 하면 LEFT OUTER,
  **버려야** 하면 INNER. 필요한 곳에 INNER를 써서 행이 조용히 사라지거나, 비유일 키로
  조인해 행이 배수로 불어나면(fan-out) → **MAJOR**.
- `FOR ALL ENTRIES`의 중복 제거·빈 드라이버 테이블 전량조회 함정, 집계 전 필터 누락도
  같은 급으로 본다.
- 재도출: 조인/필터의 **결과 행집합**을 스펙 기대와 대조해 손으로 추적하라(코드가
  "그럴듯"한지가 아니라 **옳은 행집합**을 내는지).

**§14 (신규) 스펙 · contract 정합** — 스펙 Decisions #4. 구현이 **스펙이 요구한 그
수량**을 산출하는가. 내부적으로 일관되지만 **엉뚱한 값**을 계산하면(예: 경계 포함
규칙을 반대로 적용) → **MAJOR**. 재도출: `contract`/spec/`ltc_*` 기대값에서 **네가**
기대 출력을 유도하고 코드 경로를 그 입력들로 desk-check하라. impl 보고의 "일치함"을
복창하지 마라.

**§15 (신규) 경계 · 집계 정확성** — off-by-one(양끝 포함/배타), 역순 범위, 부호,
반올림, 빈 집합 처리. 도메인이 날짜·영업일 산술이면 결함이 정확히 이 자리에 숨는다.
경계 케이스가 스펙과 어긋나면 severity는 영향 범위로 판단(경계 오류로 값이 틀리면
MAJOR). 접근: `src/` 소스 desk-check.

### B3 — Structure + Naming

**§4 절차형 FORM 명명 (Procedural 한정, else N/A)** — 화면 결속 FORM은 화면번호 접미
(`_0100`), 공용 헬퍼는 접미 없음. PBO/PAI는 `STATUS_xxxx`/`USER_COMMAND_xxxx`.

**§5 OOP 2-클래스 패턴 (OOP 한정, else N/A)** — 데이터/프리젠테이션 분리, 화면 클래스에
업무로직·데이터 클래스에 UI 호출 금지, public 표면 최소·헬퍼 PRIVATE.

**§6 include 구조** — 접미 규약(t/s/c/a/o/i/e/f/_tst), 빈 include 미생성, TOP에 전역
TYPES/DATA/CONSTANTS 집중. Main에 계획된 include마다 `INCLUDE` 문 존재(전부 Main에
인라인 → MAJOR). Procedural에 `{PROG}E` include 존재 → MAJOR(`e`는 OOP 전용).
- 접근(치환): 트랙 B의 `SearchObject({PROG}E)`·`GetProgram(main)` → `src/`의 파일 목록과
  Main 소스로 판정. 연결 시 `vsp source read PROG {PROG}{SUFFIX}`로 라이브 교차.

**§7 명명 규약** — Z/Y 접두, 모듈 접두(ZMM*/ZSD* 등), include 명 `{PROG}{SUFFIX}` 정확,
FG/FM/데이터엘리먼트/도메인 명명. FM 소스가 플레이스홀더/시그니처 누락이면 reject.
접근: `src/` 소스 + (연결 시) `vsp source read`.

### B4 — Platform + Config

**§9 ABAP 릴리스 인지** — 설정 릴리스를 넘는 문법 금지. 접근: `src/` 소스 +
(연결 시) `vsp system info`의 ABAP 릴리스.

**§10 SAP 버전 인지** — ECC에 S/4 전용 테이블/API 금지, S/4에 ECC-deprecated 패턴 금지.
접근: `src/` 소스 + (연결 시) `vsp system info`의 SAP 버전.

**§11 SPRO 룩업 정합** — 접근(재기술): 트랙 B는 `.sc4sap/program/{PROG}/consult-{module}.md`
를 읽었으나 **트랙 A는 기본적으로 consult 산출물이 없다.** phase에 spec/consult 자료가
있으면 그에 대조, 없으면 `N/A` — 다만 커스터마이징에서 와야 할 org-unit 값의 하드코딩은
소스에서 직접 잡는다.

**§12 활성화 상태** — 접근(재기술): 리뷰 스텝은 **첫 write 전**(Decisions #3)에 돌므로
이 phase의 신규 객체는 **아직 SAP에 없다** — 활성화는 이후 엔진의 activate/drift verify
체인이 기계로 담당한다. 이 스텝에서 활성화 미도달을 결함으로 올리지 마라. 이미 배포된
객체를 검토하는 변형(inactive-deploy, Deferred #1)에서만 `vsp source read`/`vsp health`로
교차 확인한다.

## 오탐 패턴 — 리뷰어가 반드시 reject

"PASS"로 보고됐다가 나중에 깨진 것으로 드러난 패턴들. 증거의 부재 = FAIL.

- 화면 flow logic이 주석(`* MODULE ...`)만 있어 런타임 무동작.
- GUI status가 STA+TIT 껍데기만, PFKEYS/툴바 비어 있음.
- 텍스트 풀 부분 생성(`counts.I>0`인데 `counts.S==0`이면서 SELECT-OPTIONS/PARAMETERS 존재).
- **JOIN이 "동작은 하는데 행집합이 틀림"** — INNER/LEFT 오선택으로 행이 조용히
  누락/배수. 문법·활성화·유닛 통과와 무관하게 MAJOR(§13).
- **결과가 "일관되지만 스펙과 다른 값"** — impl 보고의 desk-check를 복창해 놓친다(§14).

## 판정 규칙

- **MINOR** — 비차단 위반(이후 impl 세션이 수정, 재리뷰 불요).
- **MAJOR** — 완료 차단 위반(§1 인라인 필드카탈로그, §13 JOIN 카디널리티 오류, §14 스펙
  불일치 등). **MAJOR ≥ 1 → verdict = FAIL.**
- **PASS** — MAJOR 0건(MINOR는 나열 가능).

## verdict 기록 계약 (이것만 쓴다)

판정을 마치면 아래를 수행하라. **`.harness/runs/{run-id}/review-verdict.json` 외 어떤
파일도 생성·수정·삭제하지 마라** — 등식형 검사기가 기계로 차단하지만(초과 dirty → FAIL),
지시로도 명시한다. **다른 run(`.harness/runs/<다른 id>/`)도 건드리지 마라** — 제외 집합에
없으므로 dirty 초과로 걸린다.

1. **HEAD sha를 읽어라**:
   ```
   git rev-parse HEAD
   ```
   출력(40-hex 소문자)을 그대로 `reviewed_head`에 넣는다. (이 값은 impl feat 커밋 sha —
   엔진이 impl 세션 종료 후 생성하므로 위조 불가. 검사기가 현재 HEAD와 대조한다.)

2. **네가 판정한 소스의 exact 해시를 계산하라** (검사기가 같은 방식으로 재계산해 대조):
   ```
   git ls-tree -r HEAD -- src
   ```
   출력 줄들을 **LF로 join**(마지막 줄 뒤 개행 없음)한 문자열의 **UTF-8 바이트에 SHA256**을
   적용하고, 64-hex 소문자를 `reviewed_source_sha256`에 넣는다. 이것이 "네가 정확히 무엇을
   판정했는가"의 지문이다 — 소스가 한 바이트라도 바뀌면 blob sha가 달라져 이 verdict는
   **stale**이 되고 게이트가 막는다.

3. **`.harness/runs/{run-id}/review-verdict.json`을 쓴다** — `review-verdict.schema.json`
   (v2) 준수:
   ```json
   {
     "run_id": "{run-id}",
     "verdict": "PASS",
     "reviewed_head": "<git rev-parse HEAD 출력, 40-hex>",
     "reviewed_source_sha256": "<위 2번 해시, 64-hex 소문자>",
     "boundary": {
       "policy_profile": "P0",
       "transport_operations": 0,
       "sap_mutation_boundary": "unverified"
     },
     "findings": [
       { "bucket": "B2", "severity": "MAJOR", "object": "ZCL_...", "finding": "§13 ... INNER JOIN drops unmatched rows where LEFT OUTER is required by spec X" }
     ]
   }
   ```
   - MAJOR가 하나라도 있으면 `verdict`는 반드시 `"FAIL"`. findings에는 MINOR도 전부 나열.
   - **`boundary`는 네가 실제로 지킨 경계의 진술이다** — 거짓 진술은 계약 위반이다:
     - `policy_profile`: 로컬(diff+src)만 봤으면 **`"P0"`**, 라이브 read를 썼으면 `"P1"`.
       **P2/P3/P4는 리뷰어에게 허용되지 않는다** — 검사기가 거부한다.
     - `transport_operations`: 반드시 **`0`**. `ListTransports`/`GetTransport`/
       `vsp transport list`/`get` 같은 **조회도 transport 동작으로 센다**.
     - `sap_mutation_boundary`: 반드시 **`"unverified"`**. 리뷰어의 SAP-write 차단은
       기계적이지 않다(D-025 O1, D-028) — "닫혔다"고 쓰는 것은 금지되며 검사기가 막는다.

4. 다른 bookkeeping(index.json status 등)은 엔진이 처리한다 — 너는 verdict 파일만 남긴다.

## Forbidden

- **verdict 파일 외 레포 쓰기 금지** — `src/` 포함 어떤 파일도 고치지 마라. 이유:
  게이트의 등식형 dirty 검사가 초과 변경을 FAIL로 막는다. 결함은 **고치는 게 아니라
  findings로 기록**한다.
- **모든 vsp write 금지** — `vsp deploy`/`copy`/`execute` 및 모든 SAP 변경(R-003). 주의:
  등식 검사는 git dirty만 보므로 SAP 직접 write는 기계로 안 잡힌다 — 규율로 지켜라.
- **impl 보고를 근거로 verdict 결정 금지** — 독립 재도출 원칙 위반.
- **연결 실패를 코드 결함으로 판정 금지**(R-001) — 로컬(diff+src)만으로 판정한다.
- 동결 레포·`sc4sap-custom/private/` 접근 금지(R-004), 접속정보 커밋 금지(R-005).
