# State

<!-- Durable task memory (Task Loop steps 3 and 5). Keep it small: fold
     older entries into one-line summaries (see PROTOCOL.md Maintenance). -->

## Done

- 2026-07-11 | harness-tailor 산출물 배치 (사용자 승인분) — quality-gate 래퍼 2종
  (scripts/quality-gate-sap.ps1·verify-sap.ps1) + .claude/quality-gate.json(추적화) +
  VERIFY-PATTERNS 스텁 + RULES R-001~R-005 시드. 게이트 차단 실증 0→1→0 완료
  → **Phase 0a 완료 기준 3항목 전부 충족** (DESIGN §13). GOAL.md 전 기준 검증 통과.
- 2026-07-11 | Phase 0b 완료 — §16-2 연결(vsp-env.ps1) + COMMANDS.md 전수 실측 +
  실패 패턴 실측(ENV4·CODE2·LOCK 실재현)→verify-sap.ps1 마커 완성 + §14-2/3/9 판정 +
  VERIFY-PATTERNS 정본. GOAL 전 기준 충족
- 2026-07-11 | Phase 1 완료 — 커버리지 표(ABAP 부분 실효·CDS/BDEF 무의미·AMDP 본문
  불투명) + domain/abap 시드(S-001~025 + CHECKLIST) + **무인 엔진 첫 완주**
  (1-workdays-util, bridge 드라이버, 2 steps 각 1회 시도·verify 실패 0, 사후 리뷰
  하드 위반 0) → src/zsah1_workdays.prog.abap (테스트 클래스 먼저 — 스텝 경계로 기계
  증명). lint Error 차단 실증은 Phase 0a의 0→1→0 기록으로 충족. GOAL 전 기준 충족

- 2026-07-11 | Phase 1.5 완료 — **red/green 서버 실증**: 스텁 deploy→5 FAIL(red),
  최종본 deploy→**5 PASS(green)** — 무인 산출물의 정확성 실채점 확인. ATC 1건
  (INFO, exit 0 규약 재확인). **완료 기준 충족**: ENDIF 누락 소스가 offline lint
  exit 0 → connected deploy CODE_FAIL exit 1 (검출 1건 실증). 발견: vsp test가
  REPORT 로컬 테스트 클래스 지원 확인(Phase 3 red/green 루프 성립 근거), 문법 오류
  deploy는 깨진 잔존이 아니라 빈 스켈레톤 롤백(0b 서술 정정 — VERIFY-PATTERNS 반영)

- 2026-07-12 | Phase 2 계획 수립 — IDES-DEV read-only 답사(sonnet 위임, 원로그
  phases/2-duedate-reuse/recon-raw.md) → **답사가 계획 결정 3건 변경**(대상 객체
  CLAS+PROG 2개로 / 테스트 리포트 배치+deploy 순서 클래스 먼저 / 분석 스코프 객체
  단위) → PLANNING.md 기록(§13 완료 기준 "계획 문서 기록" 충족). 스텝 2개(계약+
  테스트 먼저 → calc 이식) 생성, D-4 린트 통과(경로 실재·맥락 표현 0·verify 체인
  CHAIN_EXIT=0 실증). offline lint가 .clas.abap에도 동작 실측(verify 전제).

- 2026-07-12 | Phase 2 완료 — 무인 완주(사용자 직접 기동, 2 steps attempts 2/2·
  verify 실패 0, 사후 리뷰 위반 0) + connected 채점 **vsp test 5 PASS/0 FAIL**
  (ATC INFO만, graph가 ZCL 참조 포착). 채점 중 CLAS 배포 3결함 실측·기록:
  vsp deploy LOCK NoModification+잠금 누수, vsp copy 거짓 성공(→L-001/R-006,
  COMMANDS.md ⑤-6/7), 엔진 UpdateClass 423 계열 병명 규명(HANDOFF §6 백로그 4).
  클래스는 GUI 수동 주입, 리포트·테스트는 vsp 체인. 잔존 +2(ZCL_SAH2_WORKDAYS·
  ZSAH2_DUEDATE)

