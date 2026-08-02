# SAPKit 배포 온보딩·Codex 동등 UX 설계 — `engine/` 소스 제거 기준

> 작성 2026-08-02 · 상태 = **검토 초안(Draft), 미집행**  
> 검토 대상 = Claude Code · 구현 결정/`DECISIONS.md` 반영은 리뷰와 사용자 승인 뒤  
> 제품 경계 = `interactive/` · `engine/`은 실행 경로가 아닌 빌드 소스/공방 자산  
> 관련 결정 = D-041~D-046(배포·setup) · D-057(런타임 경로 개명)

## 0. 한 문장 결론

**Claude Code와 Codex 모두 “마켓플레이스 등록 → SAPKit 설치 → setup”만으로 시작하게
만들고, MCP는 플러그인에 동봉하며, `engine/` 소스와 필수 훅은 설치 경로에서 제거한다.**
안전의 정본은 `interactive/server/`의 런타임 번들로 두고 훅은 선택 기능으로 강등한다.

## 1. 먼저 구분할 것 — `engine/` 제거의 두 의미

이 설계가 채택하는 의미는 **A**다.

| 구분 | 제거 대상 | 결과 |
|---|---|---|
| **A. 채택** | 레포의 `engine/` 소스·테스트·빌드 작업공간 | `interactive/server/server.bundle.cjs`는 남으므로 SAP MCP 조회·개발 기능 유지 |
| B. 비범위 | `interactive/server/` 런타임 번들까지 제거 | SAP MCP 기능 전체 소실. 지식·절차 스킬만 남고 SAP 업무 실행은 불가능 |

현재 마켓플레이스 두 벌 모두 플러그인 원천을 `./interactive`로 가리키므로, **다른 PC에
설치되는 제품에는 이미 `engine/`이 포함되지 않는다.** 따라서 A는 설치 용량 개선보다는
개발 레포 정리 결정이다. A를 실행해도 런타임 번들은 계속 유지·검증해야 한다.

> `engine/`을 지웠다는 이유만으로 훅이 필요 없어지는 것은 아니다. 훅은 소스 폴더가 아니라
> MCP 도구 호출을 관찰한다. 다만 서버 번들이 안전을 자체 집행한다면 훅을 **필수 방어선**으로
> 둘 이유가 없으므로, 이 설계는 기본 경로에서 훅을 제거한다.

## 2. 목표와 비목표

### 2-1. 목표 사용자 경험

새 PC에 Node.js와 해당 클라이언트가 설치되어 있다는 전제에서:

**Claude Code**

```text
claude plugin marketplace add agentic-sap/sapkit
claude plugin install sapkit@agentic-sap --scope user
# 새 세션 또는 /reload-plugins
/sapkit:setup
```

**Codex**

```text
codex plugin marketplace add agentic-sap/sapkit
codex plugin add sapkit@agentic-sap
# 새 세션
$sapkit:setup
```

완료 뒤 사용자가 하지 않아야 할 일:

- `codex mcp add`를 별도로 실행
- 플러그인 캐시의 절대경로 탐색·복사
- `~/.codex/config.toml`에 MCP command/args/env를 수기 작성
- 기본 사용을 위해 Claude/Codex 훅을 설치하거나 신뢰 처리
- `engine/` 또는 `vsp/` 소스를 내려받거나 빌드

### 2-2. 동등성의 정의

동등성은 두 클라이언트의 파일 형식이 같다는 뜻이 아니라 다음 **사용 결과**가 같다는 뜻이다.

1. 설치 후 SAPKit 스킬과 `sap` MCP가 자동 발견된다.
2. 프로파일이 없으면 오류 대신 inspection-only로 시작한다.
3. 같은 프로젝트 설정과 프로파일을 읽는다.
4. 기본은 read-only이고, 명시적으로 선택한 DEV 프로젝트만 development 도구를 노출한다.
5. 비밀은 대화·명령 인자·진단 출력에 나타나지 않는다.
6. setup 재실행과 업데이트 뒤에도 경로가 깨지지 않는다.

클라이언트가 제공하지 않는 기능까지 억지로 동일하게 만들지는 않는다. 차이가 남으면 기능을
조용히 열지 말고 **안전한 축소 + 명시적 경고**로 처리한다.

### 2-3. 비목표

- SAP 측 자산 설치·이송·운영 권한 자동화
- `engine/`을 제거하면서 MCP 기능까지 제거하는 skills-only 제품 전환
- 사용자 비밀번호 수집 또는 자동 저장
- 원격 스크립트를 `curl | sh`, `irm | iex` 형태로 즉시 실행하는 설치 방식
- Antigravity 동등화(기존 동작 보존만 하고 이번 완료 기준에서는 제외)
- 기존 `.sc4sap/` 상태의 자동 이동(D-057의 사람 전용 이행 원칙 유지)

