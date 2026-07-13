# Step 1: review-gate — 4b-glopen-gated

## 너의 역할

너는 **리뷰어**다. 이 코드를 만든 impl 세션과는 **완전히 분리된 새 컨텍스트**에서 돈다.
문법 통과·lint 통과는 코드가 **컴파일·연결됨**만 증명하지, **업무로직이 옳음**을 증명하지
않는다 — 기계 verify를 전부 통과한 INNER vs LEFT JOIN 급 시맨틱 결함이 실제로 있었다
(트랙 B E2E 실증). 그 급을 **첫 vsp write 전에** 잡는 것이 이 스텝의 유일한 존재 이유다.

너는 **판정만 한다. 고치지 않는다.**

## 독립 재도출 원칙 (신뢰하지 말 것)

impl 세션이 index.json `summary`/`contract`에 남긴 **자기보고를 근거로 삼지 마라.**
아래 원천에서 **네가 직접 재도출**해 판정하라:

1. **main 대비 diff**:
   ```
   git diff --stat main -- src/
   git diff main -- src/
   ```
2. **`src/` 소스** — diff에 걸린 파일(`src/zsah4_glopen.prog.abap`)을 통째로 읽어라.
3. **(연결 시) vsp read 라이브 참조** — 이 스텝은 offline 스코핑으로 기동되어 **SAP
   자격증명이 없을 수 있다**. 연결 실패는 정상이며 **게이트는 SAP 연결에 의존하지 않는다** —
   로컬(diff+src)만으로 판정하라(연결 실패를 코드 결함으로 판정 금지 — R-001).

phase의 기대 동작 기준은 이 phase의 **스펙**(`phases/4b-glopen-gated/PLANNING.md`의 스펙
절 §1), `index.json`의 각 step `contract`, 그리고 **소스 내 `ltc_report` 테스트 클래스의
고정 기대값**(0L 미결 400000=150·113100=200, 총 2행 — 반제·2L 제외)이다 — 이것을 **정답지**로
삼아 `collect`의 SELECT가 그 결과 집합을 실제로 산출하는지 손으로 추적하라.

## Read first

- `git diff main -- src/` 출력
- `src/zsah4_glopen.prog.abap` 전문
- `phases/4b-glopen-gated/PLANNING.md` — **이 phase의 스펙과 테스트 전략** (정답지)
- `phases/4b-glopen-gated/index.json` — 각 step의 `contract`·`summary`(검증 대상)
- `domain/abap/CHECKLIST.md`·`domain/abap/RULES.seed.md`
- `docs/reference/templates/review-verdict.schema.json`

## vsp read 명령 (연결 시 교차 참조 전용 — 게이트 아님)

바이너리 `D:\claude for SAP\vsp\vsp-custom\build\vsp.exe`, **read 계열만**. offline 기동 시
연결 실패가 정상. 신규 객체(ZSAH4_GLOPEN)는 첫 write 전이라 아직 SAP에 없다(404 정상).

| 용도 | 명령 |
|---|---|
| 라이브 소스 재조회 | `vsp source read <TYPE> <NAME>` |
| 연결·버전 맥락 (SAP 버전 = §16 맥락) | `vsp system info` |

## 체크리스트 (트랙 B 12항목 이식 + 시맨틱 신규 — 전부 판정하라)

각 항목: **PASS / FINDING(s) / N/A(사유)**. **증거의 부재는 FAIL.** 대상은 **단일
REPORT(PROG) 1개 + 로컬 클래스(lcl_report)·로컬 테스트 클래스(ltc_report)**다.

### B1 — ALV + UI
- **§1 ALV / §2 텍스트**: 이 리포트는 `WRITE` 리스트(ALV 미사용) → 필드카탈로그 항목 `N/A`.
  화면·텍스트 풀(selection text 포함)도 이 phase 범위 밖(단일 `.prog.abap`) → `N/A`.

### B2 — Logic Hygiene (+ 업무로직 정합) — **핵심 판정 구역**
- **§3 상수 / §8 Clean ABAP**: `SELECT *` 금지·명시 필드(`FIELDS racct …` 확인), LOOP 내
  SELECT 금지, 내부테이블 타입 적합성.
- **§13 (신규) JOIN 카디널리티**: 이 구현은 ACDOCA 단일 테이블 SELECT라 JOIN이 없다 — 행
  배수/누락 위험은 필터·GROUP BY 정합으로 판정한다.
