# Step 5: drift-demonstration (out-of-band 변경 검출 실증)

## Read first

- `PLANNING.md` §4 · `DESIGN.md` §6(drift 정의)·§13 Phase 3 완료 기준
- `phases/4-gated-deploy/checks/check-drift.mjs` (증거 파일 기계 계약)
- `phases/4-gated-deploy/state/state.json` (green 캡슐 해시 — 원복용)

## Task

하네스 밖 채널의 서버 변경을 drift check가 검출함을 실증하고 원복하라.

1. 마커 문자열 생성(예: `" DRIFT-DEMO-<run_id>-<임의8자>`) — 기록.
2. **out-of-band 변경**: MCP 도구 `UpdateProgram`으로 서버의
   `ZSAH4_GL_LIST` 소스에 마커 주석 1줄을 삽입하고 `ActivateObjects`로
   활성화(SE80 수동 변경의 기계 등가 — 파일·게이트 밖 채널. PLANNING §4).
3. **검출**: `-- source read PROG ZSAH4_GL_LIST` →
   `state/drifted-server-read.txt` 저장. repo `src/zsah4_gl_list.prog.abap`와
   대조해 마커 라인이 diff로 드러남을 확인(= drift 검출 성공).
4. **원복(게이트 경로)**: step 3과 동일하게 `deploy-gate.mjs`(PASS 캡슐
   유효) 경유 재배포 → `-- source read` → `state/restored-server-read.txt`
   저장(마커 부재 확인).
5. `state/drift-evidence.json`: `{marker, out_of_band_channel:
   "MCP UpdateProgram+ActivateObjects", drift_detected:true, restored:true}`.

## Acceptance Criteria

index.json step 5의 verify(`check-drift.mjs` — 마커가 drifted에 있고
restored에 없으며 restored가 green) exit 0.

## Verification procedure

1. `summary`에 마커·검출 diff 1줄·원복 방법 기록.
2. `phases/4-gated-deploy/index.json` step 5 갱신.

## Forbidden

- repo `src/**` 수정 금지(서버만 드리프트시킨다 — drift 순수 격리).
- 원복을 `verify-sap -Write -- deploy` 직접 호출로 하지 말 것(게이트 경유
  원칙 — PASS 캡슐이 유효하므로 deploy-gate가 정상 경로).
- `$TMP`·`ZSAH4_GL_LIST` 외 서버 객체 접촉 금지. row-data 도구 금지.
