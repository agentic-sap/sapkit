# Plan — 20260719-4-gated-deploy

사람용 스텝 지도. 상세 계약 = contract.md, 결정 기록 = phases/4-gated-deploy/
PLANNING.md, 스텝 정본 = phases/4-gated-deploy/step0~6.md.

| # | 이름 | 요지 | verify |
|---|---|---|---|
| 0 | implement-red | 스펙 요구 3만 위반하는 red 소스+테스트 (offline) | vsp lint |
| 1 | machine-blindness-evidence | red가 기계 4층 전부 green 실측 + verification.json(미검증 목록·서버 실측 동봉) | deploy→test→atc→check-verification red |
| 2 | review-gate | 1차: 게이트가 red FAIL(엔진 verify 실패로 기록) → 재시도 워커가 verdict대로 LEFT JOIN 수정+재검증 → PASS | review-gate.mjs exit 0 |
| 3 | deploy-gate | 3중 바인딩 후 캡슐본 배포(deploy-shim 경유) | deploy-gate.mjs exit 0 |
| 4 | post-deploy-scoring | 서버=repo 정합·test·atc + 프로브 3건(A-19/20/3) | source read→check green→test |
| 5 | drift-demonstration | MCP out-of-band 마커 → 검출 → 게이트 원복 | check-drift.mjs |
| 6 | evidence-consolidation | phase3-evidence.json (AC-8·14·15·drift·체인) | check-phase-evidence.mjs |

리뷰 스텝(2) 재시도 예산 5 (revision 3 + 인프라 2 — 스펙 §4.2). 나머지 표준 3.
