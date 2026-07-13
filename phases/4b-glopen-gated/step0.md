# Step 0: impl-glopen-correct

## Read first

- `adapters/vsp/VERIFY-PATTERNS.md` — 이 스택의 verify 규약 (offline lint가 잡는 것/못 잡는 것)
- `domain/abap/CHECKLIST.md` — ABAP 초안 셀프체크 목록
- `src/zsah3_carrflt.prog.abap` — 이 레포의 `cl_osql_test_environment` 로컬 테스트 클래스 패턴 참고 (읽기만)
- `phases/4b-glopen-gated/PLANNING.md` — 이 phase의 스펙과 테스트 전략

## Task

`src/zsah4_glopen.prog.abap` 파일을 **신규 작성**하라. 이 phase는 "S/4HANA에서 G/L 미결항목을
ACDOCA(주도 원장 테이블)에서, 리딩 원장 0L로 한정해 계정별 집계"라는 스펙을 **올바르게**
충족하는 리포트 + 결정론적 유닛 테스트를 만든다.

아래 코드 블록을 **그대로** 파일에 옮겨 써라 (SQL·테스트·식별자·주석·픽스처 값 변경 금지 —
이 소스는 정상 경로 정본이며 다음 스텝 리뷰가 있는 그대로 평가하고, 에스코트 단계에서 실제
배포·활성화·유닛 실행된다):

```abap
REPORT zsah4_glopen.

" G/L open-item balance report (S/4HANA).
" For a company code, fiscal year and ledger it sums the open-item amount
" (clearing document still blank) per G/L account and prints one line per
" account. Amounts come from ACDOCA (Universal Journal leading table);
" the ledger filter prevents double counting across parallel ledgers.

PARAMETERS p_bukrs TYPE bukrs OBLIGATORY.
PARAMETERS p_gjahr TYPE gjahr OBLIGATORY.
PARAMETERS p_rldnr TYPE acdoca-rldnr DEFAULT '0L'.

CLASS lcl_report DEFINITION FINAL.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_row,
             glaccount TYPE racct,
             amount    TYPE acdoca-hsl,
           END OF ty_row.
    TYPES ty_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
    CLASS-METHODS collect
      IMPORTING iv_bukrs       TYPE bukrs
                iv_gjahr       TYPE gjahr
                iv_rldnr       TYPE acdoca-rldnr
      RETURNING VALUE(rt_rows) TYPE ty_rows.
ENDCLASS.

CLASS lcl_report IMPLEMENTATION.
  METHOD collect.
    SELECT FROM acdoca
         FIELDS racct AS glaccount,
                SUM( hsl ) AS amount
         WHERE rbukrs = @iv_bukrs
           AND gjahr  = @iv_gjahr
           AND rldnr  = @iv_rldnr
           AND augbl  = @space
         GROUP BY racct
         ORDER BY racct
         INTO TABLE @rt_rows.
  ENDMETHOD.
ENDCLASS.

START-OF-SELECTION.
  DATA(lt_rows) = lcl_report=>collect( iv_bukrs = p_bukrs
                                       iv_gjahr = p_gjahr
                                       iv_rldnr = p_rldnr ).
  LOOP AT lt_rows INTO DATA(ls_row).
    WRITE: / ls_row-glaccount, ls_row-amount.
  ENDLOOP.

CLASS ltc_report DEFINITION FINAL FOR TESTING
  RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    CLASS-DATA go_osql TYPE REF TO if_osql_test_environment.
    CLASS-METHODS class_setup.
    CLASS-METHODS class_teardown.
    METHODS setup.
    METHODS open_and_leading_ledger_only FOR TESTING.
ENDCLASS.

CLASS ltc_report IMPLEMENTATION.

  METHOD class_setup.
    go_osql = cl_osql_test_environment=>create(
      i_dependency_list = VALUE #( ( 'ACDOCA' ) ) ).
  ENDMETHOD.

  METHOD class_teardown.
    go_osql->destroy( ).
  ENDMETHOD.

  METHOD setup.
    go_osql->clear_doubles( ).
  ENDMETHOD.

  METHOD open_and_leading_ledger_only.
    " Fixtures mix open/cleared lines and leading/extension ledgers.
    " Only open lines (augbl blank) on the leading ledger 0L must be summed.
    DATA lt_acdoca TYPE STANDARD TABLE OF acdoca.
    lt_acdoca = VALUE #(
      rclnt = sy-mandt rbukrs = '1000' gjahr = '2024'
      ( rldnr = '0L' racct = '0000400000' hsl = '100.00' augbl = '' )
      ( rldnr = '0L' racct = '0000400000' hsl = '50.00'  augbl = '' )
      ( rldnr = '0L' racct = '0000400000' hsl = '999.00' augbl = '0000000900' )
      ( rldnr = '2L' racct = '0000400000' hsl = '777.00' augbl = '' )
      ( rldnr = '0L' racct = '0000113100' hsl = '200.00' augbl = '' ) ).
    go_osql->insert_test_data( lt_acdoca ).

    DATA(lt_rows) = lcl_report=>collect( iv_bukrs = '1000'
                                         iv_gjahr = '2024'
                                         iv_rldnr = '0L' ).

    cl_abap_unit_assert=>assert_equals(
      act = lines( lt_rows )
      exp = 2
      msg = 'only leading-ledger G/L accounts with open items appear' ).
    READ TABLE lt_rows WITH KEY glaccount = '0000400000' INTO DATA(ls_a).
    cl_abap_unit_assert=>assert_equals(
      act = ls_a-amount
      exp = '150.00'
      msg = 'open 0L lines summed; cleared and 2L lines excluded' ).
    READ TABLE lt_rows WITH KEY glaccount = '0000113100' INTO DATA(ls_b).
    cl_abap_unit_assert=>assert_equals(
      act = ls_b-amount
      exp = '200.00'
      msg = 'second account open 0L balance' ).
  ENDMETHOD.

ENDCLASS.
```

