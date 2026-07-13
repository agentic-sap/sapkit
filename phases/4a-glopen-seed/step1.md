# Step 1: review-gate — 4a-glopen-seed

## 너의 역할

너는 **리뷰어**다. 이 코드를 만든 impl 세션과는 **완전히 분리된 새 컨텍스트**에서 돈다.
문법 통과·lint 통과·활성화·유닛테스트 PASS는 코드가 **컴파일·연결됨**만 증명하지,
**업무로직이 옳음**을 증명하지 않는다 — 기계 verify를 전부 통과한 INNER vs LEFT JOIN 급
시맨틱 결함이 실제로 있었다(트랙 B E2E 실증). 그 급을 **첫 vsp write 전에** 잡는 것이 이
스텝의 유일한 존재 이유다.

너는 **판정만 한다. 고치지 않는다.** 수정은 이후 impl 세션의 몫이다.

## 독립 재도출 원칙 (신뢰하지 말 것)

impl 세션이 index.json `summary`/`contract`에 남긴 **자기보고를 근거로 삼지 마라.**
"스펙대로 구현함"·"유닛테스트 green"이라는 보고가 있어도 그것을 믿지 말고, 아래 원천에서
**네가 직접 재도출**해 판정하라:

1. **main 대비 diff** — 이 phase가 무엇을 바꿨는지의 1차 사실:
   ```
   git diff --stat main -- src/
   git diff main -- src/
   ```
2. **`src/` 소스** — 배포 대상 소스 정본(abapGit 파일). diff에 걸린 파일을 통째로 읽어라
   (이 phase는 `src/zsah4a_glopen.prog.abap`).
3. **(연결 시) vsp read 계열 라이브 참조** — 아래 "vsp read 명령" 절. 이 스텝은 offline
   스코핑으로 기동되어 **SAP 자격증명이 없을 수 있다** — 그 경우 vsp 연결이 실패하는 것이
   정상이다. **게이트는 SAP 연결에 의존하지 않는다.** 연결 실패 시 1·2번(로컬)만으로
   판정하라(연결 실패를 코드 결함으로 판정 금지 — R-001).

phase의 기대 동작 기준은 이 phase의 **스펙**(`phases/4a-glopen-seed/PLANNING.md`의 스펙
절 §1)과 `phases/4a-glopen-seed/index.json`의 각 step `contract`다 — 이것을 **정답지**로
삼아 코드가 그 기대를 실제로 충족하는지 손으로 추적하라. impl 보고의 "일치함"을 복창하지
마라. **유닛테스트가 green이라는 사실은 그 자체로 PASS 근거가 아니다** — 유닛테스트가
소스와 같은 전제 위에서 자기충족적으로 통과할 수 있으므로, 스펙 요구를 소스에 직접 대조하라.

## Read first

- `git diff main -- src/` 출력 (이 phase의 변경 전체)
- `src/zsah4a_glopen.prog.abap` 전문
- `phases/4a-glopen-seed/PLANNING.md` — **이 phase의 스펙** (정답지, 자기완결적)
- `phases/4a-glopen-seed/index.json` — 각 step의 `contract`(기대 계약)·`summary`(자기보고
  — 검증 대상이지 근거 아님)
- `domain/abap/CHECKLIST.md`·`domain/abap/RULES.seed.md` — ABAP 관례 규칙 시드
- `docs/reference/templates/review-verdict.schema.json` — 네가 쓸 verdict 파일 계약

## vsp read 명령 (연결 시 교차 참조 전용 — 게이트 아님)

바이너리는 `D:\claude for SAP\vsp\vsp-custom\build\vsp.exe`. 아래는 **read 계열만** —
write(deploy/copy/execute)는 **절대 금지**(Forbidden 절). 이 스텝은 offline로 기동될 수
있어 아래 명령이 연결 실패할 수 있다 — 그러면 로컬(diff+src)만으로 판정하라.

| 용도 | 명령 | 근거 |
|---|---|---|
| 라이브 소스 재조회 | `vsp source read <TYPE> <NAME>` | 표준 ADT REST (COMMANDS.md §7-a). `src/` 로컬 소스와 대조 |
| 연결·버전 맥락 | `vsp system info` | SAP/ABAP 릴리스·SAP 버전(ECC/S4)·client 확인 — §10·§16 판정 맥락 |

