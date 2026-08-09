# ARCHITECTURE — sapkit (구 sap-agentic-harness)

> ⚠ **현행성**: 이 문서는 renew 1차 판(2026-08-10 · D-071~D-077) **이전**에 쓰였다.
> 트랙 A 실행 설비(`phases/`·`src/`·루트 `scripts/`·`.harness/`·`packs/`·`domain/`·
> `adapters/final-harness*`)는 그 판에서 레포에서 제거됐으므로, 그 설비의 **존재를
> 전제한 서술은 현행이 아니다**(run 산출물·엔진 주입·phase 템플릿 등). 구조의 지도와
> 계약으로만 읽고, 현행 게이트·완료 의미론의 정본은 `CLAUDE.md`, 상태 정본은
> `HANDOFF.md`, 재구성 계획은 `docs/BLUEPRINT.md`다.

> Engine이 docs/*.md를 매 스텝 프롬프트에 주입한다(48KB 경고·64KB 기동 거부). 구조의
> **지도와 계약**만 얇게 적는다 — 설계 서사는 DESIGN.md·interactive/DESIGN.md, 결정의
> '왜'는 docs/reference/DECISIONS.md, 살아있는 상태는 HANDOFF.md, 스코프·품질 모델은
> docs/PRD.md. top-level docs/ADR.md는 만들지 않는다(D-012·D-020·D-026 이중 체계 금지) —
> 활성 ADR 역할은 docs/reference/DECISIONS.md가 겸하고, 보조 줄기의 수행-레벨 ADR 이력은
> docs/reference/ADR.md에 보존한다(D-035).

## 스택 · 두 트랙 경계

단일 git 레포에 두 트랙이 **실행 코드 의존 없이** 공존한다:

- **트랙 A(하네스 트랙)** — Direct 기본·Guided 명시 승격·Engine attended의
  3 실행 구조와 P0~P4 Policy를 직교 매핑한다. final-harness는 Engine,
  vsp-custom CLI는 Engine 실행·공통 완료 증거 backend다. 사람 Direct/Guided의
  적용 경로는 트랙 B MCP·vsp CLI·abapGit이다. final-harness는 외부 레포로
  분리 유지하고(D-018), vsp는 레포 내 `vsp/`로 편입 완료다(D-030·D-037 —
  히스토리 비이식 스냅샷·바이너리 비커밋).
- **트랙 B(대화형 플러그인)** — Node MCP 서버 + 3사 어댑터. 도구 표면 소스 정본은 레포 내
  engine/(D-017 편입), 배포 형태는 interactive/server/의 번들.

유일한 물류: 트랙 A packs ← interactive/core/knowledge 선별 이식(커밋 이력 = provenance).

## 핵심 의존·final-harness lock v2 (D-018·D-025·D-030)

| 의존 | 역할 | lock 파일 · 고정값 |
|---|---|---|
| final-harness | 트랙 A Engine attended(자체 제작 독립 제품) | `adapters/final-harness.lock.json` schema v2 계약 — `verified`·`candidate`·`history`·`safety_state` 분리 |
| vsp-custom | Engine 실행 backend·적용 경로와 독립인 Track A 완료 증거 backend(CLI) | `adapters/vsp/vsp.lock.json` — 로컬 우월분 **v2.38.1-94**(write 프로파일 게이트·재검증 포함, 평가 §4). lock 파일이 원천 커밋 sha·재현 빌드 바이너리 sha256·명령 계약·provenance의 정본. 편입 완료(레포 내 `vsp/`, D-030·D-037 — 바이너리 비커밋) |
| engine/ (MCP 서버) | 트랙 B 도구 표면 소스 정본 | 레포 내 편입(D-017). 수리→재번들→interactive/server 반영은 `interactive/server/UPDATE-RUNBOOK.md` 절차로만 |

두 외부 의존의 분리 근거는 D-018, `engine/`만 편입한 대조 근거는 D-017이다. vsp는
D-030으로 편입이 확정됐고(D-018 supersede), subtree 편입은 레포 구조 작업이라 분기 통합
완료 직후 별도 단계로 실행한다.

lock v2의 `verified`(`8f7f13b…`)와 `candidate`(D-028에서 `d4a0aeb`, v0.20.0으로 확정)는
별개다. candidate state는 `selected|staged`뿐이며 PROMOTE event가 이전 verified를 `history`에
보존하고 candidate를 새 verified로 만든 후 `candidate=null`로 비운다.
`candidate.state=verified`는 없고 `safety_state`는 PROMOTE/REJECT에서 보존한다
(전문: 재기준 v2 §10·§12).

**현 실측:** lock은 아직 v1 `verified_commit`; v2 변환은 §11 후속 lock 행이다.

## Track A 재기준 파일 지도

| 경로 | 계약 | 현 상태(2026-07-15 실측) |
|---|---|---|
| `adapters/final-harness.lock.json` | 위 lock v2 정본 | v1 존재; v2 변환 이월 |
| `scripts/run-track-a.ps1` | 유일한 Engine 지원 진입점. no-run-id/legacy를 `LEGACY_PHASE_DENY` exit 64로 미통과 처리; candidate는 staged+`-Candidate`만 | 미존재; §11 wrapper 행 이월 |
| `adapters/final-harness/legacy-phase-policy.json` | 기존 phase default deny의 기계 정본 | 미존재; §11 legacy 행 이월 |
| `docs/reference/LEGACY-CATALOG.md` | phase별 역사 상태·branch 증거·재실행 금지 이유 | 미존재; §11 catalog 행 이월 |
| `.harness/runs/<run-id>/` | Guided/Engine의 goal·state·contract/manifest·review/verification 증거 단일 스코프 | 디렉토리 미존재; 신규 run부터 생성 |
| `phases/**` | v0.17 legacy 역사 증거 | byte 보존; raw 실행 금지·wrapper 기본 deny |

Direct는 run 흔적이 없다. Guided/Engine의 `contract.md`·`manifest.json`·
`review-verdict.json`(exact-subject R-PASS)·`verification.json`(vsp V-PASS)·goal/state/
attempt은 같은 `<run-id>` 밖으로 나가지 않으며 source byte 변경 시 review/verify가
stale다. 현 phase-only template/checker는 v0.17 legacy; run-scoped 갱신은 §11 후속 행이다.

## 실행 흐름 · 방법론 관례 (수행 레벨 — 보조 줄기 층3 시드)

무인 step·계획(harness-plan)·사람 셰퍼딩이 공통으로 따르는 수행 루프와 방법론.
라이브 관통 부검에서 증류됐다(상세 감사: `docs/reference/audits/2026-07-18-5-13-layer3-audit.md`).

수행 루프(Engine/legacy phase 기준): 답사(read-only) → 계획 기록 → 스텝 구현·자가 교정
→ verify(아래 SAP 검증 계약) → 새-컨텍스트 read-only 리뷰. run-scoped 재기준에서는 이
증거가 `.harness/runs/<run-id>/`에 담긴다.

- **작업 단위 = 세로 관통**(층3-3): "N종 일괄 생산"이 아니라 오브젝트 그룹 하나씩
  수선→활성화→E2E로 관통한다. blast radius가 그룹 하나로 제한되고 즉시 검증된다.
- **착수 전 liveness 실측**(층3-4): 수정 범위는 결함표가 아니라 실데이터 실측이 정한다 —
  승인된 범위의 절반이 휴면일 수 있다. 실측이 문서 전제를 뒤집으면 실측을 따른다.
- **결함 목록 = 표본**(층3-2, 팩 R-012): 결함 목록을 수정 범위의 지도로 쓰지 마라 —
  개수 grep은 개수 검증일 뿐 누락을 못 잡는다. 한 결함을 고칠 땐 그 메커니즘을 같은
  배치의 형제 오브젝트에 직접 대조하고, 게이트로 원리적으로 못 잡는 휴면 결함은 메커니즘
  대조와 독립 리뷰로만 잡는다.
- **미검증 표시는 구현 착수 전에 회수**(층3-7; 팩 내부 번호 R-006은 이 레포 R-006과
  무관): "재대조 필요"류 미검증 배지는 실제 대조로 해소한 뒤에만 구현에 착수한다 —
  배지를 코드 주석으로 옮기는 건 회수가 아니다.

## SAP 검증 계약 (상세 정본: adapters/vsp/VERIFY-PATTERNS.md)

- **offline**: `vsp lint --file`(Error만 exit≠0, Warning 통과) · `vsp parse --file`
  (파일 감시용, 항상 exit 0).
- **online**: 반드시 `scripts/verify-sap.ps1` 경유 — vsp 직접 호출 금지(vsp는 모든 오류가
  exit 1이라 래퍼가 출력 패턴으로 판정). 체인 = deploy→activate→drift→ATC→unit.
- **마커 3종**: `CODE_FAIL`(코드 결함 — 수정 대상) / `ENV_FAIL`(연결·환경) /
  `LOCK_FAIL`(잠금) — ENV·LOCK은 코드 결함으로 기록·규칙 승격 금지(R-001). 존재
  확인(Test-Path류)은 verify가 아니다.
- write는 DEV tier에만(R-003). deploy/copy 후 성공 보고만 믿지 말고 `vsp source read`로
  반영을 확인한다(R-006). CLAS 테스트 include 배포는 리포트 로컬 테스트 클래스 배치로
  회피했으나(ADR-002), vsp v2.38.1-94에서 지원이 실측 확인됨(ADR-002 Addendum — 재배치는
  사용자 결정 대기).

## 파일 지도 (실측 트리 — 여기 뭐가 살고 왜)

루트:
```
HANDOFF.md              프로젝트 전체 상태·재개 지침 정본 (상태 바뀔 때마다 갱신)
docs/DESIGN.md          트랙 A 설계(휴면 — ENGINE은 D-040 template-only); 재기준 권위는 D-025 + 2026-07-15 v2. 2026-08-03 루트→docs/ 이동
CLAUDE.md · AGENTS.md   Direct/Guided/Engine × P0~P4 세션 라우팅
docs/reference/DECISIONS.md       append-only 결정 로그 D-001~ (활성 ADR 역할, Engine 미주입)
docs/reference/ADR.md             보조 줄기 수행-레벨 ADR 이력 보존 (ADR-001~003, 비활성 — D-035)
docs/reference/LEGACY-CATALOG.md  phase별 역사 상태·재실행 금지 이유
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
interactive/scripts/               게이트 스크립트 (check-links·smoke-mcp·
                                   gen-permissions·doctor — 목록 정본은 CLAUDE.md 게이트 절)
.claude-plugin/ .agents/ (루트)    마켓플레이스 (source: ./interactive)
```

미존재(로드맵 예정): `domain/cds·rap·amdp`(Phase 1+). 실측 시 없는 것이 정상.

## 불변식 (요약 — 전문은 HANDOFF §8 · .harness/RULES.md)

- **HANDOFF §8 (7개)**: 지식 정본=interactive/core/(동결 레포 수정 금지) · private/ 영구
  denylist · server.bundle.cjs `.gitattributes` 보호(갱신은 UPDATE-RUNBOOK) · 실데이터 2종
  자동 승인 금지 · 게이트 상시 통과 · superpowers 재활성화 제안 금지 · 굵직한 결정은
  docs/reference/DECISIONS.md append.
- **.harness/RULES.md (R-001~R-006)**: ENV/LOCK_FAIL 마커 실패는 규칙 승격 제외 · vsp는 CLI
  전용(MCP 금지) · QA/PRD tier write 금지 · 동결 레포 수정·private 읽기 금지 · 접속정보 커밋
  금지 · vsp write 후 `vsp source read`로 반영 확인.

## 검증 게이트 (구조 변경 시 항상 통과 유지)

구조 변경 시 게이트(links·verify-engine·engine-provenance·smoke-mcp·server-gates·
plugin-manifests·runtime-path·runtime-dir·doctor)를 통과 상태로 유지한다 — 명령 목록 정본은
**CLAUDE.md 게이트 절**(여기 중복 게재 안 함). 이식 장부 계열(`coverage` → S3 폐기 D-029,
그 대체였던 `migration-snapshot` → renew 1차 은퇴 D-072)은 **더 이상 존재하지 않는다.**
