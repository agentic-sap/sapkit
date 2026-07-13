# Phase 4 파일럿 CONSULT 답사 — GL 미결항목 리포트 (IDEA-JNC, S4H/100)

> DESIGN.md §13 Phase 4 완료 기준 ①("팩이 계획 결정을 실제로 바꿨다는 증거")의 산출물.
> 이 답사는 팩 경유(`packs/modules/fi/CONSULTANT.md` → 지식 정본 → RULES.seed.md →
> 페르소나) + read-only SAP 실측을 거쳐 계획 결정을 도출한다. 전 명령 read-only,
> row-data(GetTableContents/GetSqlQuery 계열, `vsp query`) 미실행 — S-013 준수.

## 0. CONSULT 지식 로드 순서 (실사용 증거)

1. `packs/modules/fi/CONSULTANT.md` — 결정훅 3건(금액 소스 FI-002·전기 방식 FI-001·
   검증/대체 FI-003) + row-data 경계 숙지.
2. `interactive/core/knowledge/modules/FI/tables.md` — ACDOCA/BSEG/BSIS/BSAS 계열,
   "S4: data mostly in ACDOCA", "BSIS/BSAS: S/4HANA generated views from ACDOCA".
3. `interactive/core/knowledge/modules/FI/enhancements.md` §7 — "In S/4HANA, BSEG
   remains as a compatibility view but ACDOCA is the leading table."
4. `interactive/core/knowledge/modules/FI/tcodes.md` — FBL3N/FAGLL03H(S/4 신규) 등
   G/L 라인아이템 조회 계열 확인(선택화면 파라미터 설계 참고).
5. `packs/modules/fi/RULES.seed.md` — FI-001~005 전문.
6. `interactive/core/personas/sap-fi-consultant.md` — 이 페르소나 관점(S4/ECC 분기
   확인 의무, IMG/BAPI/테이블 우선순위)으로 판단.
7. `domain/abap/RULES.seed.md` S-009(릴리스)·S-010(ECC/S4 테이블 분기)·S-011(Cloud)·
   S-013(row-data 차단) + `.harness/RULES.md`(R-001~006).
8. 선례: `phases/3b-carrflt-gated/`(step0.md/step1.md/index.json — impl→review-gate
   스텝 구조, `cl_osql_test_environment` 단위테스트 패턴, 에스코트 런북 구성) +
   `phases/2-duedate-reuse/PLANNING.md`(답사→계획 변경 기록 선례 포맷).

## 1. 답사 로그 (전 명령 read-only, IDEA-JNC S4H/client 100/ABAP 756)

실행 방식: 매 호출 `scripts/vsp-env.ps1 -ProfileName IDEA-JNC` dot-source 후
`D:\claude for SAP\vsp\vsp-custom\build\vsp.exe` 직접 호출(레포 관례).

### 1-1. `vsp system info`
```
System: S4H  Client: 100  SAP: 756  ABAP: 756  Kernel: 75G  Database: HDB
ZADT_VSP: installed
```
EXIT=0. 기존 phase 실측과 일치(재확인, 로그 기점).

### 1-2. 이름 충돌 확인
- `vsp search "ZSAH4*" --max 50` → **`Found 0 objects`**, EXIT=0. `ZSAH4A_GLOPEN`/
  `ZSAH4_GLOPEN` 둘 다 **충돌 없음**.
- `vsp search "ZSAH*" --max 50` → 기존 7건 전부 이전 phase 산출물
  (`ZSAH0B_BROKEN/SMOKE/SMOKE2`, `ZSAH15_BROKEN`, `ZSAH1_WORKDAYS`, `ZSAH2_DUEDATE`,
  `ZSAH3_CARRFLT`) — `$TMP` 소속, EXIT=0. Phase 번호 4 계열은 시스템에 전무.
- `vsp search "ZR_FI_GL_OPEN" --max 10` → `Found 0 objects`, EXIT=0. HANDOFF.md 헤더에
  임시로 언급된 후보명(`ZR_FI_GL_OPEN`)도 충돌 없으나, 이번 작업 지시는 레포 명명
  관례(`ZSAH<phase>_<이름>`)를 따르므로 **`ZSAH4A_GLOPEN`/`ZSAH4_GLOPEN`을 채택**한다
  (§4 미해결 항목에 이 명명 불일치를 기록).