- 2026-07-12 | 수리 스프린트(사용자 지시, Phase 2 채점 발견분) — ① vsp 잠금 누수:
  NoModification 가드에 unlock 추가(vsp-custom 00b4b21, sonnet 위임), 라이브 검증
  연속 2회 시도 잔존 잠금 0, vsp.lock v2.38.1-87 갱신. ② 엔진 UpdateClass 423 계열:
  4.13.3 — lock 직후 setSessionType('stateful') 1줄(opus 위임), jest 439+회귀(역검증),
  번들 반영(런북), **IDES 라이브 red→green**(당일 실패 호출이 updated+activated).
  잔여: UpdateInterface/UpdateProgram 동일 잠복(HANDOFF §6 백로그 9), vsp
  RenameObject 누수 후보, CLAS deploy NoModification 근본(3번 — 조사 후 결정 대기)

- 2026-07-12 | 수리 3 완료 — 조사(opus 위임: vsp vs 엔진 lock 흐름 대조로 원인
  특정) → 라이브 프로브(Accept v1/v2 동일 NoModification = 가드 오탐 H1 확정) →
  수리(sonnet 위임): ① 가드 경고 강등+진행(vsp 8279a7c) ② copy 5함수
  result.Success 검사+배너 정직화(322320f). 라이브 검증: **deploy CLAS
  "Successfully updated and activated" 최초 완주** + copy 소스 실기록 정직 성공.
  vsp.lock v2.38.1-89, §14-4 CLAS 개통, R-006 개정(수리 반영). 잔여: RenameObject
  누수 후보(COMMANDS ⑤-6), 엔진 UpdateInterface/UpdateProgram 잠복(§6 백로그 9)

- 2026-07-12 | 백로그 5-7 완료 (트랙 B, opus 위임) — install-sap-assets.md 신설
  (동결 원본 wizard-step-09 이식 — 게이트 로직 6종 보존, 동봉 실재 22파일만 참조,
  zrfc/_EXT 미동봉 명시) + 3계열 SKIPPED 규칙 기입측·소비측 반영 + 매니페스트 갱신.
  1차 새-컨텍스트 리뷰(opus) FAIL — 소비측(review-checklist known_outages 범위)
  누락 검출 → 수리 → 2차 PASS. 부수: doctor.mjs 사각지대 수리(.py 훅 인식 +
  CLAUDE_PROJECT_DIR 치환 — FAIL 5건이 전부 오탐이었음 실증). 게이트 5종 green

- 2026-07-12 | vsp RenameObject 잠금 누수 수리 (sonnet 위임) — 구객체 삭제 실패
  경로에 unlock 추가(7a2ef66, 00b4b21 동일 패턴·원 에러 보존). pkg/adt lock 사이트
  감사 추가 누수 0. 검증은 코드 리뷰 수준(RenameObject 테스트 전무 실측 —
  build/vet/test green, 라이브 재현 미실시)으로 한계를 COMMANDS ⑤-6에 명기.
  vsp.lock v2.38.1-90 갱신

- 2026-07-12 | 엔진 4.13.4 — UpdateInterface·UpdateProgram 잠금 세션 유지 (opus
  위임, HANDOFF §6 백로그 9 해소) — 4.13.3과 동일 1줄(lock 직후 stateful 핀) +
  회귀 테스트 2본(역-검증). jest 515/0, 런북 재번들(capability diff no-op),
  **IDES 라이브 red→green 양 핸들러**(구 번들 Sperr-Handle 재현 → 신 번들 완주,
  $TMP 한정·임시 객체 정리). 동일 시그니처 스캔이 UpdateView 등 후보 발굴 →
  신규 백로그 10(감사)로 이관

- 2026-07-12 | vsp 전수 감사 완료 (sonnet 위임, 사용자 "vsp 다 수정" 지시) — 잠금
  지점 24곳 + 비ADT 흐름 전수 판정표. 추가 누수 1건 수리(ExecuteABAP 정리 경로:
  delete 실패 시 unlock + CleanedUp 정직화) + 거짓 성공 4건 수리(devops 설치 루프
  2·MCP 설치 핸들러 2 — WriteSource Success=false 무시하고 OK 출력, 322320f 계열).
  커밋 0b03ef2, lock v2.38.1-91. 잔존(수리 불가 문서화): LockObject parseLockResult
  실패 경로는 핸들 부재로 클라이언트측 unlock 불가. report-only 판단 유보 3건
  (runExecute exit 0·Rename 부분 성공·CreateClassWithTests)은 COMMANDS ⑤-6 기록.
  touched 패키지 테스트 green(실패 3패키지는 clean HEAD 동일 — 환경성 실증)