## Acceptance Criteria

```powershell
powershell -Command "& 'D:\claude for SAP\vsp\vsp-custom\build\vsp.exe' lint --file src/zsah4_glopen.prog.abap; exit $LASTEXITCODE"
```

(vsp lint는 스타일 Error만 잡고 SQL/osql 유효성·ACDOCA 필드 철자는 못 본다 — 서버 문법·유닛
red/green은 에스코트 단계의 connected 체인에서 판정한다. PLANNING.md §6 참조.)

## Verification procedure

1. AC 명령 실행 — exit 0 확인.
2. 파일 내용이 위 코드 블록과 **바이트 단위로 동일**한지 확인.
3. `domain/abap/CHECKLIST.md` 점검 (문장 종결·블록 짝 맞춤·`EQ`/`NE` 미사용·Z 접두).
4. `phases/4b-glopen-gated/index.json`의 step 0 갱신:
   - 통과 → `"status": "completed"` + `"summary"` + `"contract"`(`lcl_report=>collect`
     시그니처 + `ltc_report` 픽스처 기대값 "0L 미결 400000=150·113100=200, 2행(반제·2L 제외)"
     1-2줄)
   - 3회 수정에도 lint 실패 → `"status": "error"` + `"error_message"`

## Forbidden

- 위 코드 블록의 SQL(ACDOCA 단일 SELECT·`rldnr`·`augbl` 필터)·테스트 픽스처·기대값을 변경
  금지. 이유: 정상 경로 정본이며 리뷰·에스코트 유닛 테스트의 기준이다.
- SAP 연결 금지 — `scripts/vsp-env.ps1` dot-source, `vsp deploy/copy/execute/system/atc/
  test/health/source/search/graph` 전부 금지. 이유: 무인 스텝은 offline 단계(DESIGN §8.4).
  deploy·유닛 실행은 에스코트 단계에서 사람이 수행한다.
- `src/`와 `phases/4b-glopen-gated/index.json` 밖 파일 생성·수정 금지.
- Do not break existing tests.
