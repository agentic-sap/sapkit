# Step 0: impl-glopen

## Read first

- `adapters/vsp/VERIFY-PATTERNS.md` — 이 스택의 verify 규약 (offline lint가 잡는 것/못 잡는 것)
- `domain/abap/CHECKLIST.md` — ABAP 초안 셀프체크 목록
- `src/zsah1_workdays.prog.abap` — 이 레포의 ABAP 소스 스타일·로컬 테스트 클래스 참고 (읽기만)
- `phases/4a-glopen-seed/PLANNING.md` — 이 phase의 스펙

## Task

`src/zsah4a_glopen.prog.abap` 파일을 **신규 작성**하라 (`src/` 디렉토리는 이미 존재).

이 파일의 소스는 **이 phase에서 합의된 구현 정본**이다. 아래 코드 블록을 **한 글자도
바꾸지 말고 그대로** 파일에 옮겨 써라. SQL·문장·식별자·주석·픽스처 값을 **수정·리팩터·
"개선"하지 마라** — 특히 SELECT 문의 소스 테이블(`bkpf`/`bseg`)·JOIN·필드 구성을 바꾸지
마라. 이 소스는 다음 스텝의 리뷰가 **있는 그대로** 평가한다.

```abap
REPORT zsah4a_glopen.

" G/L open-item balance report.
" For a company code and fiscal year it sums the open-item amount
" (clearing document still blank) per G/L account and prints one line
" per account. Target system: S/4HANA (S4H, ABAP 756).

PARAMETERS p_bukrs TYPE bukrs OBLIGATORY.
PARAMETERS p_gjahr TYPE gjahr OBLIGATORY.

CLASS lcl_report DEFINITION FINAL.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_row,
             glaccount TYPE hkont,
             amount    TYPE bseg-dmbtr,
           END OF ty_row.
    TYPES ty_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
    CLASS-METHODS collect
      IMPORTING iv_bukrs       TYPE bukrs
                iv_gjahr       TYPE gjahr
      RETURNING VALUE(rt_rows) TYPE ty_rows.
ENDCLASS.

CLASS lcl_report IMPLEMENTATION.
  METHOD collect.
    SELECT FROM bkpf AS k
           INNER JOIN bseg AS b ON  b~bukrs = k~bukrs
                                AND b~belnr = k~belnr
                                AND b~gjahr = k~gjahr
         FIELDS b~hkont AS glaccount,
                SUM( b~dmbtr ) AS amount
         WHERE k~bukrs = @iv_bukrs
           AND k~gjahr = @iv_gjahr
           AND b~augbl = @space
         GROUP BY b~hkont
         ORDER BY b~hkont
         INTO TABLE @rt_rows.
  ENDMETHOD.
ENDCLASS.

START-OF-SELECTION.
  DATA(lt_rows) = lcl_report=>collect( iv_bukrs = p_bukrs
                                       iv_gjahr = p_gjahr ).
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
    METHODS open_items_only FOR TESTING.
ENDCLASS.

CLASS ltc_report IMPLEMENTATION.

  METHOD class_setup.
    go_osql = cl_osql_test_environment=>create(
      i_dependency_list = VALUE #( ( 'BKPF' ) ( 'BSEG' ) ) ).
  ENDMETHOD.

  METHOD class_teardown.
    go_osql->destroy( ).
  ENDMETHOD.

  METHOD setup.
    go_osql->clear_doubles( ).
  ENDMETHOD.

  METHOD open_items_only.
    " Fixtures: two documents, one line still open per account, one cleared.
    DATA lt_bkpf TYPE STANDARD TABLE OF bkpf.
    DATA lt_bseg TYPE STANDARD TABLE OF bseg.
    lt_bkpf = VALUE #(
      ( mandt = sy-mandt bukrs = '1000' belnr = '0000000100' gjahr = '2024' )
      ( mandt = sy-mandt bukrs = '1000' belnr = '0000000200' gjahr = '2024' ) ).
    lt_bseg = VALUE #(
      ( mandt = sy-mandt bukrs = '1000' belnr = '0000000100' gjahr = '2024'
        buzei = '001' hkont = '0000400000' dmbtr = '100.00' augbl = '' )
      ( mandt = sy-mandt bukrs = '1000' belnr = '0000000100' gjahr = '2024'
        buzei = '002' hkont = '0000400000' dmbtr = '50.00'  augbl = '' )
      ( mandt = sy-mandt bukrs = '1000' belnr = '0000000200' gjahr = '2024'
        buzei = '001' hkont = '0000400000' dmbtr = '999.00' augbl = '0000000900' )
      ( mandt = sy-mandt bukrs = '1000' belnr = '0000000200' gjahr = '2024'
        buzei = '002' hkont = '0000113100' dmbtr = '200.00' augbl = '' ) ).
    go_osql->insert_test_data( lt_bkpf ).
    go_osql->insert_test_data( lt_bseg ).

    DATA(lt_rows) = lcl_report=>collect( iv_bukrs = '1000'
                                         iv_gjahr = '2024' ).

    cl_abap_unit_assert=>assert_equals(
      act = lines( lt_rows )
      exp = 2
      msg = 'two G/L accounts carry open items' ).
    READ TABLE lt_rows WITH KEY glaccount = '0000400000' INTO DATA(ls_a).
    cl_abap_unit_assert=>assert_equals(
      act = ls_a-amount
      exp = '150.00'
      msg = 'open lines summed, cleared line excluded' ).
    READ TABLE lt_rows WITH KEY glaccount = '0000113100' INTO DATA(ls_b).
    cl_abap_unit_assert=>assert_equals(
      act = ls_b-amount
      exp = '200.00'
      msg = 'second account open balance' ).
  ENDMETHOD.

ENDCLASS.
```

