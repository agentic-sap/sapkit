# 안전훅 6종 (선택 기능)

기본 설치 경로에는 훅이 **없다**(설계 v2 §7-4, 2026-08-02). 필수 안전(QA/PRD write·실행
차단, 테이블 blocklist)의 정본은 이제 MCP 서버 번들 자신이다 — 훅이 배선되지 않아도 이
바닥선은 그대로 작동한다. 이 문서가 다루는 6종 훅은 **삭제되지 않았다**: "설정으로 껐다
다시 켤 수 있다"는 전제를 지키기 위해 파일과 설치기가 기한 없이 보존되는 선택
스위치다(R-SWITCH). 배선하지 않은 훅 파일은 세션 토큰·설치 부담이 0이다 — 이 문서가
설명하는 기능은 전부 **훅을 켠 경우에만** 적용된다.

정본 절차는 [core/procedures/setup.md](../../../core/procedures/setup.md) Step 4c(설치
안내·기존 배선 마이그레이션)·Step 6(배선 검증)이다. 이 문서는 그 절차가 가리키는
참고 자료다.

## 훅 6종 — 본질과 켰을 때 복원되는 것

| 훅 (marker) | 이벤트 | 본질 | 실패 모드 | 켰을 때 복원되는 것 |
|---|---|---|---|---|
| `block-forbidden-tables.mjs` | PreToolUse (`GetTableContents`\|`GetSqlQuery`) | 서버 blocklist의 상위 호환 — 활성 프로파일별(`.sapkit/config.json`의 `blocklistProfile`: `minimal`\|`standard`\|`strict`\|`custom`) 테이블 차단을 **호출 전에** 판정 | fail CLOSED(빈 페이로드·파싱 실패·blocklist 로드 실패·빌트인 0건 시 deny) | `blocklistProfile` 미설정 시 **strict** 기본값(서버는 standard) · `.sapkit/config.json`의 `blocklistProfile`(4종, `custom`은 서버엔 없는 값) · `blocklist-extend.txt`/`blocklist-custom.txt` 파일 · deny/ask 확인창 |
| `tier-readonly-guard.mjs` | PreToolUse (Create/Update/Delete/Activate/Patch/Release/Write*, RunUnitTest, Runtime\*Profiling, ReloadProfile) | 서버 tier 게이트와 같은 판정(QA/PRD write·실행 차단)을 클라이언트에서 한 번 더 | fail CLOSED(tier 미해석 시 deny) | 서버와 같은 차단을 클라이언트 레벨에서 이중화 — 훅이 없어도 서버가 이미 담당(아래 표) |
| `prefer-sqlquery-explicit-fields.mjs` | PreToolUse (`GetTableContents`\|`GetSqlQuery`) | 비용/UX 조언(잔소리) — 전체 컬럼 조회·`SELECT *` 시 확인 요구, COUNT 등 집계는 예외 | fail OPEN | 확인창(Claude 권한 모드와 무관하게 뜬다 — 정상 모드든 bypass/자동수락 모드든 훅의 ask/deny는 별도 경로) |
| `offline-code-analysis.mjs` | PostToolUse (Edit/Write/MultiEdit의 `.abap` · MCP Create/Update) | 로컬 품질 조언(D-049) — vsp 오프라인 13룰 분석 결과를 모델에 되먹임, 절대 차단하지 않음 | fail OPEN(vsp 미설치 시 무음 통과) | 해당 없음 — vsp 선택 설치와 함께 안내되는 순수 부가 기능 |
| `syntax-checker.mjs` | PostToolUseFailure (MCP ABAP Create/Update 실패) | 실패 직후 `CheckSyntax` 실행을 제안하는 조언 | 해당 없음(advisory, 차단하지 않음) | 해당 없음 |
| `transport-validator.mjs` | PreToolUse (MCP ABAP Create/Update, 비-`$TMP`) | 이송 요청 누락 시 상기시키는 조언(non-blocking) | 해당 없음(advisory, 차단하지 않음) | 해당 없음 |

## 훅 없는 기본 상태의 보호 (정직 표)

훅을 하나도 설치하지 않아도 다음 층은 그대로 작동한다 — 무방비 상태가 아니다. 다만
각 층의 한계를 정직하게 적는다:

| 층 | 담당 | 한계 |
|---|---|---|
| 서버 blocklist | 보호 테이블 거부(deny/ask) · ask층은 `acknowledge_risk` 자기신고 + stderr 감사 | 기본값 `standard`(훅 기본 strict보다 한 단계 낮음). 서버가 실제 받는 `MCP_BLOCKLIST_PROFILE` 값은 **`minimal`·`standard`(기본)·`strict`·`off` 4종뿐**이며 그 밖의 값은 조용히 `standard`로 폴백한다(실측, `engine/src/lib/policy/tableBlocklist.ts`) — 훅의 `custom`은 서버엔 없는 값이다. **`MCP_BLOCKLIST_PROFILE`·`MCP_BLOCKLIST_EXTEND`·`MCP_ALLOW_TABLE` 3종은 활성 프로파일의 `sap.env` 파일 안에 적을 때만 유효하다** — 서버는 프로파일을 활성화할 때 프로세스 env의 이 3종을 먼저 지우고 `sap.env` 값으로만 다시 채우므로(`engine/src/lib/profile.ts` `applyProfile`), 셸 export나 MCP 서버 등록의 `env` 블록으로 준 값은 조용히 무시된다(실측). ask는 자기신고이지 하드 게이트가 아니다(D-043 ⓑ). |
| 서버 tier 게이트 | QA/PRD write·실행 차단, tier 미해석 시 write fail-closed | stdio 경로 배선은 이 릴리스의 엔진 수리로 확보됐다 — `conformance-server-gates.mjs`가 매 CI에서 검증한다 |
| Claude 권한창 | permissions-template의 실데이터 2종 제외 → 정상 권한 모드에서 호출별 승인 | bypass/자동수락 모드에서는 이 승인창 자체가 뜨지 않는다 |
| Codex `disabled_tools` | row-data 2종(`GetTableContents`/`GetSqlQuery`) 하드 차단 | 사용자가 `~/.codex/config.toml`에 직접 설정(자동 배선 여부는 실측 진행 중) — [adapters/codex/README.md](../../codex/README.md) 참고 |

