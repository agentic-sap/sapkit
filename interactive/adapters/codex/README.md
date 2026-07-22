# Codex CLI 어댑터

Codex 플러그인은 Claude와 동형이다 — 같은 레포 루트가 플러그인 루트이고,
`.codex-plugin/plugin.json` + `.agents/plugins/marketplace.json`이 매니페스트다.
같은 `skills/` 래퍼 12개가 그대로 쓰인다 (SKILL.md 형식이 양사 공통 — L0/L4 실측).

빠른 시작: 설치 후 `setup` 스킬을 실행하면 SAP 연결 파일(프로파일·`.sc4sap/` 2개)
생성과 자가 점검을 대화형으로 대신한다 — 단 권한·훅 자동 단계는 Claude Code 전용이라,
Codex에서는 마법사가 이 README의 해당 절(MCP 등록·실데이터 차단)로 안내한다.
정본 절차 = `core/procedures/setup.md`.

## 설치 (2026-07-10, codex-cli 0.144.1 실측 통과)

```
codex plugin marketplace add "D:\claude for SAP\sap-agentic-harness"
codex plugin add sapkit@agentic-sap
```

캐시에 core/·server/ 포함 전체가 패키징됨을 확인.
⚠️ 경로 `~/.codex/plugins/cache/agentic-sap/sapkit/...`는 **D-041 개명에서 파생한 예상값**이다 —
Claude 쪽에서 `cache/<마켓>/<플러그인>/<버전>` 구조를 실측했으나 Codex 재설치는 아직 안 했다.

어댑터-코어 동기화 점검: `node interactive/scripts/doctor.mjs` (3사 동기화 점검)

## MCP 서버 등록 (전역 — 프로젝트 config는 trust 게이트가 있어 비권장)

```
codex mcp add sap --env NODE_PATH="D:\claude for SAP\sap-agentic-harness\interactive\server\runtime-deps\keyring\node_modules" -- node "D:\claude for SAP\sap-agentic-harness\interactive\server\launch.cjs" --exposition=readonly
```

주의 2가지 (2026-07-10 L3 E2E 반영):
- **경로에 `interactive\` 포함** — 레포 통합 후 서버 위치가 바뀜 (구 경로는 파일 없음).
- **`launch.cjs`(shim)를 가리킬 것** — `server.bundle.cjs` 직접 호출은 항상 mock 연결
  (4.13 번들은 activateProfile을 connection 브로커에 안 넘김). shim이
  `<cwd>/.sc4sap/active-profile.txt` → 프로파일 sap.env를 `MCP_ENV_PATH`로 배선한다.
  따라서 **연결은 codex를 실행한 폴더 기준** — 그 폴더에 `.sc4sap/active-profile.txt`가
  없으면 inspection-only(정상 폴백).

**exposition 프리셋 (§5-4 미결 5 해소 — 서버 --help 실측):**

| 프리셋 | 의미 | 권장 용도 |
|---|---|---|
| `readonly` | Get*/Check*/Validate* + search + system | **Codex 기본** — Codex는 등록된 도구 전부가 컨텍스트에 올라가므로 read 중심 축소 필수 |
| `readonly,high` | 서버 기본값 (write 포함 ~155개) | gated write 작업 세션에서만 일시 사용 |
| `compact` | 파사드 축소판 | 최소 컨텍스트 실험용 |

write 작업이 필요한 세션: `codex mcp remove sap` 후 `--exposition=readonly,high`로 재등록
(또는 별도 이름 `sap-write`로 등록해 두고 평소 disable).

## 실데이터 2종 하드 차단 — 필수 (실 SAP 사용 전, HANDOFF §8-4)

Codex엔 Claude의 L3 사전 차단 훅이 없다. `readonly` 프리셋에도 실 업무데이터를 반환하는
`GetTableContents`·`GetSqlQuery` 2종이 노출되므로, **Codex config 레벨에서 이 둘을 하드
차단한다.** codex-cli **0.144.1 실측**이 근거 (2026-07-12, 5-8):

- ✅ **`disabled_tools`(및 `enabled_tools`)는 스키마가 인식·집행**한다 — `disabled_tools`에
  넣은 도구는 tools/list에서 제거되어 모델이 호출 자체를 못 한다. 실측: 설정 후
  `codex exec` 세션이 *"GetTableContents is not available … no such SAP tool"* 보고,
  **같은 세션에서 `GetSystemInfo`는 정상 실행**(다른 read 도구는 유지).
- ❌ **도구별 `approval_mode = "prompt"`는 `codex exec`(비대화형)에서 집행되지 않는다
  (fail-open)** — 승인 프롬프트를 못 띄우는 exec 모드에서 도구가 **그냥 실행**됐다.
  실측: `prompt` 설정에도 `GetTableContents`가 T000 실데이터(5행)를 반환. **승인 모드에
  의존 금지** — 대화형 TUI 여부와 무관하게 차단은 `disabled_tools`로만 보장한다.
  (`default_tools_approval_mode`·per-tool `approval_mode` 키 자체는 `--strict-config`가
  0.144.1 스키마로 인정하나, exec 집행이 열려 있어 차단 수단으로 못 쓴다.)

**등록 후 `~/.codex/config.toml`의 sap 블록에 `disabled_tools`를 추가**한다
(`codex mcp add`는 이 필드를 안 써주므로 수기 1줄):

```toml
[mcp_servers.sap]
command = "node"
args = ['<repo>\interactive\server\launch.cjs', "--exposition=readonly"]
disabled_tools = ["GetTableContents", "GetSqlQuery"]

