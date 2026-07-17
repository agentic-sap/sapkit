# PRD — SAP ABAP 수행 작업장 (트랙 A)

> 이 문서는 하네스가 "수행하는" SAP 개발 작업의 정의다. 하네스 "자체"의
> 설계·상태는 DESIGN.md·HANDOFF.md (메타 문서 — 스텝 작업에는 불필요).

## 목표

- 연결된 SAP 시스템에 검증된 ABAP 산출물을 만든다 — 세션의 자기보고를 믿지
  않고 기계 검증 체인(offline lint → deploy → activate → test → ATC)으로 판정.
- 실전 실패를 규칙으로 증류해 모듈 전문성을 축적한다 (LESSONS → RULES → packs).

## 비목표

- MCP 서버 백엔드 사용 안 함 — SAP 접점은 vsp CLI 단독 (D-001, R-002)
- QA/PRD tier 시스템에 write 안 함 — DEV 전용 (R-003)
- 모듈 지식 전체를 RULES에 주입 안 함 — packs 이중구조로 분리 (DESIGN.md §12)

## 사용자

- 무인 step 세션 (claude/codex 드라이버) — phases/N/step*.md 지시로 작업
- 사람 (셰퍼딩) — 계획 승인 · gated write 승인 · 리뷰 게이트

## 품질 모델 (하드 제약)

- 테스트 먼저: 테스트 클래스를 먼저 쓰고 스텝 경계로 증명
- 검증 2단: offline(vsp lint/parse) → connected(deploy→activate→drift→ATC→unit)
- 실패 마커 3종: CODE_FAIL / ENV_FAIL / LOCK_FAIL — ENV·LOCK은 코드 결함으로
  기록 금지 (R-001)
- 새-컨텍스트 리뷰: 작업 세션이 자기 결과를 리뷰하지 않는다

## 로드맵 상태 (완료 기준 원문: DESIGN.md §13)

| Phase | 내용 | 상태 |
|---|---|---|
| 0a Scaffold | 설치·게이트 차단 실증 | 완료 2026-07-11 |
| 0b Connected Discovery | vsp 전수 실측·마커 실재현 | 완료 2026-07-11 |
| 1 Offline Harness | 무인 첫 완주 (1-workdays-util) | 완료 2026-07-11 |
| 1.5 Online Validation | red/green 서버 실증 (5 FAIL→5 PASS) | 완료 2026-07-11 |
| 2 Read-Only Planning | 답사가 계획 변경 + 무인 완주 + 채점 5 PASS | 완료 2026-07-12 |
| 3 Gated Deploy | 무인 write 개방 | 미착수 — 선결 3건 전까지 무인 write 금지 |
| 4 Domain Packs | 모듈 지식팩 축적 | 미착수 |

Phase 3 선결 3건: ① 새-컨텍스트 리뷰 게이트의 무인 체인 편입(HANDOFF §5-11)
② 0b 마커 실측(대상 확장분) ③ drift 실측(DESIGN.md §14-2 타입 확장분).