**훅을 켜면 복원되는 것**: strict 기본값 · `.sapkit/config.json`의 `blocklistProfile`(`custom`
포함 4종) · `blocklist-extend.txt`/`blocklist-custom.txt` 파일 · 권한 모드와 무관한 ask
확인창. 위 표의 항목들은 훅 없이도 이미 작동하는 바닥선이고, 이 문단의 항목들은 **훅을
켠 경우에만** 추가로 적용된다.

## 설치

```
node "<PLUGIN_ROOT>/adapters/claude/hooks/install-hooks.mjs"              # 사용자 설정 (~/.claude/settings.json)
node "<PLUGIN_ROOT>/adapters/claude/hooks/install-hooks.mjs" --project .  # 프로젝트 설정 (<프로젝트>/.claude/settings.json)
```

- 6종을 한 번에 등록한다: `block-forbidden-tables`·`tier-readonly-guard`·
  `prefer-sqlquery-explicit-fields`·`offline-code-analysis`·`syntax-checker`
  (PostToolUseFailure)·`transport-validator`.
- **멱등**: marker(스크립트 파일명) 기준으로 upsert — 재실행해도 같은 내용이면 파일
  diff가 0이다. 이미 설치된 다른 훅(SAPKIT 소유가 아닌 것)이나 `hooks` 밖의 키
  (`permissions`·`env` 등)는 절대 건드리지 않는다.
- 각 훅의 command는 버전 무관 marketplace 고정 경로
  (`~/.claude/plugins/marketplaces/agentic-sap/interactive/adapters/claude/hooks/<script>`)를
  우선 사용하고, 없으면 이 설치기와 같은 폴더의 경로로 폴백한다 — 플러그인 업데이트
  뒤에도 command 경로가 죽지 않는다.
- 설치 직후 콘솔에 훅별 matcher·command·테스트 방법(`testHint`)이 출력된다 — 그대로
  사용자에게 보여줄 것.

## 제거

```
node "<PLUGIN_ROOT>/adapters/claude/hooks/install-hooks.mjs" --uninstall             # 사용자 설정에서 제거
node "<PLUGIN_ROOT>/adapters/claude/hooks/install-hooks.mjs" --project . --uninstall # 프로젝트 설정에서 제거
```

marker 기준으로 SAPKIT 훅만 제거하고 다른 훅·설정 키는 그대로 둔다. 아무것도 설치돼
있지 않으면 "nothing to remove"로 무변화 no-op이다.

## 검증

세 가지 방법이 있고 커버리지가 다르다 — 하나만으로 전부를 확인했다고 가정하지 말 것.

1. **재설치 자체가 상태 조회를 겸한다** — 옵션 없이 위 설치 명령을 다시 실행하면 콘솔에
   현재 등록된 6종 각각의 `installed`/`updated`, matcher, command, `testHint`가 그대로
   출력된다(이미 같은 내용이면 파일은 건드리지 않는다).
2. **`/sapkit:setup` Step 6**이 프로젝트 `.claude/settings.json`(및 Step 4c가 찾은 범위 —
   사용자 `~/.claude/settings.json`)을 직접 읽어, 등록된 각 훅의 command가 가리키는
   스크립트 경로가 실제로 존재하는지 확인한다 — 플러그인 캐시 이동·마켓명 변경 등으로
   끊긴 죽은 경로를 FAIL로 보고한다.
3. **`node interactive/scripts/doctor.mjs`**의 "⑧ SAPKIT 훅 배선" 검사 — 사용자
   `~/.claude/settings.json`과 프로젝트 `.claude/settings.json`·`settings.local.json`
   **세 곳 모두**를 스캔한다(설계 v2 §9-2 항목 8). `PROJECT_DIR = process.cwd()` 기준이라
   사용자의 실제 SAP 프로젝트 디렉터리에서 실행하면 그 프로젝트가 대상이 된다 — 이 문서
   초안 시점엔 플러그인/레포 자신의 디렉터리만 보던 좁은 범위였으나, 그 갭은 이미
   메워졌다. v2부터 훅 미배선이 기본값이므로 **미배선은 INFO**(정상 — 결함 아님)로
   보고하고, **죽은 경로만 WARN**한다.

## 기존 사용자 마이그레이션

과거 setup이 훅을 자동 설치하던 시절부터 이어온 배선이 있다면(사용자
`~/.claude/settings.json`·프로젝트 `.claude/settings.json` 어느 쪽이든), `/sapkit:setup`을
다시 실행할 때 Step 4c가 그 배선을 보고하고 제거 여부를 **한 번만** 묻는다. 유지를
선택해도 정상 상태다 — 이제는 삭제 대상이 아니라 선택 기능이기 때문이다. 제거를
승인하면 위 "제거" 절의 `--uninstall`을 실행한다.

## 관련 문서

- [core/procedures/setup.md](../../../core/procedures/setup.md) — Step 4c(설치 안내)·
  Step 6(배선 검증)
- [core/policies/data-protection/](../../../core/policies/data-protection/) —
  `block-forbidden-tables.mjs`가 읽는 blocklist 원본
- [adapters/codex/README.md](../../codex/README.md) — Codex의 등가 방어선(`disabled_tools`
  하드 차단, 훅 없음)