주의: 이 phase가 새로 만드는 객체(ZSAH4A_GLOPEN)는 **아직 SAP에 없다**(첫 write 전) —
`source read`가 404를 내는 것이 정상이다. 그 read의 성공/실패로 verdict를 가르지 마라.

## 체크리스트 (트랙 B 12항목 이식 + 시맨틱 신규 — 전부 판정하라)

각 항목: **PASS / FINDING(s) / N/A(사유)** 중 하나. **증거의 부재는 PASS가 아니라 FAIL이다.**
이 phase의 대상은 **단일 REPORT(PROG) 1개 + 로컬 클래스(lcl_report)·로컬 테스트
클래스(ltc_report)**다 — ALV·화면/GUI·include·FM·클래스풀 등은 이 범위 밖이면 `N/A(사유)`.

### B1 — ALV + UI
- **§1 ALV / §2 텍스트 엘리먼트**: 이 리포트는 `WRITE` 리스트(ALV 미사용) → 필드카탈로그
  항목 `N/A`. 화면·텍스트 풀(selection text 포함)은 이 phase 범위 밖(단일 `.prog.abap`) → `N/A`.

### B2 — Logic Hygiene (+ 업무로직 정합) — **이 phase의 핵심 판정 구역**
- **§3 상수 / §8 Clean ABAP**: `SELECT *` 금지·명시 필드, LOOP 내 SELECT 금지, 매직
  리터럴, 내부테이블 타입 적합성. 접근: `src/` 소스 + `git diff main`.
- **§13 (신규) JOIN 카디널리티 · 행집합 무결성**: JOIN 종류가 업무 의도와 일치하는가,
  비유일 키로 조인해 행이 배수로 불어나지 않는가(fan-out), 집계 전 필터 누락은 없는가.
  재도출: 조인/필터의 **결과 행집합**을 스펙 기대와 대조해 손으로 추적하라.
- **§14 (신규) 스펙 · contract 정합**: 구현이 **스펙(§1)이 요구한 결과**를 산출하는가.
  내부적으로 일관되지만 스펙 요구를 어기면 → **MAJOR**.
- **§15 (신규) 경계 · 집계 정확성**: 집계(SUM/GROUP BY)의 빈 집합·널·부호 처리, 반제 라인
  제외가 실제로 성립하는지.
- **§16 (신규) S/4 금액 소스 테이블 (FI-002)** — 기계 verify·유닛테스트가 못 잡는 급을
  명시 커버:
  - 대상이 **S/4HANA**(스펙 §1의 대상 시스템; 연결 시 `vsp system info`의 SAP 버전)인데
    `collect`가 **BSEG/BKPF에서 금액을 SELECT**하면 → **MAJOR**. S/4에서 전표 라인아이템
    금액의 **주도 테이블은 ACDOCA(Universal Journal)**다 — BSEG만 읽으면 원장별·전 통화
    금액이 불완전할 수 있고(FI-002), 이 오용은 문법·활성화·오프라인 유닛테스트를 전부
    통과한다.
  - **재도출**: 소스의 `FROM`/`JOIN` 절이 **어느 테이블에서 금액을 읽는지** 추적하고,
    스펙 §1의 "주도(leading) 원장 소스"·"원장(ledger) 차원" 요구와 대조하라. 부수 근거:
    BSEG 계열에는 원장(ledger) 차원(`rldnr`)이 없어 스펙 §1의 원장 한정 요구를 구조적으로
    충족할 수 없다 — 이 역시 금액 소스 테이블 오선택의 징후다.

### B3 — Structure + Naming
- **§4 FORM 명명 / §5 OOP 패턴 / §6 include 구조 / §7 명명 규약**: `lcl_report`(데이터:
  SELECT) / START-OF-SELECTION(프리젠테이션: WRITE) 분리, 양 클래스 FINAL, Z 접두, 식별자
  철자 일치. 단일 파일·로컬 클래스면 include 항목은 `N/A`. 접근: `src/` 소스.
- **유닛 테스트(§19 계열)**: `ltc_report`가 무의미 단언이 아니라 실제 결과 집합을 단언하는지.
  단, **유닛테스트 green은 §16 판정을 대체하지 않는다**(위 독립 재도출 원칙).

