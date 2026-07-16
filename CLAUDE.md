# CLAUDE.md — sap-agentic-harness

## 프로젝트 정체성 (30초 맥락 — 이걸 모르면 판단하지 말 것)

SAP ABAP 개발을 AI 하네스로 수행하는 **단일 레포 · 두 트랙**. 철학: **차용 후 완전
소유**(sc4sap 지식 이식, 엔진 편입 D-017) · 가볍지만 강력하게 · 3사 하네스 중립.

- **트랙 A — 하네스 트랙** = Direct(기본) + Guided(명시 승격) + final-harness
  **Engine attended**(자체 제작, 별도 레포)와 **vsp-custom CLI**. unattended는 단순
  미착수가 아니라 D-025·재기준 v2 §7 해제 전 **`sealed`**다. 사람 소유 Direct/Guided의
  SAP 적용은 트랙 B MCP·사람 vsp CLI·사용자 abapGit 모두 허용된다. vsp-custom은
  **Engine의 SAP 실행 백엔드이자 적용 경로와 독립인 트랙 A 완료 증거 백엔드**이며,
  사람 작업의 유일한 SAP 접점은 아니다(DESIGN.md §3 — powerup 엔진은 트랙 A에서 쓰지
  않음). 두 외부 의존의 소유 전략은 **D-018 확정: 분리 유지 + 부트스트랩 시 버전
  lock** (편입 기각).
- **트랙 B — 대화형 플러그인 (검증 완료)** = `interactive/` — 하네스 중립 코어(지식 217·
  페르소나 26·절차 15·정책) + MCP 서버 번들 + 어댑터 3사(Claude/Codex/Antigravity).
  번들의 소스 정본은 레포 내 **`engine/`**(D-017 편입) — 엔진 수리→재번들→반영은
  `interactive/server/UPDATE-RUNBOOK.md` 절차로만.
- 품질 모델: **1명 작업 + 1명 새-컨텍스트 리뷰(read-only) + SAP 기계 검증**.
  안전 모델: 3층 방어(도구 단위 권한 allowlist · PreToolUse 훅 · 엔진 tier 게이트) +
  실데이터 2종(GetTableContents/GetSqlQuery) 상시 게이트.

## 세션 시작 (필수)

1. **`HANDOFF.md`를 먼저 읽는다** — 프로젝트 전체 상태·재개 지침·백로그의 정본.
2. **트랙 A를 판단·언급하는 작업이면 착수 전에 `DESIGN.md` §2(구조)·§3(백엔드 결정)을
   읽는다** — HANDOFF §1 요약만으로 트랙 A를 판단하지 말 것 (실패 사례: vsp-custom을
   "선택적 도구"로 오판). 트랙 B 설계 정본은 `interactive/DESIGN.md`.
3. 과거 결정의 '왜'는 `docs/reference/DECISIONS.md` (append-only 결정 로그, D-001~). **D-번호를
   인용·재해석하기 전 원문을 확인한다.**

## 문서 계약 — 갱신까지가 작업의 일부 (커밋 전 확인)

| 문서 | 갱신 시점 |
|---|---|
| `HANDOFF.md` | **상태가 바뀔 때마다** (설치·검증·백로그 증감·머신 환경) |
| `docs/reference/DECISIONS.md` | 대안을 기각한 굵직한 결정 발생 시 **append** (수정·삭제 금지, 정정도 새 항목) |
| `DESIGN.md` · `interactive/DESIGN.md` | 해당 트랙의 **설계가 변경될 때만** (상태 변화로는 갱신하지 않음) |
| `interactive/MIGRATION-MANIFEST.md` | 원본 파일 분류 변경 시 — 분류 변경은 이 파일 수정으로만 |

불변 규칙 전체(동결 레포·private denylist·번들 보호·실데이터 승인 등)는 **HANDOFF §8**.

## 게이트 (구조 변경 시 항상 통과 상태 유지)

```bash
node interactive/scripts/check-migration-snapshot.mjs    # 이식 provenance (pin·원본 무접촉)
node interactive/scripts/check-links.mjs interactive     # 깨짐 0
node interactive/server/verify-engine.mjs                # 번들 무결성 OK
node interactive/scripts/smoke-mcp.mjs                   # 도구 표면 불변식 assert
node interactive/scripts/doctor.mjs                      # 3사 동기화 OK
```

`check-migration-coverage`는 **S3에서 폐기**됐다(D-027 §9.2) — 외부 sc4sap-custom을
재귀 순회하며 private 경로 이름을 열거해 R-004 정신에 저촉했다. 대체 =
`check-migration-snapshot`(원본 무접촉, CI 포함).

git push는 사용자 판단 — 커밋까지만 하고 push는 요청 시에만.

@AGENTS.md
