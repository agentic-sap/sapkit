# L1 변환 계약 — 스킬 → 하네스 중립 절차 문서

모든 변환 작업자는 이 계약을 따른다. 목적: sc4sap-custom의 Claude 전용 스킬을
**어느 하네스(Claude/Codex/Antigravity)에서든 에이전트 1명이 읽고 따라가는 절차 문서**로 변환.

## 언어·형식

- 절차 문서 본문은 **영어** (원본 지식·페르소나가 영어 — LLM 소비용 일관성). 코드·경로·도구명 원문 유지.
- 파일당 frontmatter: `name`, `description`, `source`(원본 경로 목록).
- 원본에 없는 내용 창작 금지. 노하우 보존 우선 — 오케스트레이션 서술 제거로 자연 감량.

## 반드시 제거 (Claude 배선)

- `Team_Mode` 블록과 `team-mode*.md` 내용 전부 (반영 금지)
- `Session_Trust_Bootstrap` / trust-session 언급
- `Response_Prefix`, `Phase_Banner`, 모델 지정(`model:`, Opus/Sonnet/Haiku 라우팅)
- `Agent(...)` 디스패치 문법, `mode: "dontAsk"`, 서브에이전트/병렬 디스패치 서술
  (`multi-executor-split.md`, `phase4-parallel.md`의 병렬 장치는 버리되, "무엇을 나눠
  점검하는가"의 항목 자체는 체크리스트로 흡수 가능)
- `mcp__<네임스페이스>__` 접두어 → 도구 이름만 backtick으로 (예: `CreateProgram`)

## 반드시 유지

- 단계 **순서**와 **관문**: SAP version preflight → interview → plan → spec → **사람 승인 게이트**
  → implement → self-QA → **리뷰 게이트** → report
- 인터뷰 질문 차원, 체크리스트 항목, ECC DDIC fallback 게이트, Cloud Public 거부 규칙
- 상태 파일 경로 (`.sc4sap/program/{PROG}/…`) — [project-context](../../core/project-context.md) 규약
- 스펙 승인 키워드 규약 (`승인`/`approve`/`proceed` 등 명시 키워드만 인정)

## 역할 문구 치환

- "dispatch `sap-X` agent" → "Adopt the `../personas/sap-X.md` persona for this step." (실제 파일로 링크)
- 리뷰 단계 → "Run `review-checklist.md` **in a fresh context**
  (new session/subagent per adapter guidance). The reviewer judges read-only; fixes are
  applied by the worker, then re-reviewed."

## 경로 매핑 (절차 문서는 `core/procedures/`에 위치 — 상대경로 기준)

| 원본 | 새 경로 |
|---|---|
| `../../common/<규약>.md` (include-structure, oop-pattern, alv-rules, clean-code*, naming-conventions, text-element-rule, constant-rule, procedural-form-naming, ecc-ddic-fallback, cloud-abap-constraints, abap-release-*, sap-version-reference, field-typing-rule, function-module-rule, ok-code-pattern) | `../knowledge/abap/conventions/<규약>.md` |
| `../../common/oop-sample/…`, `procedural-sample/…`, `alv-sample/…` | `../knowledge/abap/templates/<샘플>/…` |
| `skills/create-object/ecc/…` | `../knowledge/abap/templates/ecc/…` |
| `../../common/data-extraction-policy.md` | `../policies/data-protection/data-extraction-policy.md` |
| `../../common/transport-client-rule.md` | `../policies/transport-client-rule.md` |
| `../../common/{spro-lookup,customization-lookup,help-portal-fetch}.md` | `./<파일>` (같은 디렉토리) |
| `../../common/active-modules.md` | `../knowledge/modules/common/active-modules.md` |
| `configs/<MOD>/…` | `../knowledge/modules/<MOD>/…` |
| `industry/…` / `country/…` | `../knowledge/industry/…` / `../knowledge/country/…` |
| `asset/template_base.xlsx` | `../../assets/spec/template_base.xlsx` |
| `scripts/spec/*.mjs` | `../../tools/spec/*.mjs` |
| `agents/sap-X.md` | `../personas/sap-X.md` |
| `.sc4sap/…` | 그대로 유지 |

링크는 **실재하는 파일만** 걸 것. 대상 부재 시 backtick 텍스트로만 표기.
완료 후 최종 메시지는 "생성 파일 목록 + 한 줄 요약"만.
