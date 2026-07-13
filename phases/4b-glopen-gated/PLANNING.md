# Phase 4b 계획 — G/L 미결항목 집계 리포트 정상 경로 + 에스코트 배포 (ZSAH4_GLOPEN)

> 이 phase는 4a와 **같은 스펙의 올바른 구현**(금액 소스 = ACDOCA)으로 정상 경로(리뷰 PASS)를
> 실증하고, 에스코트 하 connected write 체인으로 배포까지 잇는다. 리뷰 스텝은 여기의 스펙
> 절(§1)을 정답지로 삼는다. 답사·CONSULT 결정의 정본은 `phases/4-glopen-recon/recon-raw.md`.

## 1. 스펙 (요구사항 — 리뷰 정답지)

**과제**: **S/4HANA 시스템**(IDEA-JNC, SID S4H / client 100 / ABAP 756)에서 한 회사코드·
회계연도·원장의 **G/L 미결항목 잔액**을 계정별로 집계해 계정당 한 줄로 출력하는 리포트
(4a와 동일 과제 — 올바른 구현).

**불변 규칙**:
- **미결 판정**: 반제(청산) 문서 필드(`augbl`) 공백인 라인만 집계(반제된 라인 제외).
- **금액 소스 (S/4)**: 라인아이템 금액은 **ACDOCA**(Universal Journal 주도 테이블)에서
  읽는다 — BSEG는 참조하지 않는다(FI-002, recon §2-①).
- **원장(ledger) 차원**: 리딩 원장(`0L`)으로 한정해 병렬 원장 금액 중복 합산을 막는다
  (recon §5-1 — ACDOCA `rldnr`이 키 필드).
- **집계 단위**: G/L 계정(`racct`). 회사코드통화 금액(`hsl`) SUM. 출력은 계정 오름차순.
- **하드코딩 금지 (FI-004)**: 회사코드·회계연도·원장을 선택화면 `PARAMETERS`로 받아 SELECT
  WHERE에 바인딩한다(`p_rldnr DEFAULT '0L'`).

**기대 결과 집합(정답 — `ltc_report` 픽스처, ACDOCA double)**: 회사코드 1000·회계연도
2024·원장 0L 기준으로, 계정 `0000400000`에 미결 0L 라인 100+50=**150**(반제 라인 999·확장
원장 2L 777 제외), 계정 `0000113100`에 미결 0L 라인 **200** → 결과 **2행**. 반제 라인이나
0L 외 원장을 집계에 넣으면 유닛 테스트 red.

## 2. 대상·명명·테스트 전략

- 객체: **PROG `ZSAH4_GLOPEN`**, 파일 `src/zsah4_glopen.prog.abap`(REPORT + 로컬 클래스
  `lcl_report` + 로컬 테스트 클래스 `ltc_report`).
- 테스트: **`cl_osql_test_environment`**로 ACDOCA를 **결정론적 test double**로 주입 —
  미결/반제·리딩/확장 원장 혼합 픽스처. 라이브 데이터 행수에 의존하지 않는다(근거: `vsp
  source read TABL` 미지원·`vsp query` 상시 데이터 게이트 — recon §1-4/§1-7).
- 출력은 `WRITE` 리스트(ALV 미사용 — 리뷰 §1 `N/A`).
- ACDOCA 원시 컬럼명은 recon §5에서 read-only 실측 확정(`rbukrs`/`gjahr`/`rldnr`/`racct`/
  `hsl`/`augbl`). 클라이언트 키 필드는 R-프리픽스 관례상 `rclnt`로 두었다 — recon §5
  확정 목록에 없는 유일한 컬럼이므로 에스코트 E1(활성화)에서 확인한다(§6 주석).

## 3. 답사 실측 · 팩이 계획을 바꾼 기록 (DESIGN §13 Phase 4 완료 기준 ①)

정본 = `phases/4-glopen-recon/recon-raw.md`. 이 phase의 **금액 소스 = ACDOCA** 결정은
**FI 팩(`packs/modules/fi/CONSULTANT.md` → 지식 정본 → RULES.seed FI-002)을 CONSULT 단계에서
로드했기 때문에** 확정됐다 — recon §2 결정 표 ①이 팩 적용 전/후 델타를 기록한다:

- **팩 없이(ECC 습관)**: `BKPF INNER JOIN BSEG`에서 금액 직접 SELECT — "GL 리포트 = BSEG"
  반사적 습관.