### 1-3. ACDOCA/BSEG 실재·패키지 확인
`vsp what-package ACDOCA BSEG BKPF T001`:
```
R3TR  BDOC T001                                     → CDB
R3TR  SCDT T001                                     → PP0A
R3TR  SOBJ BKPF                                     → FBAS
R3TR  SOBJ BSEG                                     → FBAS
R3TR  TABL BKPF                                     → FBAS
R3TR  TABL T001                                     → FBZCORE
R3TR  TABL ACDOCA                                   → FINS_ACDOC_DB
R3TR  TABL BSEG                                     → FBAS
```
EXIT=0. **ACDOCA·BSEG·BKPF·T001 전부 실재 확인**(TABL 항목으로 존재) — 씨앗 phase(4a)가
"활성화는 통과하고 의미만 틀린" 결함이 되려면 BSEG가 실제로 존재해 컴파일 가능해야 한다는
전제가 이걸로 충족된다.

### 1-4. 필드 구조 확인 시도 — `vsp source read TABL` 미지원 (기존 한계 재확인)
```
vsp source read TABL ACDOCA
Error: failed to get source: unsupported object type: TABL
  (supported: PROG, CLAS, INTF, FUNC, FUGR, INCL, DDLS, VIEW, BDEF, SRVD, SRVB, MSAG)
```
EXIT=1. Phase 2 recon(§8)에서 이미 확인된 한계와 동일 — vsp CLI로 DDIC TABL의 필드
목록을 직접 얻는 경로가 없다. **대체 경로**: DDLS(CDS 뷰)는 `source read` 지원 목록에
있으므로, ACDOCA 파생 CDS 표준 뷰를 읽어 구조를 간접 확인했다.

### 1-5. 대체 구조 확인 — `vsp source read DDLS I_JournalEntryItem`
표준 S/4 CDS 뷰(ACDOCA 파생 `I_GLAccountLineItemRawData` 위에 얹힌 공개 API,
`enhancements.md` §7에 언급된 `I_JournalEntryItem`) 전문을 읽었다(EXIT=0, 약 2700줄).
row 데이터 미포함 — DDL 정의(필드/연관/주석)만이다. 핵심 발견:

- `association [1..1] to I_AccountingDocument as _ClearingAccountingDocument on
  $projection.CompanyCode = ... and $projection.ClearingAccountingDocument = ...`
  → **반제(청산) 문서 필드가 ACDOCA 계열 데이터에 구조적으로 존재**(CDS 별칭
  `ClearingAccountingDocument` — classic 명명 `AUGBL`에 대응하는 개념).
- `IsOpenItemManaged`, `ClearingDate`, `ClearingDocFiscalYear` 필드 존재 — 미결항목
  관리/반제 시맨틱이 Universal Journal 계열에도 그대로 이어짐을 구조적으로 확인.
- 통화 금액 필드가 `cast( AmountInCompanyCodeCurrency as fis_dr_hsl/fis_cr_hsl ... )`,
  `cast( AmountInTransactionCurrency as fis_dr_wsl/fis_cr_wsl ... )`로 캐스팅됨 —
  `fis_dr_hsl`/`fis_cr_hsl`(HSL=회사코드통화 금액)·`fis_dr_wsl`/`fis_cr_wsl`
  (WSL=거래통화 금액)는 BSEG/ACDOCA 공통 classic 필드 접미사와 일치하는 데이터엘리먼트
  이름 — ACDOCA가 BSEG와 동일 계열의 통화 금액 필드 명명을 유지한다는 간접 증거.

**한계 (정직 표기)**: 이 방법으로도 ACDOCA의 **원시 컬럼명 리터럴**(`RBUKRS`/`BUKRS`,
`AUGBL`, `RYEAR`/`GJAHR` 등 정확한 철자)까지는 확인하지 못했다 — CDS 계층은 필드를
논리명으로 재명명하기 때문. 추가로 `vsp grep "AUGBL" --package FBAS`·
`vsp grep "RBUKRS"/"AUGBL" --package FINS_ACDOC_DB`(표준 코드에서 원시 필드명 사용례
확인 시도)를 실행했으나, FBAS/FINS_ACDOC_DB는 초대형 표준 패키지라 응답이 수 분 내
반환되지 않아 **타임아웃 전 취소**했다(read-only 명령이었음 — 취소는 원가 절감
목적, 안전 사유 아님). → **원시 컬럼명 확인은 다음 create-program/구현 단계로
이월**한다(§4 미해결 항목).

