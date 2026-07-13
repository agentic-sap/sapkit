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

- 2026-07-13 | 업스트림 핸드오프 작성 (opus 위임, 사용자 지시 "원본도 고칠 수
  있게") — `engine/UPSTREAM-FIX-HANDOFF.md` 신설: 영어 자립형(vsp-423 선례
  형식), 4.13.2~4.13.11 전량을 병리별 9섹션(증상 원문→root cause→수정 위치
  [서버 vs 클라이언트 패키지 구분]→테스트→라이브 검증) + 잔여 결함 7 + 적용·
  검증 절차. CHANGELOG 대조 누락 0, 게이트 통과. 부수 수리: CHANGELOG
  4.13.8 헤더 누락(4.13.9에 중첩) 발굴·수정. 신규 백로그 11-⑫ 등재 —
  잔여 create 경로 EN 하드코딩(포크 클론에서 번들 직편집 KO 핸드핵 발견 =
  실수요 실증, 원복 권장·근본 수리는 11-⑫). 다음 착수 ①을 11-⑪·⑫ 묶음으로
  확대(HANDOFF 헤더 반영)

- 2026-07-13 | **엔진 11-⑪·⑫ 수리 완료 (4.13.12, 1 Wave, 메인 워커)** — 착수 ①.
  **11-⑪**: 정독이 백로그 "1줄"을 확장 — table `runTableCheckRun`이 parse/throw
  안 해 AdtTable.check가 항상 errors:[] → 나쁜 update 무차단. 2편집(ddlCode 전달
  + parse/throw, structure 미러, check()에만 surgical). **11-⑫**: 8종 create
  언어 확장(Class·Interface·Program·Package·Table·Structure·SRVD·DDLX), DCL은
  도달불가 죽은코드로 제외. 회귀 테스트 2본 신설 + **역-검증 두 편집/스레딩 각각
  실측**(원복 시 FAIL). jest **599/0**(+19), build clean, 재번들 4.13.12 +
  verify-engine OK + capability **155 no-op**. **KR-DEV(KO) 라이브 red→green**:
  11-⑪ = 나쁜 DDL 구 번들 `success:true`(거짓 성공) → 신 번들 정직 에러+차단,
  good DDL 통과. 11-⑫ = KO 페이로드 create-수락 확인(class·table). 설명 readback은
  도구 한계(SearchObject 클래스 short text 미반환, CL_SALV_TABLE 대조 확인)로 불가
  — 페이로드 언어 역-검증(unit)+§5 라이브 메커니즘 재사용으로 근거. $TMP 4종 전량
  삭제 검증(Z*SAH412* 무결과)·고아 0. **새-컨텍스트 리뷰 PASS**(BLOCKER/MAJOR 0;
  MINOR = CheckTableLow 구조화출력 parity, 의도된 4.13.11 선례). 문서: CHANGELOG
  4.13.12 + UPSTREAM §5·§7 갱신 + Known-remaining #2 제거 + HANDOFF §6·헤더. 게이트:
  coverage/links/verify-engine/smoke155 green, doctor는 agy 드리프트 1건(1.0.16→
  1.1.1, 환경·무관·R-001)

- 2026-07-13 | **② 지식 문서 부트스트랩 완료 (D-020, 메인=오케스트레이션·작업=opus
  서브에이전트 위임)** — harness-docs Mode A 계약을 lock 커밋(8f7f13b) 절차문에서
  직접 소비(플러그인 이 머신 미설치). 산출: docs/PRD.md(55줄/3.6KB)·
  docs/ARCHITECTURE.md(87줄/6.1KB — 파일 지도는 실측 트리 기반, 미존재 항목은 "예정"
  표기) 신설 + D-020 append(D-012의 PRD·ARCHITECTURE 기각분 갱신, **ADR.md 미신설
  유지**). 주입 합계 33.5KB < 48KB, 중괄호 플레이스홀더 0. **새-컨텍스트 리뷰
  PASS**(opus, read-only — 엔진 주입 glob·48/64KB 수치까지 execute.py 실측 대조,
  HANDOFF/DESIGN 68/40KB 실측). 리뷰 발견 MINOR 2 수리 반영(게이트 블록→포인터,
  D-020 문구 3건 정정 후 append). 워커가 지시문 오류도 실측 정정(§8 "8규칙"→7개).
  HANDOFF §7·헤더 갱신