## 3. 현행 진단

| 항목 | Claude Code 현행 | Codex 현행 | 문제 |
|---|---|---|---|
| 플러그인 설치 | 마켓 등록 + 설치 | 마켓 등록 + 설치 | 대체로 동등 |
| MCP | `interactive/.mcp.json`으로 자동 연결 | README의 `codex mcp add` 수동 등록 | Codex만 절대경로·재등록 필요 |
| 캐시 경로 | `${CLAUDE_PLUGIN_ROOT}` 사용 | 사용자가 `launch.cjs`와 `NODE_PATH` 경로 입력 | 업데이트 때 경로 표류 가능 |
| setup | 프로파일·프로젝트·권한·훅 수행 | 권한·훅 단계 skip 후 README 안내 | “한 번의 setup” 약속이 Codex에서는 불완전 |
| 기본 도구면 | `readonly,high` 고정 | 수동 예시는 `readonly` | 설치 직후 동작이 다름 |
| 실데이터 도구 | Claude allow-list에서 제외하여 승인창 유지 | `disabled_tools` 수기 추가 권고 | 수기 누락 위험·기능 차이 |
| 훅 | 프로젝트 settings에 절대 캐시경로 등록 | 현행 문서상 없음 | 업데이트 후 죽은 경로 가능 |
| 진단 | 번들·버전·Claude 훅 일부만 검사 | exact 버전 비교 | 설치 성공과 실제 MCP 사용 가능 여부를 증명하지 못함 |
| 업데이트 | Claude 명령·auto-update 지원 | marketplace upgrade 뒤 동작이 문서화되지 않음 | 친구에게 안내할 안정된 절차 부족 |

2026-08-02 이 머신의 읽기 전용 실측:

- Claude Code `2.1.220`: `plugin validate/details/eval/update` 지원.
- Codex CLI `0.146.0`: `plugin add/list/marketplace`와 `mcp` 명령 지원.
- 레포의 `compatibility.json`은 Codex `0.144.6`과 **정확히 같아야 PASS**이므로, 호환 가능한
  새 버전도 `doctor`가 FAIL로 판정하는 구조다.
- 현재 Codex 공식 규격은 플러그인 매니페스트의 `mcpServers`, 플러그인별 MCP 정책,
  lifecycle hooks를 문서화한다. 따라서 수동 전역 MCP 등록은 더 이상 목표 구조가 아니다.

## 4. 설계 불변식

| ID | 불변식 |
|---|---|
| R-PRODUCT | 배포·실행 경로는 `interactive/` 안에서 완결된다. `engine/`을 import·spawn·탐색하지 않는다. |
| R-RUNTIME | SAP 안전 게이트의 정본은 런타임 번들이다. 클라이언트 훅만으로 안전을 성립시키지 않는다. |
| R-DEFAULT | 신규·미설정 프로젝트의 도구면은 read-only다. 알 수 없는 값도 read-only로 축소한다. |
| R-DEV | write 도구면은 `SAP_TIER=DEV` + 사용자 명시 선택 두 조건이 모두 있어야 열린다. |
| R-SECRET | setup·doctor·CI는 비밀번호를 묻거나 출력하지 않는다. `SAP_PASSWORD=` 빈 뼈대만 만든다. |
| R-ATTENDED | 홈/프로젝트/클라이언트 설정 쓰기는 dry-run 요약 뒤 각각 확인받는다. |
| R-PORTABLE | 설치 캐시의 버전·사용자·드라이브 문자를 문서나 설정에 고정하지 않는다. |
| R-IDEMPOTENT | setup·repair·update 재실행은 건강한 파일을 다시 쓰지 않으며 두 번째 실행의 diff가 0이다. |
| R-ATOMIC | JSON/TOML 수정은 parse → validate → 임시 파일 → atomic replace 순이며 원본 백업과 복구 경로가 있다. |
| R-LEGACY | `.sc4sap/` legacy-only 프로젝트는 자동 이행하지 않는다. 감지·안내만 한다. |
| R-CAPABILITY | 클라이언트 호환성은 exact 버전 문자열보다 실제 bundled MCP/path/cwd/tool-policy probe로 판정한다. |

## 5. 목표 구조

