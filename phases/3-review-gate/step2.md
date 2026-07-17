# Step 2: state

## Read first

- `phases/3-review-gate/PLANNING.md` §3.1·§3.5(상태 파일 형태 — 정본)
- `docs/reference/designs/2026-07-17-phase3-review-gate.md` §4.2(revision 정의)·
  §4.3·AC-5·6·9·13
- `phases/3-review-gate/index.json` step 0·1의 `contract`

## Task

### 1. `scripts/review-gate/state.mjs` (ESM, Node 내장만)

`stateDir`를 인자로 받는 순수 파일 기반 모듈 (전역 상태 금지 — run-scoped는
호출자가 stateDir로 보장):

- `loadState(stateDir)` — state.json 없으면 §3.5 초기 구조 반환. **파싱 불능
  손상이면 `InternalError` throw** (`err.code === 'INTERNAL_ERROR'`) — 조용한
  초기화 금지 (AC-13, fail-closed).
- `saveState(stateDir, state)` — 원자적 쓰기(임시 파일 → rename).
- `getCachedVerdict(state, capsuleHash)` — 있으면 `{classification, at}`.
- `recordVerdict(stateDir, state, capsuleHash, classification)` — verdicts 기록.
  **FAIL이고 fail_revisions에 없는 해시면 push** (고유 FAIL 해시 목록 = revision
  계수, 스펙 §4.2). 인프라 계열(TIMEOUT/INFRA_ERROR/INTERNAL_ERROR)은
  fail_revisions에 **불산입**(AC-9), `infra_retries` 증가만.
- `revisionCount(state)` — `fail_revisions.length`.
- `isBlocked(state, limits)` — `blocked === true` 또는 revisionCount ≥
  `limits.revision_limit`.
- `markBlocked(stateDir, state)` — `blocked: true` 영속화.
- `recordPass(stateDir, state, capsuleHash, record)` — §3.5 `pass_records` 형태.

### 2. `scripts/review-gate/tests/state.test.mjs` (node:test, 임시 디렉터리)

1. AC-5 — FAIL 기록 후 같은 해시 조회 → 캐시 반환. 같은 해시 FAIL 재기록해도
   revisionCount 불변(고유 해시 기준).
2. AC-6 — 서로 다른 FAIL 해시 3개 → `isBlocked` true (limit 3). 2개면 false.
3. AC-9 — TIMEOUT·INFRA_ERROR·INTERNAL_ERROR 기록 → revisionCount 불변,
   infra_retries 증가.
4. AC-13 — state.json에 깨진 JSON 주입 → `loadState`가 INTERNAL_ERROR throw.
5. run-scoped — stateDir A의 기록이 stateDir B에 비가시.
6. 원자성 최소 검증 — saveState 후 임시 파일 잔존 없음 + 내용 재로드 일치.
7. PASS 레코드 왕복 — recordPass 후 reload하여 record 필드 보존.

## Acceptance Criteria

```
node --test scripts/review-gate/tests/state.test.mjs
```

## Verification procedure

1. AC 명령 exit 0.
2. `phases/3-review-gate/index.json` step 2만 갱신 (규칙은 step0.md와 동일).

## Forbidden

- `scripts/review-gate/**`·`phases/3-review-gate/index.json` 밖 수정 금지.
- 손상 상태의 조용한 재초기화 금지. 이유: fail-closed(스펙 §5-12) — 손상은
  차단 사유이지 리셋 사유가 아니다.
- 외부 패키지 금지 · SAP 연결 금지 · Do not break existing tests.
