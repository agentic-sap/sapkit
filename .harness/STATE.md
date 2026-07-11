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

## Next

- Phase 2 무인 기동(사용자 승인 대기): `python scripts/execute.py 2-duedate-reuse`
  — bridge + sonnet 워커 권장, harness-run 셰퍼딩. 완주 후 connected 채점
  (PLANNING.md §5: deploy ZCL→ZSAH2→test 5 PASS→ATC, CTS 무관 $TMP) 후 Phase 2
  완료 판정. Phase 3(Gated Deploy) 선결 = 백로그 5-11(무인 gated write 전 리뷰
  게이트 편입) 포함 3조건

## Attempts & dead ends

<!-- one line per attempt, appended: date | task | what was tried | outcome -->
- 2026-07-11 | quality-gate | git status --porcelain(기본)로 미추적 수집 | 실패 — 신규 디렉토리가 "src/" 한 줄로 접혀 내부 .abap 미탐 → -uall로 수리
- 2026-07-11 | verify 래퍼 | powershell -File + `--file` 대시 인자 전달 | 실패 — PS 5.1 -File 모드 바인딩 오류 → 대시 인자는 -Command "& '...' -- <args>" 형태로 (VERIFY-PATTERNS 주의 기록)
- 2026-07-11 | lint 실측 | 규칙 7종 스니펫별 exit code | E 4종(line_length>255·empty_statement·max_one_statement·preferred_compare_operator), W 3종(obsolete·colon·naming, len 120~255도 W) — §14-8 --strict 검토 근거
- 2026-07-11 | 실패 패턴 | 403을 ENV로 분류하던 휴리스틱 | 실측상 403의 유일 사례가 ENQUEUE 락 — LOCK 우선 검사로 교정
- 2026-07-11 | deploy | 문법 오류 소스 deploy | 오류에도 객체 생성됨(exit 1이지만 서버 잔존) — 배포 성공≠코드 정상, $TMP에 ZSAH0B_BROKEN 잔존
