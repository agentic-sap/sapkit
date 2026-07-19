# ARCHITECTURE — 작업장 지도 (트랙 A)

> 무인 스텝이 참조하는 실행 구조·파일 맵·검증 계약. 하네스 자체의 설계 근거는
> DESIGN.md, 프로젝트 전체 상태는 HANDOFF.md (메타 — 스텝은 읽지 않아도 됨).

## 실행 흐름

1. 계획: read-only 답사 → phases/N-name/PLANNING.md 기록
2. 스텝: phases/N-name/step*.md (Read first/Task/AC/Verification/Forbidden
   5블록) — python scripts/execute.py N-name 이 순차 실행·자가 교정
3. 검증: 스텝의 verify 명령 (아래 계약) — 기록은 run-summary.json·run-history.jsonl
4. 리뷰: 새-컨텍스트 read-only 세션이 review.md 작성 (lint 재실행·desk-check 재추적)

## 방법론 관례 (계획·수정 범위) — JNC 교훈 팩 층3 시드

라이브 관통 부검에서 온 계획·수정 방법론. 무인 step·계획(harness-plan)·사람 셰퍼딩이
공통으로 따른다. (상세 감사: docs/reference/audits/2026-07-18-5-13-layer3-audit.md)

- **작업 단위 = 세로 관통** (JNC 층3-3): "N종 일괄 생산"이 아니라 오브젝트 그룹 하나씩
  수선→활성화→E2E로 관통한다. blast radius가 그룹 하나로 제한되고 즉시 검증된다
  (실증: 일괄 접근 3일 완결 0건 → 세로 관통 전환 후 하루 6배치 완주).
- **착수 전 liveness 실측** (JNC 층3-4): 수정 범위는 결함표가 아니라 실데이터 실측이
  정한다 — 승인된 범위의 절반이 휴면일 수 있다(8건 중 4건 실측). 실측이 문서 전제를
  뒤집으면 실측을 따른다(세션마다 1~3건 발생).
- **결함 목록 = 표본** (JNC 층3-2, R-012): 결함 목록을 수정 범위의 지도로 쓰지 마라 —
  grep으로 개수를 세는 건 개수 검증일 뿐 누락을 못 잡는다. 한 결함을 고칠 땐 그 메커니즘을
  같은 배치의 형제 오브젝트에 직접 대조하라. 게이트·데이터 대조로 원리적으로 못 잡는
  휴면 결함은 메커니즘 대조와 독립 리뷰로만 잡힌다.
- **미검증 표시는 구현 착수 전에 회수** (JNC 층3-7; 팩의 R-006은 JNC 내부 번호로
  이 레포 R-006과 무관): 문서의 "재대조 필요"류 미검증 배지는 실제 대조로 해소한 뒤에만
  구현에 착수한다 — 배지를 코드 주석으로 옮기는 건 회수가 아니며, 회수되지 않은 부채는
  그대로 구현된다.

## 파일 맵

- phases/N-name/ — 스텝 실행 단위: index.json·step*.md·PLANNING.md·
  run-summary.json·review.md·원로그
- scripts/execute.py — 스텝 실행기 (final-harness 엔진)
- scripts/quality-gate-sap.ps1 — Stop 훅: 변경된 .abap/.asddls를 lint
- scripts/verify-sap.ps1 — 온라인 verify 래퍼 (마커 판정의 유일한 경로)
- scripts/vsp-env.ps1 — SAP 자격증명 주입 (dot-source)
- src/ — 하네스가 관리하는 ABAP 소스 (abapGit 호환 네이밍)
- domain/abap/ — RULES.seed.md(규칙 후보풀 — 무인 주입 안 됨)·CHECKLIST.md
- .harness/ — 엔진 상태 (GOAL·STATE·RULES·LESSONS·VERIFY-PATTERNS) — 스텝이
  직접 수정 금지 (엔진이 관리)
- adapters/vsp/ — COMMANDS.md(명령 전수 실측)·VERIFY-PATTERNS.md(마커 상세
  정본)·vsp.lock.json(v2.38.1-91 lock)
- adapters/final-harness.lock.json — 엔진 lock (v0.17.3)
- DESIGN.md·HANDOFF.md·docs/DECISIONS.md — 메타 문서 (하네스를 만드는 프로젝트용)

## 검증 계약 (상세 정본: adapters/vsp/VERIFY-PATTERNS.md)

- offline: vsp lint --file (Error만 exit≠0, Warning 통과) · vsp parse --file
  (파일 감시용, 항상 exit 0)
- online: 반드시 scripts/verify-sap.ps1 경유 — vsp 직접 호출 금지 (vsp는 모든
  오류가 exit 1이라 래퍼가 출력 패턴으로 판정)
- 마커: CODE_FAIL(코드 결함 — 수정 대상) / ENV_FAIL(연결·환경) / LOCK_FAIL(잠금)
  — ENV·LOCK은 코드 결함으로 기록·규칙 승격 금지 (R-001)
- 존재 확인(Test-Path류)은 verify가 아니다

## SAP 접점

- vsp-custom CLI 단독 (MCP 서버 모드 금지 — R-002). 버전은 lock 파일 기준.
- write는 DEV tier에만 (R-003). deploy/copy 후 성공 보고만 믿지 말고
  vsp source read로 확인 (R-006).
- CLAS 테스트 include 배포는 vsp 미지원 — 테스트는 리포트 로컬 테스트 클래스
  배치 (ADR-002)