### 1-6. `$TMP` 패키지 상태
`vsp health --package '$TMP' --fast`:
```
Summary: WARN — ATC findings detected
tests:      SKIPPED {"reason":"fast mode"}
atc:        FINDINGS {"errors":3,"findings":465,"infos":376,"warnings":86}
boundaries: SKIPPED {"reason":"fast mode"}
staleness:  ACTIVE {"age_days":1,"checked":0,"last_changed":"2026-07-12T00:00:00Z"}
```
EXIT=0. WARN은 `$TMP`의 기존(비ZSAH*) 객체 지적사항(Phase 2/3b 선례와 동일 패턴) —
신규 결함 아님, 정상.

### 1-7. 재사용 후보 — `ZSAH3_CARRFLT` 소스 (단위테스트 패턴 확인, 레포 로컬 read)
`src/zsah3_carrflt.prog.abap` 정독(레포 파일, SAP 미접속) — 구조:
- `lcl_report`(PUBLIC, `collect( ) RETURNING rt_rows`) / `START-OF-SELECTION`(WRITE) 분리.
- `ltc_report`: `cl_osql_test_environment=>create( i_dependency_list = VALUE #(
  ( 'SCARR' ) ( 'SFLIGHT' ) ) )` — class_setup/class_teardown/setup(clear_doubles)
  + `insert_test_data`로 결정론적 픽스처 주입, 실 데이터 미의존.
- 이 패턴은 **테이블명만 바꾸면 BKPF/BSEG/ACDOCA에도 그대로 적용 가능**
  (`cl_osql_test_environment`는 임의 DB 테이블을 double로 대체하는 범용 프레임워크 —
  ACDOCA/BSEG처럼 필드 수가 많은 표준 테이블도 동일하게 동작). Phase 4 유닛테스트
  전략의 기반으로 채택.

## 2. CONSULT 결정 표 — 팩 적용 전/후 델타

| # | 결정 항목 | 팩 없이(기본/ECC 습관) | 팩 적용 후 | 근거 |
|---|---|---|---|---|
| ① | **금액 소스 테이블** | `BKPF INNER JOIN BSEG`에서 `dmbtr`/`wrbtr` 직접 SELECT (ECC 시절 관행 — S/4에서도 "일단 되니까" 그대로 씀) | **ACDOCA 단일 SELECT**로 금액(HSL/WSL 계열) 집계 — BSEG는 참조하지 않음 | FI-002(`RULES.seed.md`) + `tables.md` "S4: data mostly in ACDOCA" + `enhancements.md` §7 "ACDOCA is the leading table" + 시스템 실측(§1-3 양쪽 테이블 실재, §1-5 CDS로 ACDOCA 계열 통화금액 필드 구조 확인) |
| ② | **미결 판정 방식** | 임의 가정(예: 별도 상태 플래그나 "금액 절대값 필터" 같은 비표준 방식을 자체 고안할 위험) | **반제(청산) 문서 필드 공백 = 미결** — classic 명명 `AUGBL` 공백 판정을 ACDOCA에도 동일 개념으로 적용 | `tables.md`(BSIS/BSAS "G/L Open/Cleared Items") + 페르소나(sap-fi-consultant) FI 도메인 지식 + 시스템 실측(§1-5, CDS `_ClearingAccountingDocument`/`ClearingDate`/`IsOpenItemManaged` 필드 구조로 반제 시맨틱이 ACDOCA 계열에도 존재함을 확인) |
| ③ | **하드코딩 금지 (FI-004)** | 리포트에 회사코드·연도를 SELECT WHERE 조건에 리터럴(예 `bukrs = '1000'`)로 박아 넣기 쉬움(단발성 파일럿이라 "일단 하나만 되면 됨" 유혹) | 선택화면 `PARAMETERS`/`SELECT-OPTIONS`로 회사코드(BUKRS)·회계연도(GJAHR)를 받아 SELECT WHERE에 바인딩 | FI-004(`RULES.seed.md`) + 시스템 실측(§1-3, T001 실재 확인 — F4 검색도움말 대상 존재) |
| ④ | **row-data 경계** | 답사 단계에서 "실제로 미결항목이 몇 건인지 보자"며 `vsp query`/GetTableContents로 ACDOCA 라인아이템을 조회해볼 위험 | 이번 답사는 **존재확인(what-package)·구조확인(CDS source read)만** 수행, row-data 조회 0건 | S-013(`domain/abap/RULES.seed.md`) + CONSULTANT.md "row-data 경계" 결정훅 — 이번 세션 전 명령이 이 경계 내에서 실행됨(§1 로그 전건 read-only) |
| ⑤ | **검증 함정 (오프라인 게이트의 사각지대)** | "lint 통과 + 활성화 성공 = 코드가 옳다"고 오판할 위험(S-025 위반) | BSEG 오사용은 **문법적으로 완전히 유효한 ABAP**이라 오프라인 lint·활성화가 전부 통과한다 — 리뷰 게이트(사람/독립 재도출) 또는 커넥티드 실행(실 데이터 비교)에서만 드러남 | CONSULTANT.md "이 오용은 lint·활성화를 전부 통과하고 커넥티드 실행/리뷰에서만 드러난다" + S-025 + 3a/3b 선례(INNER vs LEFT JOIN 급 결함과 동일한 클래스의 함정 — 오프라인 게이트 무력, 리뷰가 유일한 방어선) |

