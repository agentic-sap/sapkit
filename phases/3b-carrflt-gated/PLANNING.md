# Phase 3b 계획 — 항공사 운항편 집계 리포트 정상 경로 + 에스코트 배포 (ZSAH3_CARRFLT)

> 이 phase는 3a와 **같은 스펙의 올바른 구현**(LEFT OUTER)으로 정상 경로(리뷰 PASS)를
> 실증하고, 에스코트 하 connected write 체인으로 DESIGN §13 Phase 3 완료 기준 ①②를
> 채운다. 리뷰 스텝은 여기의 스펙 절을 정답지로 삼는다.

## 1. 스펙 (요구사항 — 리뷰 정답지)

3a와 동일. 각 항공사(SCARR)의 예정 항공편(SFLIGHT) **건수**를 항공사당 한 줄로 출력.

**불변 규칙**: **운항편이 0건인 항공사도 결과에 반드시 포함**되며 `flightcount`는 **0**.
즉 트랜잭션(운항편)이 없는 마스터(항공사)도 결과에 남아야 한다. → **LEFT OUTER JOIN**이
스펙 요구다(INNER면 0건 항공사가 누락되어 스펙 위반).

**기대 결과 집합(정답 — `ltc_report` 픽스처)**: 항공사 AA(운항편 2)·LH(1)·ZZ(**0**) →
결과 **3행**, ZZ가 `flightcount=0`으로 포함. INNER면 2행(ZZ 누락)이 되어 유닛 테스트 red.

## 2. 대상·명명·테스트 전략

- 객체: **PROG `ZSAH3_CARRFLT`**, 파일 `src/zsah3_carrflt.prog.abap` (REPORT + 로컬
  클래스 `lcl_report` + 로컬 테스트 클래스 `ltc_report`).
- 테스트: **`cl_osql_test_environment`** 로 SCARR·SFLIGHT를 **결정론적 test double**로
  주입(AA/LH/ZZ 픽스처). 라이브 데이터 행수에 의존하지 않는다 — 근거: 답사에서
  `vsp source read TABL` 미지원·`vsp query` 상시 데이터 게이트 확인(3a PLANNING §4-1).
- 출력은 `WRITE` 리스트(ALV 미사용 — 리뷰 §1 `N/A`).

## 3. 답사 실측

3a PLANNING §3 참조 (같은 세션 답사). SCARR·SFLIGHT 실존(SAPBC_DATAMODEL), `carrid` 조인
키, ZSAH3* 이름 충돌 0건, IDEA-JNC=S4H/100/756 DEV tier.

## 4. 리뷰 게이트 배선

- 스텝: `impl(step0) → review-gate(step1)`. 정상 경로라 리뷰 **PASS** 기대 → 검사기
  exit 0 → 엔진 feat 커밋 → phase completed. (write 스텝은 index에 두지 않는다 — 아래 §6
  에스코트 런북으로 사람이 수행. conventions §5 에스코트 조항.)
- 리뷰 verify = `check-review-verdict.ps1` sha256 핀(`7B4F211F…FA0223`) 가드 + 호출.

## 5. 무인 엔진 기동 스코핑 (3a·3b 공통 — 운영자 필수)

- 두 phase의 무인 스텝은 **offline 스코핑**으로 기동한다: 엔진을 띄우는 셸에서
  `vsp-env.ps1`을 **dot-source 하지 말 것**, 레포 CWD에 **`.env` 없을 것**(§8.4). 그러면
  무인 세션(impl·review)이 SAP에 닿지 못해(자격증명 부재) 안전 표면이 최소가 되고,
  리뷰는 로컬(diff+src)만으로 판정한다(게이트는 연결 불요).
- 자격증명은 **§6 에스코트 단계에서만** 사람이 `IDEA-JNC`로 로드한다(DEV tier, R-003).

## 6. 에스코트 런북 (사람 수행, connected — 완료 기준 ①②)

> 에스코트 조항(DESIGN §13·conventions §5): AC5(씨앗 결함 라이브 차단, = 3a 성공) 실증
> 전까지 gated write는 **사람이 수행**한다. 아래는 3b 엔진 phase가 completed 된 **뒤**
> 운영자가 IDEA-JNC 연결 셸에서 수행하는 절차다. 결과는 scoring 로그로 남긴다(phase 2
> `scoring-raw.md` 선례).

### 선결 (P)
- **P0 — verify-sap.ps1 경로 정정 (필수)**: `scripts/verify-sap.ps1`의 `$VSP`가 현재
  머신에 없는 경로(`D:\Claude for SAP\vsp-custom\build\vsp.exe`)를 가리킨다. 실제 바이너리는
  **`D:\claude for SAP\vsp\vsp-custom\build\vsp.exe`**다(0b03ef2 재현 빌드). 정정 전에는
  모든 verify-sap.ps1 호출이 `ENV_FAIL: vsp binary not found`로 떨어진다. → 에스코트 전
  `$VSP`를 실제 경로로 갱신하라(커밋 여부는 운영자 판단).
- **P1**: `phases/3b-carrflt-gated/index.json`의 두 스텝이 `completed`(리뷰 PASS 포함).
- **P2 — 자격증명 로드**: `. .\scripts\vsp-env.ps1 -ProfileName IDEA-JNC` (DEV tier;
  write는 `$TMP`에만 — R-003, package allowlist SAFETY-PROFILES §⑤).

### 체인 (E) — DESIGN §8.3 순서: deploy → activate → drift → ATC → unit
- **E1 deploy(+activate)**: `powershell -File scripts/verify-sap.ps1 -- deploy src/zsah3_carrflt.prog.abap '$TMP'`
  → 기대 `VERIFY_PASS` ("Successfully created and activated PROG ... ZSAH3_CARRFLT").
  deploy가 활성화를 겸한다(COMMANDS §8). R-006: 성공 보고만 믿지 말고 E2로 반영 확인.