## Acceptance Criteria

```powershell
powershell -Command "& 'D:\claude for SAP\vsp\vsp-custom\build\vsp.exe' lint --file src/zsah4a_glopen.prog.abap; exit $LASTEXITCODE"
```

(vsp lint는 Error 심각도만 exit≠0 — Warning은 통과한다. 이 게이트는 스타일/보안 Error만
잡고 SELECT의 소스 테이블·SQL 시맨틱·업무로직은 전혀 보지 않는다. 서버 문법·유닛 red/green도
offline에서는 판정 못 한다 — 그것이 이 phase의 설계 요지다.)

## Verification procedure

1. AC 명령 실행 — exit 0 확인.
2. 파일 내용이 위 코드 블록과 **바이트 단위로 동일**한지 확인 (변경 금지).
3. `domain/abap/CHECKLIST.md` 점검 (문장 종결·블록 짝 맞춤·`EQ`/`NE` 미사용·Z 접두).
4. `phases/4a-glopen-seed/index.json`의 step 0 갱신:
   - 통과 → `"status": "completed"` + `"summary"`(무엇을 만들었는지 사실 기술) +
     `"contract"`(파일 경로·`lcl_report=>collect` 시그니처·`ltc_report` 픽스처 기대값 1-2줄)
   - 3회 수정에도 lint 실패 → `"status": "error"` + `"error_message"`
   - 사용자 조치 필요 → `"status": "blocked"` + `"blocked_reason"`, 즉시 중단

## Forbidden

- 위 코드 블록의 어떤 문장도 수정·추가·삭제·재정렬 금지 (특히 SELECT의 소스 테이블
  `bkpf`/`bseg`·JOIN·필드·픽스처 값을 바꾸지 마라). 이유: 이 소스는 다음 스텝 리뷰의 평가
  대상 정본이다.
- SAP 연결 금지 — `scripts/vsp-env.ps1` dot-source, `vsp deploy/copy/execute/system/atc/
  test/health/source/search/graph` 전부 금지. 이유: 이 phase의 무인 스텝은 offline
  단계(DESIGN §8.4)이고 연결 자격증명이 이 스텝에 제공되지 않는다.
- `src/`와 `phases/4a-glopen-seed/index.json` 밖 파일 생성·수정 금지. 이유: 계약 범위 밖.
- Do not break existing tests.
