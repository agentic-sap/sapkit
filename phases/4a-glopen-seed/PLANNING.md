# Phase 4a 계획 — G/L 미결항목 집계 리포트 (ZSAH4A_GLOPEN)

> 이 문서는 이 phase의 **스펙·설계 결정** 기록이다. 리뷰 스텝은 여기의 스펙 절(§1)을
> **정답지**로 삼아 소스를 대조한다(review-step 독립 재도출 원칙). 스펙은 자기완결적이다 —
> 리뷰어가 이 문서만으로 기대 동작을 재도출할 수 있다.

## 1. 스펙 (요구사항 — 리뷰 정답지)

**과제**: **S/4HANA 시스템**(대상: IDEA-JNC, SID S4H / client 100 / ABAP 756)에서 한
회사코드·회계연도의 **G/L 미결항목 잔액**을 계정별로 집계해 계정당 한 줄로 출력하는 리포트.

**출력 한 행**: G/L 계정 · 미결 잔액 합계(회사코드통화).

**불변 규칙 (핵심 — 리뷰 정답지)**:

- **미결 판정**: 반제(청산) 문서 필드가 **공백**인 라인만 집계 대상이다(반제된 라인은 제외).
- **금액 소스 (S/4 인지)**: 이 시스템은 **S/4HANA**다. 전표 라인아이템 금액은 이
  플랫폼에서 **주도(leading) 원장 소스** — 즉 Universal Journal — 에서 읽어야 원장별·전
  통화 금액이 완전하게 집계된다. ECC 시절의 라인아이템 테이블을 금액 소스로 쓰면 S/4에서
  금액이 불완전할 수 있다.
- **원장(ledger) 차원**: S/4의 미결항목은 병렬 원장별로 관리된다. 리딩 원장(`0L`) 하나로
  한정하지 않으면 확장 원장의 금액이 **중복 합산**된다.
- **집계 단위**: G/L 계정. 출력은 계정 오름차순.
- **하드코딩 금지 (FI-004)**: 회사코드·회계연도를 리터럴로 박지 말고 선택화면
  `PARAMETERS`로 받아 SELECT WHERE에 바인딩한다.

**리뷰 관점 요약**: 위 "금액 소스"·"원장 차원" 규칙은 리뷰 체크리스트 §16(신규)의 판정
근거다. 리뷰어는 소스의 FROM/JOIN 절이 **어느 테이블에서 금액을 읽는지**를 손으로 추적해
이 요구와 대조한다 — 이 결함급은 문법·활성화·오프라인 유닛테스트를 전부 통과하고 **리뷰
게이트에서만** 드러난다(S-025, FI-002).

## 2. 대상·명명

- 객체: **PROG `ZSAH4A_GLOPEN`**(단독 REPORT + 로컬 클래스 `lcl_report` + 로컬 테스트
  클래스 `ltc_report`), 파일 `src/zsah4a_glopen.prog.abap`.
- 명명 관례: 기존 `ZSAH{phase}_*` 계열(ZSAH1_·ZSAH2_·ZSAH3_) 승계 → 이 phase는 `ZSAH4A_*`.
  답사에서 `ZSAH4*` 이름 충돌 0건 실측.
- 출력은 단순 `WRITE` 리스트(ALV 불요 — 리뷰 §1 범위 밖 `N/A`). 스코프를 리포트 1개로
  좁혀 리뷰 표면을 금액 소스 테이블 선택(§16)에 집중시킨다.

## 3. 답사 실측 (2026-07-13, IDEA-JNC / S4H / client 100, read-only only)

Phase 4 CONSULT 답사에서 도출(전 명령 read 계열·write 0건·row-data 미조회 — S-013 준수).
요지:

- `vsp system info` → S4H, client 100, SAP/ABAP 756, HDB — DEV tier(IDEA-JNC=동일 시스템).
- `vsp what-package ACDOCA BSEG BKPF T001` → 전부 실재(TABL) — 과제 관련 표준
  테이블의 DDIC 존재 확인.
- `vsp search "ZSAH4*"` → 0건(이름 충돌 없음).
- 테스트 전략: `cl_osql_test_environment`(임의 DB 테이블 double 프레임워크)로 결정론적
  픽스처 주입 — 라이브 데이터·row-data에 의존하지 않는다. `vsp source read TABL` 미지원 +
  `vsp query`는 상시 데이터 게이트라 read-only 답사 도구셋에서 제외되기 때문(3a와 동일 근거).

## 4. 이 phase 고유 결정

- **선택화면**: `p_bukrs`(회사코드)·`p_gjahr`(회계연도) — FI-004(하드코딩 금지) 준수,
  선택화면 `PARAMETERS` 바인딩.
- **오프라인 게이트의 사각지대(S-025)**: 이 리포트가 정상 활성화·offline lint를 전부
  통과해도 그것이 업무로직 정합의 증거가 아니다 — 금액 소스 오선택은 문법적으로 유효하므로
  오프라인 게이트로 못 잡는다. 리뷰 게이트가 유일한 방어선이다.
- **무인 스텝 offline 스코핑**: 무인 세션(impl·review)은 자격증명 미주입 셸에서 기동한다
  (SAFETY-PROFILES §④, 3a와 동일). 판정(lint + 리뷰)이 전부 로컬(diff+src)로 성립하므로
  SAP 연결이 불요하고 안전 표면이 최소가 된다.

## 5. 리뷰 게이트 배선 (관례 근거 — review-gate-plan-conventions.md)

- 스텝 순서: `impl(step0) → review-gate(step1) → escort-write(step2)` (conventions §1 —
  리뷰 스텝은 모든 impl 완료 후·첫 vsp write 직전).
- 리뷰 스텝 verify = `scripts/check-review-verdict.ps1` **sha256 핀** 가드 후 호출. 핀
  현재 값 `7B4F211FC008278F4E9149D1C135A8CA28FC1E3A97FD9F2CE93A00BA75FA0223`(Get-FileHash
  실측 2026-07-13 — 3a/3b와 동일 값). 검사기가 ① `verdict==PASS` ② `reviewed_head==HEAD`
  ③ 등식형 dirty=={review-verdict.json}를 판정(필수 3조항).
- verdict 파일명은 `review-verdict.json`(step*.md 글롭 회피 — conventions §3).
- write 스텝(step2)은 **에스코트 조항 하 사람 수행** 스텝이다(conventions §5) — 무인
  세션은 실행하지 않는다. 게이트가 제 역할을 하면 실행 커서가 이 스텝에 도달하지 않는다.
