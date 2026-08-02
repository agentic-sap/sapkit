# Codex CLI 어댑터

Codex 플러그인은 Claude와 동형이다 — 같은 레포 루트가 플러그인 루트이고,
`.codex-plugin/plugin.json` + `.agents/plugins/marketplace.json`이 매니페스트다.
같은 `skills/` 래퍼 14개가 그대로 쓰인다 (SKILL.md 형식이 양사 공통 — L0/L4 실측).

빠른 시작: 설치 후 `setup` 스킬을 실행하면 SAP 연결 파일(프로파일·`.sapkit/` 2개)
생성과 자가 점검을 대화형으로 대신한다 — Codex의 MCP 배선도 이제 setup Step 0이
`codex-wire-mcp.mjs`로 자동 처리한다(아래 "MCP 서버(번들)"). 권한 템플릿·훅 자동
단계만 Claude Code 전용이라, Codex에서는 마법사가 이 README의 실데이터 하드 차단
절로 안내한다. 정본 절차 = `core/procedures/setup.md`.

## 설치

**목표 사용자 경험** (GitHub 마켓 배포본 — 설계 v2 §2):

```
codex plugin marketplace add agentic-sap/sapkit
codex plugin add sapkit@agentic-sap
# 새 세션
$sapkit:setup
```

**로컬 체크아웃 설치** (개발/도그푸딩 — 2026-07-10, codex-cli 0.144.1 실측 통과):

```
codex plugin marketplace add "D:\claude for SAP\sap-agentic-harness"
codex plugin add sapkit@agentic-sap
```

캐시에 core/·server/ 포함 전체가 패키징됨을 확인(로컬 경로 기준 실측). 위 GitHub 마켓
경로("목표") 자체의 이 머신 재현은 아직 별도 실측 전이다.

캐시 경로 `<CODEX_HOME>/plugins/cache/agentic-sap/sapkit/<version>/`(기본
`<CODEX_HOME>` = `~/.codex`)는 **2026-08-02 실측 확인**됐다 — Claude와 같은
`cache/<마켓>/<플러그인>/<버전>` 구조다(D-041 개명에서의 예상값이 실측으로 확정됐다).

어댑터-코어 동기화 점검: `node interactive/scripts/doctor.mjs` (3사 동기화 점검)

## MCP 서버 (번들 — 수동 `codex mcp add` 폐기)

과거 이 절이 안내하던 `codex mcp add ...` **수동 전역 등록 절차는 폐기됐다.** MCP는
이제 플러그인에 **동봉**되어 스킬과 함께 자동 설치된다 — 사용자가 명령을 손으로
입력할 필요가 없다.

설치 직후에는 번들 매니페스트의 경로가 `{{SAPKIT_PLUGIN_ROOT}}` 토큰 상태라 서버가
아직 기동하지 않을 수 있다(스킬 자체는 정상 — manifest의 `required:false` 덕분에
세션은 깨지지 않는다). 배선(**2026-08-02 구현 완료 · E2E 실측**):

```
node "<설치 캐시>/scripts/codex-wire-mcp.mjs" status --json
node "<설치 캐시>/scripts/codex-wire-mcp.mjs" apply  --json
```

`apply`는 설치 캐시를 자동 탐색해 토큰을 절대경로로 재작성한다(멱등 — 이미 배선돼
있으면 무변화). 실행 후 **새 세션**을 시작해야 MCP가 반영된다. `/sapkit:setup`이
Codex를 감지하면 이 절차를 대신 실행하고 안내한다(정본 = `core/procedures/setup.md`
Step 0) — 수동 실행은 setup을 거치지 않았거나, 플러그인 업데이트 뒤 경로가 다시
스테일해졌을 때만 필요하다(같은 명령이 업데이트 후의 스테일 경로도 수리한다).

`--json` 출력의 `overall`(설치본 전체 중 최악값)과 `installations[].state`가 갖는 값:

| state | 의미 | 조치 |
|---|---|---|
| `WIRED_OK` | 이미 절대경로로 배선됨 | 조치 없음 |
| `TOKEN_PENDING` | 신규 설치 직후, 토큰 미해결 | `apply` 실행 후 새 세션 |
| `STALE_PATH` | 과거엔 배선됐던 경로가 더 이상 유효하지 않음(예: 업데이트 후) | `apply` 실행 후 새 세션 |
| `NOT_FOUND` | 설치본을 찾지 못함 | Codex 플러그인 미설치로 취급 |
| `PARSE_ERROR` | 매니페스트/설정 파싱 실패 | 자동 진행하지 않음 — 사람이 직접 확인 |

`launch.cjs`(shim)가 여전히 `<cwd>/.sapkit/active-profile.txt` → 프로파일 sap.env를
`MCP_ENV_PATH`로 배선한다. 따라서 **연결은 codex를 실행한 폴더 기준** — 그 폴더에
`.sapkit/active-profile.txt`가 없으면 inspection-only(정상 폴백).