- **E2 drift(clean)** — 완료 기준 ① 일부: 라이브 소스를 재조회해 레포와 대조.
  ```
  $vsp = "D:\claude for SAP\vsp\vsp-custom\build\vsp.exe"
  & $vsp source read PROG ZSAH3_CARRFLT > "$env:TEMP\zsah3_live.abap"
  git diff --no-index src/zsah3_carrflt.prog.abap "$env:TEMP\zsah3_live.abap"
  ```
  기대: 차이 없음(레포==SAP). 서버 정규화(대소문자/개행)로 사소한 차이가 나면 내용 동일
  여부를 눈으로 확인해 기록(정규화 규칙은 DESIGN §6·§14-2, 타입 확장은 후속).
- **E3 ATC**: `powershell -File scripts/verify-sap.ps1 -- atc PROG ZSAH3_CARRFLT`
  → `VERIFY_PASS`(exit 0). findings는 출력 파싱 — INFO 등급(시간대 SLIN·미번역 리터럴)만
  기대(코드 결함 아님, phase 2 선례). Error급 finding이 있으면 조사.
- **E4 unit(red/green)**: `powershell -File scripts/verify-sap.ps1 -- test PROG ZSAH3_CARRFLT`
  → 기대 `Total: 1 passed, 0 failed`, `VERIFY_PASS`. LEFT OUTER가 ZZ(0건) 행을 살려 3행을
  내는 것을 서버 ABAP Unit이 기계로 증명(green). red면 osql 픽스처/환경 조사.
  → **E1~E4 통과 = 완료 기준 ① 충족**(객체 1건이 리뷰 게이트 PASS + 전체 write 체인을
  통과해 SAP에 존재).

### drift SE80 검출 (D) — 완료 기준 ② (사람 수동 변경 필수)
- **D1**: SE80/ADT(GUI)에서 `ZSAH3_CARRFLT`를 **수동 변경**(예: WRITE 헤더 문구 변경, 또는
  주석 한 줄 추가) 후 활성화. ← **이 지점이 사람 개입 필수**(무인 경로로는 만들 수 없는
  "SAP 쪽 직접 변경").
- **D2**: E2와 동일 대조를 재실행 →
  ```
  & $vsp source read PROG ZSAH3_CARRFLT > "$env:TEMP\zsah3_live2.abap"
  git diff --no-index src/zsah3_carrflt.prog.abap "$env:TEMP\zsah3_live2.abap"
  ```
  기대: **차이 있음(non-empty diff) = drift 검출** → 완료 기준 ② 충족.
- **D3(선택)**: E1 재실행으로 SAP를 레포 상태로 복구.

## 7. 3a 실패 잔존물 정리 (3b 실행 **전** 필수 절차)

3a(`3a-carrflt-seed`)는 **설계상 error로 끝난다**(리뷰 게이트가 씨앗 결함을 FAIL →
3회 재시도 → error). 이는 AC5(§13 완료 기준 ③)의 **성공 신호**다. 3b를 계획·실행하기 전:

1. **replan-proposal.md 정리 (conventions §7)**: 3a error 시 엔진이 `wip(3a-carrflt-seed)`
   커밋 **뒤** `phases/3a-carrflt-seed/replan-proposal.md`를 쓴다 — 이는 wip 커밋 이후라
   **untracked로 잔존**한다. 3b 리뷰 게이트의 등식형 dirty 검사가 이 초과 파일을
   **오탐 FAIL**로 볼 수 있으므로(fail-closed·재시도 3회 낭비), 3b 기동 전 이 파일을
   **검토 후 커밋하거나 삭제**하라.
2. **LESSONS 오염 방지 (운영 노트)**: 3a error 시 엔진이 `.harness/LESSONS.md`에 실패를
   기계 기록한다. 이 항목은 **의도적으로 주입한 씨앗 결함**이지 실제 코드 결함이 아니므로
   **규칙 승격 후보로 오르면 안 된다**. harness-lesson 트리아지 전에 해당 LESSONS 항목을
   "AC5 씨앗 결함 실증 — 의도된 실패, 규칙 승격 제외"로 **주석 처리/무력화**하라(R-001의
   환경/비-코드 실패 제외 정신).
3. **브랜치**: 3a는 자체 feat 브랜치(`feat-3a-carrflt-seed`)에서 돌며 INNER 소스를 커밋
   하지만 **main에 머지하지 않는다** — 결함 소스 `ZSAH3A_CARRFLT`는 main·SAP에 도달하지
   않는다. 3b는 clean한 main에서 분기해 올바른 `ZSAH3_CARRFLT`를 만든다.

## 8. 운영자 결정 대기 항목

- **step_model (phase 전 스텝 공통 — 스펙 Deferred #3)**: 리뷰 품질이 AC5의 관건이다.
  - **3a 권고 = 강 모델(Opus)**: AC5는 리뷰어가 INNER-vs-LEFT를 실제로 잡아야 성립하는데
    리뷰어 판단은 확률적이다(스펙 Decisions #6-②). 캐치 확률을 최대화하려면 3a는 강 모델
    권장. (impl 스텝은 사실상 전사 작업이라 모델 강도 영향 미미 — 비용의 대부분은 리뷰.)
  - **3b 권고 = 강 모델 권장, Sonnet 허용**: 정상 경로라 리뷰는 PASS만 내면 되고(쉬움),
    잘못돼도 오탐 FAIL은 재실행으로 회복 가능(AC5 오염 아님). 비용 절감 시 Sonnet 가능.
  - 확정은 운영자 몫. profile `step_model`은 per-step 배정 불가라 phase 단위로 정한다.
