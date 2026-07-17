# Step 3: gate-assembly

## Read first

- `phases/3-review-gate/PLANNING.md` §3 전체 (특히 §3.1 exit·§3.3 config)
- `docs/reference/designs/2026-07-17-phase3-review-gate.md` §4.1(정상 플로)·
  §4.2(수정 루프·BLOCKED fail-fast)·§5-3(클린 env)·AC-7
- `phases/3-review-gate/index.json` step 0~2의 `contract` — capsule/verdict/state
  의 실제 export를 그 계약대로 소비하라.

## Task

### 1. `scripts/review-gate/reviewer.mjs`

- `runReviewer({ capsuleDir, config })` — `config.reviewer.command` 배열을
  `child_process.spawn`으로 실행. cwd = capsuleDir.
  **env는 화이트리스트만**: `config.env_allowlist`에 있는 이름만 부모 env에서
  복사 — 그 외 전부 미전달 (SAP_*·MCP_ENV_PATH 등 자격증명 변수가 새지 않는
  구조, 스펙 §5-3). `config.reviewer.timeout_ms` 초과 시 프로세스 kill.
  반환: `{ type: 'ok'|'timeout'|'spawn_error', stdout, stderr, exitCode }`.

### 2. `scripts/review-gate/review-gate.mjs` — 게이트 메인 CLI

`node review-gate.mjs --unit <unit.json 경로> --state <stateDir> --config <config 경로>`

플로 (스펙 §4.1·§4.2를 기계로):

1. state 로드 — `isBlocked` → **즉시 exit 7** (리뷰어 미기동 fail-fast).
2. `createCapsule` (INCOMPLETE → exit 6, 사유 stderr).
3. `getCachedVerdict(capsuleHash)` 있으면 리뷰어 **미기동**, 캐시 분류의
   exit 반환.
4. `runReviewer` — timeout → TIMEOUT(4), spawn_error → INFRA_ERROR(5) 기록
   (infra_retries — revision 불산입).
5. stdout을 `verdict.evaluate`로 판정 → `recordVerdict`.
6. PASS면 판정 JSON을 stateDir에 저장하고 `recordPass`(§3.5 record — model·
   policy_version·schema_version·duration_ms 포함) → exit 0.
7. FAIL이면 판정 JSON(발견 목록 — 다음 시도의 워커가 읽고 수정)을 stateDir에
   저장 → revision 한도 도달 시 `markBlocked` + exit 7, 아니면 exit 1.
8. 모든 예기치 못한 예외는 top-level catch → exit 6 (INTERNAL_ERROR catch-all).

### 3. mock 리뷰어 4종 — `scripts/review-gate/tests/mocks/`

`reviewer-pass.mjs`(스키마 적합 PASS JSON 출력) · `reviewer-major.mjs`(MAJOR
1건 FAIL) · `reviewer-invalid.mjs`(비JSON 출력) · `reviewer-envdump.mjs`
(자기 process.env 키 목록을 JSON으로 출력 — env 검증용) ·
`reviewer-sleep.mjs`(timeout 초과 대기).

### 4. `scripts/review-gate/tests/gate-e2e.test.mjs` (node:test)

임시 stateDir·config 사본(reviewer.command를 mock으로 교체)으로:

1. PASS 사이클 — exit 0 + pass_records에 레코드(model·버전·duration 존재).
2. FAIL 사이클 — exit 1 + 판정 JSON 파일 저장됨(발견 좌표 포함).
3. 캐시 — 동일 unit 재실행 → 리뷰어 재기동 없음(mock에 실행 마커 파일을 남기게
   해 2회째 마커 미증가 확인) + 동일 exit.
4. 3-revision BLOCKED — 소스를 바꿔가며 FAIL 3회(서로 다른 해시) → 3회째 exit 7,
   이후 재호출도 즉시 7 (마커로 리뷰어 미기동 확인).
5. MALFORMED — invalid mock → exit 2.
6. TIMEOUT — sleep mock + 짧은 timeout_ms → exit 4, revision 불산입 확인.
7. AC-7(env) — envdump mock 출력에 `SAP_`으로 시작하는 키·`MCP_ENV_PATH` 부재
   (부모 env에 가짜 `SAP_PASSWORD=dummy`를 주입한 상태에서 실행해 확인).

## Acceptance Criteria

```
node --test scripts/review-gate/tests/gate-e2e.test.mjs
```

## Verification procedure

1. AC 명령 exit 0. (선행 스텝 테스트 3종도 여전히 통과해야 한다:
   `node --test scripts/review-gate/tests/` 전체 실행으로 회귀 확인.)
2. `phases/3-review-gate/index.json` step 3만 갱신 (규칙은 step0.md와 동일).

## Forbidden

- 실제 claude/codex 스폰 금지 — 이 스텝은 mock만. 이유: 라이브는 스텝 5
  스코프(PLANNING §1-3), 비용·비결정성 격리.
- `scripts/review-gate/**`·`phases/3-review-gate/index.json` 밖 수정 금지.
- 외부 패키지 금지 · SAP 연결 금지 · Do not break existing tests.