```text
Git marketplace
  └─ installed plugin = interactive/
       ├─ .claude-plugin/plugin.json ─┐
       ├─ .mcp.json (Claude)          ├─> server/launch.cjs ─> server.bundle.cjs
       ├─ .codex-plugin/plugin.json   │           │
       ├─ adapters/codex/.mcp.json ───┘           └─ .sapkit project/profile state
       ├─ skills/setup/SKILL.md ─> core/procedures/setup.md
       ├─ scripts/setup-state.mjs
       └─ scripts/doctor.mjs

선택 기능(기본 성공 조건 아님)
  ├─ adapters/claude/hooks/*
  └─ scripts/get-vsp.mjs

배포 밖
  └─ engine/  ← 삭제 대상. 런타임에서 참조 금지
```

핵심은 **두 매니페스트가 같은 런처를 가리키고**, 런처 이후의 프로파일·안전·도구면 로직은
클라이언트와 무관하게 한 번만 존재하는 것이다.

## 6. 플러그인·MCP 패키징

### 6-1. 단일 논리 정본, 클라이언트별 생성물

Claude와 Codex의 `.mcp.json` wrapper·경로 치환 규격이 완전히 같다고 가정하지 않는다.
`plugin-metadata.json` 또는 별도 `mcp-metadata.json`을 논리 정본으로 두고 다음 두 파일을
생성한다.

| 생성물 | 소비자 | 역할 |
|---|---|---|
| `interactive/.mcp.json` | Claude Code | `${CLAUDE_PLUGIN_ROOT}` 기반 bundled stdio MCP |
| `interactive/adapters/codex/.mcp.json` | Codex | Codex가 검증한 wrapper와 plugin-local 경로 방식 |

`gen-plugin-manifests.mjs`는 Codex 매니페스트에도 아래 필드를 생성한다.

```json
{
  "skills": "./skills/",
  "mcpServers": "./adapters/codex/.mcp.json"
}
```

Codex MCP의 논리 설정은 다음과 같다. 아래의 `<PLUGIN_LOCAL_PATH>`는 구현 시 capability
probe로 확정할 **상징값**이며 절대경로를 생성물에 쓰라는 뜻이 아니다.

```json
{
  "sap": {
    "command": "node",
    "args": ["<PLUGIN_LOCAL_PATH>/server/launch.cjs"],
    "env": {
      "NODE_PATH": "<PLUGIN_LOCAL_PATH>/server/runtime-deps/keyring/node_modules"
    },
    "required": false
  }
}
```

`required:false`인 이유는 Node/번들 문제로 MCP가 뜨지 않아도 지식·절차 스킬과
troubleshooting은 사용할 수 있어야 하기 때문이다. 실패는 숨기지 않고 doctor에서 FAIL로
보고한다.

### 6-2. Codex 경로·cwd는 출시 BLOCKER

bundled MCP가 다음 두 조건을 동시에 만족해야 한다.

1. `launch.cjs`는 설치된 플러그인 루트에서 안정적으로 찾는다.
2. `process.cwd()` 또는 명시 프로젝트 경로는 **사용자의 SAP 프로젝트**를 가리킨다.

플러그인 루트를 찾으려고 MCP의 `cwd`를 플러그인 폴더로 고정하면 1은 해결되지만 2가
깨진다. 반대로 상대 args만 쓰면 클라이언트가 프로젝트 cwd에서 파일을 못 찾을 수 있다.
따라서 Codex CLI·IDE/app 각각에서 다음을 실측해 한 방식만 채택한다.

1. 플러그인 루트 변수 치환 + 프로젝트 cwd 보존
2. plugin-local args 재기준화 + 프로젝트 cwd 보존
3. 호스트가 제공하는 프로젝트 경로를 `SAPKIT_PROJECT_DIR`로 전달

세 방식이 모두 불가능한 지원 버전에서는 bundled local MCP 출시를 중단한다. 최후 폴백은
런타임을 버전 고정 npm 패키지로 배포해 `npx`로 실행하는 것이며, **수동 절대경로 등록으로
회귀하지 않는다.** npm 폴백은 오프라인 SAP 환경의 첫 실행 의존성이 생기므로 별도 승인
없이는 채택하지 않는다.

### 6-3. 서버 이름과 구 전역 등록 충돌

기존 Codex 사용자는 `[mcp_servers.sap]` 전역 항목을 가질 수 있다. bundled 서버와 동시에
두 프로세스를 띄우지 않는다.

- doctor가 legacy 전역 `sap` 등록과 plugin-bundled `sap`의 공존을 탐지한다.
- 기본 조치는 경고 + 정확한 diff/제거 명령 제시다.
- `codex mcp remove sap`는 사용자 확인 없이 실행하지 않는다.
- 같은 이름의 우선순위가 실측상 모호하면 Codex bundled id를 `sapkit-sap`으로 바꾸고,
  스킬·문서에서 도구 namespace를 하드코딩하지 않는다.

## 7. 도구면과 안전 — 훅 없는 기본 경로

### 7-1. 프로젝트별 도구 모드

