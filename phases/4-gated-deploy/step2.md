# Step 2: review-gate (red FAIL → 수정 → PASS, 엔진 표준 재시도)

## Read first

- `phases/4-gated-deploy/state/verdict-*.json` — **있으면 직전 판정 산출물**
  (이 스텝의 분기 조건). 없으면 1차 시도다.
- `phases/4-gated-deploy/spec.md` · `unit.json` · `PLANNING.md` §2·§3
- `scripts/review-gate/config.json` (판정 정책 — 수정 금지)
- `phases/4-gated-deploy/checks/check-verification.mjs` (green 재검증 계약)

## Task

**1차 시도(verdict 파일 없음)**: 아무것도 수정하지 마라. 입력 3종(unit.json
경로들 실재 · verification.json이 현재 소스와 정합 · state 디렉터리 생성
가능)만 확인하고 completed로 보고하라 — 이어지는 엔진 verify(게이트 실행)가
red 캡슐을 심사해 **FAIL(비0)로 기록되는 것이 이 설계의 의도**다(AC-8 red
절반: 엔진 run 기록에 verify 실패로 남는다).

**재시도(verdict 파일 존재, FAIL)**: 스펙 §4.2의 수정 워커다.

1. verdict의 findings를 읽고 지적된 결함(스펙 요구 3 — JOIN 완전성)을
   수정하라: `INNER JOIN skat` → `LEFT OUTER JOIN skat`(결합 조건 불변).
   **findings에 없는 것은 고치지 마라**(단일 수정 원칙).
2. 기계 검증 전 체인 재실행(트랙 B D-019 동일 원칙): lint → `-Write -- deploy
   … '$TMP'`(green 재스테이징) → test → atc → source read.
3. `state/verification.json`을 green 기준으로 재작성(server_evidence는 **재배포
   후 fresh source read 원문** — LEFT OUTER JOIN이 보여야 함).
   `node phases/4-gated-deploy/checks/check-verification.mjs green` exit 0 확인.
4. completed 보고 → 엔진 verify(게이트)가 새 캡슐로 재심사 → PASS(0) 기대.

## Acceptance Criteria

index.json step 2의 verify = `review-gate.mjs` exit 0 (PASS 캡슐 + PASS 레코드
기록). 1차 시도에서는 exit 1(FAIL)이 **정상**이며 엔진이 재시도한다.

## Verification procedure

1. (재시도 시) 수정 diff가 JOIN 1건뿐임을 `summary`에 명시 + 재검증 체인
   수치 기록.
2. `state/` 산출물 확인: `verdict-<red>.json`(FAIL·MAJOR·B2) ·
   `verdict-<green>.json`(PASS) · `state.json.pass_records` 1건.
3. `phases/4-gated-deploy/index.json` step 2 갱신(completed/error/blocked).
   리뷰어가 스펙 결함을 지적하면 수정하지 말고 blocked.

## Forbidden

- `spec.md`·`scripts/review-gate/**`(config 포함) 수정 금지.
- 1차 시도에서 소스 수정 금지(red 보존 — FAIL 기록이 목적).
- findings 범위 밖 수정 금지 · 테스트 기대값 변경 금지.
- `$TMP` 외 write 금지 · row-data 도구 금지.
