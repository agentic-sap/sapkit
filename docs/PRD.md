# PRD — sapkit (구 sap-agentic-harness)

> ⚠ **현행성**: renew 1차 판(2026-08-10 · D-071~D-077) **이전** 문서다. 트랙 A 실행
> 설비는 그 판에서 제거됐으므로 엔진 주입·`scripts/execute.py` 같은 서술은 현행이
> 아니다. 스코프 가드레일로만 읽을 것 — 현행 정본은 `CLAUDE.md`·`HANDOFF.md`.

> Engine이 이 파일을 **매 스텝 프롬프트에 주입**한다(scripts/execute.py: docs/*.md
> 전량, 48KB 경고·64KB 기동 거부). 그러므로 스코프의 **가드레일**만 얇게 적고 상세는
> 포인터로 돌린다. 상태 정본은 HANDOFF.md, 설계 정본은 DESIGN.md·interactive/DESIGN.md,
> 결정의 '왜'는 docs/reference/DECISIONS.md, 구조·파일 지도는 docs/ARCHITECTURE.md.
> 중괄호 플레이스홀더 금지(엔진이 해당 문서를 스킵).

## 목표

SAP ABAP/RAP/CDS/AMDP 개발을 AI 하네스로 수행한다. 세션의 자기보고 대신
exact-subject fresh-context review와 SAP 기계 확인으로 완료를 판정하고, 실전 실패에서
증류된 규칙을 모듈 지식으로 축적하는 것이 핵심.
단일 레포·두 트랙 구조(아래 §트랙별 기능). 철학: 차용 후 완전 소유(sc4sap 지식 이식,
엔진 편입 D-017 · vsp 편입 D-030 후 **판1에서 자체 저작 검사기로 대체·은퇴** D-085) ·
가볍지만 강력하게 · 3사 하네스 중립.

## 사용자

**개인 도구 — SAP ABAP 개발자 1인**(소유자 겸 유일 사용자). 팀 배포·다중 사용자·상업
배포 대상이 아니다(다국어 README 미작성 결정 근거, HANDOFF 5-6). 이 전제가 아래 비목표와
품질 모델의 규모를 정한다 — "senior 1명이 과설계라 부를 것은 짓지 않는다".
실행 행위자는 사람(Direct/Guided 셰퍼딩 — 계획 승인·gated write 승인·리뷰 게이트)과
무인 step 세션(Engine attended의 claude/codex 드라이버)이다.

## 트랙별 기능과 우선순위

### 트랙 A — 3 실행 구조 × 5 SAP Policy 프로필

action마다 직교하는 두 축을 하나씩 고른다. **Direct**는 현재 사람 세션의
기본값(흔적 0), **Guided**는 SAP 코드 완료·pause/resume·fresh review·지속 증거용
명시 승격, **Engine attended**는 승인된 new-style contract/manifest의 bounded
step·retry·seed·batch다. Engine은 `scripts/run-track-a.ps1`만 진입점이다.

Policy는 효과가 강한 순서로 **P0 offline / P1 connected-read / P2 real-data
extraction / P3 write-execute / P4 transport**다. 15칸 전체 matrix·소유권·종결
조건은 `docs/reference/designs/2026-07-15-track-a-rebase-v2.md` §3~§5가 정본이다.

재기준이 전역으로 미통과 처리하는 것은 **reviewer mutation**이다. **무인(headless)
실행은 대화형 중심 틀 안의 관문(U-gate)을 통과할 때만 조건부로 열리는 경로**로
재정의됐다(D-034 — ⑴ 방향 절충). 관문 재료 = 로컬 Phase 3 Gated Deploy 검토 게이트
실증(AC-8: 기계 4층 green 시맨틱 결함을 게이트가 미통과 처리→수정본 통과) + 2026-07-19
사용자 승인. **U-gate의 정의·기계 배선은 후속 소규모 설계이며, 배선 완료 전까지 무인
SAP write의 운영 개방은 그 배선에 종속된다(그 전까지 `unattended=sealed` 유지).**
각 cell의 지원 경로·gate는 지켜야 한다(예: Direct-P4 진입점 없음, Engine-P2 직접 실행
금지). 사람 Direct/Guided-P3은 트랙 B MCP·사람이 모는 CLI·abapGit 적용이 모두
정당하며, 어느 길로 넣든 정책 등급과 관문은 같다. Engine 실행 구조는 D-040으로
template-only가 된 뒤 R1에서 설비가 제거돼 지금 배선된 증거 backend가 없다.

D-019 완료 matrix는 변하지 않는다. Direct SAP code는 `DRAFT`, Direct-P3는
`PROVISIONAL_WRITE`다. 완료는 **기계 확인 + 독립 새-컨텍스트 리뷰** 둘 다이며 —
기계 확인은 `interactive/core/procedures/verify-applied.md`(반영 소스 되읽기 대조 +
구문·활성 확인), 리뷰는 Guided-P3 exact-subject `R-PASS`다. 도장 의식과 그 판정 기록
파일은 renew 1차에서 폐지됐다(D-075). D-025/O1에 따라
SAP reviewer 기계 격리는 약화됐고 `sap_mutation_boundary=unverified`(reviewer +
all attended child)를 숨기지 않는다.

P2는 `GetTableContents`·`GetSqlQuery`를 비롯해 **SAP 행 데이터를 끌어오는 모든
경로**(로컬 CLI·스크립트·직접 질의) **매 호출 전** 범위·필드·row 상한을 보여 사람
승인을 받고 batch·subagent·자동 승인을 금지한다 — 규칙은 도구 이름이 아니라 행위에
걸리므로 도구가 은퇴해도 좁아지지 않는다. 하네스별 승인 메커니즘은 재기준 v2 §4와
D-025를 따른다.

**수행 로드맵(legacy phase 기준 — 완료 사실 보존, 재기준에서 phase는 legacy)**: 0a
Scaffold(설치·게이트 미통과 실증, 완료 07-11) · 0b Connected Discovery(vsp 전수 실측,
07-11) · 1 Offline Harness(무인 첫 완주, 07-11) · 1.5 Online Validation(red/green 서버
실증, 07-11) · 2 Read-Only Planning(답사가 계획 변경 + 채점 5 PASS, 07-12) · **3 Gated
Deploy(검토 게이트 실증 완주, 07-19 — 무인 개방은 D-034 U-gate 조건부로 재기술)** · **4
Domain Packs(FI 첫 팩 완성, 07-19 — 축적 계속)**. 완료 기준 원문 = DESIGN.md §13.

### 트랙 B — 대화형 플러그인 (interactive/)
sc4sap-custom의 전 자산(지식 · 페르소나 26 · 절차 · 정책)을 하네스 중립 코어 +
MCP 서버 번들 + 어댑터 3사(Claude/Codex/Antigravity)로 재편한 라이트 플러그인(플러그인명
sapkit — D-041 개명 전 `sap-agentic-harness`). 현황: L0~L5 구현 + E2E + 3사 교차검증 완료. 설계 정본 =
interactive/DESIGN.md.

두 트랙의 유일한 접점: 트랙 A의 packs가 interactive/core/knowledge에서 선별 이식한다
(같은 레포라 커밋 이력이 곧 provenance).

## 비목표 (의도적으로 버린 것)

- **멀티에이전트 자동 디스패치** · **team 협업** — sc4sap-custom에서 이식하지 않은 유일한
  두 자산(D-002). 품질 모델을 "1명 작업 + 1명 리뷰"로 단순화한 결과다(단일 fresh worker
  위임 — `execution_owner`, D-047 — 은 이 비목표에 해당하지 않는다).
- **엔진 도구 삭제로 MCP 표면 경량화** — 기각(D-016). 경량화는 하네스별 노출 정책으로 한다.
- **표준 문서 남발** — top-level docs/ADR.md는 만들지 않는다(D-012·D-020·D-026, 이중 체계
  금지). 활성 ADR 역할은 docs/reference/DECISIONS.md가 겸하고, 보조 줄기 수행-레벨 ADR
  이력은 docs/reference/ADR.md에 비활성 보존한다(D-035).

## 품질·안전 모델

- **품질**: 1 worker + 1 fresh reviewer + SAP 기계 확인. reviewer는 고치지
  않고 P0/P1만 수행하며 transport read를 포함한 모든 transport 동작을 하지
  않는다. 작업 세션은 자기 결과를 리뷰하지 않는다. 상세는 D-019·D-025·재기준 v2 §5.
- **검증 체인**: 테스트 먼저(테스트 클래스를 먼저 쓰고 스텝 경계로 증명) · 2단
  검증 offline(동봉 검사기 lint/analyze) → connected(deploy→activate→drift→ATC→unit) ·
  실패 마커 3종 CODE_FAIL/ENV_FAIL/LOCK_FAIL(ENV·LOCK은 코드 결함 기록 금지, R-001).
  계약 정본 = docs/ARCHITECTURE.md §SAP 검증 계약 ·
  interactive/core/procedures/troubleshooting.md §7(오프라인 검사기).
- **안전 3층 방어**: 도구 단위 권한 allowlist · PreToolUse 훅 · 엔진 tier 게이트.
- **실데이터 P2 상시 게이트**: 호출별 사람 승인, 최소화, 자동·batch 금지
  (D-008·D-025; 재기준 v2 §4).
- 불변 규칙 전문 = 루트 `CLAUDE.md` 「안전 규칙」 절 — 구 HANDOFF §8과 구
  `.harness/RULES.md`(R-001~R-007)가 2026-08-24(판B)에 그리로 단권화됐다.
  구조/파일 지도 = ARCHITECTURE.md.
