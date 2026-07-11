# Step 1: implement-calc

## Read first

- `src/zsah1_workdays.prog.abap` (step 0이 생성 — 테스트 클래스 ltc_workdays와
  lcl_workdays 시그니처·스텁이 들어 있다. 먼저 읽고 의도를 파악하라)
- `adapters/vsp/VERIFY-PATTERNS.md`
- `domain/abap/CHECKLIST.md`

## Task

`src/zsah1_workdays.prog.abap`의 `lcl_workdays=>calc` 스텁(`rv_days = -1.`)을 실제
구현으로 교체하라.

사양 (불변): iv_from > iv_to → rv_days = 0. 그 외에는 iv_from~iv_to 양끝 포함
범위에서 토요일·일요일과 it_holidays에 포함된 날짜를 제외한 날 수.

구현 재량: 일자 단위 루프면 충분하다 (성능 요구 없음). 요일 판정 방법은 재량이나
(TYPE d의 산술 특성 이용 등), **선택한 요일 매핑의 근거를 영어 주석으로 소스에
남겨라** — offline에서는 ABAP Unit을 실행할 수 없으므로(연결 필요) 이 주석과
desk-check가 이 스텝의 의미 검증이다.

테스트 클래스 `ltc_workdays`의 기대값 5개가 정답 기준이다 (2024-01-01 = 월요일).

소스 규칙: step 0과 동일 — `EQ`/`NE` 금지, 255자 이하, 한 줄 한 문장, 빈 문장 금지,
자격증명 하드코딩·루프 내 COMMIT 금지, 주석 영어.

## Acceptance Criteria

```powershell
powershell -Command "& 'D:\Claude for SAP\vsp-custom\build\vsp.exe' lint --file src/zsah1_workdays.prog.abap; exit $LASTEXITCODE"
```

## Verification procedure

1. AC 명령 실행 — exit 0 확인.
2. 구현을 테스트 5케이스 각각에 대해 손으로 추적(desk-check)해 기대값(5·4·4·1·0)과
   일치함을 확인하고, 그 근거를 `summary`에 1-2줄로 남겨라.
3. `domain/abap/CHECKLIST.md` 점검.
4. `phases/1-workdays-util/index.json`의 step 1 갱신:
   - 통과 → `"status": "completed"` + `"summary"` + `"contract"`
   - 3회 수정에도 실패 → `"status": "error"` + `"error_message"`
   - 테스트 자체의 결함을 발견 → 수정하지 말고 `"status": "blocked"` +
     `"blocked_reason"`에 구체 사유, 즉시 중단

## Forbidden

- `CLASS ltc_workdays`(테스트 클래스) 수정·삭제·약화 금지. 이유: 시험지를 바꾸면
  검증이 무력화된다 — 결함 발견 시 blocked로 보고가 유일한 경로.
- `calc` 시그니처(파라미터·타입) 변경 금지. 이유: step 0 계약.
- SAP 연결 금지 (step 0과 동일 사유 — vsp-env dot-source·연결 명령 전부).
- `src/`와 `phases/1-workdays-util/index.json` 밖 파일 생성·수정 금지.
- Do not break existing tests.
