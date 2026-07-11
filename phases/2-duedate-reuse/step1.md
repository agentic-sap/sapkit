# Step 1: implement-calc

## Read first

- `src/zcl_sah2_workdays.clas.abap` (step 0이 생성 — calc 시그니처와 스텁)
- `src/zsah2_duedate.prog.abap` (step 0이 생성 — 테스트 클래스 ltc_duedate의
  기대값 5개가 정답 기준)
- `src/zsah1_workdays.prog.abap` — **이식 원본**: `lcl_workdays=>calc`의 검증된
  구현(2024-01-01 월요일 기준 TYPE d 산술 + MOD 7 요일 판정)이 들어 있다.
  **읽기만 — 수정 금지**
- `adapters/vsp/VERIFY-PATTERNS.md`
- `domain/abap/CHECKLIST.md`

## Task

`src/zcl_sah2_workdays.clas.abap`의 `calc` 스텁(`rv_days = -1.`)을
`src/zsah1_workdays.prog.abap`의 `lcl_workdays=>calc` 구현을 **이식**해 교체하라.

- 이식이 원칙이다: 원본 로직은 Phase 1에서 desk-check와 서버 ABAP Unit 5 PASS로
  검증됐다(동작 동일 보장이 목적). 근거 주석(영어)도 함께 이식하라.
- 사양 (불변): iv_from > iv_to → rv_days = 0. 그 외에는 iv_from~iv_to 양끝 포함
  범위에서 토요일·일요일과 it_holidays에 포함된 날짜를 제외한 날 수.
- 테스트 클래스 `ltc_duedate`(zsah2_duedate 안)의 기대값 5개(5·4·4·1·0)가 정답
  기준이다.

소스 규칙: step 0과 동일 — `EQ`/`NE` 금지, 255자 이하, 한 줄 한 문장, 빈 문장 금지,
자격증명 하드코딩·루프 내 COMMIT 금지, 주석 영어.

## Acceptance Criteria

```powershell
powershell -Command "& 'D:\Claude for SAP\vsp-custom\build\vsp.exe' lint --file src/zcl_sah2_workdays.clas.abap; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; & 'D:\Claude for SAP\vsp-custom\build\vsp.exe' lint --file src/zsah2_duedate.prog.abap; exit $LASTEXITCODE"
```

## Verification procedure

1. AC 명령 실행 — exit 0 확인.
2. 이식한 구현을 테스트 5케이스 각각에 대해 손으로 추적(desk-check)해
   기대값(5·4·4·1·0)과 일치함을 확인하고, 원본과의 차이(있다면 이름 변경 수준인지)를
   `summary`에 1-2줄로 남겨라.
3. `domain/abap/CHECKLIST.md` 점검.
4. `phases/2-duedate-reuse/index.json`의 step 1 갱신:
   - 통과 → `"status": "completed"` + `"summary"` + `"contract"`
   - 3회 수정에도 실패 → `"status": "error"` + `"error_message"`
   - 테스트 자체의 결함을 발견 → 수정하지 말고 `"status": "blocked"` +
     `"blocked_reason"`에 구체 사유, 즉시 중단

## Forbidden

- `src/zsah2_duedate.prog.abap` 수정 금지 (테스트 클래스 포함). 이유: 시험지를
  바꾸면 검증이 무력화된다 — 결함 발견 시 blocked로 보고가 유일한 경로.
- `src/zsah1_workdays.prog.abap` 수정 금지. 이유: Phase 1 산출물 동결.
- `calc` 시그니처(파라미터·타입) 변경 금지. 이유: step 0 계약.
- SAP 연결 금지 (step 0과 동일 사유 — vsp-env dot-source·연결 명령 전부).
- `src/`와 `phases/2-duedate-reuse/index.json` 밖 파일 생성·수정 금지.
- Do not break existing tests.