[mcp_servers.sap.env]
NODE_PATH = '<repo>\interactive\server\runtime-deps\keyring\node_modules'
```

**검증:**

```
codex mcp get sap --json     # "disabled_tools": ["GetTableContents","GetSqlQuery"] 확인
```

행동 검증(선택): repo 루트(=`.sc4sap/active-profile.txt` 존재)에서
`$null | codex exec --json -s read-only --ephemeral "GetTableContents로 T000 1행 조회 시도"`
→ 모델이 "도구 없음" 보고. 같은 방식으로 `GetSystemInfo`는 정상 실행돼 다른 read 도구가
살아 있음을 확인. (codex exec는 stdout 리다이렉트 시 stdin EOF를 기다리므로 `$null |`
필수.)

> **대안(미구현 · 백로그 5-8 잔여):** 도구를 제거하지 않고 *호출별 승인*을 원한다면,
> config-level 승인이 exec에서 fail-open이라 `launch.cjs` 앞단에 이름-보존형 tools/list
> 필터가 필요하다(별도 항목 — 권장만, 미구현). 현재 정본 권장은 위의 하드 차단.

## 로컬 오프라인 검증 (vsp, 선택)

SAP 반영 전 `.abap` 파일을 로컬에서 미리 점검하고 싶으면 `vsp`(오프라인 ABAP
검증기)를 설치한다 — 없어도 플러그인 동작에는 지장 없다.

```
node interactive/scripts/get-vsp.mjs   # ~/.sc4sap/bin/vsp(.exe) 설치
```

설치 후 `vsp lint <파일>` / `vsp parse <파일>`로 사용. 자세한 내용:
[core/procedures/troubleshooting.md §7](../../core/procedures/troubleshooting.md#7-vsp-local-verification-optional).

## SAP 프로젝트 루트 AGENTS.md

`AGENTS-template.md`의 내용을 대상 SAP 프로젝트의 `AGENTS.md`에 병합한다
(합산 32KiB 한도 — 템플릿은 요약+포인터만).

## 안전 모델 주의 (정직성 명시)

Codex에는 도구 호출 사전 차단 훅이 없다. 방어선은
① 문서 정책(AGENTS 요약+core/policies) ② 서버 내장 가드(SAP_TIER·blocklist)
③ exposition 프리셋 ④ **`disabled_tools` 하드 차단**(위 "실데이터 2종 하드 차단" — 필수)
⑤ Codex 승인 모드/샌드박스. 실데이터 조회 2종(GetTableContents/GetSqlQuery)의 **호출
건별 승인은 Codex에서 신뢰 불가**(0.144.1 실측: `approval_mode="prompt"`가 `codex exec`
에서 fail-open) — 그래서 정책 준수가 아니라 **④ 하드 차단으로 무력화**한다. 실 SAP
사용 전 반드시 `disabled_tools` 적용 + `codex mcp get sap --json`으로 검증할 것.

## 리뷰 패스

```
codex exec --sandbox read-only "PLUGIN_ROOT/core/procedures/review-checklist.md를 읽고 <review-request 경로>를 판정하라"
```

## 활성 스코프 (2026-07-10 실측)

Codex 플러그인 활성화는 **전역 전용**이다 — 프로젝트 `.codex/config.toml`의
`[plugins]` 오버레이와 `-c plugins...enabled=true` 런타임 오버라이드 모두 스킬 로딩에
반영되지 않음을 실측으로 확인했다. 운용:

```
node adapters/codex/toggle-plugin.mjs on      # SAP 작업 시작
node adapters/codex/toggle-plugin.mjs off     # 종료 (다른 프로젝트 오염 방지)
node adapters/codex/toggle-plugin.mjs status
```