**팩이 실제로 바꾼 것 (완료 기준 ① 핵심 문장)**: 팩 없이 접근했다면 ECC 프로젝트 경험이
있는 개발자/에이전트가 "GL 리포트 = BSEG"라는 반사적 습관으로 BKPF/BSEG 조인을 1차
초안으로 작성했을 것이다. FI-002 결정훅과 `tables.md`/`enhancements.md`의 명시적
"ACDOCA is the leading table" 문구를 CONSULT 단계에서 먼저 로드했기 때문에, 정상
경로(4b)의 설계는 **처음부터 ACDOCA 단일 SELECT로 확정**되었고, BSEG 경로는 오히려
"리뷰 게이트가 잡아야 할 결함"으로 **의도적으로 격리**(4a 씨앗 phase)하는 결정으로
이어졌다 — 이것이 3a/3b가 확립한 "씨앗-정상 쌍" 구조를 FI 도메인에 처음 적용한 사례다.

## 3. Phase 설계 제안 (4a 씨앗 + 4b 정상)

### 공통 스펙
- 파라미터: `PARAMETERS p_bukrs TYPE bukrs OBLIGATORY`, `p_gjahr TYPE gjahr OBLIGATORY`
  (FI-004 — 양쪽 phase 공통, 하드코딩 결함은 씨앗의 대상이 아니므로 4a/4b 동일하게
  정상 구현하여 **결함을 금액 소스 테이블 1개로 단일화**한다).
- 출력: `WRITE` 리스트, G/L 계정(HKONT/RACCT 계열)별 미결 잔액 합계 1행씩(ALV 미사용,
  3b 선례와 동일 — §1 N/A 예상).
- 미결 판정: 반제 문서 필드 공백(§2-② 결정) — 원시 필드명은 구현 스텝 착수 시
  1회 재확인 필요(§4 미해결 ①).

### 4a-glopen-seed (씨앗 — 리뷰 FAIL 기대)
- 객체: PROG **`ZSAH4A_GLOPEN`**, 파일 `src/zsah4a_glopen.prog.abap`.
- 결함: `lcl_report=>collect`가 **BKPF INNER JOIN BSEG**에서 금액을 SELECT(S/4 대상인데
  ECC 습관 — FI-002 위반). 다른 모든 요소(선택화면·미결 판정 필드·GROUP BY·구조)는
  정상으로 만들어 **결함을 금액 소스 테이블 선택 1건에 고정**한다(3a가 JOIN 종류
  1건에 결함을 고정했던 것과 동일 원칙).