`.sapkit/config.json`에 다음 필드를 추가한다.

```json
{
  "toolSurface": "readonly"
}
```

| 값 | 실제 exposition | 조건 |
|---|---|---|
| `readonly` | `readonly` | 기본·권장 |
| `development` | `readonly,high` | 활성 프로파일의 `SAP_TIER=DEV` + setup에서 명시 승인 |
| 누락/오타 | `readonly` | stderr에 1회 경고 |
| `development` + QA/PRD/미해석 | `readonly` | fail-closed + 이유 보고 |

`interactive/.mcp.json`의 고정 `--exposition=readonly,high`를 제거하고 `launch.cjs`가 위 값을
검증한 뒤 bundle argv에 정확히 하나의 exposition을 넣는다. 이 변경은 `engine/src` 수정 없이
런처에서 가능하다. 모드 변경 뒤에는 MCP 재시작이 필요하다고 setup이 알려야 한다.

기존 프로젝트에 `toolSurface`가 없을 때도 `readonly`로 축소한다. 기존 DEV 사용자의 write
도구가 업데이트 뒤 잠시 사라질 수 있으므로 v0.5.0 release note와 setup repair에서
`development` 명시 선택 절차를 안내한다. 조용한 write 유지보다 안전한 축소를 택한다.

### 7-2. 필수 안전은 서버 안에 둔다

런타임 번들이 다음을 자체 집행하는 것이 release gate다.

- QA/PRD write 및 runtime execution 차단
- 프로파일/tier 미해석 시 write fail-closed
- 테이블 blocklist와 사용자 확장 목록 적용
- inspection-only 상태에서 연결 필요 도구의 정직한 실패

훅을 끄거나 지원하지 않는 클라이언트에서도 위 결과가 같아야 한다. server-side 검증이
하나라도 빠지면 훅을 다시 필수화하는 것이 아니라 **런타임을 수리한 뒤 출시**한다.

### 7-3. 실데이터 2종

`GetTableContents`와 `GetSqlQuery`는 readonly exposition에도 나타난다. 배포 기본은 다음
순서로 결정한다.

1. Codex의 plugin-scoped per-tool `approval_mode="prompt"`가 TUI에서 매번 묻고,
   `codex exec`에서는 무인 fail-closed임을 실측한다.
2. 둘 다 PASS면 Claude의 “allow-list 제외”와 같은 사용자 승인 결과로 맞춘다.
3. 하나라도 FAIL이면 Codex에서는 기존 `disabled_tools` 하드 차단을 유지하고
   `P2 unsupported`를 명시한다. 기능 동등성보다 fail-closed가 우선이다.

이 판정은 버전 문자열이나 공식 문서만으로 닫지 않는다. 과거 실측에서 Codex
`PreToolUse permissionDecision="ask"`와 승인 모드가 무인 실행에서 기대대로 차단되지 않은
경로가 있었기 때문이다.

### 7-4. 훅 처리 — 기본 0개

이 설계의 **필수 설치 경로에는 훅이 없다.** 현행 6개는 다음처럼 분류한다.

| 훅 | 본질 | 목표 처리 |
|---|---|---|
| `tier-readonly-guard` | 서버 안전의 중복 방어 | 기본 미설치. 서버 conformance로 대체 |
| `block-forbidden-tables` | 서버 blocklist의 중복 방어 | 기본 미설치. 서버 conformance로 대체 |
| `prefer-sqlquery-explicit-fields` | 비용/UX 조언 | 선택 기능 |
| `offline-code-analysis` | 로컬 품질 조언 | vsp 선택 기능과 함께 분리 |
| `syntax-checker` | 실패 후 품질 조언 | 절차 지시로 대체 가능 |
| `transport-validator` | 변경 전 품질 조언 | 절차 지시로 대체 가능 |

전환 순서:

1. v0.5.x에서는 setup Step 4 자동 설치를 제거한다.
2. 기존 hook 파일과 `install-hooks.mjs --uninstall`은 한 minor 동안 남겨 정리 경로를 제공한다.
3. doctor가 SAPKit marker가 있는 기존 프로젝트 훅을 찾아 “활성/죽은 경로/제거 가능”을
   보고한다.
4. 사용자가 승인하면 기존 `--uninstall --project <path>`만 실행한다.
5. 실제 수요가 확인되면 나중에 `sapkit-guardrails` 선택 플러그인으로 분리한다.

향후 Codex 훅을 다시 도입할 때 Claude 스크립트를 그대로 재사용하지 않는다. 공통 정책
판정(`allow|deny|confirm|advise`)과 클라이언트 출력 serializer를 분리해야 한다. 현재 Codex
공식 계약은 PreToolUse `deny`는 지원하지만 `ask`는 지원하지 않으며, `ask`를 반환하면 hook
실패로 기록하고 도구 호출을 계속할 수 있다.