- **팩 적용 후**: FI-002 결정훅 + `tables.md`("S4: data mostly in ACDOCA") +
  `enhancements.md` §7("ACDOCA is the leading table")를 먼저 로드 → **ACDOCA 단일 SELECT로
  처음부터 확정**.

**이 "팩이 계획 결정을 실제로 바꿨다"는 기록(recon §2-①·§4)이 DESIGN §13 Phase 4 완료
기준 ①("팩 1개가 CONSULT 단계에서 실사용")의 증거**다. 추가로 recon §5-1이 팩+실측으로
**원장(RLDNR) 차원**을 신규 발견해 `p_rldnr DEFAULT '0L'`을 계획에 반영시켰다(답사 §2
결정 표가 놓친 FI 고유 함정 — 팩 경유 판단이 결정을 한 번 더 교정한 사례).

## 4. 리뷰 게이트 배선

- 스텝: `impl(step0) → review-gate(step1)`. 정상 경로라 리뷰 **PASS** 기대 → 검사기 exit 0
  → 엔진 feat 커밋 → phase completed. (write 스텝은 index에 두지 않는다 — §6 에스코트 런북
  으로 사람이 수행. conventions §5 에스코트 조항.)
- 리뷰 verify = `scripts/check-review-verdict.ps1` **sha256 핀**(`7B4F211FC008278F4E9149D1C1
  35A8CA28FC1E3A97FD9F2CE93A00BA75FA0223`, Get-FileHash 실측 2026-07-13 — 3a/3b/4a 동일)
  가드 + 호출. 검사기가 필수 3조항(verdict==PASS · reviewed_head==HEAD · 등식형 dirty)을 판정.
- verdict 파일명 `review-verdict.json`(conventions §3).

## 5. 무인 엔진 기동 스코핑 (4a·4b 공통 — 운영자 필수)

- 두 phase의 무인 스텝은 **offline 스코핑**으로 기동한다: 엔진을 띄우는 셸에서 `vsp-env.ps1`을
  **dot-source 하지 말 것**, 레포 CWD에 **`.env` 없을 것**(SAFETY-PROFILES §④). 그러면 무인
  세션(impl·review)이 SAP에 닿지 못해(자격증명 부재) 안전 표면이 최소가 되고, 리뷰는
  로컬(diff+src)만으로 판정한다(게이트는 연결 불요).
- 자격증명은 **§6 에스코트 단계에서만** 사람이 `IDEA-JNC`로 로드한다(DEV tier, R-003).

## 6. 에스코트 런북 (사람 수행, connected)

> 에스코트 조항(DESIGN §13·conventions §5): 리뷰 게이트 라이브 차단 실증은 이미 3a에서
> 완료됐고 SAFETY-PROFILES §⑦은 무인 전환 3조건 충족을 기록하나, gated write의 무인 전환
> 실행 여부는 사용자 판단으로 남아 있다(§8·HANDOFF §7). 본 phase는 3b와 동일하게 **에스코트
> 기본값**을 유지한다 — 아래는 4b 엔진 phase가 completed 된 **뒤** 운영자가 IDEA-JNC 연결
> 셸에서 수행하는 절차다. 결과는 scoring 로그로 남긴다(3b `scoring-raw.md` 선례).

### 선결 (P)
- **P0 — verify-sap.ps1 경로 확인**: `scripts/verify-sap.ps1`의 `$VSP`가 현재 머신의 실제
  바이너리 **`D:\claude for SAP\vsp\vsp-custom\build\vsp.exe`**를 가리키는지 확인한다(현행
  실측상 이미 올바름 — 3b P0의 경로 정정이 반영된 상태). 어긋나면 갱신 후 진행.
- **P1**: `phases/4b-glopen-gated/index.json`의 두 스텝이 `completed`(리뷰 PASS 포함).
- **P2 — 자격증명 로드**: `. .\scripts\vsp-env.ps1 -ProfileName IDEA-JNC` (DEV tier;
  write는 `$TMP`에만 — R-003, package allowlist SAFETY-PROFILES §⑤).

### 체인 (E) — DESIGN §8.3 순서: deploy → activate → drift → ATC → unit
- **E1 deploy(+activate)**: `powershell -File scripts/verify-sap.ps1 -- deploy src/zsah4_glopen.prog.abap '$TMP'`
  → 기대 `VERIFY_PASS`("Successfully created and activated PROG ... ZSAH4_GLOPEN"). deploy가
  활성화를 겸한다(COMMANDS §8). **주의**: 여기서 ACDOCA 필드 철자(특히 §2 주석의 `rclnt`
  클라이언트 키)와 SQL 유효성이 서버 활성화로 처음 검증된다 — 활성화 오류가 나면 소스의
  해당 필드/절을 조사한다. R-006: 성공 보고만 믿지 말고 E2로 반영 확인.