- 2026-07-12 | 엔진 4.13.5 — 백로그 10 전량 (opus 위임, 사용자 "발굴분도 수리"
  지시) — Update 핸들러 10종 stateful 핀 + 계열 테스트 10케이스(역-검증), jest
  525/0, 런북 재번들. 라이브 red→green: Table·Domain 423 재현→해소. PUT-first
  계열(FM·SRVD·DDLX·BDEF)은 라이브 미재현이나 unlock 노출+프로토콜 정본 근거로
  핀 유지. $TMP 임시 객체 8/8 정리, 고아 잠금 0. 감사 부산물 7건(Create 계열
  동일 병리 **라이브 실증** 포함) → HANDOFF §6 백로그 11 기록. 별건: 업스트림
  사용자용 vsp-423-fix-handoff.md에 §3c(오늘 vsp 수리분, 포크 전용 파일 제외
  검증) 추가

- 2026-07-12 | 엔진 4.13.6 — 백로그 11-① Create 계열 (opus 위임) — 수리 6종
  (핀 5 + CreateInclude의 lock 직후 stateless 리셋 제거), 재스캔이 raw-lock 2종
  추가 발굴(CreateInclude 수리·CreateTextElement는 별개 병리로 11-⑦ 편입).
  CreateStructure는 죽은 잠금 쌍(무수리, 11-⑨). 테스트 6케이스 역-검증, jest
  531/0, 재번들. 라이브: CreateDomain·CreateDataElement red 423 → green 423
  소멸. 신규 발굴: 로그온 언어 불일치 결함(라이브 확정, 11-⑧ — 잠금 수리 후
  지배적 차단 요인). $TMP 잔존물 0·고아 잠금 0 검증. 누적 19 핸들러(4.13.3~6)

- 2026-07-12 | 5-5 우선분 완료 (sonnet 위임) — fetch 스크립트 2종을 동결 원본에서
  `interactive/tools/fetch/`로 이식(순수 stdlib·private 결합 0, 실동작 증명:
  ABAP 키워드 문서 + SAP Help 실fetch). sap-doc-specialist 페르소나의 깨진
  "bundled" 참조 해소 + help-portal-fetch/spro-lookup 경로 갱신 + 매니페스트
  deferred→copy 재분류. 부수: 동결 레포에 전역 sc4sap 플러그인이 남긴 런타임
  로그 드리프트(.sc4sap/state/) 실측 → 매니페스트 obsolete 규칙 추가로 게이트
  복구. 나머지 deferred(extract 2종·sap-profile-cli)는 유지

- 2026-07-12 | 5-8 필수분 완료 (opus 위임, IDES 라이브) — **Codex approval_mode
  fail-open 실증**(prompt 설정에도 T000 실데이터 반환 — 승인 방식 신뢰 불가) →
  row-data 2종은 `disabled_tools` 하드 차단만 실효, 어댑터 README에 필수 설정
  정본화. AG excludeTools는 문서 수준 기록(미실증 — 승격 대기). launch.cjs 필터
  대안은 백로그. 평시 OFF 복원 검증(toggle off·mcp remove·config 청정). 잔여
  5-8 하위 2건(required_capabilities·smoke write 판정)은 [낮음] 유지

