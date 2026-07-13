# Phase 3a 계획 — 항공사 운항편 집계 리포트 (ZSAH3A_CARRFLT)

> 이 문서는 이 phase의 **스펙·답사·설계 결정** 기록이다. 리뷰 스텝은 여기의 스펙 절을
> **정답지**로 삼아 소스를 대조한다 (review-step 독립 재도출 원칙).

## 1. 스펙 (요구사항 — 리뷰 정답지)

**과제**: 각 항공사(SCARR)에 대해 그 항공사가 운항하는 예정 항공편(SFLIGHT)의 **건수**를
집계해 한 항공사당 한 줄로 출력하는 리포트.

**출력 한 행**: 항공사 코드(`carrid`) · 항공사명(`carrname`) · 운항편 수(`flightcount`).

**불변 규칙 (핵심)**:

- **운항편이 하나도 없는 항공사도 결과에 반드시 포함**되어야 하며, 그 항공사의
  `flightcount`는 **0**으로 표시된다. 즉 "운항편이 없다"는 이유로 항공사가 결과에서
  **사라지면 안 된다**. (마스터 = 항공사, 트랜잭션 = 운항편. 트랜잭션이 없는 마스터도
  보고 대상이다.)
- 집계는 항공사 단위(`carrid`, `carrname`)로 묶는다.
- 출력은 `carrid` 오름차순.

**워크드 예시 (기대 결과 집합 — 이 값이 정답)**:

| SCARR (항공사) | SFLIGHT (운항편) | 기대 출력 행 |
|---|---|---|
| AA (운항편 2건) | AA×2 | `AA / … / 2` |
| LH (운항편 1건) | LH×1 | `LH / … / 1` |
| ZZ (운항편 **0건**) | — | `ZZ / … / 0`  ← **이 행이 결과에 있어야 한다** |

→ 항공사 3곳이면 결과는 **3행**이다. ZZ(운항편 0건)가 빠져 2행이 나오면 스펙 위반이다.

## 2. 대상·명명

- 객체: **PROG `ZSAH3A_CARRFLT`** (단독 REPORT), 파일 `src/zsah3a_carrflt.prog.abap`.
- 명명 관례: 기존 `ZSAH{phase}_*` 계열(ZSAH1_·ZSAH2_) 승계 → 이 phase는 `ZSAH3A_*`.
- 출력은 단순 `WRITE` 리스트 (ALV 불요 — 리뷰 §1 범위 밖 `N/A`). 스코프를 리포트 1개로
  좁혀 리뷰 표면을 JOIN 시맨틱(§13)에 집중시킨다.

## 3. 답사 실측 (2026-07-13, IDEA-JNC / S4H / client 100, read-only only)

전 명령 read 계열·write 0건. 근거 로그는 이 세션 답사(system info·what-package·search).

| 명령 | 발견 |
|---|---|
| `vsp system info` | S4H, client 100, SAP/ABAP 756, HDB — DEV tier(IDEA-JNC=동일 시스템) |
| `vsp what-package SCARR SFLIGHT SPFLI SBOOK` | 전부 실존. `TABL SCARR`·`TABL SPFLI`·`TABL SFLIGHT` → 패키지 `SAPBC_DATAMODEL` (표준 SFLIGHT 데이터 모델 DDIC 존재) |
| `vsp search "SFLIGHT" -t TABL` / `"SCARR" -t TABL` | 각 1건 — 표준 테이블 확인 |
| `vsp search "ZSAH3*"` | **0건** — 이름 충돌 없음 |

**표준 테이블 쌍 선정**: **SCARR(항공사 마스터) ← SFLIGHT(운항편 트랜잭션)**, 조인 키
`carrid`. 이 쌍은 "트랜잭션이 없는 마스터(운항편 0건 항공사)"라는 **누락 행 시맨틱**이
업무적으로 자연스럽게 성립하는 표준 데모 모델이라 JOIN 카디널리티 과제에 적합하다.

## 4. 답사가 계획을 바꾼 기록 (DESIGN §13 관례)

1. **테스트 전략을 라이브 데이터 대조 → 결정론적 test double로 변경**. 근거: (a)
   `vsp source read`는 `TABL` 타입을 **미지원**(supported: PROG/CLAS/INTF/FUNC/FUGR/
   INCL/DDLS/VIEW/BDEF/SRVD/SRVB/MSAG)이라 read 계열로 테이블 정의/행수를 못 뽑는다.
   (b) 실데이터 행수 추출은 `vsp query`가 담당하는데 이는 **상시 데이터 게이트**(HANDOFF
   §8·SAFETY-PROFILES §②)라 read-only 답사 도구셋에서 제외된다. → 유닛 테스트는 라이브
   행수에 의존하지 않고 `cl_osql_test_environment`로 **주입한 픽스처**(§1 워크드 예시의
   AA/LH/ZZ)에 대조한다. 이는 결정론적이고 라이브 데이터 변동에 안전하다. (이 phase(3a)
   자체는 유닛 테스트를 싣지 않는다 — 3b가 싣는다. 이 결정은 3b 정상 경로에 적용된다.)
2. **무인 스텝은 offline 스코핑으로 기동**(자격증명 미주입). 근거: 이 phase의 판정(lint +
   리뷰)은 전부 로컬(diff+src)로 성립하고 SAP 연결이 불요하다. 자격증명을 주입하지 않으면
   무인 세션이 SAP에 닿지 못해(§8.4) 안전 표면이 최소가 된다. 리뷰 스텝도 로컬만으로
   판정한다(리뷰 게이트 스펙 Key flows #2 — "연결 실패 시 로컬만으로").

## 5. 리뷰 게이트 배선 (관례 근거)

- 스텝 순서: `impl(step0) → review-gate(step1) → escort-write(step2)` (conventions §1).
- 리뷰 스텝 verify = `scripts/check-review-verdict.ps1` **sha256 핀**(현재 값
  `7B4F211F…FA0223`, Get-FileHash 실측 2026-07-13) 가드 후 호출. 검사기가 ① verdict==PASS
  ② reviewed_head==HEAD ③ 등식형 dirty=={review-verdict.json} 를 판정(필수 3조항).
- verdict 파일명은 `review-verdict.json` (step*.md 글롭 회피 — conventions §3).
- write 스텝(step2)은 에스코트 조항 하 사람 수행이며, 게이트가 정상이면 도달하지 않는다.