## 8. `/sapkit:setup` v2

### 8-1. 흐름

```text
0. client/plugin/bundled MCP 탐지
1. 기존 .sapkit 또는 legacy .sc4sap 상태 요약
2. 프로파일 선택 또는 비밀 없는 sap.env 뼈대 생성
3. 프로젝트 context + toolSurface 선택
4. [선택] Claude 프롬프트 감소용 permission merge / vsp 설치
5. 재시작 필요 여부 안내
6. self-check: plugin → bundle → profile → MCP → SAP connection
```

삭제되는 기본 단계:

- Codex README로 보내는 별도 MCP 등록 단계
- Claude hook 설치 단계
- Codex `disabled_tools` 수기 편집 단계(안전 프로필이 manifest/config 생성물에 포함될 때)

### 8-2. 대화와 파일 쓰기의 분리

`SKILL.md`와 `setup.md`는 질문·설명·사용자 확인을 담당한다. 반복 가능해야 하는 상태 판정과
파일 갱신은 신설 `interactive/scripts/setup-state.mjs`가 담당한다.

이것은 D-045가 기각한 “모든 질문을 없애는 비대화형 setup”의 부활이 아니다. 스크립트는
사람의 선택을 대신하지 않고, 이미 승인된 선택을 같은 방식으로 적용하는 작은 mutator다.

제안 인터페이스:

```text
node scripts/setup-state.mjs status --project <path> --json
node scripts/setup-state.mjs plan   --project <path> --input <non-secret-json> --json
node scripts/setup-state.mjs apply  --project <path> --plan <plan-file> --json
node scripts/setup-state.mjs verify --project <path> --client auto --json
```

규칙:

- 기본은 `status`/`plan`; `apply` 없이는 쓰지 않는다.
- 입력 schema에 password/secret/token 필드를 허용하지 않는다.
- `sap.env`는 `SAP_PASSWORD=` 빈 줄만 만들고 값은 사용자가 직접 입력한다.
- plan에는 대상 절대경로, create/update/noop, 변경 필드, restart 필요 여부를 담되 비밀은 없다.
- 기존 JSON의 알 수 없는 키와 기존 설정을 보존한다.
- 건강한 파일은 byte-level noop이다.
- 부분 실패 시 이번 apply가 만든 파일만 되돌리고 사용자 기존 파일은 백업에서 복구한다.

### 8-3. setup 종료 상태

| 상태 | 의미 |
|---|---|
| `READY_INSPECTION` | 플러그인·MCP 정상, 프로파일/비밀번호 미완성 |
| `READY_READONLY` | SAP 연결 + readonly 도구면 정상 |
| `READY_DEVELOPMENT` | DEV 연결 + 사용자가 development 선택 + write surface 정상 |
| `RESTART_REQUIRED` | 설정은 정상이나 MCP/플러그인 reload 필요 |
| `DEGRADED_SKILLS_ONLY` | 스킬은 로드됐으나 bundled MCP 시작 실패 |
| `BLOCKED` | 잘못된 경로·파싱 오류·안전 조건 불충족 |

비밀번호가 비어 있어 SAP 연결만 실패한 경우 setup 전체를 FAIL로 부르지 않고
`READY_INSPECTION`으로 끝낸다.

## 9. doctor와 호환성 판정

### 9-1. exact 버전 핀 제거

`compatibility.json`을 다음 의미로 바꾼다.

```json
{
  "codex": {
    "minimumSupported": null,
    "lastVerified": ["0.146.0"],
    "requiredCapabilities": [
      "plugin-bundled-stdio-mcp",
      "plugin-local-path-with-project-cwd",
      "plugin-scoped-tool-policy"
    ]
  }
}
```

`minimumSupported`는 최초 clean-home conformance가 통과한 가장 낮은 버전을 확인한 뒤에만
채운다. 판정은 다음과 같다.

- 최소 미만 또는 필수 capability FAIL → FAIL
- 검증된 버전 → PASS
- 최소 이상이지만 더 새로운 미검증 버전 → WARN + capability probe 실행
- CLI 미설치 → 해당 클라이언트 SKIP

### 9-2. doctor 범위

현재 doctor의 번들 해시·CLI 존재·Claude hook 경로 검사에 다음을 추가한다.

