# Step 1: machine-blindness-evidence

## Read first

- `phases/4-gated-deploy/spec.md` · `PLANNING.md` §2·§3
- `src/zsah4_gl_list.prog.abap` (step 0의 red)
- `adapters/vsp/VERIFY-PATTERNS.md` §④(래퍼 경유 규약)·§⑤(안티패턴)
- `phases/4-gated-deploy/checks/check-verification.mjs` (증거 파일의 기계 계약)

## Task

red 소스가 **기계 검증 4층(offline lint · deploy+활성화 · unit test · ATC)을
전부 green으로 통과**함을 실측하고, 그 증거 + 서버 실측을
`phases/4-gated-deploy/state/verification.json`으로 남겨라(AC-14·AC-15 재료).

1. 사전: `powershell -Command "& 'scripts\verify-sap.ps1' -- search ZSAH4"`로
   서버 잔존물 0건 확인(잔존 시 blocked 보고).
2. 스테이징 배포: `powershell -Command "& 'scripts\verify-sap.ps1' -Write --
   deploy src/zsah4_gl_list.prog.abap '$TMP'"` — VERIFY_PASS 확인. (게이트 전
   스테이징은 PLANNING §2가 승인한 증거 수집 목적 — 최종 상태는 S3 캡슐본이
   덮어쓴다.)
3. `-- test PROG ZSAH4_GL_LIST`(전 케이스 pass)·`-- atc PROG ZSAH4_GL_LIST`
   (Error급 0 — finding 요약 기록)·`-- source read PROG ZSAH4_GL_LIST`(서버
   실측 원문 캡처) 실행.
4. `state/verification.json` 작성 — 형식은 check-verification.mjs가 요구하는
   그대로: `machine_checks.{offline_lint,deploy_activation,unit_test,atc}`
   (각 cmd·exit·수치), `covered_types[]`, **`uncovered_by_machine[]`(≥2 —
   최소: "JOIN 결합의 데이터 완전성(스펙 요구 3)은 어느 기계층도 검증 안 함",
   "AUTHORITY-CHECK 런타임 실효성은 HARMLESS 단위테스트가 미발동")**,
   `server_evidence.vsp_source_read{object, content(원문 전체), sha256_normalized}`.
   content는 red 소스이므로 INNER JOIN이 그대로 보여야 한다.

## Acceptance Criteria

index.json step 1의 verify 명령(배포→test→atc→check-verification.mjs red) exit 0.

## Verification procedure

1. AC 체인 각 단계 exit·마커 확인, 수치( pass/fail·finding )를 `summary`에 기록.
2. "기계 4층 전부 green인데 스펙 요구 3 위반이 실재"함을 `summary`에 1줄 명시
   (AC-8 전제 문장).
3. `phases/4-gated-deploy/index.json` step 1 갱신(completed/error/blocked).

## Forbidden

- `src/zsah4_gl_list.prog.abap` 수정 금지(red 보존 — 수정은 S2 재시도 워커의
  몫). `spec.md` 수정 금지.
- `$TMP` 외 패키지 write 금지 · row-data 도구(GetTableContents/GetSqlQuery)
  호출 금지.
- verification.json 수치 조작 금지 — 실행 원문에서만 전사(§⑤ 오라클 불신:
  content는 반드시 `source read` 실출력).
