# Step 3: deploy-gate (캡슐본 배포 — 3중 바인딩)

## Read first

- `phases/4-gated-deploy/state/state.json` (`pass_records`의 green 캡슐 해시)
- `scripts/review-gate/deploy-gate.mjs` 헤더 주석 · `deploy-shim.mjs`
- `PLANNING.md` §1(R1 — shim 존재 이유)·§6

## Task

**게이트 경로로만** green을 배포한다 — 이 스텝의 작업은 검증 준비뿐이다:

1. `state.json`의 `pass_records`에 캡슐 해시가 정확히 1개 있는지, 그 캡슐
   디렉터리(`state/capsules/<hash>/`)가 실재하고 `files/0/zsah4_gl_list.prog.abap`
   이 워킹트리 `src/zsah4_gl_list.prog.abap`과 바이트 동일한지 확인하라
   (다르면 blocked — 3중 확인이 어차피 거부한다).
2. 상태를 확인만 하고 completed로 보고하라 — 엔진 verify가 `deploy-gate.mjs`를
   실행해 ① 캡슐 무결성 ② PASS 레코드 ③ 워킹트리 일치 3중 확인 후 **캡슐
   사본을** `deploy-shim.mjs` 경유로 `$TMP`에 배포한다(exit 0 = 배포 수행).

## Acceptance Criteria

index.json step 3의 verify(deploy-gate 3중 확인 + 캡슐본 배포) exit 0.

## Verification procedure

1. verify 후 `summary`에: 사용된 캡슐 해시 · deploy-gate stdout 요지(배포
   성공 라인) 기록.
2. `phases/4-gated-deploy/index.json` step 3 갱신.

## Forbidden

- `verify-sap.ps1 -Write -- deploy`를 **직접 호출 금지** — 이 스텝의 배포는
  반드시 deploy-gate(3중 확인) 경유. 이유: 게이트 우회 배포는 이 phase의
  존재 목적을 부정한다.
- `src/**`·`spec.md`·게이트 스크립트 수정 금지. `$TMP` 외 write 금지.