1. 현재 실행 중인 플러그인 루트와 manifest version
2. Claude/Codex bundled MCP 선언과 실제 launcher 경로
3. 플러그인 경로에 공백·한글이 있어도 stdio initialize/tools/list 성공
4. 프로젝트 cwd와 `.sapkit/active-profile.txt` 해석 결과
5. 기대 `toolSurface`와 tools/list의 write 도구 존재 여부
6. Codex legacy 전역 `sap` MCP 중복
7. 기존 Claude SAPKit hook의 활성/죽은 경로(이행 기간만)
8. `sap.env` 존재 여부만 확인하고 내용·값은 출력하지 않음

사람용 텍스트와 `--json`을 모두 제공한다. JSON은 `status`, `code`, `evidence`,
`remediation`을 가지며 CI와 setup이 같은 판정을 재사용한다.

## 10. `engine/` 소스 삭제 계약

### 10-1. 삭제 선행조건

다음이 모두 충족되기 전에는 `engine/`을 삭제하지 않는다.

1. `interactive/`의 활성 코드·문서·CI가 `engine/` 경로를 참조하지 않는다.
2. 런타임 원천이 별도 공개/사내 repo 또는 보존 branch/tag에 있고 정확한 commit을 얻을 수 있다.
3. 그 원천에서 lockfile 기반으로 현재 `server.bundle.cjs`를 재현하는 절차가 있다.
4. 번들의 package/version/source URL/source commit/build command/SHA-256/bytes/license를 고정한다.
5. inspection-only tools/list와 실제 DEV read smoke가 번들만으로 통과한다.
6. 런타임 수정이 필요할 때 “원천 수정 → build → capability diff → bundle 반입” 경로가
   한 문서로 재현된다.
7. `engine/` 내부에만 있던 unit test는 외부 원천에 보존되고 여기에는 black-box contract
   test가 남는다.

원천을 다른 곳에 보존하지 않는다면 삭제는 “정리”가 아니라 **런타임을 사실상 동결**하는
결정이다. 그 선택을 원한다면 `FROZEN_VENDOR_BUNDLE`로 명시하고 향후 보안·SAP 호환 수리를
할 수 없다는 제한을 release note에 기록해야 한다.

### 10-2. 남은 명칭과 provenance 정리

| 현행 | 목표 |
|---|---|
| `server/verify-engine.mjs` | `server/verify-runtime-bundle.mjs` |
| `server/UPDATE-RUNBOOK.md`의 `cd engine` | 외부 원천 clone/checkout/build/반입 절차 |
| `server/integrity.json`의 `engine/server.bundle.cjs` 표기 | `server/server.bundle.cjs` |
| `server/VERSION`의 “in-repo engine” 설명 | source repository + immutable commit |
| doctor의 “번들 무결성” 호출 | 새 runtime-bundle verifier 호출 |

`engine/` 삭제는 위 변경과 conformance가 먼저 들어간 뒤 **마지막 커밋**에서 한다.

## 11. 업데이트·버전 배포

### 11-1. 버전 정본

- 제품 버전의 단일 정본은 `interactive/plugin-metadata.json`이다.
- 생성기는 Claude/Codex/AG 매니페스트와 설명을 재생성한다.
- Claude의 plugin manifest와 marketplace entry 양쪽에 같은 plugin version을 중복 고정하지
  않는다. plugin manifest를 버전 정본으로 하고 marketplace entry의 중복 version은 제거한다.
- 버전을 올리지 않은 새 릴리스는 CI에서 거부한다.

### 11-2. 사용자 업데이트 UX

Claude 후보 절차:

```text
claude plugin marketplace update agentic-sap
claude plugin update sapkit@agentic-sap --scope user
# restart 또는 /reload-plugins
/sapkit:setup status
```

Codex 후보 절차:

```text
codex plugin marketplace upgrade agentic-sap
codex plugin add sapkit@agentic-sap
# 새 세션
$sapkit:setup status
```

Codex의 두 번째 `add`가 설치 버전을 실제로 교체하는지는 clean-home vN→vN+1 시험으로
확정한다. 아니라면 공식 지원 명령을 문서화하며 remove/add를 조용히 자동 실행하지 않는다.

### 11-3. 릴리스 자동화

태그 릴리스의 최소 파이프라인:

1. tag와 `plugin-metadata.json.version` 일치
2. manifest/MCP 생성물 drift 0
3. Claude `plugin validate`
4. Codex 임시 HOME의 local marketplace install + bundled MCP probe
5. `interactive/` 패키지 경계 검사(`engine/`, 개발용 dependency, 비밀 파일 0건)
6. runtime bundle integrity + tools/list snapshot
7. setup 새 설치/재실행/부분 repair fixture
8. 링크·스키마·기존 offline gate
9. 릴리스 노트에 지원 클라이언트와 known gap 기록

GitHub Actions에서 실제 SAP 자격증명을 사용하지 않는다. 라이브 SAP 검증은 별도
release-candidate 체크리스트에서 DEV read 1건과, write release라면 격리된 `$TMP` 객체 1건으로
수행하고 증거만 기록한다.

