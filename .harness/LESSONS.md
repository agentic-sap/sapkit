# Lessons

<!-- Append-only failure log (Memory Loop steps 1-3).
     Read when investigating a failure; not loaded by default.
     Entry format:

## L-NNN | YYYY-MM-DD | <area>
FAIL: what was attempted, what happened, exact error/symptom
CAUSE: root cause (verified: how)
RULE: -> R-NNN | not generalizable: why | unverified
-->

## L-001 | 2026-07-12 | vsp-clas-deploy
FAIL: Phase 2 connected 채점에서 CLAS ZCL_SAH2_WORKDAYS를 vsp deploy로 배포 — LOCK에서 modificationSupport="NoModification" 거부 + 시도마다 고아 ENQUEUE 잔존(SM12 수동 정리 반복). copy(ZIP·ZADT_VSP) 우회는 "1 success/EXIT=0" 보고하나 active·inactive 모두 소스 미기록(거짓 성공). MCP UpdateClass도 "ungültiges Sperr-Handle"(매번 새 핸들) 2회 실패.
CAUSE: (검증: 소스 대조 + SM12 클린 상태 재현 + source read/ADT inactive 조회) ① deploy — IDES가 CLAS 루트 lock에 NoModification 반환 + vsp NoModification 가드(업스트림 22517d4)가 실패 경로에서 unlock 누락. ② copy — 기존재 CLAS에 소스를 안 쓰고 성공 보고. ③ MCP — lock→중간 stateless 요청이 세션 롤백→PUT 시점 잠금 증발(vsp issue #88=423과 동일 메커니즘, 커넥션 재활용 시스템에서 발현). PROG 경로는 세 도구 모두 정상.
RULE: -> R-006

## L-002 | 2026-07-19 | sql-completeness
FAIL: Phase 3 검토 게이트 실증(phases/4-gated-deploy)의 ZSAH4_GL_LIST(G/L 계정 목록) 검증용 표본이 offline lint·활성화·ABAP Unit 5건·ATC를 전부 통과(green)했으나, 계정명 텍스트(SKAT)를 INNER JOIN으로 결합해 로그온 언어(sy-langu) 텍스트가 없는 계정이 결과에서 조용히 빠짐 — 스펙 완전성 요구("전 계정 표시") 위반. 기계 4층 어느 것도 미검출, 검토 게이트만 MAJOR/B2로 미통과 처리.
CAUSE: (검증: 캡슐 해시 대조 — red 862ca3b3의 47행 INNER JOIN → verdict FAIL/MAJOR/B2, green 3f678081의 47행 LEFT OUTER JOIN → verdict PASS, 소스 47행 JOIN 키워드가 유일 차이. 표본 결함이나 DESIGN §13 Phase 4 "의도적 주입으로 대체 가능" 근거로 승격 재료 유효) 마스터 데이터와 텍스트 테이블의 INNER JOIN은 텍스트 행이 없는 마스터 레코드를 결과에서 제거한다 — 다국어 텍스트 유지가 고르지 않은 시스템(KR 로컬라이제이션 포함)에서 조용한 데이터 누락.
RULE: -> R-007

## L-003 | 2026-07-19 | repo-sync
FAIL: 잔여 소진 스프린트 종결 후 사용자 지시로 git push — 거부(non-fast-forward). fetch 결과 원격 main에 주 머신이 07-13 공통 조상(8d09e571) 이후 쌓은 65커밋 실재(통합 보강 로드맵 S0~S6·자체 D-025~029·자체 엔진 4.13.12). 보조 머신(이 레포)도 같은 기간 65커밋 — 6일간 두 머신이 서로 모른 채 분기, 결정 로그 D-번호·엔진 버전 번호가 양쪽에서 독립 진행돼 자동 병합 불가(사람 감독 통합 필요). 사용자 정정: "pull하고 했어야".
CAUSE: (검증: git fetch·merge-base 실측 + 문서 대조 — CLAUDE.md "세션 시작 (필수)"는 HANDOFF/DESIGN 읽기만 요구, HANDOFF 규칙 "push는 사용자 요청 시에만"은 있으나 fetch/원격 대조 절차는 어느 문서에도 없음) 세션 시작 절차에 원격 분기 확인이 없어, 로컬 문서(HANDOFF)만 정본으로 믿고 6일치 작업을 쌓는 동안 원격의 병렬 줄기를 감지할 기회가 0회.
RULE: -> R-008
