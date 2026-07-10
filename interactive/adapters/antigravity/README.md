# Antigravity 어댑터

설계(§4-2)의 "Claude 어댑터 import + 보정" 예상보다 좋은 결과 — **직설치가 그대로 동작**한다
(agy 1.0.7 실측, 2026-07-10). 루트 `plugin.json`(agy용 매니페스트) 하나만 추가하면
같은 레포가 Antigravity 플러그인이다.

## 설치 (실측 통과)

```
agy plugin validate "D:\claude for SAP\sc4sap-lite"   # skills 11 + agents 1 processed
agy plugin install  "D:\claude for SAP\sc4sap-lite"
```

임포트 위치: `~/.gemini/config/plugins/sc4sap-lite/` — **core/·server/ 포함 전체 복사**라
스킬 래퍼의 PLUGIN_ROOT 상대 해석이 유지된다. 갱신 시 재설치 필요(레포 수정이 자동 반영되지
않음 — doctor 점검 대상).

## MCP 서버 등록 (전역 — agy 1.0.7 플러그인 번들 미지원 실측)

`plugin.json`의 mcpServers 포인터/인라인/`mcp.json` 모두 "skipped" — MCP는 Antigravity
전역 설정(`~/.gemini` 하위 mcp_config)에 수동 등록한다. Agent Manager MCP 설정 UI 또는
설정 파일에 다음을 등록:

```json
{
  "mcpServers": {
    "sap": {
      "command": "node",
      "args": ["D:\\claude for SAP\\sc4sap-lite\\server\\server.bundle.cjs", "--exposition=readonly"],
      "env": { "NODE_PATH": "D:\\claude for SAP\\sc4sap-lite\\server\\runtime-deps\\keyring\\node_modules" }
    }
  }
}
```

(write 세션은 `--exposition=readonly,high` — Codex 어댑터 README의 프리셋 표와 동일)

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