- 2026-07-13 | **③ Phase 3 선결 설계 완료 (D-021, 백로그 5-11 해소 — 메인=오케스트레이션,
  분석·검증·스펙=opus 서브에이전트 3왕복)** — harness-design 계약의 스코프드 적용.
  ① 분석: 엔진 실측(lock 8f7f13b)이 결정적 사실 확정 — 기존 `_run_review`는 완료
  마킹 *후* 실행+verdict 미소비(비게이트), 체인을 멈추는 유일한 것 = verify exit
  code; 나머지 선결 2건(0b 마커·§14-2 drift)은 기완료 판정. ② 독립 검증: 분석의
  (b) 원안(다음-스텝-verify)에서 **verdict 위조 창 BLOCKER 적중**(일반 step 세션
  full-write+원복 없음). ③ 정정 재검증: (b′) 자기-verify 구성 + 필수 3조항(등식형
  변경검사·검사 로직 인라인/sha256 핀·reviewed_head 바인딩)이면 조건부 성립 —
  엔진 승격(A)과 1:1 비교 후 A는 이연 판정(D-018 논리). **사용자 택1 = (b′) 강화판**
  (12살 설명 재제시 후 결정). 기록: 스펙 196줄(harness-design §5 계약 11섹션) +
  DESIGN v2.2(§8.3·§13, 선결 3건 전부 해소) + D-021 + HANDOFF §5-11 종결.
  에스코트 조항: 씨앗 결함 라이브 차단 1회 실증까지 사람 셰퍼딩

- 2026-07-13 | **Phase 3 A-청크 완료 — 무인 리뷰 게이트 구현 (메인=오케스트레이션,
  작업=opus×4+sonnet×2)** — 산출물: 검사기 `scripts/check-review-verdict.ps1`(필수
  3조항 구현, sha256 7B4F211F…FA0223) + 재현 테스트 `scripts/test-check-review-
  verdict.ps1`(13케이스 전건 통과) + `docs/reference/templates/`(review-step.md —
  트랙 B 12항목 이식+시맨틱 §13~15 신규 · review-verdict.schema.json ·
  review-gate-plan-conventions.md) + `adapters/vsp/SAFETY-PROFILES.md`(DESIGN §8.4
  4건 커버). 실측: AC1~4 로컬 테스트 **13/13** + **AC3 엔진 통합 재현 성립**
  (scratchpad 클론 실엔진: FAIL verdict→3회 재시도 소진→error 종료→write 스텝
  미도달, attempt_secs [26,48,42]) + **Assumption #1 일치**(PASS 경로 초과 dirty 0,
  제외 집합 개정 불요, 리뷰 스텝 verify 시점 attempt_secs [23]). 새-컨텍스트 리뷰
  (opus, read-only) **PASS — MAJOR 0, MINOR 2**: F1(실패 phase replan-proposal.md
  잔존이 다음 phase 게이트를 오탐시키는 경로 미문서화)은
  review-gate-plan-conventions.md §7 관례 명문화로 수리(제외 집합 확대는 타
  phase 경로 주입 표면이라 기각) / F2(검사기 reviewed_head 대소문자 관대, 스키마는
  lowercase)는 수용 편차로 기록(검사기 바이트 변경 시 "동일 바이트 검사기×실 엔진"
  증거 사슬 역사화 비용 > 정합 이득). GOAL 전 기준 [x] 충족

