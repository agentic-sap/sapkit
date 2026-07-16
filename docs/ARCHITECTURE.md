# ARCHITECTURE — sap-agentic-harness

> Engine이 docs/*.md를 매 스텝 프롬프트에 주입한다(48KB 경고·64KB 기동 거부). 구조의
> **지도와 계약**만 얇게 적는다 — 설계 서사는 DESIGN.md·interactive/DESIGN.md, 결정의
> '왜'는 docs/reference/DECISIONS.md, 살아있는 상태는 HANDOFF.md. 리뷰 체크리스트가 참조하는
> docs/ADR.md는 존재하지 않는다 — ADR 역할은 docs/reference/DECISIONS.md가 겸한다(D-012·D-020).

## 스택 · 두 트랙 경계

단일 git 레포에 두 트랙이 **실행 코드 의존 없이** 공존한다:

- **트랙 A(하네스 트랙)** — Direct 기본·Guided 명시 승격·Engine attended의
  3 실행 구조와 P0~P4 Policy를 직교 매핑한다. final-harness는 Engine,
  vsp-custom CLI는 Engine 실행·공통 완료 증거 backend다. 사람 Direct/Guided의
  적용 경로는 트랙 B MCP·vsp CLI·abapGit이다. 두 실행 의존은 외부 레포로
  분리 유지한다(D-018).
- **트랙 B(대화형 플러그인)** — Node MCP 서버 + 3사 어댑터. 도구 표면 소스 정본은 레포 내
  engine/(D-017 편입), 배포 형태는 interactive/server/의 번들.

유일한 물류: 트랙 A packs ← interactive/core/knowledge 선별 이식(커밋 이력 = provenance).

## 핵심 의존·final-harness lock v2 (D-018·D-025)

| 의존 | 역할 | lock 파일 · 고정값 |
|---|---|---|
| final-harness | 트랙 A Engine attended(자체 제작 독립 제품) | `adapters/final-harness.lock.json` schema v2 계약 — `verified`·`candidate`·`history`·`safety_state` 분리 |
| vsp-custom | Engine 실행 backend·적용 경로와 독립인 Track A 완료 증거 backend(CLI) | `adapters/vsp/vsp.lock.json` — v2.38.1-91-g0b03ef2, 커밋 0b03ef2, 바이너리 sha256 고정 |
| engine/ (MCP 서버) | 트랙 B 도구 표면 소스 정본 | 레포 내 편입(D-017). 수리→재번들→interactive/server 반영은 `interactive/server/UPDATE-RUNBOOK.md` 절차로만 |

두 외부 의존의 분리 근거는 D-018, `engine/`만 편입한 대조 근거는 D-017이다.

lock v2의 `verified`(`8f7f13b…`)와 `candidate`(`6de63ba…`)는 별개다.
candidate state는 `selected|staged`뿐이며 PROMOTE event가 이전 verified를 `history`에
보존하고 candidate를 새 verified로 만든 후 `candidate=null`로 비운다.
`candidate.state=verified`는 없고 `safety_state`는 PROMOTE/REJECT에서 보존한다
(전문: 재기준 v2 §10·§12).

**현 실측:** lock은 아직 v1 `verified_commit`; v2 변환은 §11 후속 lock 행이다.

## Track A 재기준 파일 지도

| 경로 | 계약 | 현 상태(2026-07-15 실측) |
|---|---|---|
| `adapters/final-harness.lock.json` | 위 lock v2 정본 | v1 존재; v2 변환 이월 |
| `scripts/run-track-a.ps1` | 유일한 Engine 지원 진입점. no-run-id/legacy를 `LEGACY_PHASE_DENY` exit 64로 거부; candidate는 staged+`-Candidate`만 | 미존재; §11 wrapper 행 이월 |
| `adapters/final-harness/legacy-phase-policy.json` | 기존 phase default deny의 기계 정본 | 미존재; §11 legacy 행 이월 |
| `docs/reference/LEGACY-CATALOG.md` | phase별 역사 상태·branch 증거·재실행 금지 이유 | 미존재; §11 catalog 행 이월 |
| `.harness/runs/<run-id>/` | Guided/Engine의 goal·state·contract/manifest·review/verification 증거 단일 스코프 | 디렉토리 미존재; 신규 run부터 생성 |
| `phases/**` | v0.17 legacy 역사 증거 | byte 보존; raw 실행 금지·wrapper 기본 deny |

Direct는 run 흔적이 없다. Guided/Engine의 `contract.md`·`manifest.json`·
`review-verdict.json`(exact-subject R-PASS)·`verification.json`(vsp V-PASS)·goal/state/
attempt은 같은 `<run-id>` 밖으로 나가지 않으며 source byte 변경 시 review/verify가
stale다. 현 phase-only template/checker는 v0.17 legacy; run-scoped 갱신은 §11 후속 행이다.

## 파일 지도 (실측 트리 — 여기 뭐가 살고 왜)

루트:
```
HANDOFF.md              프로젝트 전체 상태·재개 지침 정본 (상태 바뀔 때마다 갱신)
DESIGN.md               트랙 A 설계; 현 재기준 권위는 D-025 + 2026-07-15 v2
CLAUDE.md · AGENTS.md   Direct/Guided/Engine × P0~P4 세션 라우팅
docs/reference/DECISIONS.md       append-only 결정 로그 D-001~ (ADR 역할, Engine 주입 대상)
docs/PRD.md             스코프·비목표·품질 모델 (Engine 주입, thin+pointer)
docs/ARCHITECTURE.md    이 문서 — 구조·파일 지도·불변식 (Engine 주입, thin+pointer)
docs/superpowers/       설계 스냅샷 아카이브 (docs/*.md glob 밖 = Engine 미주입)
docs/reference/templates/ 현 v0.17 phase-only review legacy 템플릿; run-scoped 갱신 이월
engine/                 MCP 엔진 소스 정본 — TS 소스·tests·번들 도구·patches·
                        UPSTREAM-FIX-HANDOFF.md·CHANGELOG (D-017 편입, 플러그인 표면 밖)
interactive/            트랙 B 플러그인 루트 (아래 세부)
adapters/               트랙 A 의존 lock 2종 + vsp/ COMMANDS·VERIFY-PATTERNS·SAFETY-PROFILES
domain/                 트랙 A 도메인 규칙 시드 — 현재 abap/만(CHECKLIST·RULES.seed, S-001~025)
packs/                  트랙 A 모듈 지식팩(Phase 4~) — modules/README.md(이중 구조 규약) ·
                        modules/fi/(CONSULTANT.md 포인터 허브 + RULES.seed.md FI-001~005;
                        지식 정본은 interactive/core/knowledge/modules/ — thin+pointer)
scripts/                raw Engine executor(execute.py, 직접 진입 금지) + 후속 wrapper
                        run-track-a.ps1 + SAP verify 래퍼 + 현 v0.17 review checker
src/                    하네스가 만든 ABAP 소스, abapGit 호환 파일명
                        (현재 3건: zsah1_workdays · zcl_sah2_workdays · zsah2_duedate)
phases/                 v0.17 legacy 역사 7종(예제·완료·sealed seed); byte 보존·기본 deny
.harness/               RULES(R-001~007)·PROTOCOL·LESSONS; GOAL/STATE는 동결 singleton,
                        신규 Guided/Engine 증거는 runs/<run-id>/로만
.claude/                quality-gate.json(→scripts/quality-gate-sap.ps1) · settings(.local)
```

interactive/ 세부:
```
interactive/DESIGN.md              트랙 B 설계 정본 (상태는 여기 기록 안 함 — HANDOFF가 정본)
interactive/MIGRATION-MANIFEST.md  원본 5분류 정본 (분류 변경은 이 파일 수정으로만)
interactive/provenance/            이식 pin·인벤토리·목적지 해시·드리프트 판단 (S3)
interactive/core/                  하네스 중립 지식·페르소나 26·절차·정책·vocabulary
interactive/server/                MCP 번들 + keyring + tool-catalog + sap-assets + UPDATE-RUNBOOK
interactive/adapters/ (claude·codex·antigravity)  어댑터별 설치·안전모델 가이드 + compatibility.json
interactive/skills/ agents/ plugin.json           플러그인 표면
interactive/scripts/               게이트 스크립트 (check-links·check-migration-snapshot·
                                   smoke-mcp·gen-permissions·doctor)
.claude-plugin/ .agents/ (루트)    마켓플레이스 (source: ./interactive)
```

미존재(로드맵 예정): `domain/cds·rap·amdp`(Phase 1+). 실측 시 없는 것이 정상.

## 불변식 (요약 — 전문은 HANDOFF §8 · .harness/RULES.md)

- **HANDOFF §8 (7개)**: 지식 정본=interactive/core/(동결 레포 수정 금지) · private/ 영구
  denylist · server.bundle.cjs `.gitattributes` 보호(갱신은 UPDATE-RUNBOOK) · 실데이터 2종
  자동 승인 금지 · 게이트 상시 통과 · superpowers 재활성화 제안 금지 · 굵직한 결정은
  DECISIONS.md append.
- **.harness/RULES.md (R-001~R-006)**: ENV/LOCK_FAIL 마커 실패는 규칙 승격 제외 · vsp는 CLI
  전용(MCP 금지) · QA/PRD tier write 금지 · 동결 레포 수정·private 읽기 금지 · 접속정보 커밋
  금지 · vsp write 후 `vsp source read`로 반영 확인.

## 검증 게이트 (구조 변경 시 항상 통과 유지)

구조 변경 시 게이트 5종(coverage·links·verify-engine·smoke-mcp·doctor)을 통과 상태로
유지한다 — 명령 목록 정본은 HANDOFF §9 (CLAUDE.md 게이트 절과 동일, 여기 중복 게재 안 함).