### B4 — Platform + Config
- **§9 ABAP 릴리스 / §10 SAP 버전**: 릴리스(756/S4) 초과 문법 금지. **S/4 버전 인지**는
  §16과 직결 — 접근: `src/` 소스 + (연결 시) `vsp system info`.
- **§11 SPRO / §12 활성화**: 이 phase엔 consult 산출물이 없으면 `N/A`. 활성화는 첫 write
  전이라 **미도달이 정상** — 활성화 미도달을 결함으로 올리지 마라.

## 오탐 패턴 — 리뷰어가 반드시 reject

- **JOIN이 "동작은 하는데 행집합이 틀림"** — INNER/LEFT 오선택으로 행이 조용히 누락/배수(§13).
- **결과가 "일관되지만 스펙과 다른 값/집합"** — impl 보고의 desk-check를 복창해 놓친다(§14).
- **S/4인데 금액을 BSEG에서 읽음** — 문법·활성화·유닛 green과 무관하게 MAJOR(§16). 유닛
  테스트가 BSEG 픽스처 위에서 green이라는 것은 결함의 반증이 아니다(자기충족).

## 판정 규칙

- **MINOR** — 비차단 위반(나열은 하되 verdict를 FAIL로 만들지 않음).
- **MAJOR** — 완료 차단 위반(§13 JOIN 카디널리티 오류, §14 스펙 불일치, §16 S/4 금액 소스
  오선택 등). **MAJOR ≥ 1 → verdict = FAIL.**
- **PASS** — MAJOR 0건(MINOR는 나열 가능).

## verdict 기록 계약 (이것만 쓴다)

판정을 마치면 아래를 수행하라. **`phases/4a-glopen-seed/review-verdict.json` 외 어떤
파일도 생성·수정·삭제하지 마라** — 등식형 검사기가 초과 dirty를 기계로 FAIL시키지만, 지시로도
명시한다.

1. **HEAD sha를 읽어라**:
   ```
   git rev-parse HEAD
   ```
   출력(40-hex 소문자)을 그대로 `reviewed_head`에 넣는다. (이 값은 impl feat 커밋 sha —
   엔진이 impl 세션 종료 후 생성하므로 위조 불가. 검사기가 현재 HEAD와 대조한다.)

2. **`phases/4a-glopen-seed/review-verdict.json`을 쓴다** — `review-verdict.schema.json`
   준수:
   ```json
   {
     "verdict": "PASS 또는 FAIL",
     "reviewed_head": "<git rev-parse HEAD 출력, 40-hex>",
     "findings": [
       { "bucket": "B2", "severity": "MAJOR", "object": "ZSAH4A_GLOPEN", "finding": "§16 ... (구체 인용)" }
     ]
   }
   ```
   MAJOR가 하나라도 있으면 `verdict`는 반드시 `"FAIL"`. findings에는 MINOR도 전부 나열.
   깨끗한 PASS면 `findings`는 빈 배열 `[]`.

3. 다른 bookkeeping(index.json status 등)은 엔진이 처리한다 — 너는 verdict 파일만 남긴다.

## Verification procedure

이 스텝의 완료 판정은 엔진이 이 스텝의 **verify 명령**(검사기)을 직접 실행해 내린다 —
너의 자기보고가 아니다. 네가 할 일은 위 verdict 파일을 정확히 쓰는 것뿐이다. verdict를
쓴 뒤 `phases/4a-glopen-seed/index.json`의 step 1을 `"status": "completed"`로 갱신하고
`summary`에 판정 요지(주요 finding)를 남겨라. 엔진 verify가 실패하면(검사기 exit≠0) 엔진이
재시도/error를 관장한다.

## Forbidden

- **verdict 파일 외 레포 쓰기 금지** — `src/` 포함 어떤 파일도 고치지 마라. 결함은
  **고치는 게 아니라 findings로 기록**한다. (등식형 dirty 검사가 초과 변경을 FAIL시킨다.)
- **모든 vsp write 금지** — `vsp deploy`/`copy`/`execute` 및 모든 SAP 변경(R-003).
- **impl 보고를 근거로 verdict 결정 금지** — 독립 재도출 원칙 위반.
- **연결 실패를 코드 결함으로 판정 금지**(R-001) — 로컬(diff+src)만으로 판정한다.
- 동결 레포·`sc4sap-custom/private/` 접근 금지(R-004), 접속정보 커밋 금지(R-005).
