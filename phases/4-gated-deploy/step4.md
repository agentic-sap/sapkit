# Step 4: post-deploy-scoring (+ 소품 프로브 3건)

## Read first

- `PLANNING.md` §5 (스윕 A-19·A-20·A-3 편입) · `adapters/vsp/VERIFY-PATTERNS.md`
  §②·§⑤ · `adapters/vsp/COMMANDS.md` §④(transport)
- `phases/4-gated-deploy/state/verification.json` (green 기준)

## Task

배포된 green을 채점하고 소품 프로브 3건을 실측해
`state/probes-evidence.json`에 기록하라.

1. **채점**: `-- source read PROG ZSAH4_GL_LIST`(서버=repo 정합 — `git diff
   --no-index`로 전문 대조, 정규화 CRLF/LF만) · `-- test`(전 pass) ·
   `-- atc`(Error급 0). R-006(배포 후 source read) 이행.
2. **A-19 transport read-only**: `-- transport list` 1회 실측(read) — 시그니처·
   출력 요지 기록. `transport get`은 list가 반환한 실존 transport 있을 때만.
3. **A-20 ATC Error exit**: 의도적 Error급 유발 시도 — 임시 소스
   `src/zsah4_atcprobe.prog.abap`(예: 하드코딩 패스워드 리터럴 등 ATC 표준
   보안 체크 대상)를 스테이징 배포 → `-- atc PROG ZSAH4_ATCPROBE` exit·출력
   실측 → **IDES 기본 변형에서 Error급이 안 나오면 그 사실을 그대로 기록**
   (억지 금지) → 임시 객체 삭제 + read-back 404 확인 + 임시 파일 삭제.
4. **A-3 CLAS 테스트 include 배포 프로브**: 최소 클래스
   `src/zcl_sah4_probe.clas.abap` + 테스트 include
   `src/zcl_sah4_probe.clas.testclasses.abap`을 `-Write -- deploy`로 각각 시도 —
   지원/미지원(에러 원문)을 실측 기록 → 서버·로컬 잔존물 전량 삭제(read-back
   404).
5. `state/probes-evidence.json`: `{scoring:{drift_clean,test,atc},
   transport_readonly:"<요지>", atc_error_exit:"<요지>",
   clas_include_deploy:"<요지>"}`.

## Acceptance Criteria

index.json step 4의 verify(source read 재실측 → check-verification green →
test 재실행) exit 0.

## Verification procedure

1. 프로브 3건 결과를 `summary`에 각 1줄. 잔존물 정리(임시 객체 read-back
   404·임시 파일 삭제)를 명시.
2. `phases/4-gated-deploy/index.json` step 4 갱신.

## Forbidden

- `src/zsah4_gl_list.prog.abap` 수정 금지(green 동결). `$TMP` 외 write 금지.
- row-data 도구 금지. 프로브 임시 산출물을 남기고 종료 금지.