### 도구면 (toolSurface)

등록 시 `--exposition`을 손으로 넣던 절차는 사라졌다 — 기본은 `.sapkit/config.json`의
`toolSurface`다(`readonly` 기본·권장, `development`는 활성 프로파일 `SAP_TIER=DEV` +
`/sapkit:setup`에서 명시 선택했을 때만 열린다). `setup`에서 값을 바꾸면 다음 MCP
재시작부터 반영된다. 아래는 프리셋의 의미(참고용):

| 프리셋 | 의미 | 비고 |
|---|---|---|
| `readonly` | Get*/Check*/Validate* + search + system | 기본·권장 — Codex는 등록된 도구 전부가 컨텍스트에 올라가므로 read 중심 축소가 특히 중요 |
| `development`(→`readonly,high`) | 서버 기본값(write 포함 ~155개) | `SAP_TIER=DEV` 프로파일 + `setup`에서 명시 선택했을 때만 |
| `compact` | 파사드 축소판 | 최소 컨텍스트 실험용 — `toolSurface`에는 없는 값, 수동 오버라이드 전용 |

## 기존 사용자 마이그레이션 (전역 `[mcp_servers.sap]` 등록이 있었다면)

과거 이 문서의 수동 등록 절차를 따라 전역 `[mcp_servers.sap]` 항목을 이미 만들어 둔
사용자는 주의: **그 전역 등록이 있으면 번들 MCP가 조용히 가려진다**(실측). 증상은
스킬은 정상인데 도구 목록·동작이 예전 수동 등록 시점의 것(예: 옛 `--exposition` 값)에
머무는 식으로 나타날 수 있다.

- `node interactive/scripts/doctor.mjs`가 이 충돌(전역 등록 + 번들 공존)을 감지해
  보고한다.
- 제거는 **사용자 확인 후에만** — `codex mcp remove sap`를 실행하기 전에 반드시
  사용자에게 물을 것(자동 제거 금지).
- 제거 후에는 위 "MCP 서버(번들)" 절의 `codex-wire-mcp.mjs status`로 번들 쪽이 정상
  배선됐는지 다시 확인한다.

## 실데이터 2종 하드 차단 — 필수 (실 SAP 사용 전, HANDOFF §8-4)

Codex엔 Claude의 L3 사전 차단 훅이 없다. `readonly`를 포함한 모든 도구면에 실
업무데이터를 반환하는 `GetTableContents`·`GetSqlQuery` 2종이 노출되므로, **Codex
기본값은 이 둘을 `disabled_tools`로 하드 차단하는 것을 유지한다.**

**근거 (2026-08-02 갱신, codex-cli 0.146.0 실측)**: 과거(0.144.1, 2026-07-12)의 근거는
"도구별 `approval_mode="prompt"`가 `codex exec`(비대화형)에서 fail-open"이었다. 0.146.0
재실측 결과 `codex exec`의 기본·`prompt` 승인 모드는 **fail-closed(자동 취소)로 바뀌어
있다** — 다만 (a) TUI(대화형) 쪽 동작은 아직 실측하지 못했고, (b) 더 근본적으로
**도구별 `approval_mode`는 사용자 개인 config 전용 설정이며 플러그인이 선언·배포할 수
없다**(0.146.0 실측) — 그래서 이 값이 실제로 잘 작동하는지와 무관하게 "배포 기본값"으로
채택할 수 있는 설정 자체가 아니다. 결론은 바뀌지 않는다: 승인 모드에 의존하지 않고
`disabled_tools`로 도구 자체를 `tools/list`에서 제거한다.

> **구판 실측 각주(0.144.1, 2026-07-12)**: 당시 `approval_mode="prompt"`를 설정해도
> `codex exec`에서 `GetTableContents`가 T000 실데이터(5행)를 반환했다 — 승인 프롬프트를
> 띄울 수 없는 비대화형 세션에서 도구가 그냥 실행된 사례. 이 결과는 **구판·전역 수동
> 등록 경로의 이력**으로 남긴다; 현재(0.146.0) 결론은 위 근거로 대체됐다.

**설정**: 번들 MCP가 command/args/env를 자동 공급하므로, 사용자가 직접 쓰는 것은
`disabled_tools` 한 줄뿐이다. `~/.codex/config.toml`의 `sap` 항목에 추가한다:

```toml
[mcp_servers.sap]
disabled_tools = ["GetTableContents", "GetSqlQuery"]
```

(command/args/env는 번들이 채운다 — 직접 쓰지 않는다. 이 부분 오버라이드가 번들
등록과 자동으로 병합되는지는 아직 실측 확정 전이다 — P0/P1 실측 대상. 그때까지는
아래 검증 명령으로 항상 실제 적용 여부를 확인할 것.)

**검증:**

```
codex mcp get sap --json     # "disabled_tools": ["GetTableContents","GetSqlQuery"] 확인
```