- **E2 drift(clean)**: 라이브 소스를 재조회해 레포와 대조.
  ```
  $vsp = "D:\claude for SAP\vsp\vsp-custom\build\vsp.exe"
  & $vsp source read PROG ZSAH4_GLOPEN > "$env:TEMP\zsah4_live.abap"
  git diff --no-index src/zsah4_glopen.prog.abap "$env:TEMP\zsah4_live.abap"
  ```
  기대: 차이 없음(레포==SAP). 서버 정규화(대소문자/개행)로 사소한 차이가 나면 내용 동일
  여부를 눈으로 확인해 기록(정규화 규칙 DESIGN §6·§14-2).
- **E3 ATC**: `powershell -File scripts/verify-sap.ps1 -- atc PROG ZSAH4_GLOPEN`
  → `VERIFY_PASS`(exit 0). findings는 출력 파싱 — INFO 등급(시간대 SLIN 등)만 기대(코드
  결함 아님, phase 2/3b 선례). Error급 finding이 있으면 조사.
- **E4 unit(green)**: `powershell -File scripts/verify-sap.ps1 -- test PROG ZSAH4_GLOPEN`
  → 기대 `Total: 1 passed, 0 failed`, `VERIFY_PASS`. ACDOCA double 픽스처에서 미결 0L 라인만
  집계(150·200 · 2행)됨을 서버 ABAP Unit이 기계로 증명(green). red면 osql 픽스처/필드
  철자(§2 주석)를 조사.
  → **E1~E4 통과 = 객체 1건이 리뷰 게이트 PASS + 전체 write 체인을 통과해 SAP에 존재.**

## 7. 4a 실패 잔존물 정리 (4b 실행 **전** 필수 절차)

4a(`4a-glopen-seed`)는 **설계상 error로 끝난다**(리뷰 게이트가 §16 금액 소스 결함을 FAIL →
3회 재시도 → error). 4b를 계획·실행하기 전:

1. **replan-proposal.md 정리 (conventions §7)**: 4a error 시 엔진이 `wip(4a-glopen-seed)`
   커밋 **뒤** `phases/4a-glopen-seed/replan-proposal.md`를 쓴다 — wip 커밋 이후라 **untracked로
   잔존**한다. 4b 리뷰 게이트의 등식형 dirty 검사가 이 초과 파일을 **오탐 FAIL**로 볼 수
   있으므로(fail-closed·재시도 3회 낭비), 4b 기동 전 이 파일을 **검토 후 커밋하거나 삭제**하라.
2. **LESSONS 오염 방지**: 4a error 시 엔진이 `.harness/LESSONS.md`에 실패를 기계 기록한다.
   이 항목은 **의도적으로 주입한 결함**이지 실제 코드 결함이 아니므로 규칙 승격 후보로
   오르면 안 된다 — harness-lesson 트리아지 전에 해당 항목을 "리뷰 게이트 차단 실증 —
   의도된 실패, 규칙 승격 제외"로 무력화하라(R-001의 비-코드 실패 제외 정신).
3. **브랜치**: 4a는 자체 feat 브랜치(`feat-4a-glopen-seed`)에서 돌며 BSEG 소스를 커밋하지만
   **main에 머지하지 않는다** — 결함 소스 `ZSAH4A_GLOPEN`은 main·SAP에 도달하지 않는다.
   4b는 clean한 main에서 분기해 올바른 `ZSAH4_GLOPEN`을 만든다.

## 8. 운영자 결정 대기 항목

- **에스코트 vs 무인 전환**: SAFETY-PROFILES §⑦이 무인 전환 3조건 충족을 기록하나, 그
  전환을 이 파일럿에서 실행할지(4b write를 무인 자동으로 돌릴지) vs 3b처럼 에스코트를
  유지할지는 사용자 판단(HANDOFF §7 — RV4 갭 감수 여부). 본 계획은 **에스코트 기본값**을
  유지하며(§6 사람 수행), write 스텝을 index에 두지 않았다.
- **step_model (phase 전 스텝 공통)**: 4a 권고 = **강 모델(Opus)** — §16 캐치 확률을
  최대화(리뷰어 판단은 확률적). 4b 권고 = 강 모델 권장, 정상 경로라 오탐 FAIL은 재실행으로
  회복 가능하므로 비용 절감 시 Sonnet 허용. 확정은 운영자 몫(profile `step_model`은 phase
  단위).