- 2026-07-12 | 엔진 4.13.7 — 백로그 11-② 래퍼 내부 stateless 누수 (opus 위임,
  사용자 "full로 끝까지" 스프린트 Wave 1/5 — GOAL.md) — vendored client 직접
  패치를 patch-package로 정본화(engine/patches/, npm install 자동 재적용):
  Local 4계열 create+update 풀체인 재핀·updateTestClasses 리셋 제거 +
  **UpdateBehaviorImplementation 4.13.5 목록 누락 추가 발굴·수리**. 회귀 7케이스
  (역-검증 — 패치 원복 시 전부 FAIL 실측), jest 538/0, 재번들(capability no-op),
  라이브 red→green(UpdateLocalTestClass $TMP — 구 번들 423 → 신 번들 완주),
  $TMP 정리·고아 잠금 0. 새-컨텍스트 리뷰(opus) PASS(BLOCKER/MAJOR 0). 신규
  발굴: Delete 로컬 계열 4종 클라이언트 레벨 항상 실패(선재 결함 → 백로그
  11-⑩), 미도달 풀체인 동일 결함은 upstream 수리 후보

- 2026-07-12 | 엔진 4.13.8 — Wave 2/5 CT 협상 계열 (opus 위임) — 11-③
  UpdateFunctionGroup raw PUT에 4.13.1 discovery 협상 적용(잠금 전 협상·v3
  폴백·legacy 스킵), **라이브 red 415→green**(read-back masterLanguage=CS).
  구 3-7 상수 비대칭은 흡수 해소 판정(도달 가능 FUGR 쓰기 경로 전부 협상 —
  vendored 폴백은 도달 불가 죽은 코드, 미수정 근거 CHANGELOG). 11-④ CreateView
  400은 원인 확정·이관 — CT 계열 아님, 언어 불일치(11-⑧ 뿌리, vendored
  language="EN" 하드코딩) + 쉘 잔류 없음(구 서술 정정) + handleCreateView가
  ADT 에러 body를 버리는 부수 결함 발굴(11-⑧에서 함께). jest 540/0(역-검증),
  capability no-op, 게이트 5종 green, 새-컨텍스트 리뷰(opus) PASS. $TMP
  실삭제 검증·고아 잠금 0

- 2026-07-12 | 엔진 4.13.9 — Wave 3/5 정직성 계열 (opus 위임) — ① 구 3-5:
  `/deletion/delete` 계열 **공통 뿌리 수리** — vendored 공용 헬퍼(patch-package)
  로 delete 12종 일괄 정직화 + 캐스케이드 배열 정규화(라이브 발굴) + 인식 불가
  body HTTP 폴백. 라이브 red(잠긴 FUGR 삭제 거짓 성공+잔존)→green(SAP 메시지
  정직 실패)+정상 삭제 무영향. ② 구 3-3: CreateProgram 미지원 4타입 사전 거부
  +enum 6→2, 라이브 red(가짜 REPORT)→green(거부+미생성). compact 경로는 수리
  상속(리뷰 검증), CreateProgramLow 잔여. ③ 11-⑨: 죽은 잠금 쌍 제거, 동작
  동일. jest 556/0(역-검증 전 항목), capability no-op, 게이트 5종 green,
  새-컨텍스트 리뷰(opus) PASS(MINOR 2 — CHANGELOG 과대 기술 정정 완료).
  $TMP 정리·실삭제 검증(SearchObject 잔존 1) — **ZSAH39_FGL 세션 잠금 잔존**
  (red 재현용 SIGKILL 산물, SAP 세션 타임아웃 자동 해소·SM12 정리 가능,
  기능 영향 0 — 스프린트 종료 시 해소 재확인). 부수: 에이전트 잔존 정리
  루프 프로세스 종료(메인). 별건: fewer-permission-prompts로 게이트 5종
  Bash/PowerShell 정확 형태 10건을 .claude/settings.json allow에 추가

- 2026-07-12 | 엔진 4.13.10 — Wave 4/5 언어 계열 (opus 위임, 세션 한도로 1회
  중단→재개) — ① 11-⑧(+11-④ 본수리): 로그온 언어 동적 해석(systeminformation
  실측 CS → resolveLogonLanguage, 캐시·EN 폴백) + Create 3종 주입 + vendored
  master_language 수용(patch 32파일) + patchXmlAttribute opt-in add-if-missing
  → 라이브 red→green 3종(View 400 소멸·Domain/DTEL description 착지) + **구
  번들이 남긴 반쪽 스켈레톤 2건 Update 복구 실증**(영구 불구 해소). ② 11-⑥:
  already-exists 판별을 기계 식별자 우선(타입→T100 SWB_TOOL/016[실측]→다국어
  폴백)으로 재설계 — 사용자 "동적 적용" 지시 반영, 라이브 red(독어 오분류
  거부)→green. ③ CreateView 에러 body 전달(형제 판정표 기록). jest 572/0
  (역-검증 3계열), capability no-op, 게이트 5종 green, 새-컨텍스트 리뷰(opus)
  PASS(MINOR 2 관찰만). $TMP 5종 실삭제 검증·고아 잠금 0. 잔여 관찰:
  add-if-missing 추가 description GET 비직렬화(백로그 후보, HANDOFF 11-⑧ 기록)