행동 검증(선택): repo 루트(=`.sapkit/active-profile.txt` 존재)에서
`$null | codex exec --json -s read-only --ephemeral "GetTableContents로 T000 1행 조회 시도"`
→ 모델이 "도구 없음" 보고. 같은 방식으로 `GetSystemInfo`는 정상 실행돼 다른 read 도구가
살아 있음을 확인. (codex exec는 stdout 리다이렉트 시 stdin EOF를 기다리므로 `$null |`
필수.)

> **대안(미구현 · 백로그 5-8 잔여):** 도구를 제거하지 않고 *호출별 승인*을 원한다면,
> config-level 승인이 exec에서 fail-open이었던 이력이 있고(위 각주) 현재도 플러그인이
> 배포할 수 있는 설정이 아니므로, `launch.cjs` 앞단에 이름-보존형 tools/list 필터가
> 필요하다(별도 항목 — 권장만, 미구현). 현재 정본 권장은 위의 하드 차단.

## 로컬 오프라인 검증 (vsp, 선택)

SAP 반영 전 `.abap` 파일을 로컬에서 미리 점검하고 싶으면 `vsp`(오프라인 ABAP
검증기)를 설치한다 — 없어도 플러그인 동작에는 지장 없다.

```
node interactive/scripts/get-vsp.mjs   # ~/.sapkit/bin/vsp(.exe) 설치
```

설치 후 `vsp lint <파일>` / `vsp parse <파일>`로 사용. 자세한 내용:
[core/procedures/troubleshooting.md §7](../../core/procedures/troubleshooting.md#7-vsp-local-verification-optional).

## SAP 프로젝트 루트 AGENTS.md

`AGENTS-template.md`의 내용을 대상 SAP 프로젝트의 `AGENTS.md`에 병합한다
(합산 32KiB 한도 — 템플릿은 요약+포인터만).

## 안전 모델 주의 (정직성 명시)

Codex에는 도구 호출 사전 차단 훅이 없다. 방어선은
① 문서 정책(AGENTS 요약+core/policies) ② 서버 내장 가드(SAP_TIER·blocklist)
③ toolSurface/exposition ④ **`disabled_tools` 하드 차단**(위 "실데이터 2종 하드 차단" —
필수) ⑤ Codex 승인 모드/샌드박스. 실데이터 조회 2종(GetTableContents/GetSqlQuery)의
**호출 건별 승인은 Codex에서 신뢰할 수 있는 배포 기본값이 아니다**(근거는 위 절 참고 —
도구별 `approval_mode`는 사용자 config 전용이라 플러그인이 배포할 수 없고, 구판
0.144.1은 게다가 `codex exec`에서 fail-open이었다) — 그래서 정책 준수가 아니라
**④ 하드 차단으로 무력화**한다. 실 SAP 사용 전 반드시 `disabled_tools` 적용 +
`codex mcp get sap --json`으로 검증할 것.

## 리뷰 패스

```
codex exec --sandbox read-only "PLUGIN_ROOT/core/procedures/review-checklist.md를 읽고 <review-request 경로>를 판정하라"
```

## 구현 위임 (execution_owner = delegated)

Codex에는 플러그인이 정의하는 서브에이전트가 없다 — 위임 = **새 codex 세션**이다.

```
codex exec "PLUGIN_ROOT/agents/sap-worker.md의 계약을 그대로 따라 <슬라이스>를 구현하라. 스펙: <경로> · 이송: <TRKORR> · 범위 밖 객체 금지"
```

경계의 집행 강도가 Claude와 다르다 — 정직하게 적는다:

- **P2(실데이터)**: 위 §실데이터 2종 하드 차단의 `disabled_tools`가 그대로 담당한다.
  위임 세션에도 같은 설정이 걸려 있어야 한다(전역 설정이면 자동 승계).
- **P4(이송)·컨트롤 아티팩트·자기 리뷰 금지**: 기계 차단 없음 — 워커 계약 문서에만
  존재하는 절차 규범이다. 그래서 Codex에서는 슬라이스를 더 작게 끊고, 이송은 메인
  세션이 직접 잡는 편이 안전하다.

## 활성 스코프 (2026-07-10 실측)

Codex 플러그인 활성화는 **전역 전용**이다 — 프로젝트 `.codex/config.toml`의
`[plugins]` 오버레이와 `-c plugins...enabled=true` 런타임 오버라이드 모두 스킬 로딩에
반영되지 않음을 실측으로 확인했다. Codex에 plugin enable/disable 공식 명령은 없다
(`add`/`list`/`marketplace`/`remove`뿐) — 그래서 아래 `toggle-plugin.mjs`가 계속
유효하다. 운용:

```
node adapters/codex/toggle-plugin.mjs on      # SAP 작업 시작
node adapters/codex/toggle-plugin.mjs off     # 종료 (다른 프로젝트 오염 방지)
node adapters/codex/toggle-plugin.mjs status
```