- 유닛테스트: `cl_osql_test_environment`로 BKPF/BSEG double 주입(3b 패턴 재사용) —
  이 유닛테스트 자체는 BSEG 픽스처 기준으로 **green**이 나온다(구조는 유효하므로).
  이것이 정확히 CONSULT §2-⑤의 함정이다 — **오프라인 유닛테스트조차 이 결함을 못
  잡는다**(픽스처가 BSEG 스키마로 만들어졌기 때문에 "BSEG를 쓴 것 자체"는 테스트
  안에서 자기충족적으로 옳아 보인다). 결함을 잡는 것은 오직 **리뷰 게이트가
  "S/4 대상에 BSEG를 소스로 썼다"는 사실 자체를 FI-002 기준으로 판정**하는 것뿐 —
  이것이 이 phase가 진짜로 실증하려는 것(완료 기준 ②, "FI 도메인 씨앗 결함 리뷰
  차단").
- 리뷰 체크리스트 신규 항목 제안(3b step1.md §13 JOIN 카디널리티 패턴과 동일 위치):
  **"§16(신규) S/4 대상 금액 소스 테이블 선택 — `.sc4sap/config.json`(또는 phase
  스펙)의 `sapVersion=S4`인데 `collect`가 BSEG/BKPF에서 금액을 SELECT하면 MAJOR"**.
  리뷰어는 `phases/4a-glopen-seed/PLANNING.md`(이 recon의 §2-① 결정)를 정답지로
  삼아 소스의 SELECT 절을 손으로 추적한다(3b의 "독립 재도출" 원칙 그대로 적용).
- 기대 결과: 3a와 동일하게 리뷰 게이트 3회 시도 전부 FAIL → `escort-write` 미도달,
  `wip(4a-glopen-seed)` 커밋 후 error 종료, feat 브랜치에 잔존(main 미머지).

### 4b-glopen-gated (정상 — 리뷰 PASS 기대 + 에스코트 배포)
- 객체: PROG **`ZSAH4_GLOPEN`**, 파일 `src/zsah4_glopen.prog.abap`.
- 로직: `lcl_report=>collect`가 **ACDOCA 단일 SELECT**(§2-① 정상 결정) —
  `WHERE rbukrs = p_bukrs AND gjahr = p_gjahr AND <반제문서필드> = space`,
  `GROUP BY racct`(또는 확정된 원시 필드명), `SUM(<HSL 계열 필드>)`.
- 유닛테스트: `cl_osql_test_environment`(dependency: `ACDOCA` 1개)로 미결/반제 혼합
  픽스처 주입 — 미결 행만 집계에 남는지 단언(3b의 "ZZ=0건도 포함" 단언과 대칭되는
  "반제된 행은 제외" 단언).
- 리뷰 게이트: 정상 경로이므로 §16 신규 항목이 PASS(ACDOCA 사용 확인) + 기존 B1~B4
  항목 그대로 적용.
- 에스코트 런북: 3b PLANNING.md §6 패턴 그대로 재사용
  (deploy → drift(source read 대조) → ATC → unit test green) — `$TMP` 패키지,
  DEV tier(IDEA-JNC/IDES-DEV), R-003 준수.

### 엔진 스텝 배선 (3b index.json 패턴)
- 4a: `step0(impl-glopen-seed) → step1(review-gate)` — 무인, offline 스코핑
  (자격증명 미주입 셸에서 기동, SAFETY-PROFILES §④ 규율 그대로 적용).
- 4b: `step0(impl-glopen-correct) → step1(review-gate)` — 무인, offline 스코핑.
  완료(PASS) 후 **사람이 에스코트 런북 수행**(현재 무인 전환 가능 상태이나
  HANDOFF §7이 명시한 대로 "RV4 갭 감수 여부는 사용자 판단" — 본 답사는 그 판단에
  개입하지 않고 3b와 동일하게 에스코트 기본값 유지를 제안).

## 4. 미해결 / 사용자 판단 필요 항목

1. **ACDOCA 원시 컬럼명 확정 필요**: 이번 답사는 `vsp source read TABL` 미지원 +
   대형 표준 패키지(FBAS/FINS_ACDOC_DB) grep 타임아웃으로 **CDS 계층 간접 증거**
   (§1-5)까지만 확보했다. 구현(create-program) 착수 전에 회사코드(`RBUKRS`
   추정)·회계연도(`GJAHR` 추정)·반제문서(`AUGBL` 추정)·금액(HSL 계열) 필드의
   **정확한 철자**를 1회 확인해야 한다(예: 더 작은 패키지 범위로 grep 재시도,
   또는 사용자가 SE11에서 직접 확인).