- 2026-07-13 | 엔진 4.13.11 — Wave 5/5 조사·확장 계열 (opus 위임) — ① 11-⑤:
  원인 확정 = vendored AdtStructure.check의 ddlCode 조용한 드랍(새 DDL 대신
  저장본 검사 — 빈 에러·PUT 불투명 실패 공통 뿌리, 미구현 아님). 수리 =
  check-with-source 전달(+저수준 CheckStructure ddl_code 경로 부활) + bare
  에러 상태 폴백. 라이브 red(불투명 Kein Sichern)→green(진짜 원인 사전
  표면화+정정 DDL 완주). ② 구 3-6: low 3종+CDS 리더 3종을 4.13.1 클래식
  헬퍼 재사용으로 전환(계약·스키마 보존), 라이브 red 404→green(실 runResult,
  --exposition low 실증). jest 580/0(역-검증 양방향), capability no-op(155),
  게이트 5종 green, 새-컨텍스트 리뷰(opus) PASS — 리뷰가 동류 1건 추가 발굴
  (AdtTable.check 동일 드랍 → HANDOFF 11-⑪). $TMP 2종 실삭제 검증·고아
  잠금 0

- 2026-07-13 | **엔진 수리 스프린트 종결** (GOAL.md 전 기준 충족) — 목표
  11건/5 Wave 전량 해소(4.13.7~4.13.11), Wave별 리뷰 5/5 PASS, 라이브
  red→green 누적 12건+, jest 538→580(실패 0 유지). Wave 3 잔존물
  ZSAH39_FGL은 삭제 완료 확인(read-back not found — 정리 루프가 종료 전
  성공). 신규 백로그 11-⑩·⑪ + 관찰 2건 HANDOFF 등재. HANDOFF 헤더 정리
  (다음 착수 후보 3안 — 사용자 판단)

## Next

- 스프린트 완료 — 다음 착수는 사용자 판단 (HANDOFF 헤더 후보 3안): ① 트랙 A
  Phase 3 선결 3조건(5-11 리뷰 게이트 편입 등) ② 엔진 신규 백로그(11-⑩·⑪)
  ③ 트랙 A 지식 문서 갱신(harness-docs — 세션 시작 알림 2회째)

## Attempts & dead ends

<!-- one line per attempt, appended: date | task | what was tried | outcome -->
- 2026-07-11 | quality-gate | git status --porcelain(기본)로 미추적 수집 | 실패 — 신규 디렉토리가 "src/" 한 줄로 접혀 내부 .abap 미탐 → -uall로 수리
- 2026-07-11 | verify 래퍼 | powershell -File + `--file` 대시 인자 전달 | 실패 — PS 5.1 -File 모드 바인딩 오류 → 대시 인자는 -Command "& '...' -- <args>" 형태로 (VERIFY-PATTERNS 주의 기록)
- 2026-07-11 | lint 실측 | 규칙 7종 스니펫별 exit code | E 4종(line_length>255·empty_statement·max_one_statement·preferred_compare_operator), W 3종(obsolete·colon·naming, len 120~255도 W) — §14-8 --strict 검토 근거
- 2026-07-11 | 실패 패턴 | 403을 ENV로 분류하던 휴리스틱 | 실측상 403의 유일 사례가 ENQUEUE 락 — LOCK 우선 검사로 교정
- 2026-07-11 | deploy | 문법 오류 소스 deploy | 오류에도 객체 생성됨(exit 1이지만 서버 잔존) — 배포 성공≠코드 정상, $TMP에 ZSAH0B_BROKEN 잔존
