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

어댑터-코어 동기화 점검: `node interactive/scripts/doctor.mjs` (3사 동기화 점검)

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
가드(SAP_TIER·blocklist) ③ exposition 프리셋 ④ **`excludeTools` 하드 차단 시도(아래
— 실측 결과 미작동, 의존 금지)** ⑤ Antigravity 자체 도구 권한 설정
(`--dangerously-skip-permissions`는 SAP 작업에서 금지 — 도구 호출별 승인이 현재
유일한 실효 방어).

### 실데이터 2종 하드 차단 시도 — 실측 결과 미작동 (2026-07-19)

gemini-CLI MCP 설정은 서버별 도구 필터를 지원한다(공식 문서 기준):
`excludeTools`(차단 목록) · `includeTools`(허용 목록) · `trust`(true면 해당 서버 승인
전면 우회 — **sap엔 절대 금지**). **`excludeTools`가 `includeTools`에 우선**한다는
것도 공식 문서 기준. agy는 `~/.gemini/config/` 레이어를 공유하므로 같은 키가
파싱될 가능성은 있었으나:

**실측 미작동(2026-07-19, agy 1.0.16·1.1.4)**: 아래 예시대로 sap 블록에
`excludeTools`를 넣어도 `GetTableContents`·`GetSqlQuery`가 노출 목록에 그대로
나타남 — 대조군(sap 서버 미등록 시 노출 0건 확인으로 측정 방식 자체를 검증) ·
서버 직결 교차검증(`smoke-mcp.mjs`로 두 도구가 agy 없이도 서버 기본 카탈로그에
실재함 확인) · 노출 순서가 서버 선언 순서와 일치(암기·환각이 아니라 실제
tools/list 반영이라는 방증) 3갈래로 확인됐다. **이 설정에 의존하지 말 것.**
`includeTools`는 이번에 별도로 실측하지 않았으나 같은 필터 메커니즘을 공유할
가능성이 높아 **미실측·신뢰 금지**로 함께 취급한다.

재실측 트리거: agy가 새 버전을 내면(2026-07-19 기준 1.1.4) 1회 재실측 — 작동이
확인되면 이 경고를 걷어내고 이 절을 "실증"으로 승격할 것. 아래 예시는 그때까지
참고용으로만 남긴다(현재는 적용해도 효과 없음):

```json
{
  "mcpServers": {
    "sap": {
      "command": "node",
      "args": ["<repo>\\interactive\\server\\launch.cjs", "--exposition=readonly"],
      "env": { "NODE_PATH": "<repo>\\interactive\\server\\runtime-deps\\keyring\\node_modules" },
      "excludeTools": ["GetTableContents", "GetSqlQuery"]
    }
  }
}
```

`trust`는 넣지 말 것(기본 false 유지 — 도구 호출별 승인이 **현재 유일한 실효
방어**). 실측으로 확인된 사실: 실데이터 2종 게이트가 없는 상태이고, 잔여 위험은
Claude보다 한 겹 약함(호출 시점 승인 프롬프트 하나가 최후 방어선).

## 리뷰 패스

Agent Manager에서 별도 에이전트를 띄워 review-checklist를 수행시키거나:

```
agy --print --sandbox "…/core/procedures/review-checklist.md를 읽고 <review-request 경로>를 판정하라"
```

## 활성 스코프 (2026-07-10 실측)

agy 1.0.7의 enable/disable은 전역 스위치뿐 — 프로젝트 스코프 없음. 운용:
`agy plugin enable sap-agentic-harness` (SAP 작업 시) / `agy plugin disable ...` (종료).
현재 기본 상태: disabled.
