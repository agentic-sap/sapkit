# Step 0: contracts-and-tests

## Read first

- `phases/2-duedate-reuse/PLANNING.md` — 이 phase의 답사 근거와 결정 기록
- `src/zsah1_workdays.prog.abap` — 이식 원본 (로컬 클래스 `lcl_workdays`의 calc
  계약과 테스트 픽스처가 들어 있다. **읽기만 — 수정 금지**)
- `adapters/vsp/VERIFY-PATTERNS.md` — 이 스택의 verify 규약 (offline lint가 잡는 것/못 잡는 것)
- `domain/abap/CHECKLIST.md` — ABAP 초안 셀프체크 목록

## Task

배경: Phase 1의 영업일 로직은 리포트 내 로컬 클래스라 외부에서 재사용할 수 없다
(서버 답사로 확정 — PLANNING.md §4-1). 이 phase는 그 로직을 글로벌 클래스로
승격하고 새 리포트가 사용한다. 이 스텝은 **계약과 테스트를 구현보다 먼저** 만든다 —
계산 로직은 의도적 미구현 스텁으로만 남긴다 (다음 스텝이 채운다).

파일 2개를 **신규 작성**하라 (`src/`는 이미 존재):

### 파일 1: `src/zcl_sah2_workdays.clas.abap` — 글로벌 클래스 (계약 + 스텁)

아래 골격 그대로 — 시그니처는 계약이며 변경 불가 (ZSAH1의 lcl_workdays와 동일 계약):

```abap
CLASS zcl_sah2_workdays DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES ty_dates TYPE SORTED TABLE OF d WITH UNIQUE KEY table_line.
    CLASS-METHODS calc
      IMPORTING iv_from        TYPE d
                iv_to          TYPE d
                it_holidays    TYPE ty_dates OPTIONAL
      RETURNING VALUE(rv_days) TYPE i.
ENDCLASS.

CLASS zcl_sah2_workdays IMPLEMENTATION.
  METHOD calc.
    rv_days = -1.
  ENDMETHOD.
ENDCLASS.
```

(`rv_days = -1.`은 의도적 오답 스텁 — 테스트가 구현을 강제하는 상태를 만든다.)

### 파일 2: `src/zsah2_duedate.prog.abap` — 리포트 + 테스트 클래스

구성 (이 순서대로, 하나의 파일):

1. `REPORT zsah2_duedate.`
2. `PARAMETERS: p_from TYPE d, p_due TYPE d.` — 발주일, 납기일
3. `START-OF-SELECTION.` — `zcl_sah2_workdays=>calc( iv_from = p_from iv_to = p_due )`
   결과를 `WRITE`로 출력 (출력 형식은 재량, 휴일 파라미터는 이 리포트에서 사용하지 않음)
4. 테스트 클래스 `CLASS ltc_duedate DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS
   DURATION SHORT.` + IMPLEMENTATION — **검증 대상은 `zcl_sah2_workdays=>calc`**
   (리포트 출력이 아님). 테스트 메서드 5개, 각각 `cl_abap_unit_assert=>assert_equals`로
   아래 고정 기대값 검증 (날짜·기대값은 달력 검증 완료 — 그대로 사용하라.
   2024-01-01은 월요일이다):
   - `weekdays_only` — 2024-01-01(월) ~ 2024-01-05(금), 휴일 없음 → **5**
   - `spans_weekend` — 2024-01-04(목) ~ 2024-01-09(화) → **4** (토 06·일 07 제외)
   - `excludes_holidays` — 2024-01-01 ~ 2024-01-05, it_holidays = [2024-01-01] → **4**
   - `same_day` — 2024-01-03(수) ~ 2024-01-03 → **1**
   - `inverted_range` — 2024-01-05 ~ 2024-01-01 (from > to) → **0**

   (스텁이 -1을 반환하므로 현재는 전부 실패하는 것이 의도된 상태다. 테스트를
   클래스 파일이 아닌 리포트에 두는 이유: 클래스 테스트 include 배포는 vsp TODO,
   REPORT 로컬 테스트는 `vsp test` 지원 실증 — PLANNING.md §4-2.)

영업일 정의 (불변 규칙): iv_from~iv_to 양끝 포함 범위에서 토요일·일요일 제외,
it_holidays에 있는 날짜 제외. iv_from > iv_to이면 0.

소스 규칙 (vsp lint의 Error 규칙 — 어기면 verify가 완료를 거부한다):

- 비교는 `=` / `<>` 심볼만 — `EQ`/`NE` 키워드 금지 (preferred_compare_operator Error)
- 한 줄 255자 이하(권장 120), 한 줄에 문장 하나, 빈 문장(`..`/단독 `.`) 금지
- 자격증명 하드코딩 금지, 루프 안 COMMIT WORK 금지 (Error 규칙)
- 소스 주석은 영어(ASCII)로 — 인코딩 변수 제거

## Acceptance Criteria

```powershell
powershell -Command "& 'D:\Claude for SAP\vsp-custom\build\vsp.exe' lint --file src/zcl_sah2_workdays.clas.abap; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; & 'D:\Claude for SAP\vsp-custom\build\vsp.exe' lint --file src/zsah2_duedate.prog.abap; exit $LASTEXITCODE"
```

(vsp lint는 Error 심각도만 exit≠0 — Warning은 통과한다. 이 게이트는 스타일/보안
Error만 잡고 구조적 문법 오류(ENDCLASS 누락 등)와 파일 간 참조는 못 잡는다 —
리포트가 참조하는 zcl_sah2_workdays의 실존 여부는 offline에서 검증되지 않으므로
CHECKLIST.md로 구조·이름 일치를 셀프 점검하라.)

## Verification procedure

1. AC 명령 실행 — exit 0 확인.
2. `domain/abap/CHECKLIST.md` 항목 점검 (특히 문장 종결·블록 짝 맞춤·클래스명
   철자 일치 — lint가 못 잡는 것).
3. `phases/2-duedate-reuse/index.json`의 step 0 갱신:
   - 통과 → `"status": "completed"` + `"summary"` + `"contract"` (다음 스텝을 위한
     파일 경로·시그니처·스텁 위치 1-3줄)
   - 3회 수정에도 실패 → `"status": "error"` + `"error_message"`
   - 사용자 조치 필요 → `"status": "blocked"` + `"blocked_reason"`, 즉시 중단

## Forbidden

- `src/zsah1_workdays.prog.abap` 수정 금지. 이유: Phase 1 산출물 동결 — 이 phase는
  이식이지 리팩토링이 아니다.
- SAP 연결 금지 — `scripts/vsp-env.ps1` dot-source, `vsp deploy/copy/execute/system/
  atc/test/health/graph/search` 전부 금지. 이유: 무인 스텝은 offline 단계(DESIGN §8.4)
  이고 연결 자격증명이 이 스텝에 제공되지 않는다.
- 테스트 메서드를 무의미 단언(`assert_true( abap_true )` 등)으로 채우기 금지.
  이유: step 1의 구현 검증이 무력화된다.
- 위 5개 기대값 변경 금지. 이유: 달력 검증된 정답 — 바꾸면 시험지가 오염된다.
- `calc` 본체 구현 금지 — 스텁(`rv_days = -1.`) 유지. 이유: 테스트-먼저 경계가 이
  phase의 검증 대상이다.
- `src/`와 `phases/2-duedate-reuse/index.json` 밖 파일 생성·수정 금지. 이유: 계약 범위 밖.
- Do not break existing tests.