## 12. 마이그레이션

### 12-1. 기존 Claude 사용자

1. 플러그인 업데이트·reload.
2. setup status가 기존 permission과 프로젝트 hook을 보고한다.
3. 훅 제거 여부를 사용자에게 한 번 묻고, 승인 시 기존 installer의 `--uninstall`을 사용한다.
4. `toolSurface`가 없으면 readonly로 시작하고 DEV write가 필요할 때만 development를 선택한다.
5. permission allow-list는 자동 축소·삭제하지 않는다.

### 12-2. 기존 Codex 사용자

1. bundled MCP가 정상인지 먼저 확인한다.
2. 기존 전역 `[mcp_servers.sap]`가 있으면 중복으로 보고한다.
3. 사용자가 승인한 경우에만 기존 등록을 제거한다.
4. `toggle-plugin.mjs`는 Codex의 plugin enable/disable UI·명령으로 대체하고 한 minor 뒤 제거한다.
5. config의 사용자 다른 MCP·주석·순서는 건드리지 않는다.

### 12-3. legacy `.sc4sap/`

D-057 불변: setup은 legacy 상태를 그대로 읽고 마이그레이터의 dry-run 명령만 안내한다.
플러그인 업데이트나 engine 삭제를 계기로 자동 이동하지 않는다.

## 13. 구현 순서

| 단계 | 작업 | 종료 조건 |
|---|---|---|
| **P0 — BLOCKER probe** | Codex bundled MCP wrapper/path/cwd, server id 충돌, per-tool prompt의 TUI/exec 동작 | 지원 버전과 정확한 JSON shape 확정 |
| P1 — 패키징 | Codex MCP 생성물 + manifest 연결, Claude/Codex 논리 정본, launcher `toolSurface` | 수동 `codex mcp add` 없이 tools/list |
| P2 — setup/doctor | setup v2, deterministic state mutator, capability 기반 doctor | clean project + 재실행 diff 0 |
| P3 — 훅 이행 | 기본 설치 제거, 기존 훅 탐지/선택 제거, optional 문서 | 훅 0개 상태로 전체 필수 gate PASS |
| P4 — 업데이트 | version 정본·manifest 중복 정리·vN→vN+1 시험·README | 캐시 경로 변경 후 MCP 정상 |
| P5 — engine 제거 준비 | 외부 provenance·runtime verifier/runbook·black-box tests | §10-1 전건 PASS |
| **P6 — engine 삭제** | `engine/` 삭제와 stale reference gate | 제품·CI·문서에서 활성 참조 0 |

P6을 P0~P5보다 먼저 하지 않는다.

## 14. 시험과 완료 기준

### 14-1. CI 자동 시험

- Windows + Linux, 공백·한글 포함 설치 경로
- 임시 HOME/USERPROFILE/CODEX_HOME으로 사용자 실제 설정 무접촉
- Claude/Codex manifest parse와 local marketplace 설치
- installed plugin 안에 `skills/`, `core/`, `server/`, `adapters/`, `scripts/` 존재
- installed plugin 안에 `engine/` 없음
- no-profile → inspection-only initialize/tools/list
- readonly → write 도구 0
- DEV development → 기대 write 도구 존재
- QA/PRD development 요청 → readonly로 강등
- setup 첫 실행 → 기대 파일 생성
- setup 두 번째 실행 → byte diff 0
- 깨진 JSON/부분 파일 → 기존 파일 보존 + 명확한 BLOCKED
- `sap.env` 값과 process env secret이 stdout/stderr/JSON report에 없음
- vN 설치 → vN+1 업데이트 → 새 캐시 경로에서 MCP와 setup 정상
- legacy 전역 MCP와 hook 탐지, 무승인 상태에서 변경 0

### 14-2. 실제 클라이언트 release-candidate 시험

| 클라이언트 | 필수 시나리오 |
|---|---|
| Claude Code | GitHub marketplace 신규 설치, `/reload-plugins`, `/sapkit:setup`, `/mcp`, readonly 연결 |
| Codex CLI | GitHub marketplace 신규 설치, `$sapkit:setup`, bundled MCP, 프로젝트 cwd, readonly 연결 |
| Codex IDE/app | 같은 설치 상태 공유, workspace cwd/profile 해석, 새 세션 후 MCP 연결 |

공통:

1. 처음 보는 사용자가 README만 보고 10분 안에 `READY_INSPECTION`에 도달한다.
2. 어느 단계에도 플러그인 캐시 절대경로 복사가 없다.
3. setup을 하지 않아도 플러그인과 MCP가 로드되고 inspection-only로 설명 가능하다.
4. 훅을 하나도 신뢰·설치하지 않아도 필수 안전 시험이 통과한다.
5. Claude/Codex의 대표 상담 1건과 read 1건 결과가 같은 정책·프로젝트 문맥을 사용한다.
6. DEV development write는 별도 명시 선택 뒤에만 가능하다.

### 14-3. 출시 불가 조건

다음 중 하나라도 있으면 “Codex도 Claude처럼 설치 한 번”을 완료로 선언하지 않는다.

- Codex MCP가 절대 캐시경로를 요구함
- Codex plugin path를 얻기 위해 project cwd를 잃음
- `codex exec`에서 prompt 정책이 fail-open인데 해당 도구가 노출됨
- bundled 서버와 legacy 전역 서버가 동시에 기동함
- 훅을 제거하자 QA/PRD write 또는 blocklist가 우회됨
- engine 원천/라이선스/재빌드 경로 없이 `engine/`을 삭제함
- 업데이트 뒤 이전 캐시를 가리키는 설정이 남음

## 15. 기각한 대안

| 대안 | 기각 이유 |
|---|---|
| Codex README에 현재 절대경로 명령만 더 친절하게 작성 | 사용자가 바뀔 때마다 경로가 다르고 업데이트 때 다시 깨짐 |
| setup이 `~/.codex/config.toml`에 전체 MCP 블록 복사 | plugin-bundled MCP와 정본이 둘로 갈라지고 캐시 버전을 고정함 |
| Claude `.mcp.json` 하나를 Codex가 그대로 읽는다고 가정 | wrapper·변수·cwd 차이를 검증하지 않으면 silent failure 가능 |
| Claude 6훅을 Codex에 그대로 등록 | `ask` 의미가 다르고 훅 신뢰 절차가 새 설치 장벽이 됨 |
| 훅을 안전의 유일한 정본으로 유지 | 클라이언트별 지원 차이와 사용자의 비활성화로 우회 가능 |
| engine부터 삭제한 뒤 필요한 파일 복구 | 번들 수정·재현·unit test 원천을 잃은 뒤 문제를 발견할 수 있음 |
| 원격 one-liner 설치 스크립트 | 편하지만 신뢰하기 전 코드를 즉시 실행시키는 배포 방식 |

## 16. Claude Code 리뷰 요청 사항

다음 형식으로 검토한다.

```text
이 설계서를 현재 레포 실물과 대조해 리뷰해줘.
구현은 하지 말고 BLOCKER / MAJOR / MINOR / INFO로 분류해라.
각 지적에는 (1) 근거 파일·행, (2) 실패 시나리오, (3) 최소 수정안을 적어라.
특히 아래 6개를 우선 확인해라.

1. engine/ 삭제 뒤 server.bundle.cjs 재현·유지 계약이 충분한가
2. Codex bundled MCP의 plugin-local path와 project cwd를 동시에 보존할 수 있는가
3. Codex .mcp.json wrapper와 plugin-scoped tool policy가 목표 지원 버전에서 유효한가
4. 훅 0개 기본 상태에서도 server-side tier/blocklist가 실제로 우회 불가능한가
5. 기존 전역 sap MCP·Claude hooks·permission의 마이그레이션이 비파괴적인가
6. clean-home 설치와 vN→vN+1 업데이트 시험이 실제 명령으로 재현 가능한가

설계에 없는 추정은 사실처럼 채우지 말고, 실측이 필요한 것은 BLOCKER probe로 남겨라.
```

## 17. 근거 문서

- OpenAI, [Package your plugin](https://developers.openai.com/plugins/build/plugins)
  — Codex plugin의 `mcpServers`, plugin-scoped MCP policy, lifecycle hook 패키징.
- OpenAI, [Codex Hooks](https://learn.chatgpt.com/docs/hooks)
  — plugin hook trust와 PreToolUse 지원/미지원 출력 계약.
- OpenAI, [Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp)
  — Codex host의 MCP 설정·CLI/IDE/app 공유 범위.
- Anthropic, [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
  — Claude plugin-bundled MCP와 `${CLAUDE_PLUGIN_ROOT}`.
- Anthropic, [Discover and install plugins](https://code.claude.com/docs/en/discover-plugins)
  — marketplace 설치·reload·update/auto-update UX.
- Anthropic, [Create and distribute a plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
  — 캐시 복사·version resolution·`plugin validate`.

---

**제안 판정:** P0 probe가 통과한다는 조건으로 **채택**. 기본 경로는 bundled MCP +
server-side safety + 훅 0개다. `engine/` 삭제는 배포 개선과 별개이며, §10의 원천·재현 계약을
먼저 닫은 뒤 마지막 단계로만 수행한다.
