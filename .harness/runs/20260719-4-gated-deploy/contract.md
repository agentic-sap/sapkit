# Run Contract — 20260719-4-gated-deploy (Phase 3: Gated Deploy)

## Goal

무인 gated write 체인(리뷰 게이트 → 캡슐본 배포 → 채점)을 실물 1객체로 완주해
DESIGN §13 Phase 3 완료 기준과 리뷰 게이트 스펙 AC-8·AC-14·AC-15를 실증한다.
대상: `ZSAH4_GL_LIST`(G/L 계정 목록 REPORT, SKA1×SKAT, IDES S4H/100 `$TMP`).

## Success criteria

1. AC-8: 기계 검증 4층(lint·deploy/활성화·unit·ATC) 전부 green인 red(스펙
   요구 3 위반 — INNER JOIN)를 리뷰 게이트가 FAIL(비0)로 차단하고, 엔진 표준
   재시도의 수정본(LEFT OUTER JOIN)이 PASS — state.json에 FAIL verdict(MAJOR/
   B2)와 PASS 레코드가 다른 캡슐 해시로 공존.
2. 객체 1건이 전체 체인(deploy-gate 캡슐본 배포 → 활성화 → drift-clean →
   ATC → unit test)을 통과해 SAP에 실재(step 3·4 verify green).
3. drift check가 out-of-band 변경(MCP UpdateProgram — SE80 기계 등가)을 실제
   검출 후 게이트 경로 원복(step 5 verify green — check-drift.mjs).
4. AC-14: verification.json의 `uncovered_by_machine` ≥2가 캡슐에 동봉되어
   리뷰 입력이 됨. AC-15: 래퍼가 fetch한 서버 실측(`vsp source read`)이
   캡슐 verification에 동봉(프롬프트 v1.1 대조·IC 의무) — check-verification/
   check-phase-evidence로 기계 확인.
5. 소품 프로브 3건(transport read-only·ATC Error exit·CLAS include 배포)
   실측 기록(성공/불가 모두 정직 기록이 성공 조건).
6. 전 스텝 index.json 정직 기록(재시도·실패 포함) + run 종료 시 `$TMP` 프로브
   잔존물 0(본 산출물 ZSAH4_GL_LIST는 의도 잔존).

## Exclusions

- 무인 상시(headless unattended) write 개방 아님 — 이 런은 attended bridge
  1회이며, 상시 개방은 런 뒤 사용자 결정(5-11 재론).
- QA/PRD tier 접촉 금지(R-003) · row-data 도구(GetTableContents/GetSqlQuery)
  사용 금지 · `$TMP` 외 패키지 write 금지.
- 엔진(execute.py)·리뷰 게이트 스크립트(scripts/review-gate/** — 이 계획이
  동결한 config v1.1·deploy-shim 포함) 런 중 수정 금지.
- 동결 레포·`interactive/**`·`engine/**` 접촉 금지.

## Approved side effects

- SAP IDES S4H/100 `$TMP`: `ZSAH4_GL_LIST` 생성·red/green 갱신·drift 마커
  삽입과 원복(최종 = green 잔존). step 4 프로브 임시 객체
  (`ZSAH4_ATCPROBE`·`ZCL_SAH4_PROBE`)는 생성 후 당일 삭제·read-back 404.
- repo: `src/zsah4_gl_list.prog.abap` 신규(+프로브 임시 파일 생성·삭제),
  `phases/4-gated-deploy/**` 산출물·상태 파일.
- git: 엔진이 스텝 경계 커밋 수행(런 브랜치), push 없음.