2. **명명 불일치**: HANDOFF.md 헤더는 파일럿 후보명으로 `ZR_FI_GL_OPEN`을
   언급했으나, 이번 작업 지시는 레포 관례(`ZSAH<phase>_<이름>`)에 따라
   `ZSAH4A_GLOPEN`/`ZSAH4_GLOPEN`을 지정했다. 시스템 실측상 **양쪽 다 충돌 없음**
   (§1-2) — 최종 채택명은 사용자 확인 필요(본 문서는 지시받은 `ZSAH4*` 계열로
   설계했다).
3. **미결 판정의 표준 리포트 정합성**: FBL3N/FAGLL03H(S4 신규) 등 표준 T-code가
   내부적으로 어떤 정확한 조건식(AUGBL 공백 외 특수 케이스 — 부분반제/거래통화별
   반제 등)을 쓰는지는 tcodes.md 수준 지식 이상으로 파고들지 않았다(파일럿 스코프
   유지, 페르소나 판단으로 "AUGBL 공백"을 1차 근사로 채택) — 실사용 리포트라면
   FI 컨설턴트 확인이 추가로 필요할 수 있음.
4. **4a 리뷰 체크리스트 §16 신규 항목의 정식 문서화 위치**: 이번 답사는 제안만
   했다 — 실제 `phases/4a-glopen-seed/step1.md` 작성 시 3b step1.md의 §13처럼
   정식 절로 승격해야 한다(harness-plan 스킵 단계에서 처리).
5. **에스코트 여부**: HANDOFF §7 "무인 전환 3조건 충족, 실행 여부는 사용자 판단"
   상태가 이 파일럿에도 적용되는지(4b도 에스코트로 갈지, 무인 전환을 이번에
   실행할지)는 본 답사 범위 밖 — 계획(harness-plan) 단계에서 사용자 확인 필요.

## 5. 후속 확정 (메인 세션, 2026-07-13 — §4-1 해소)

`vsp source read DDLS I_GLAccountLineItemRawData`(read-only, IDEA-JNC)가 **ACDOCA
원시 컬럼명을 리터럴로 노출** — `as select from P_ACDOCA`(ACDOCA 투영) DDL의
필드 매핑으로 §4-1의 추정 전부 확정:

| 원시 컬럼 | CDS 논리명 | 용도 |
|---|---|---|
| `rbukrs` (key) | CompanyCode | 회사코드 — 선택화면 p_bukrs 바인딩 |
| `gjahr` (key) | FiscalYear | 회계연도 — p_gjahr 바인딩 |
| `belnr`/`docln` (key) | AccountingDocument/LedgerGLLineItem | 전표/라인 |
| `rldnr` (key) | (원장) | **§5-1 신규 발견 — 아래** |
| `racct` | GLAccount | G/L 계정 (GROUP BY 대상) |
| `hsl` | AmountInCompanyCodeCurrency | 회사코드통화 금액 (SUM 대상) |
| `wsl` | AmountInTransactionCurrency | 거래통화 금액 |
| `augbl` | ClearingAccountingDocument | 반제 문서 — 공백=미결 (§2-② 판정) |
| `augdt` | ClearingDate | 반제일 |
| `xopvw` | IsOpenItemManaged | 미결항목 관리 플래그 |

**§5-1 신규 발견 — 원장(RLDNR) 차원**: `rldnr`은 ACDOCA **키 필드**다(뷰 헤더
tableElement: rldnr·rbukrs·gjahr·belnr·docln). 원장 필터 없이 SUM하면 복수 원장
(리딩 0L + 확장 원장)의 금액이 **중복 합산**된다 — 답사 §2 결정 표가 놓친 FI 고유
함정. 계획 반영: 선택화면 `p_rldnr TYPE acdoca-rldnr DEFAULT '0L'`(FI-004 하드코딩
금지 준수 — 파라미터화 + 리딩 원장 기본값). 4a 씨앗의 결함은 여전히 "금액 소스
테이블 1건"으로 고정하고, 원장 필터는 4a/4b 양쪽 공통 정상 구현(BSEG 경로에는
원장 차원이 없으므로 4a에서는 자연히 미적용 — 리뷰어가 이 차이도 §16 판정 근거로
쓸 수 있음).