- **§14 스펙 정합 / §15 집계 정확성**: `SUM( hsl )`가 미결 라인만(`augbl = @space`) 집계하고
  `GROUP BY racct`가 계정 단위인지, 원장 필터(`rldnr = @iv_rldnr`)가 확장 원장 중복 합산을
  막는지 확인. **재도출**: `ltc_report` 픽스처(0L 미결 400000=150·113100=200; 반제 999·2L
  777 제외; 2행)를 SELECT로 손으로 추적하라.
- **§16 (신규) S/4 금액 소스 테이블 (FI-002)**:
  - 대상이 **S/4HANA**(스펙 §1의 대상 시스템; 연결 시 `vsp system info`의 SAP 버전)인데
    `collect`가 **BSEG/BKPF에서 금액을 SELECT**하면 → **MAJOR**. S/4에서 전표 라인아이템
    금액의 **주도 테이블은 ACDOCA(Universal Journal)**다(FI-002).
  - **재도출**: 소스의 `FROM` 절이 어느 테이블에서 금액을 읽는지 추적하라. 이 구현은
    ACDOCA에서 읽고 `rldnr`로 원장을 한정하므로 스펙 §1의 "주도 원장 소스"·"원장 차원"
    요구를 충족한다 → **PASS**(BSEG 참조 0건이면 위반 없음).

### B3 — Structure + Naming
- **§5 OOP 패턴**: `lcl_report`(데이터: SELECT) / START-OF-SELECTION(프리젠테이션: WRITE)
  분리, 양 클래스 FINAL, 선택화면 파라미터를 importing으로 전달(데이터 클래스가 전역 화면
  필드를 직접 읽지 않음). **§6 include**: 단일 파일이라 `N/A`. **§7 명명**: Z 접두·식별자
  철자 일치.
- **유닛 테스트(§19 계열)**: `ltc_report`가 무의미 단언이 아니라 실제 결과 집합(2행·반제
  제외·2L 제외·150/200)을 단언하는지 확인.

### B4 — Platform + Config
- **§9 릴리스 / §10 버전**: 756/S4 초과 문법 없음(신 ABAP SQL·`cl_osql_test_environment`·
  ACDOCA는 S4/756 지원). **§11 SPRO / §12 활성화**: consult 없음 → `N/A`. 활성화는 첫 write
  전이라 미도달이 정상 — 결함으로 올리지 마라.

## 오탐 패턴 — 반드시 reject
- **JOIN/필터가 "동작은 하는데 행집합이 틀림"** — 미결/원장 필터 누락으로 행 누락/배수(§13·§15).
- **결과가 "일관되지만 스펙과 다른 값/집합"**(§14).
- **S/4인데 금액을 BSEG에서 읽음** — 문법·활성화·유닛 green과 무관하게 MAJOR(§16).

## 판정 규칙
- **MINOR** — 비차단(나열만). **MAJOR** — 완료 차단(§13/§14/§15/§16 등),
  **MAJOR ≥ 1 → verdict = FAIL.** **PASS** — MAJOR 0건.

## verdict 기록 계약 (이것만 쓴다)

1. `git rev-parse HEAD` 출력(40-hex)을 `reviewed_head`에 넣는다 (impl feat 커밋 sha —
   위조 불가, 검사기가 현재 HEAD와 대조).
2. **`phases/4b-glopen-gated/review-verdict.json`을 쓴다** (`review-verdict.schema.json`
   준수):
   ```json
   {
     "verdict": "PASS 또는 FAIL",
     "reviewed_head": "<git rev-parse HEAD 출력>",
     "findings": []
   }
   ```
   MAJOR가 하나라도 있으면 `verdict`는 `"FAIL"`. MINOR도 findings에 전부 나열. 깨끗하면 `[]`.
3. 다른 파일은 건드리지 마라 — 등식형 검사기가 초과 dirty를 FAIL시킨다.

## Verification procedure

완료 판정은 엔진이 이 스텝의 **verify 명령**(검사기)을 직접 실행해 내린다. verdict 파일을
정확히 쓴 뒤 `phases/4b-glopen-gated/index.json`의 step 1을 `"status": "completed"` +
`summary`(판정 요지)로 갱신하라.

## Forbidden

- **verdict 파일 외 레포 쓰기 금지** — `src/` 포함 어떤 파일도 고치지 마라(고치지 말고
  findings로 기록). 등식형 dirty 검사가 초과 변경을 FAIL시킨다.
- **모든 vsp write 금지**(deploy/copy/execute·SAP 변경 — R-003).
- **impl 보고를 근거로 verdict 결정 금지** — 독립 재도출 위반.
- **연결 실패를 코드 결함으로 판정 금지**(R-001).
- 동결 레포·`sc4sap-custom/private/` 접근 금지(R-004), 접속정보 커밋 금지(R-005).