- 2026-07-13 | **Phase 3 B-청크 완료 — 커넥티드 실증(AC5 라이브 차단 + §13 완료
  기준 ①②③ 전부 실측)** — B-1 vsp 주 머신 빌드: lock 커밋 0b03ef2 재현 빌드,
  sha256 바이트 불일치(+3,072B, Go 경로 임베딩 아티팩트 판정)·기능 일치(--version
  정확 일치+오프라인 계약 스모크) → 사용자 결정: 수용 + lock에
  `binary_main_machine` 병기(164eb52). B-2 SAP: IDEA-JNC 프로파일(= IDES-DEV와
  동일 시스템의 이 머신 프로파일명 — S4H/100, ABAP 756, DEV tier. 이 머신 홈
  ~\.sah에는 IDEA-JNC·KR-DEV만 존재, IDES-DEV 명칭 없음). 주 머신 엔진 훅 설치
  (install_engine.py 병합, 트랙 B MCP 훅 3개 보존, ENFORCEMENT_ALIVE_OK 실측,
  경로 정정 43ccac5·aabcf1b) — **이 머신 트랙 A 무인 실행 최초 가동**(기존 실적은
  보조 머신). phase 3a-carrflt-seed(씨앗 INNER JOIN 결함 ZSAH3A_CARRFLT, opus):
  impl completed(attempts 2) → 리뷰 3회(209/257/306s) **전부 FAIL — B2/MAJOR로
  INNER JOIN을 file:line까지 적중**(리뷰어는 씨앗 메타 모름, 독립 대조) →
  REVIEW_GATE_FAIL exit 1 ×3 → error 종료, escort-write-deploy 미시작. 증거는
  feat-3a-carrflt-seed 브랜치에 봉인(2f5d2a2, main 미병합 — INNER 소스·L-002·
  replan-proposal 전부 branch만). phase 3b-carrflt-gated(정상 경로 LEFT OUTER,
  ZSAH3_CARRFLT+osql 단위테스트): impl 1회(136s)·리뷰 1회(156s) **PASS(findings
  0)** → completed → main ff 병합(c7a2d51). 에스코트 체인(사람 셰퍼딩, IDEA-JNC —
  deploy는 권한 계층 차단으로 사용자가 직접 실행): E1 deploy+activate
  **VERIFY_PASS** → E2 drift clean(유일 차이 = EOF 개행 정규화, 내용 동일) → E3
  ATC INFO 1건만(시간대 SLIN 캐시, phase 2 선례)·VERIFY_PASS → E4 unit **1
  passed/0 failed**(zero_flight_carrier_present — ZZ 0건 행 생존 기계 증명).
  drift SE80 검출: 사용자가 SE80에서 주석 1줄 추가+활성화(D1) → vsp source read
  재대조가 `+* drift test by SE80` 정확 검출(D2), 복원은 레포 정본 재배포(D3,
  메인 세션 확인). **DESIGN §13 완료 기준 ①②③ 전부 실측 충족** →
  D-021 에스코트 해제 조건(§13 조항) 성립. 단 SAFETY-PROFILES 무인 전환 3조건 중
  2번째(§⑥ 차단 검증 V1~V5+RV1~RV4 실측)는 **미수행 — 정직하게 미완 기록**.
  상세 원로그 = `phases/3b-carrflt-gated/scoring-raw.md`

- 2026-07-13 | **SAFETY-PROFILES §⑥ 차단 검증 실측 완료 — 에스코트 해제 3조건 전부
  충족** — V1(offline deploy, `Get-ChildItem Env:SAP_*` 0건 확인 후 실행): exit 1
  `ENV_FAIL: no SAP connectivity` 일치. V2(offline atc): 동일 ENV_FAIL 일치.
  V3(`vsp lint --file`, 무자격증명): exit 0 `No issues found` — offline lint는
  자격증명 없이 동작. V4(IDEA-JNC 자격증명 주입, read만): `source read`
  ZSAH1_WORKDAYS exit 0(전문 반환)·`health --package $TMP` exit 0(WARN은 기존
  객체 ATC 지적, 명령 자체 정상)·`verify-sap.ps1 -- atc` exit 0 VERIFY_PASS(INFO
  1). V5(정적 감사, 전 5 phase index.json): impl 5스텝 전부 `lint --file`,
  review-gate 2스텝(3a/3b) 전부 로컬 검사기 호출뿐(vsp 인자 0) — `deploy`
  유일 1건은 3a step2 `escort-write-deploy`(gated-write 전용 명명 스텝, 미도달)뿐,
  `copy`/`query`/`execute`/`source write` 전 phase 0건. RV1(3b 리뷰 세션
  산출물 전수): step1-output.json 세션 최종응답이 "no vsp write; no src/
  edits" 명시 + review.md도 diff/소스 정독뿐 — SAP 접촉 0건, 3a·3b 무인 실행은
  offline 스코핑(엔진 phase 셸에 SAP_* 미주입, 에스코트 체인은 별도 사람 주도
  셸)이라 접촉이 구조적으로 0. RV2(frozen verify 감사): check-review-verdict.ps1
  전문 grep(`vsp.exe|vsp-env|SAP_|deploy|copy|query|execute`) 매치 1건뿐(git
  rename 감지 주석, SAP copy와 무관) — SAP verb 0건. RV3: test-check-review-
  verdict.ps1 재실행 **13/13 PASS**(AC1(b) verdict+src 동시 dirty→exit 1 포함).
  RV4(음성 대조, 신규 배포 없이 기실측 인용): scoring-raw.md E1(IDEA-JNC 자격증명
  주입 셸에서 `verify-sap.ps1 -- deploy … '$TMP'` → VERIFY_PASS 성공)·D3(동일
  자격증명 상태 재배포 성공) 인용 → 리뷰 스텝이 같은 gated phase 승계 env를
  공유하므로 실제 호출했다면 동등 성공했을 것 = SAP-write 차단이 §④(자격증명
  부재)로 성립하지 않고 관례+package allowlist+에스코트 참관의 합임을 확정
  기록(갭은 없애지 않고 정직 문서화, §⑧ 알려진 한계로 존속). **결론**: DESIGN §13
  완료 기준 ①②③(2026-07-13 오전 B-청크 실증) + 본 §⑥ V1~V5/RV1~RV4 = 에스코트
  해제 3조건 전부 실측 충족 → SAFETY-PROFILES §⑦ "무인 전환 가능(2026-07-13
  실측 완료)" 명기. 무인 전환 실행 여부(RV4 갭 감수 vs 리뷰/write phase 분리
  선행)는 사용자 판단으로 남김(발명 금지). 문서 갱신: SAFETY-PROFILES.md §①·⑥·⑦.

