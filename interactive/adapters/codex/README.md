# Codex CLI 어댑터

Codex 플러그인은 Claude와 동형이다 — 같은 레포 루트가 플러그인 루트이고,
`.codex-plugin/plugin.json` + `.agents/plugins/marketplace.json`이 매니페스트다.
같은 `skills/` 래퍼 11개가 그대로 쓰인다 (SKILL.md 형식이 양사 공통 — L0/L4 실측).

## 설치 (2026-07-10, codex-cli 0.144.1 실측 통과)

```
codex plugin marketplace add "D:\claude for SAP\sap-agentic-harness"
codex plugin add sap-agentic-harness@sap-agentic-harness
```

캐시(`~/.codex/plugins/cache/sap-agentic-harness/...`)에 core/·server/ 포함 전체가 패키징됨을 확인.

## MCP 서버 등록 (전역 — 프로젝트 config는 trust 게이트가 있어 비권장)

```
codex mcp add sap --env NODE_PATH="D:\claude for SAP\sap-agentic-harness\server\runtime-deps\keyring\node_modules" -- node "D:\claude for SAP\sap-agentic-harness\server\server.bundle.cjs" --exposition=readonly
```

**exposition 프리셋 (§5-4 미결 5 해소 — 서버 --help 실측):**

| 프리셋 | 의미 | 권장 용도 |
|---|---|---|
| `readonly` | Get*/Check*/Validate* + search + system | **Codex 기본** — Codex는 등록된 도구 전부가 컨텍스트에 올라가므로 read 중심 축소 필수 |
| `readonly,high` | 서버 기본값 (write 포함 ~155개) | gated write 작업 세션에서만 일시 사용 |
| `compact` | 파사드 축소판 | 최소 컨텍스트 실험용 |

write 작업이 필요한 세션: `codex mcp remove sap` 후 `--exposition=readonly,high`로 재등록
(또는 별도 이름 `sap-write`로 등록해 두고 평소 disable).

## SAP 프로젝트 루트 AGENTS.md

`AGENTS-template.md`의 내용을 대상 SAP 프로젝트의 `AGENTS.md`에 병합한다
(합산 32KiB 한도 — 템플릿은 요약+포인터만).

## 안전 모델 주의 (정직성 명시)

Codex에는 도구 호출 사전 차단 훅이 없다. 방어선은
① 문서 정책(AGENTS 요약+core/policies) ② 서버 내장 가드(SAP_TIER·blocklist)
③ exposition 프리셋 ④ Codex 승인 모드/샌드박스. 실데이터 조회 2종(GetTableContents/
GetSqlQuery)의 호출 건별 승인은 Claude보다 한 겹 약하다 — readonly 프리셋에도 포함되므로
정책 준수에 의존한다.

## 리뷰 패스

```
codex exec --sandbox read-only "PLUGIN_ROOT/core/procedures/review-checklist.md를 읽고 <review-request 경로>를 판정하라"
```
