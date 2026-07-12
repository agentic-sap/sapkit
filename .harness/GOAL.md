# Current Goal

<!-- Overwritten at the start of each task (Task Loop step 2).
     The verifier reads ONLY this file plus the produced artifact. -->

## Task

엔진 잔여 결함 수리 스프린트 — HANDOFF §6 백로그 11-②~⑨ 잔여 + 구 백로그 3 잔여 전량
(사용자 지시 "full로 끝까지", 2026-07-12). 실행은 모델 지정 서브에이전트 위임,
메인은 오케스트레이션·게이트·커밋.

### Wave 구성 (11건)

| Wave | 항목 |
|---|---|
| 1 | 11-② 래퍼 내부 stateless 누수 — vendored client 패치 (UpdateLocalTestClass/Types/Macros/Definitions·UpdateUnitTest·UpdateClassMethod·UpdateCdsUnitTest 영향) |
| 2 | 11-③ UpdateFunctionGroup raw PUT CT v3 하드코딩 · 3-7 vendored 상수 비대칭 · 11-④ CreateView 400 조사·수리 |
| 3 | 3-5 DeleteFunctionGroup 조용한 실패 · 3-3 CreateProgram(function_group) 거짓 성공 · 11-⑨ CreateStructure 죽은 잠금 쌍 |
| 4 | 11-⑧ Create 로그온 언어 불일치 (patch 헬퍼 add-if-missing + 언어 파라미터 일관화) · 11-⑥ isAlreadyExistsError 영어 전용 매칭 |
| 5 | 11-⑤ UpdateStructure 사전 check 빈 에러 조사·수리 · 3-6 low/CDS unit test Cloud 경로 404 (4.13.1 수리의 low/CDS 확장) |

제외(HANDOFF에 유보 조건 기록됨): 11-⑦(RFC 3계열 — 관찰만), 3-8(보류),
백로그 1 잔여(서비스키 운용 전 재검토), 백로그 2(.sc4sap 개명 — 동일 유보 사이클).

## Success criteria

- [x] **jest 전량 통과(실패 0)** + 수리마다 회귀 테스트 신설, **역-검증**(수리를
      되돌리면 해당 테스트 FAIL) 실증 — 538→580 passed/0 failed, Wave별 역-검증 실측
- [x] **재번들 런북 준수** (interactive/server/UPDATE-RUNBOOK.md): 4.13.7~4.13.11
      5회 전부 verify-engine OK + capability diff no-op(155 유지 — disallowedTools
      동기화 불요)
- [x] **IDES 라이브 red→green**: 누적 12건+ (423 잠금·415 CT·삭제 거짓 성공·가짜
      PROG·언어 400·스켈레톤 복구 2·already-exists 오분류·불투명 check·low/CDS
      404). $TMP 전량 실삭제 검증(ZSAH39_FGL 포함 최종 0), 고아 잠금 0
- [x] **새-컨텍스트 read-only 리뷰 PASS** — Wave별 5/5 PASS (BLOCKER/MAJOR 0,
      리뷰 발굴 2건은 정정·백로그 등재)
- [x] **게이트 5종 green 유지** + Wave별 커밋 5건 + HANDOFF·STATE 갱신
- [x] 환경 실패(ENV/LOCK 마커)를 코드 결함으로 기록하지 않음 — 해당 사례 없음
      (ZSAH39_FGL 세션 잠금은 테스트 산물로 기록, 코드 결함 아님)

## Verification method

1. jest·게이트 5종 exit code 실측
2. 역-검증: 수리 원복 시 신설 테스트 FAIL 재현 로그
3. 라이브 red→green 증거(구/신 번들 각 실행 결과) 또는 재현 불가 사유
4. 독립 리뷰어(새 컨텍스트, read-only)가 Wave diff를 이 GOAL 기준으로 항목별 판정
