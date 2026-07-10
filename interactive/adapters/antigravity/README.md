# Antigravity 어댑터

설계(§4-2)의 "Claude 어댑터 import + 보정" 예상보다 좋은 결과 — **직설치가 그대로 동작**한다
(agy 1.0.7 실측, 2026-07-10). 루트 `plugin.json`(agy용 매니페스트) 하나만 추가하면
같은 레포가 Antigravity 플러그인이다.

## 설치 (실측 통과)

```
agy plugin validate "D:\claude for SAP\sap-agentic-harness"   # skills 11 + agents 1 processed
agy plugin install  "D:\claude for SAP\sap-agentic-harness"
```

임포트 위치: `~/.gemini/config/plugins/sap-agentic-harness/` — **core/·server/ 포함 전체 복사**라
스킬 래퍼의 PLUGIN_ROOT 상대 해석이 유지된다. 갱신 시 재설치 필요(레포 수정이 자동 반영되지
않음 — doctor 점검 대상).

## MCP 서버 등록 (전역 — agy 1.0.7 플러그인 번들 미지원 실측)

`plugin.json`의 mcpServers 포인터/인라인/`mcp.json` 모두 "skipped" — MCP는 Antigravity
전역 설정에 수동 등록한다. **파일이 둘이며 용도가 다름 (2026-07-10 L6 실측)**:

| 파일 | 읽는 주체 |
|---|---|
| `~/.gemini/config/mcp_config.json` | **agy CLI** (`--print` 포함) — CLI 테스트는 이 파일이 정본 |
| `~/.gemini/antigravity/mcp_config.json` | Antigravity IDE(Agent Manager) |

둘 다(또는 필요한 쪽에) 다음을 등록:

```json
{
  "mcpServers": {
    "sap": {
      "command": "node",
      "args": ["D:\\claude for SAP\\sap-agentic-harness\\interactive\\server\\launch.cjs", "--exposition=readonly"],
      "env": { "NODE_PATH": "D:\\claude for SAP\\sap-agentic-harness\\interactive\\server\\runtime-deps\\keyring\\node_modules" }
    }
  }
}
```

(write 세션은 `--exposition=readonly,high` — Codex 어댑터 README의 프리셋 표와 동일)

주의 2가지 (2026-07-10 L3 E2E 반영):
- **경로에 `interactive\\` 포함** — 레포 통합 후 서버 위치가 바뀜 (구 경로는 파일 없음).
- **`launch.cjs`(shim)를 가리킬 것** — `server.bundle.cjs` 직접 호출은 항상 mock 연결.
  shim이 `<cwd>/.sc4sap/active-profile.txt`를 읽어 연결을 배선하므로, 연결은
  Antigravity가 서버를 띄운 작업 폴더 기준 — 없으면 inspection-only(정상 폴백).

## Rules (상시 주입 안전 규칙)

워크스페이스 `.agents/rules/sap-standards.md`에
[core/policies/sap-standards.md](../../core/policies/sap-standards.md)의 Always-on
summary 섹션만 복사한다 (파일당 12,000자 한도 — 요약만, 상세는 경로 참조).

## 안전 모델 주의

Claude 훅 같은 사전 차단이 없다. 방어선: ① rules 요약+core/policies ② 서버 내장
가드(SAP_TIER·blocklist) ③ exposition 프리셋 ④ Antigravity 자체 도구 권한 설정
(`--dangerously-skip-permissions`는 SAP 작업에서 금지). 실데이터 2종 게이트는 정책
준수 의존 — Claude보다 한 겹 약함.

## 리뷰 패스

Agent Manager에서 별도 에이전트를 띄워 review-checklist를 수행시키거나:

```
agy --print --sandbox "…/core/procedures/review-checklist.md를 읽고 <review-request 경로>를 판정하라"
```

## 활성 스코프 (2026-07-10 실측)

agy 1.0.7의 enable/disable은 전역 스위치뿐 — 프로젝트 스코프 없음. 운용:
`agy plugin enable sap-agentic-harness` (SAP 작업 시) / `agy plugin disable ...` (종료).
현재 기본 상태: disabled.
