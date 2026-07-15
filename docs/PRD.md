# PRD — sap-agentic-harness

> Engine이 이 파일을 **매 스텝 프롬프트에 주입**한다(scripts/execute.py: docs/*.md
> 전량, 48KB 경고·64KB 기동 거부). 그러므로 스코프의 **가드레일**만 얇게 적고 상세는
> 포인터로 돌린다. 상태 정본은 HANDOFF.md, 설계 정본은 DESIGN.md·interactive/DESIGN.md,
> 결정의 '왜'는 docs/reference/DECISIONS.md. 중괄호 플레이스홀더 금지(엔진이 해당 문서를 스킵).

## 목표

SAP ABAP/RAP/CDS/AMDP 개발을 AI 하네스로 수행한다. 세션의 자기보고 대신
exact-subject fresh-context review와 vsp 기계 증거로 완료를 판정하고, 실전 실패에서
증류된 규칙을 모듈 지식으로 축적하는 것이 핵심.
단일 레포·두 트랙 구조(아래 §트랙별 기능). 철학: 차용 후 완전 소유(sc4sap 지식 이식,
엔진 편입 D-017) · 가볍지만 강력하게 · 3사 하네스 중립.

## 사용자

**개인 도구 — SAP ABAP 개발자 1인**(소유자 겸 유일 사용자). 팀 배포·다중 사용자·상업
배포 대상이 아니다(다국어 README 미작성 결정 근거, HANDOFF 5-6). 이 전제가 아래 비목표와
품질 모델의 규모를 정한다 — "senior 1명이 과설계라 부를 것은 짓지 않는다".

## 트랙별 기능과 우선순위

### 트랙 A — 3 실행 구조 × 5 SAP Policy 프로필

action마다 직교하는 두 축을 하나씩 고른다. **Direct**는 현재 사람 세션의
기본값(흔적 0), **Guided**는 SAP 코드 완료·pause/resume·fresh review·지속 증거용
명시 승격, **Engine attended**는 승인된 new-style contract/manifest의 bounded
step·retry·seed·batch다. Engine은 `scripts/run-track-a.ps1`만 진입점이다.

Policy는 효과가 강한 순서로 **P0 offline / P1 connected-read / P2 real-data
extraction / P3 write-execute / P4 transport**다. 15칸 전체 matrix·소유권·종결
조건은 `docs/reference/designs/2026-07-15-track-a-rebase-v2.md` §3~§5가 정본이다.

재기준이 전역으로 차단하는 것은 **reviewer mutation**과 **사람 없는
unattended 실행** 둘뿐이다. 단 각 cell의 지원 경로·gate는 지켜야 한다
(예: Direct-P4 진입점 없음, Engine-P2 직접 실행 금지). 사람 Direct/Guided-P3은
트랙 B MCP·vsp CLI·abapGit 적용이 모두 정당하고, Engine-P3/P4와 공통
완료 증거 backend는 vsp CLI다. `attended-only / unattended=sealed`.

D-019 완료 matrix는 변하지 않는다. Direct SAP code는 `DRAFT`, Direct-P3는
`PROVISIONAL_WRITE`다. 완료는 Guided-P3 exact-subject `R-PASS` + vsp `V-PASS`이며,
`source_read_match=PASS`, `check_syntax=PASS`, `activate=PASS`,
`unit_test/atc=PASS|SKIPPED(reason)`를 모두 만족해야 한다. D-025/O1에 따라
SAP reviewer 기계 격리는 약화됐고 `sap_mutation_boundary=unverified`(reviewer +
all attended child)를 숨기지 않는다.

P2는 `GetTableContents`, `GetSqlQuery`, vsp `query` **매 호출 전** 범위·필드·
row 상한을 보여 사람 승인을 받고 batch·subagent·자동 승인을 금지한다.
하네스별 승인 메커니즘은 재기준 v2 §4 및
`adapters/vsp/SAFETY-PROFILES.md`의 해당 포인터를 따른다.

### 트랙 B — 대화형 플러그인 (interactive/)
sc4sap-custom의 전 자산(지식 217 · 페르소나 26 · 절차 15 · 정책)을 하네스 중립 코어 +
MCP 서버 번들 + 어댑터 3사(Claude/Codex/Antigravity)로 재편한 라이트 플러그인(플러그인명
sap-agentic-harness). 현황: L0~L5 구현 + E2E + 3사 교차검증 완료. 설계 정본 =
interactive/DESIGN.md.

두 트랙의 유일한 접점: 트랙 A의 packs가 interactive/core/knowledge에서 선별 이식한다
(같은 레포라 커밋 이력이 곧 provenance).

## 비목표 (의도적으로 버린 것)

- **멀티에이전트 자동 디스패치** · **team 협업** — sc4sap-custom에서 이식하지 않은 유일한
  두 자산(D-002). 품질 모델을 "1명 작업 + 1명 리뷰"로 단순화한 결과다.
- **엔진 도구 삭제로 MCP 표면 경량화** — 기각(D-016). 경량화는 하네스별 노출 정책으로 한다.
- **표준 문서 남발** — docs/ADR.md는 만들지 않는다. ADR 역할은 docs/reference/DECISIONS.md가 겸한다
  (D-012·D-020, 이중 체계 금지).

## 품질·안전 모델

- **품질**: 1 worker + 1 fresh reviewer + vsp 기계 검증. reviewer는 고치지
  않고 P0/P1만 수행하며 transport read를 포함한 모든 transport 동작을 하지
  않는다. 상세는 D-019·D-025·재기준 v2 §5.
- **안전 3층 방어**: 도구 단위 권한 allowlist · PreToolUse 훅 · 엔진 tier 게이트.
- **실데이터 P2 상시 게이트**: 호출별 사람 승인, 최소화, 자동·batch 금지
  (D-008·D-025; 재기준 v2 §4).
- 불변 규칙 전문 = HANDOFF §8 · .harness/RULES.md(R-001~R-007). 구조/파일 지도 = ARCHITECTURE.md.
