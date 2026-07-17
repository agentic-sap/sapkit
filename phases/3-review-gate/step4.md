# Step 4: deploy-gate

## Read first

- `phases/3-review-gate/PLANNING.md` §3.1(exit 1의 바인딩 불일치 사유 코드)
- `docs/reference/designs/2026-07-17-phase3-review-gate.md` §4.1-7(3중 확인·
  캡슐본 배포)·AC-4
- `phases/3-review-gate/index.json` step 0·2·3의 `contract`

## Task

### 1. `scripts/review-gate/deploy-gate.mjs` — 배포 래퍼 CLI

`node deploy-gate.mjs --unit <unit.json> --state <stateDir> --capsule <capsuleDir>
--deploy-cmd "<명령 템플릿>"`

플로 (스펙 §4.1-7 — 3중 확인 후에만 배포):

1. state 로드(손상 → exit 6).
2. `verifyCapsule(capsuleDir)` — `ok: false` → **exit 1**, stderr에
   `CAPSULE_TAMPERED`.
3. 캡슐 해시로 `pass_records` 조회 — 없음 → **exit 1**, `NO_PASS_RECORD`.
4. 워킹트리 대조 — unit.files의 현재 워킹트리 각 파일 해시 = 캡슐 manifest
   해시. 불일치 → **exit 1**, `WORKTREE_DRIFT` (+ 어떤 파일인지).
5. 전부 통과 → **캡슐 사본 경로**를 `--deploy-cmd` 템플릿의 `{file}` 자리에
   치환해 파일별로 실행 (워킹트리 경로 금지 — 캡슐본 배포가 계약).
   명령 exit 비0 → 그대로 전파. 전부 0 → exit 0.
6. top-level catch → exit 6.

### 2. `scripts/review-gate/tests/deploy-gate.test.mjs` (node:test)

mock 배포 명령(`tests/mocks/deploy-recorder.mjs` — 받은 인자·파일 내용 해시를
기록 파일에 남기고 exit 0)으로:

1. 정상 — PASS 레코드·무결 캡슐·일치 워킹트리 → exit 0 + recorder가 받은
   경로가 **캡슐 내부 경로**이고 내용 해시가 캡슐 manifest와 일치.
2. AC-4 — PASS 후 워킹트리 파일 1바이트 변경 → exit 1 + `WORKTREE_DRIFT` +
   recorder 미실행(기록 파일 부재).
3. PASS 레코드 없음 → exit 1 + `NO_PASS_RECORD` + 미실행.
4. 캡슐 사본 변조 → exit 1 + `CAPSULE_TAMPERED` + 미실행.
5. state.json 손상 → exit 6 + 미실행.
6. 배포 명령이 exit 3을 반환하는 mock → deploy-gate exit 비0 전파.

## Acceptance Criteria

```
node --test scripts/review-gate/tests/deploy-gate.test.mjs
```

## Verification procedure

1. AC 명령 exit 0 + `node --test scripts/review-gate/tests/` 전체 회귀 통과.
2. `phases/3-review-gate/index.json` step 4만 갱신 (규칙은 step0.md와 동일).

## Forbidden

- **실 vsp 실행 금지** — 배포 명령은 mock만. 이유: 이 phase는 SAP write 0
  (PLANNING §2), 무인 write 금지(5-11)는 게이트 구현·실증 완료 전까지 유효.
- 워킹트리 경로를 배포 명령에 전달 금지 — 캡슐본만. 이유: 스펙 §4.0 TOCTOU 제거.
- `scripts/review-gate/**`·`phases/3-review-gate/index.json` 밖 수정 금지.
- 외부 패키지 금지 · Do not break existing tests.
