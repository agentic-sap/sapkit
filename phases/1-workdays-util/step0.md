# Step 0: test-class-first

## Read first

- `adapters/vsp/VERIFY-PATTERNS.md` — 이 스택의 verify 규약 (offline lint가 잡는 것/못 잡는 것)
- `domain/abap/CHECKLIST.md` — ABAP 초안 셀프체크 목록

## Task

`src/zsah1_workdays.prog.abap` 파일을 **신규 작성**하라 (`src/` 디렉토리도 신규 생성).
이 스텝은 **테스트 클래스를 구현보다 먼저 작성**하는 스텝이다 — 계산 로직 구현은
의도적 미구현 스텁으로만 남긴다 (다음 스텝이 채운다).

파일 구성 (이 순서대로, 하나의 파일):

1. `REPORT zsah1_workdays.`
2. 계산 클래스 정의 — 시그니처는 계약이며 변경 불가:
   ```abap
   CLASS lcl_workdays DEFINITION FINAL.
     PUBLIC SECTION.
       TYPES ty_dates TYPE SORTED TABLE OF d WITH UNIQUE KEY table_line.
       CLASS-METHODS calc
         IMPORTING iv_from        TYPE d
                   iv_to          TYPE d
                   it_holidays    TYPE ty_dates OPTIONAL
         RETURNING VALUE(rv_days) TYPE i.
   ENDCLASS.
   ```
3. `CLASS lcl_workdays IMPLEMENTATION.` — `calc` 본체는 **스텁 한 줄만**: `rv_days = -1.`
   (의도적 오답 — 테스트가 구현을 강제하는 상태를 만든다)
4. 테스트 클래스 `CLASS ltc_workdays DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS
   DURATION SHORT.` + IMPLEMENTATION — 테스트 메서드 5개, 각각
   `cl_abap_unit_assert=>assert_equals`로 아래 고정 기대값 검증 (날짜·기대값은 달력
   검증 완료 — 그대로 사용하라. 2024-01-01은 월요일이다):
   - `weekdays_only` — 2024-01-01(월) ~ 2024-01-05(금), 휴일 없음 → **5**
   - `spans_weekend` — 2024-01-04(목) ~ 2024-01-09(화) → **4** (토 06·일 07 제외)
   - `excludes_holidays` — 2024-01-01 ~ 2024-01-05, it_holidays = [2024-01-01] → **4**
   - `same_day` — 2024-01-03(수) ~ 2024-01-03 → **1**
   - `inverted_range` — 2024-01-05 ~ 2024-01-01 (from > to) → **0**

영업일 정의 (불변 규칙): iv_from~iv_to 양끝 포함 범위에서 토요일·일요일 제외,
it_holidays에 있는 날짜 제외. iv_from > iv_to이면 0.

소스 규칙 (vsp lint의 Error 규칙 — 어기면 verify가 완료를 거부한다):

- 비교는 `=` / `<>` 심볼만 — `EQ`/`NE` 키워드 금지 (preferred_compare_operator Error)
- 한 줄 255자 이하(권장 120), 한 줄에 문장 하나, 빈 문장(`..`/단독 `.`) 금지
- 자격증명 하드코딩 금지, 루프 안 COMMIT WORK 금지 (Error 규칙)
- 소스 주석은 영어(ASCII)로 — 인코딩 변수 제거

## Acceptance Criteria

```powershell
powershell -Command "& 'D:\Claude for SAP\vsp-custom\build\vsp.exe' lint --file src/zsah1_workdays.prog.abap; exit $LASTEXITCODE"
```

(vsp lint는 Error 심각도만 exit≠0 — Warning은 통과한다. 이 게이트는 스타일/보안
Error만 잡고 구조적 문법 오류(ENDIF 누락 등)는 못 잡는다 — VERIFY-PATTERNS.md 실측.
그러므로 CHECKLIST.md로 구조를 셀프 점검하라.)

## Verification procedure

1. AC 명령 실행 — exit 0 확인.
2. `domain/abap/CHECKLIST.md` 항목 점검 (특히 문장 종결·블록 짝 맞춤 — lint가 못 잡는 것).
3. `phases/1-workdays-util/index.json`의 step 0 갱신:
   - 통과 → `"status": "completed"` + `"summary"` + `"contract"` (다음 스텝을 위한
     파일 경로·시그니처·스텁 위치 1-3줄)
   - 3회 수정에도 실패 → `"status": "error"` + `"error_message"`
   - 사용자 조치 필요 → `"status": "blocked"` + `"blocked_reason"`, 즉시 중단

## Forbidden

- SAP 연결 금지 — `scripts/vsp-env.ps1` dot-source, `vsp deploy/copy/execute/system/
  atc/test/health` 전부 금지. 이유: 이 phase는 offline 단계(DESIGN §7)이고 연결
  자격증명이 이 스텝에 제공되지 않는다.
- 테스트 메서드를 무의미 단언(`assert_true( abap_true )` 등)으로 채우기 금지.
  이유: step 1의 구현 검증이 무력화된다.
- 위 5개 기대값 변경 금지. 이유: 달력 검증된 정답 — 바꾸면 시험지가 오염된다.
- `calc` 본체 구현 금지 — 스텁(`rv_days = -1.`) 유지. 이유: 테스트-먼저 경계가 이
  phase의 검증 대상이다.
- `src/`와 `phases/1-workdays-util/index.json` 밖 파일 생성·수정 금지. 이유: 계약 범위 밖.
- Do not break existing tests.