## Next

- 사용자 확정 순서 전부 완료: ~~①~~ ✅ 4.13.12 → ~~②~~ ✅ D-020 → ~~③~~ ✅ D-021 →
  ~~Phase 3 A-청크~~ ✅ 무인 리뷰 게이트 구현 → ~~Phase 3 B-청크~~ ✅ 커넥티드
  실증(AC5 라이브 차단 + 완료 기준 ①②③ 전부 실측) → ~~SAFETY-PROFILES §⑥~~ ✅
  차단 검증 V1~V5+RV1~RV4 실측(에스코트 해제 3조건 전부 충족). **Phase 3 완료 +
  무인 전환 조건 전부 충족.** 다음 후보 = Phase 4(Domain Packs) 또는 무인 전환
  실행(RV4 갭 감수 여부 결정) 또는 소형 잔여 정리(엔진 11-⑩ 설계 판단 · doctor
  agy 핀 갱신 · vsp source read lock command_contract 편입 검토) — 사용자 판단 대기.

## Attempts & dead ends

<!-- one line per attempt, appended: date | task | what was tried | outcome -->
- 2026-07-11 | quality-gate | git status --porcelain(기본)로 미추적 수집 | 실패 — 신규 디렉토리가 "src/" 한 줄로 접혀 내부 .abap 미탐 → -uall로 수리
- 2026-07-11 | verify 래퍼 | powershell -File + `--file` 대시 인자 전달 | 실패 — PS 5.1 -File 모드 바인딩 오류 → 대시 인자는 -Command "& '...' -- <args>" 형태로 (VERIFY-PATTERNS 주의 기록)
- 2026-07-11 | lint 실측 | 규칙 7종 스니펫별 exit code | E 4종(line_length>255·empty_statement·max_one_statement·preferred_compare_operator), W 3종(obsolete·colon·naming, len 120~255도 W) — §14-8 --strict 검토 근거
- 2026-07-11 | 실패 패턴 | 403을 ENV로 분류하던 휴리스틱 | 실측상 403의 유일 사례가 ENQUEUE 락 — LOCK 우선 검사로 교정
- 2026-07-11 | deploy | 문법 오류 소스 deploy | 오류에도 객체 생성됨(exit 1이지만 서버 잔존) — 배포 성공≠코드 정상, $TMP에 ZSAH0B_BROKEN 잔존
- 2026-07-13 | AC3 엔진 재현 | 클론 엔진을 스크래치패드에서 그대로 재현 실행 | 환경 전제 3가지 필요 실측 — core.longpaths 설정·.claude 훅은 gitignored라 install_engine.py --target 정식 설치 필요·quality-gate.json의 vsp.exe 부재 시 fail-closed 기동 거부 → 전제 충족 후 재현 성립
- 2026-07-13 | 리뷰 게이트 dirty 검사 | AC3 재현 중 실패 phase 다음 phase 실행 | 실패 phase의 replan-proposal.md가 wip 커밋 **후** 생성돼 untracked 잔존 → 다음 phase 게이트 오탐 FAIL(F1, 재시도 3회 소음) → review-gate-plan-conventions.md §7 관례로 수리
- 2026-07-13 | 검사기 verify 명령 구성 | verdict 경로를 verify 명령 문자열에 포함 | 세션의 verdict 기록이 verify-surface WARN으로 찍힘(엔진의 위임 타겟 변경 감지, execute.py:614-618) — 비차단 예상 소음으로 판정
- 2026-07-13 | 주 머신 첫 무인 기동 | 엔진 훅 미설치 상태로 스텝 실행 시도 | fail-closed 거부(quality-gate.json이 vsp.exe/훅 부재 감지 — 보조 머신만 설치돼 있었음) → install_engine.py 병합 설치로 해소(트랙 B MCP 훅 3개 보존)
- 2026-07-13 | 에스코트 셸 명령 구성 | `!` bash 프롬프트에서 PowerShell dot-source(`. .\scripts\vsp-env.ps1`)+대시 인자를 직접 실행 | 실패(bash 파서가 PS 전용 구문을 오분해) → 전체를 `powershell -NoProfile -Command "..."` 한 겹으로 감싸 해소
