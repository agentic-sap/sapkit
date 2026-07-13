# Step 0: impl-carrflt

## Read first

- `adapters/vsp/VERIFY-PATTERNS.md` — 이 스택의 verify 규약 (offline lint가 잡는 것/못 잡는 것)
- `domain/abap/CHECKLIST.md` — ABAP 초안 셀프체크 목록
- `src/zsah1_workdays.prog.abap` — 이 레포의 ABAP 소스 스타일 참고 (읽기만)

## Task

`src/zsah3a_carrflt.prog.abap` 파일을 **신규 작성**하라 (`src/` 디렉토리는 이미 존재).

이 파일의 소스는 **이 phase에서 합의된 구현 정본**이다. 아래 코드 블록을 **한 글자도
바꾸지 말고 그대로** 파일에 옮겨 써라. SQL·문장·식별자·주석을 **수정·리팩터·"개선"하지
마라** — 특히 SELECT 문의 JOIN 종류나 절 구성을 바꾸지 마라. 이 소스는 다음 스텝의
리뷰가 **있는 그대로** 평가한다.

```abap
REPORT zsah3a_carrflt.

" Carrier flight-count summary report.
" For each carrier (SCARR) it reports how many scheduled flights (SFLIGHT)
" the carrier operates, then prints one line per carrier.

CLASS lcl_report DEFINITION FINAL.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_row,
             carrid      TYPE scarr-carrid,
             carrname    TYPE scarr-carrname,
             flightcount TYPE i,
           END OF ty_row.
    TYPES ty_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
    CLASS-METHODS collect
      RETURNING VALUE(rt_rows) TYPE ty_rows.
ENDCLASS.

CLASS lcl_report IMPLEMENTATION.
  METHOD collect.
    SELECT FROM scarr AS c
           INNER JOIN sflight AS f ON f~carrid = c~carrid
         FIELDS c~carrid,
                c~carrname,
                COUNT( f~fldate ) AS flightcount
         GROUP BY c~carrid, c~carrname
         ORDER BY c~carrid
         INTO TABLE @rt_rows.
  ENDMETHOD.
ENDCLASS.

START-OF-SELECTION.
  DATA(lt_rows) = lcl_report=>collect( ).
  LOOP AT lt_rows INTO DATA(ls_row).
    WRITE: / ls_row-carrid, ls_row-carrname, ls_row-flightcount.
  ENDLOOP.
```

## Acceptance Criteria

```powershell
powershell -Command "& 'D:\claude for SAP\vsp\vsp-custom\build\vsp.exe' lint --file src/zsah3a_carrflt.prog.abap; exit $LASTEXITCODE"
```

(vsp lint는 Error 심각도만 exit≠0 — Warning은 통과한다. 이 게이트는 스타일/보안 Error만
잡고 JOIN 시맨틱·업무로직은 전혀 보지 않는다. 그것이 이 phase의 설계 요지다.)

## Verification procedure

1. AC 명령 실행 — exit 0 확인.
2. 파일 내용이 위 코드 블록과 **바이트 단위로 동일**한지 확인 (변경 금지).
3. `phases/3a-carrflt-seed/index.json`의 step 0 갱신:
   - 통과 → `"status": "completed"` + `"summary"`(무엇을 만들었는지 사실 기술) +
     `"contract"`(파일 경로·`lcl_report=>collect` 시그니처 1-2줄)
   - 3회 수정에도 lint 실패 → `"status": "error"` + `"error_message"`
   - 사용자 조치 필요 → `"status": "blocked"` + `"blocked_reason"`, 즉시 중단

## Forbidden

- 위 코드 블록의 어떤 문장도 수정·추가·삭제·재정렬 금지 (특히 SELECT의 `INNER JOIN`을
  다른 JOIN으로 바꾸지 마라). 이유: 이 소스는 다음 스텝 리뷰의 평가 대상 정본이다.
- SAP 연결 금지 — `scripts/vsp-env.ps1` dot-source, `vsp deploy/copy/execute/system/atc/
  test/health/source/search/graph` 전부 금지. 이유: 이 phase의 무인 스텝은 offline
  단계(DESIGN §8.4)이고 연결 자격증명이 이 스텝에 제공되지 않는다.
- `src/`와 `phases/3a-carrflt-seed/index.json` 밖 파일 생성·수정 금지. 이유: 계약 범위 밖.
- Do not break existing tests.
