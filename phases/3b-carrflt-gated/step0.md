# Step 0: impl-carrflt-correct

## Read first

- `adapters/vsp/VERIFY-PATTERNS.md` — 이 스택의 verify 규약 (offline lint가 잡는 것/못 잡는 것)
- `domain/abap/CHECKLIST.md` — ABAP 초안 셀프체크 목록
- `src/zsah1_workdays.prog.abap` — 이 레포의 ABAP 소스 스타일·로컬 테스트 클래스 참고 (읽기만)
- `phases/3b-carrflt-gated/PLANNING.md` — 이 phase의 스펙과 테스트 전략

## Task

`src/zsah3_carrflt.prog.abap` 파일을 **신규 작성**하라. 이 phase는 "운항편이 없는 항공사도
결과에 포함(운항편 수 0)"이라는 스펙을 **올바르게** 충족하는 리포트 + 결정론적 유닛
테스트를 만든다.

아래 코드 블록을 **그대로** 파일에 옮겨 써라 (SQL·테스트·식별자·주석 변경 금지 — 이
소스는 정상 경로 정본이며 다음 스텝 리뷰가 있는 그대로 평가한다):

```abap
REPORT zsah3_carrflt.

" Carrier flight-count summary report.
" For each carrier (SCARR) it reports how many scheduled flights (SFLIGHT)
" the carrier operates. A carrier that operates no flights must still appear
" in the result, with a flight count of zero (LEFT OUTER semantics).

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
           LEFT OUTER JOIN sflight AS f ON f~carrid = c~carrid
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

CLASS ltc_report DEFINITION FINAL FOR TESTING
  RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    CLASS-DATA go_osql TYPE REF TO if_osql_test_environment.
    CLASS-METHODS class_setup.
    CLASS-METHODS class_teardown.
    METHODS setup.
    METHODS zero_flight_carrier_present FOR TESTING.
ENDCLASS.

CLASS ltc_report IMPLEMENTATION.

  METHOD class_setup.
    go_osql = cl_osql_test_environment=>create(
      i_dependency_list = VALUE #( ( 'SCARR' ) ( 'SFLIGHT' ) ) ).
  ENDMETHOD.

  METHOD class_teardown.
    go_osql->destroy( ).
  ENDMETHOD.

  METHOD setup.
    go_osql->clear_doubles( ).
  ENDMETHOD.

  METHOD zero_flight_carrier_present.
    " Fixtures: three carriers, one of which (ZZ) operates no flights.
    DATA lt_scarr   TYPE STANDARD TABLE OF scarr.
    DATA lt_sflight TYPE STANDARD TABLE OF sflight.
    lt_scarr = VALUE #(
      ( mandt = sy-mandt carrid = 'AA' carrname = 'Test Air A' )
      ( mandt = sy-mandt carrid = 'LH' carrname = 'Test Air L' )
      ( mandt = sy-mandt carrid = 'ZZ' carrname = 'No Flights' ) ).
    lt_sflight = VALUE #(
      ( mandt = sy-mandt carrid = 'AA' connid = '0017' fldate = '20240101' )
      ( mandt = sy-mandt carrid = 'AA' connid = '0017' fldate = '20240102' )
      ( mandt = sy-mandt carrid = 'LH' connid = '0400' fldate = '20240101' ) ).
    go_osql->insert_test_data( lt_scarr ).
    go_osql->insert_test_data( lt_sflight ).

    DATA(lt_rows) = lcl_report=>collect( ).

    cl_abap_unit_assert=>assert_equals(
      act = lines( lt_rows )
      exp = 3
      msg = 'all three carriers must appear, incl. the zero-flight carrier' ).
    READ TABLE lt_rows WITH KEY carrid = 'ZZ' INTO DATA(ls_zz).
    cl_abap_unit_assert=>assert_subrc(
      msg = 'zero-flight carrier ZZ must be present (LEFT OUTER JOIN)' ).
    cl_abap_unit_assert=>assert_equals(
      act = ls_zz-flightcount
      exp = 0
      msg = 'zero-flight carrier must show flight count 0' ).
  ENDMETHOD.

ENDCLASS.
```

## Acceptance Criteria

```powershell
powershell -Command "& 'D:\claude for SAP\vsp\vsp-custom\build\vsp.exe' lint --file src/zsah3_carrflt.prog.abap; exit $LASTEXITCODE"
```

(vsp lint는 스타일 Error만 잡고 SQL/osql 유효성은 못 본다 — 서버 문법·유닛 red/green은
에스코트 단계의 connected 체인에서 판정한다. PLANNING.md §에스코트 참조.)

## Verification procedure

1. AC 명령 실행 — exit 0 확인.
2. 파일 내용이 위 코드 블록과 **바이트 단위로 동일**한지 확인.
3. `domain/abap/CHECKLIST.md` 점검 (문장 종결·블록 짝 맞춤·`EQ`/`NE` 미사용·Z 접두).
4. `phases/3b-carrflt-gated/index.json`의 step 0 갱신:
   - 통과 → `"status": "completed"` + `"summary"` + `"contract"`(`lcl_report=>collect`
     시그니처 + `ltc_report` 픽스처 기대값 "AA=2·LH=1·ZZ=0, 3행" 1-2줄)
   - 3회 수정에도 lint 실패 → `"status": "error"` + `"error_message"`

## Forbidden

- 위 코드 블록의 SQL(`LEFT OUTER JOIN`)·테스트 픽스처·기대값을 변경 금지. 이유: 정상 경로
  정본이며 리뷰·에스코트 유닛 테스트의 기준이다.
- SAP 연결 금지 — `scripts/vsp-env.ps1` dot-source, `vsp deploy/copy/execute/system/atc/
  test/health/source/search/graph` 전부 금지. 이유: 무인 스텝은 offline 단계(DESIGN §8.4).
  deploy·유닛 실행은 에스코트 단계에서 사람이 수행한다.
- `src/`와 `phases/3b-carrflt-gated/index.json` 밖 파일 생성·수정 금지.
- Do not break existing tests.
