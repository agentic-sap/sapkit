# SAPKit 배포 온보딩·Codex 동등 UX — 최종 구현 설계 (v2)

> 작성 2026-08-02 (v1 검토 초안) → 동일자 **v2 확정 — 구현 대기**  
> v1→v2 = Claude Code 실물 대조 리뷰(BLOCKER 2 · MAJOR 4 · MINOR 6, §16) + 사용자 결정 3건:
> ① 훅은 "제거"가 아니라 **기본 미설치 + 선택 스위치 보존** ② **`engine/` 소스 삭제는 범위
> 제외**(§10) ③ 최종 범위 = "Codex 온보딩 동등화" + "잔소리 제거" 두 축.  
> 관련 결정 = D-017 · D-038 · **D-040(①⑤⑦)** · D-041~D-046 · **D-043③** · **D-049** · D-057  
> 집행 착수 커밋에 §7-5의 supersede 목록을 담은 **신규 D-항목**을 함께 append한다.  
> 파일명의 `no-engine`은 v1의 옛 범위 흔적 — 링크 안정성을 위해 파일명은 유지한다.

## 0. 한 문장 결론

**Claude Code와 Codex 모두 "마켓 등록 → 설치 → setup"만으로 시작하게 만들고(MCP는 플러그인
동봉), 훅 6종은 기본 미설치·선택 스위치로 강등하며, 안전의 정본은 서버 번들의 자체 게이트에
둔다. `engine/` 소스는 삭제하지 않는다.**

## 1. v1에서 달라진 것 (리뷰·사용자 결정 반영)

| 항목 | v1 초안 | v2 확정 | 사유 |
|---|---|---|---|
| `engine/` 소스 | 외부 원천화 후 삭제 (구 §10 · P5·P6) | **삭제하지 않음** (§10) | D-040⑦("외부 정본 복귀는 자체 수리 소실")과 정면 충돌 · 설치본에 원래 미포함이라 이득 0(D-040② 레포 바이트 비KPI) · 수리 실수요 실증(3주 수리 ~20건, 4.14.0 당일 반영, 열린 결함 백로그 D-058ⓓ·D-060ⓑ) |
| 훅 처리 | "기본 경로에서 제거" | **기본 미설치 + 파일·설치기 보존(스위치)** (§7-4) | 사용자 결정 — 확인창은 "설정으로 껐다 다시 켤 수 있다"는 전제로 끈 기능이므로 되돌릴 길을 보존한다. 비배선 훅 파일은 세션 토큰·설치 부담 0(D-040 무게 척도) |
| Claude 훅 현행 진단 | "절대 캐시경로 등록 → 업데이트 후 죽은 경로" | **정정** — 설치기는 버전 무관 marketplace 고정 경로를 우선 사용(`install-hooks.mjs` resolveHookScript) | 리뷰 실측. 잔여 위험은 마켓명 변경·클라이언트 레이아웃 변화(D-041 ⓐ가 마켓명 이관 부재를 실증) |
| 훅↔서버 의미 격차 | 미기재 | §7-2·§7-4에 **정직 표** | 리뷰 실측 — 서버 blocklist 기본 standard(훅은 strict)·`custom` 프로파일 서버 부재·서버는 env만 읽음(훅은 config.json+파일)·ask는 `acknowledge_risk` 자기신고(D-043 ⓑ) |
| readonly 실행 도구 | 미기재 | §7-1에 **정직 고지** | 실측 스냅샷(mcp-surface.json) — readonly에도 실행 2종·row-data 2종 노출 |
| 마이그레이션 스캔 | 프로젝트 settings만 | **사용자 `~/.claude/settings.json` 포함** (§9·§12) | install-hooks 기본 설치 대상이 사용자 settings |
| marketplace 중복 version | "제거한다" 단정 | **P4 실측 후 결정**으로 강등 (§11-1) | 현 중복은 생성기+`--check`가 관리해 드리프트 위험이 아니며, 제거의 스키마·업데이트 해석 영향이 미검증 |

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
4. 기본 도구면은 write 미노출(readonly)이고, 명시적으로 선택한 DEV 프로젝트만 development
   도구를 노출한다. readonly에 남는 실행 2종·row-data 2종 노출은 §7-1이 정직 고지하고
   §7-2(서버 tier 게이트)·§7-3(실데이터 정책)이 담당한다.
5. 비밀은 대화·명령 인자·진단 출력에 나타나지 않는다.
6. setup 재실행과 업데이트 뒤에도 경로가 깨지지 않는다.

클라이언트가 제공하지 않는 기능까지 억지로 동일하게 만들지는 않는다. 차이가 남으면 기능을
조용히 열지 말고 **안전한 축소 + 명시적 경고**로 처리한다.

### 2-3. 비목표

- **`engine/` 소스 삭제** — §10의 재론 트리거 전에는 하지 않는다 (v1의 P5·P6 폐기)
- **트랙 A ENGINE 접촉** — D-040⑤ template-only 상태 그대로, 본 설계 무접촉
- SAP 측 자산 설치·이송·운영 권한 자동화
- MCP 기능까지 제거하는 skills-only 제품 전환
- 사용자 비밀번호 수집 또는 자동 저장
- 원격 스크립트를 `curl | sh`, `irm | iex` 형태로 즉시 실행하는 설치 방식
- Antigravity 동등화(기존 동작 보존만 하고 이번 완료 기준에서는 제외)
- 기존 `.sc4sap/` 상태의 자동 이동(D-057의 사람 전용 이행 원칙 유지)

## 3. 현행 진단 (v2 정정판)

| 항목 | Claude Code 현행 | Codex 현행 | 문제 |
|---|---|---|---|
| 플러그인 설치 | 마켓 등록 + 설치 | 마켓 등록 + 설치 | 대체로 동등 |
| MCP | `interactive/.mcp.json`으로 자동 연결 | README의 `codex mcp add` 수동 등록 | Codex만 절대경로·재등록 필요 |
| 캐시 경로 | `${CLAUDE_PLUGIN_ROOT}` 사용 | 사용자가 `launch.cjs`와 `NODE_PATH` 경로 입력 | 업데이트 때 경로 표류 가능 |
| setup | 프로파일·프로젝트·권한·훅 수행 | 권한·훅 단계 skip 후 README 안내 | "한 번의 setup" 약속이 Codex에서는 불완전 |
| 기본 도구면 | `readonly,high` 고정 | 수동 예시는 `readonly` | 설치 직후 동작이 다름 |
| 실데이터 도구 | Claude allow-list에서 제외하여 승인창 유지 | `disabled_tools` 수기 추가 권고 | 수기 누락 위험·기능 차이 |
| 훅 | setup이 자동 설치(사용자 또는 프로젝트 settings). 경로는 **버전 무관 marketplace 고정 경로 우선** | 현행 문서상 없음 | 잔소리형 4종이 기본 켜짐(성가심 실증) · 잔여 경로 위험은 마켓명·레이아웃 변경 시 |
| 진단 | 번들·버전·Claude 훅 일부만 검사 | exact 버전 비교 | 설치 성공과 실제 MCP 사용 가능 여부를 증명하지 못함 |
| 업데이트 | Claude 명령·auto-update 지원 | marketplace upgrade 뒤 동작이 문서화되지 않음 | 친구에게 안내할 안정된 절차 부족 |

2026-08-02 이 머신의 읽기 전용 실측 (v2 리뷰에서 재확인):

- Claude Code `2.1.220` · Codex CLI `0.146.0` — 리뷰 세션에서 재실측 일치.
- `codex plugin` 하위명령 = add/list/marketplace/remove. **플러그인 `update`는 없음**,
  `marketplace upgrade`는 있음 → §11-2의 "재`add`가 교체하는지" 시험이 필요한 구조 확인.
- 레포의 `compatibility.json`은 Codex `0.144.6`과 **정확히 같아야 PASS**(doctor.mjs exact
  비교 실측)이므로, 호환 가능한 새 버전도 FAIL로 판정하는 구조다.
- Codex 공식 규격(§17) 실재·내용 검증 완료: 플러그인 매니페스트 `mcpServers`, 플러그인별
  per-tool `approval_mode`, lifecycle hooks, "plugin-bundled MCP는 사용자 config가
  transport를 정하지 않음" 명문. 따라서 수동 전역 MCP 등록은 더 이상 목표 구조가 아니다.

## 4. 설계 불변식

| ID | 불변식 |
|---|---|
| R-PRODUCT | 배포·실행 경로는 `interactive/` 안에서 완결된다. `engine/`을 import·spawn·탐색하지 않는다. |
| R-RUNTIME | SAP 안전 게이트의 정본은 런타임 번들이다. 클라이언트 훅만으로 안전을 성립시키지 않는다. |
| R-SWITCH | 안전 기능의 기본값 변경은 **삭제가 아니라 스위치 보존**으로 한다 — 훅 파일·설치기·제거기는 배포에 남는다. |
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

선택 기능(기본 미설치 — 켜고 끄는 스위치 = adapters/claude/hooks/install-hooks.mjs)
  ├─ adapters/claude/hooks/*  (6종 파일 보존)
  └─ scripts/get-vsp.mjs

공방(배포 밖 · 유지)
  └─ engine/  ← 삭제하지 않음(§10). 런타임 참조 금지(R-PRODUCT)는 불변
```

핵심은 **두 매니페스트가 같은 런처를 가리키고**, 런처 이후의 프로파일·안전·도구면 로직은
클라이언트와 무관하게 한 번만 존재하는 것이다.

## 6. 플러그인·MCP 패키징

### 6-1. 단일 논리 정본, 클라이언트별 생성물

Claude와 Codex의 `.mcp.json` wrapper·경로 치환 규격이 완전히 같다고 가정하지 않는다.
`plugin-metadata.json`(또는 별도 `mcp-metadata.json`)을 논리 정본으로 두고 다음 두 파일을
생성한다.

| 생성물 | 소비자 | 역할 |
|---|---|---|
| `interactive/.mcp.json` | Claude Code | `${CLAUDE_PLUGIN_ROOT}` 기반 bundled stdio MCP |
| `interactive/adapters/codex/.mcp.json` | Codex | Codex가 검증한 wrapper와 plugin-local 경로 방식 |

`gen-plugin-manifests.mjs`는 Codex 매니페스트에 `mcpServers` 필드를 추가 생성한다
(`"skills"` 필드는 이미 존재 — 신규는 `mcpServers`뿐):

```json
{
  "mcpServers": "./adapters/codex/.mcp.json"
}
```

Codex MCP의 논리 설정은 다음과 같다. `<PLUGIN_LOCAL_PATH>`는 구현 시 capability probe로
확정할 **상징값**이며 절대경로를 생성물에 쓰라는 뜻이 아니다.

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

공식 문서는 매니페스트 경로가 플러그인 루트 상대로 해석된다고 명시하지만("start with `./`,
resolve relative to the plugin root") **서버 프로세스의 cwd는 명시하지 않는다** — "servers
are launched from the plugin"이라는 문구가 cwd=플러그인 루트일 가능성을 남긴다. 따라서
Codex CLI·IDE/app 각각에서 다음을 실측해 한 방식만 채택한다.

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
  스킬·문서에서 도구 namespace를 하드코딩하지 않는다. id 변경은 도구 네임스페이스 전체를
  바꾸므로 권한 템플릿·에이전트 차단 목록·smoke 스냅샷 재생성이 한 커밋에 동반된다.

## 7. 도구면과 안전 — 훅 기본 0개, 스위치 보존

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

집행 규칙:

- `interactive/.mcp.json`의 고정 `--exposition=readonly,high`를 제거하고 `launch.cjs`가 위
  값을 검증한 뒤 bundle argv에 정확히 하나의 exposition을 넣는다. `engine/src` 수정 없이
  런처에서 가능하다. 모드 변경 뒤 MCP 재시작 필요를 setup이 안내한다.
- **인자 우선순위**: 명시 `--exposition` CLI 인자(수동 등록·Antigravity·Codex write 세션
  재등록 등 기존 문서 경로) > `.sapkit/config.json`의 `toolSurface` > 기본 `readonly`.
  명시 인자가 config와 다르면 stderr에 1회 고지한다.
- launcher의 tier 판정은 기존 리졸버 의미(D-057 R-TIE·R-ENV·R-PRESERVE)를 따르고,
  적합성 진리표(`runtime-dir-selection.json`)에 소비자로 등재해 3중 구현 드리프트를 막는다.
- 기존 프로젝트에 `toolSurface`가 없으면 `readonly`로 축소한다. 기존 DEV 사용자의 write
  도구가 업데이트 뒤 잠시 사라질 수 있으므로 v0.5.0 release note와 setup repair에서
  `development` 명시 선택 절차를 안내한다. 조용한 write 유지보다 안전한 축소를 택한다.

**정직 고지 — readonly는 실행·row-data 무풍지대가 아니다** (실측 스냅샷
`provenance/mcp-surface.json`): readonly exposition에도 실행 2종
(`RuntimeRunClassWithProfiling` · `RuntimeCreateProfilerTraceParameters`)과 row-data 2종
(`GetTableContents` · `GetSqlQuery`)이 노출된다. 실행 2종의 QA/PRD 차단은 서버 tier
게이트(§7-2)가, row-data 2종은 §7-3 정책이 담당한다. exposition만으로 이 4종을 숨기는
"이름-보존형 tools/list 필터"는 백로그(HANDOFF 5-8 잔여)로 보존하고 이번 범위에 넣지 않는다.

### 7-2. 필수 안전은 서버 안에 둔다

런타임 번들이 다음을 자체 집행하는 것이 release gate다. 각 항목은 conformance 시험으로
박제한다(§14-1).

1. QA/PRD write 및 runtime execution 차단
2. 프로파일/tier 미해석 시 write fail-closed (연결은 됐지만 `SAP_TIER` 부재인 케이스 포함)
3. 테이블 blocklist 적용 (기본 프로파일 `standard`, env 노브 `MCP_BLOCKLIST_PROFILE` ·
   `MCP_BLOCKLIST_EXTEND` · `MCP_ALLOW_TABLE`)
4. inspection-only 상태에서 연결 필요 도구의 정직한 실패
5. **훅↔서버 정책 동등성 diff 1회 실측·기록** — 설정 소스(config.json+파일 ↔ env)·기본값
   (strict ↔ standard)·프로파일 집합(`custom`은 서버에 없음)·차단 목록 내용(정책 md ↔ 서버
   내장)·ask 의미(하네스 승인창 ↔ `acknowledge_risk` 자기신고). 격차는 §7-4의 정직 표에
   기록하고 숨기지 않는다. 격차를 좁히는 엔진 수리는 별건이며 §10 덕분에 경로가 살아 있다.

훅을 켜지 않은 클라이언트에서도 위 결과가 같아야 한다. server-side 검증이 하나라도 빠지면
훅을 다시 필수화하는 것이 아니라 **런타임을 수리한 뒤 출시**한다.

### 7-3. 실데이터 2종

`GetTableContents`와 `GetSqlQuery`는 readonly exposition에도 나타난다. 배포 기본은 다음
순서로 결정한다.

1. Codex의 plugin-scoped per-tool `approval_mode="prompt"`가 TUI에서 매번 묻고,
   `codex exec`에서는 무인 fail-closed임을 실측한다.
2. 둘 다 PASS면 Claude의 "allow-list 제외"와 같은 사용자 승인 결과로 맞춘다.
3. 하나라도 FAIL이면 Codex에서는 기존 `disabled_tools` 하드 차단을 유지하고
   `P2 unsupported`를 명시한다. 기능 동등성보다 fail-closed가 우선이다.

이 판정은 버전 문자열이나 공식 문서만으로 닫지 않는다. 과거 실측(0.144.1)에서 config-level
`approval_mode="prompt"`가 `codex exec`에서 fail-open이었기 때문이다.

판정이 어느 쪽으로 나든 **관련 표면을 한 커밋에서 함께 갱신한다**: `adapters/codex/README.md`
의 하드 차단 절, `compatibility.json`의 `p2` 서술, smoke-mcp `adapter_deny` 스냅샷
(`--update` 동반 — 이 스냅샷이 README 문구를 must_mention으로 고정하고 있어 따로 고치면
CI가 red가 된다).

### 7-4. 훅 — 기본 0개, 선택 기능으로 보존

**필수 설치 경로에는 훅이 없다. 그러나 훅을 삭제하지 않는다(R-SWITCH)** — 6종 파일과
`install-hooks.mjs`(설치/제거 스위치)는 `adapters/claude/hooks/`에 그대로 남는다. 배선되지
않은 훅 파일은 세션 토큰·설치 부담이 0이다.

| 훅 | 본질 | v2 처리 |
|---|---|---|
| `tier-readonly-guard` | 서버 tier 게이트의 중복 방어 | 기본 미설치. 서버 conformance(§7-2)로 대체. 파일 보존 |
| `block-forbidden-tables` | 서버 blocklist의 상위 호환(strict 기본·config/파일·ask 승인창) | 기본 미설치. 파일 보존 — 켜면 아래 "훅 활성 시" 기능 복원 |
| `prefer-sqlquery-explicit-fields` | 비용/UX 조언 (잔소리) | 기본 미설치. 파일 보존 |
| `offline-code-analysis` | 로컬 품질 조언 (D-049) | 기본 미설치. vsp 선택 기능과 함께 안내 |
| `syntax-checker` | 실패 후 품질 조언 | 기본 미설치. 절차 지시로 대체 |
| `transport-validator` | 변경 전 품질 조언 | 기본 미설치. 절차 지시로 대체 |

**훅 없는 기본 상태의 보호 (정직 표)**:

| 층 | 담당 | 한계 |
|---|---|---|
| 서버 blocklist | 보호 테이블 거부·ask층 `acknowledge_risk`(stderr 감사) | 기본 `standard`(훅 기본 strict보다 한 단계 낮음) · ask는 자기신고이지 하드 게이트 아님(D-043 ⓑ) |
| 서버 tier 게이트 | QA/PRD write·실행 차단, 미해석 fail-closed | conformance로 박제 필요(§7-2) |
| Claude 권한창 | 템플릿 2종 제외 → 정상 모드에서 호출별 승인 | bypass/자동수락 모드에서는 승인창 없음 |
| Codex `disabled_tools` | row-data 2종 하드 차단(§7-3 판정 전 기본) | 사용자 수기(생성물 포함 시 자동) |

**훅 활성 시 복원되는 것**: strict 기본값, `.sapkit/config.json`의 `blocklistProfile`,
`blocklist-extend.txt`/`blocklist-custom.txt` 파일, 권한 모드와 무관한 ask 확인창.
문서에는 "이 기능들은 훅을 켠 경우에 적용된다"를 명시한다.

전환 순서:

1. v0.5.0에서 setup Step 4의 자동 설치를 제거한다(§8).
2. 훅 파일과 `install-hooks.mjs`는 **기한 없이** 보존한다 — "한 minor 뒤 제거"(v1)를
   폐기하고 공식 선택 기능으로 문서화한다(설치·제거·검증 방법 포함).
3. doctor가 SAPKit marker가 있는 기존 훅 배선을 **사용자(`~/.claude/settings.json`)와
   프로젝트 settings 양쪽**에서 찾아 "활성/죽은 경로/제거 가능"을 보고한다.
4. 사용자가 승인하면 기존 `--uninstall`(대상 파일별)을 실행한다. 유지를 원하면 그대로 둔다.
5. `sapkit-guardrails` 별도 플러그인 분리는 실수요가 확인될 때만 재론한다.

향후 Codex 훅을 도입할 때 Claude 스크립트를 그대로 재사용하지 않는다. 공통 정책 판정
(`allow|deny|confirm|advise`)과 클라이언트 출력 serializer를 분리해야 한다. Codex 공식
계약은 PreToolUse `deny`는 지원하지만 `ask`는 "parsed but not supported yet"이며, 미지원
출력은 hook 실패로 기록하고 도구 호출을 계속한다(§17에서 원문 검증).

### 7-5. 집행 D-항목에 담을 supersede 목록

이 설계의 집행은 다음 기존 기록을 명시적으로 개정한다. 집행 커밋의 신규 D-항목에 그대로
싣고, HANDOFF §8-4 문구 개정을 동반한다.

1. **HANDOFF §8-4** "배포 기본값은 … 훅 유지" → "훅 = 선택 기능(기본 미설치, 스위치 보존)"으로 개정.
2. **D-043③** "훅 동작 … 전부 불변" 중 배포 기본 훅 배선 부분 supersede — 템플릿 2종
   제외·Codex 하드차단 권고(§7-3 판정 전)·서버 바닥선은 유지.
3. **D-049**의 offline-code-analysis 기본 배선 → 선택 기능화.
4. **D-046 ②**가 이연했던 "동봉-미등록 훅 2종의 등록 여부" → "전 훅 기본 미등록·스위치
   보존"으로 종결.

## 8. `/sapkit:setup` v2

### 8-1. 흐름

```text
0. client/plugin/bundled MCP 탐지
1. 기존 .sapkit 또는 legacy .sc4sap 상태 요약
2. 프로파일 선택 또는 비밀 없는 sap.env 뼈대 생성
3. 프로젝트 context + toolSurface 선택
4. [선택] Claude 권한 템플릿 병합 · vsp 설치 · 안전훅 스위치 안내(설치는 명시 요청 시에만)
5. 재시작 필요 여부 안내
6. self-check: plugin → bundle → profile → MCP → SAP connection
```

삭제되는 기본 단계:

- Codex README로 보내는 별도 MCP 등록 단계
- Claude 훅 자동 설치 단계 (→ Step 4의 안내 1줄로 대체: "확인창·이중 방어가 필요하면
  `install-hooks.mjs` 한 줄로 켤 수 있다")
- Codex `disabled_tools` 수기 편집 단계(안전 프로필이 manifest/config 생성물에 포함될 때)

Step 3의 `blocklistProfile` 질문은 유지하되 "**훅을 켠 경우에 적용**되며, 훅 없는 기본
상태의 서버 차단은 env 노브로 조절한다"는 주석을 함께 보여준다.

### 8-2. 대화와 파일 쓰기의 분리

`SKILL.md`와 `setup.md`는 질문·설명·사용자 확인을 담당한다. 반복 가능해야 하는 상태 판정과
파일 갱신은 신설 `interactive/scripts/setup-state.mjs`가 담당한다.

이것은 D-045가 기각한 "모든 질문을 없애는 비대화형 setup"의 부활이 아니다. 스크립트는
사람의 선택을 대신하지 않고, 이미 승인된 선택을 같은 방식으로 적용하는 작은 mutator다.

제안 인터페이스:

```text
node "<PLUGIN_ROOT>/scripts/setup-state.mjs" status --project <path> --json
node "<PLUGIN_ROOT>/scripts/setup-state.mjs" plan   --project <path> --input <non-secret-json> --json
node "<PLUGIN_ROOT>/scripts/setup-state.mjs" apply  --project <path> --plan <plan-file> --json
node "<PLUGIN_ROOT>/scripts/setup-state.mjs" verify --project <path> --client auto --json
```

규칙:

- 기본은 `status`/`plan`; `apply` 없이는 쓰지 않는다.
- 입력 schema에 password/secret/token 필드를 허용하지 않는다.
- `sap.env`는 `SAP_PASSWORD=` 빈 줄만 만들고 값은 사용자가 직접 입력한다.
- plan에는 대상 절대경로, create/update/noop, 변경 필드, restart 필요 여부를 담되 비밀은 없다.
- 기존 JSON의 알 수 없는 키와 기존 설정을 보존한다.
- 건강한 파일은 byte-level noop이다. 그 전제로 직렬화 규칙을 고정한다: Node 전용 I/O
  (UTF-8 무BOM — D-060의 PS 인코딩 사고 교훈), 기존 파일의 EOL 보존, JSON 2-space 들여쓰기
  + 기존 키 순서 보존.
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
    "probeCandidates": ["0.146.0"],
    "lastVerified": [],
    "requiredCapabilities": [
      "plugin-bundled-stdio-mcp",
      "plugin-local-path-with-project-cwd",
      "plugin-scoped-tool-policy"
    ]
  }
}
```

`0.146.0`은 이 문서를 작성한 머신의 설치 버전일 뿐, bundled MCP conformance를 통과했다는
뜻이 아니다. `minimumSupported`와 `lastVerified`는 최초 clean-home conformance가 통과한
뒤에만 채운다. 판정:

- `minimumSupported === null`(pre-conformance) → 어떤 버전도 PASS로 부르지 않는다.
  capability probe를 실행하고 결과와 함께 WARN(미검증)으로 보고한다.
- 최소 미만 또는 필수 capability FAIL → FAIL
- 검증된 버전 → PASS
- 최소 이상이지만 더 새로운 미검증 버전 → WARN + capability probe 실행
- CLI 미설치 → 해당 클라이언트 SKIP

Antigravity 핀 로직은 비범위 — 현행 exact 비교를 유지한다.

### 9-2. doctor 범위

현재 doctor의 번들 해시·CLI 존재·Claude hook 경로 검사에 다음을 추가한다.

1. 현재 실행 중인 플러그인 루트와 manifest version
2. Claude/Codex bundled MCP 선언과 실제 launcher 경로
3. 플러그인 경로에 공백·한글이 있어도 stdio initialize/tools/list 성공
4. 프로젝트 cwd와 `.sapkit/active-profile.txt` 해석 결과
5. 기대 `toolSurface`와 tools/list의 write 도구 존재 여부
6. Codex legacy 전역 `sap` MCP 중복
7. SAPKit 훅 배선 상태 — **사용자 `~/.claude/settings.json`과 프로젝트 settings 양쪽**에서
   marker 탐지, 활성/죽은 경로 보고 (스위치가 영구 기능이므로 상시 검사)
8. `sap.env` 존재 여부만 확인하고 내용·값은 출력하지 않음

**소유자 머신 예외(D-043·HANDOFF §8-4)**: Codex `disabled_tools` 부재·Claude 2종 허용·훅
미배선/무력화 상태를 "결함"으로 보고하지 않는다 — 훅 미배선은 v2부터 기본값이기도 하다.

사람용 텍스트와 `--json`을 모두 제공한다. JSON은 `status`, `code`, `evidence`,
`remediation`을 가지며 CI와 setup이 같은 판정을 재사용한다.

## 10. `engine/` — 삭제하지 않는다

**결정**: `engine/` 소스는 레포에 유지한다. v1의 외부 원천화·삭제 계획(구 §10, P5·P6)은
폐기한다.

**근거**:

1. **D-040⑦(2026-07-20)이 정확히 이 선택지를 이미 기각했다** — "MCP source = in-repo
   `engine/` 정본 추인 … 외부 정본 복귀는 자체 수리 소실". D-040①도 모노레포 유지를
   "차용 후 완전 소유의 의도된 형태"로 명시했다.
2. **이득이 사실상 0이다** — 설치되는 플러그인 원천은 `./interactive`뿐이라 `engine/`은
   어차피 배포에 포함되지 않고, D-040②는 레포 바이트를 주 KPI에서 제외했다. 세션 토큰·설치
   부담·모델이 겪는 환경에 변화가 없다.
3. **수리 실수요가 살아 있다** — 2026-07-11~08-02 사이 엔진 수리 약 20건(오늘자 4.14.0
   포함), 문서로 임시 우회해둔 알려진 도구 결함(D-058 ⓓ: `$TMP` 판별·GrepObjects FUGR
   미도달·CreateTransport 인코딩)과 dist dotenv 정리(D-060 ⓑ)가 대기 중이다. 소스를 빼면
   D-017이 실측으로 종결했던 "수리 1건 = 두 레포 왕복" 마찰이 되살아난다.

**재론 트리거**: 엔진 수리 요청이 장기간(제안: 6개월) 0으로 수렴하면 삭제를 재론할 수 있다.
그 경우에도 ① 새 D-항목(D-040⑦ supersede 명시) ② v1이 정리한 원천 보존·재현 계약
(외부 repo/branch에 정확한 commit·lockfile 재빌드 절차·black-box 계약 시험·license 고지)
③ CI의 엔진 결합 5곳 이전 계획 — engine-tests 잡(jest+`--rebuild` 재현),
`check-engine-provenance`, 적합성 fixture(`engine/__tests__/fixtures/runtime-dir-selection.json`),
rename 게이트의 engine 구역, dotenv probe(`engine/package-lock.json`) — 이 선행돼야 한다.
원천을 보존하지 않는 삭제는 "정리"가 아니라 런타임 동결(FROZEN_VENDOR_BUNDLE) 결정이며,
보안·SAP 호환 수리 불가를 release note에 기록해야 한다.

**용어 주의(D-040 용어 절)**: 여기서의 `engine/`은 트랙 B MCP 서버의 TypeScript 소스다.
트랙 A **ENGINE**(final-harness 루프 실행기)과 다른 물건이며, 후자는 D-040⑤로 이미
template-only·지원 중단 상태다 — 본 설계는 트랙 A에 무접촉이다. (v2 확정 대화에서 실제로
이 혼동이 발생했다 — 두 이름을 섞어 쓰지 말 것.)

## 11. 업데이트·버전 배포

### 11-1. 버전 정본

- 제품 버전의 단일 정본은 `interactive/plugin-metadata.json`이다.
- 생성기는 Claude/Codex/AG 매니페스트와 설명을 재생성한다.
- Claude marketplace entry와 plugin manifest의 version 중복은 현재 생성기+`--check`가
  관리하므로 드리프트 위험이 아니다. **중복 제거 여부는 P4에서 `plugin validate`와
  vN→vN+1 실측(marketplace entry version이 업데이트 판정에 쓰이는지)으로 확정한다** —
  실측 전에 제거하지 않는다.
- 버전을 올리지 않은 새 릴리스는 CI에서 거부한다(D-060 ④: 설치본 내용이 바뀌는 커밋은
  패치 범프가 배포의 일부다).

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

Codex에는 플러그인 `update` 하위명령이 없다(0.146.0 실측 — add/list/marketplace/remove뿐).
두 번째 `add`가 설치 버전을 실제로 교체하는지는 clean-home vN→vN+1 시험으로 확정한다.
아니라면 공식 지원 명령을 문서화하며 remove/add를 조용히 자동 실행하지 않는다.

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
2. setup status가 기존 permission과 훅 배선(**사용자 settings + 프로젝트 settings**)을
   보고한다.
3. 훅 제거 여부를 사용자에게 한 번 **질문**한다 — 유지 선택도 정상 상태다(선택 기능).
   제거 승인 시 기존 installer의 `--uninstall`을 사용한다.
4. `toolSurface`가 없으면 readonly로 시작하고 DEV write가 필요할 때만 development를 선택한다.
5. permission allow-list는 자동 축소·삭제하지 않는다.

### 12-2. 기존 Codex 사용자

1. bundled MCP가 정상인지 먼저 확인한다.
2. 기존 전역 `[mcp_servers.sap]`가 있으면 중복으로 보고한다.
3. 사용자가 승인한 경우에만 기존 등록을 제거한다.
4. `toggle-plugin.mjs`는 Codex의 plugin enable/disable 공식 명령이 **실재·전역 스코프로
   동작함을 P0에서 실측한 뒤에만** 대체·제거한다(플러그인 활성이 전역 전용임은 기실측).
5. config의 사용자 다른 MCP·주석·순서는 건드리지 않는다.

### 12-3. legacy `.sc4sap/`

D-057 불변: setup은 legacy 상태를 그대로 읽고 마이그레이터의 dry-run 명령만 안내한다.
플러그인 업데이트를 계기로 자동 이동하지 않는다.

## 13. 구현 순서

| 단계 | 작업 | 종료 조건 |
|---|---|---|
| **P0 — BLOCKER probe** | Codex bundled MCP wrapper/path/cwd, server id 충돌, per-tool prompt의 TUI/exec 동작, plugin enable/disable 공식 명령 실재 | 지원 버전과 정확한 JSON shape 확정 |
| P1 — 패키징 | Codex MCP 생성물 + manifest 연결, Claude/Codex 논리 정본, launcher `toolSurface`(+인자 우선순위) | 수동 `codex mcp add` 없이 tools/list |
| P2 — setup/doctor | setup v2, deterministic state mutator, capability 기반 doctor | clean project + 재실행 diff 0 |
| P3 — 훅 이행 | 기본 설치 제거, 기존 배선 탐지(사용자+프로젝트)·선택 제거, 선택 기능 문서(설치·제거·검증), 서버 게이트 conformance | 훅 0개 상태로 전체 필수 gate PASS + 스위치 왕복 시험 PASS |
| P4 — 업데이트·릴리스 | version 정본·manifest version 중복 실측 판정·vN→vN+1 시험·README, **v0.5.0** | 캐시 경로 변경 후 MCP 정상 |

(v1의 P5·P6 — engine 원천화·삭제 — 는 §10에 따라 폐기. 재론 시 별도 설계·D-결정.)

## 14. 시험과 완료 기준

### 14-1. CI 자동 시험

- Windows + Linux, 공백·한글 포함 설치 경로
- 임시 HOME/USERPROFILE/CODEX_HOME으로 사용자 실제 설정 무접촉
- Claude/Codex manifest parse와 local marketplace 설치
- installed plugin 안에 `skills/`, `core/`, `server/`, `adapters/`, `scripts/` 존재
- installed plugin 안에 `engine/` 없음 (패키징 경계 — 소스 유지와 무관하게 불변)
- no-profile → inspection-only initialize/tools/list
- readonly → write 도구 0 · **실행 도구는 등재분(스냅샷)과 정확히 일치** · row-data 노출
  상태 기대대로 (기존 smoke-mcp 단언의 승계 명문화)
- DEV development → 기대 write 도구 존재
- QA/PRD development 요청 → readonly로 강등
- **서버 tier 게이트 conformance** — QA/PRD write·실행 거부, tier 미해석 시 write fail-closed
- **서버 blocklist conformance** — 기본 standard 거부 동작, `MCP_BLOCKLIST_EXTEND`/`MCP_ALLOW_TABLE`
  env 노브, ask층 `acknowledge_risk` 왕복
- **훅 스위치 왕복** — `install-hooks.mjs` 설치→doctor 탐지→`--uninstall` 제거가 멱등이고
  다른 훅·설정을 건드리지 않음
- setup 첫 실행 → 기대 파일 생성 · 두 번째 실행 → byte diff 0
- 깨진 JSON/부분 파일 → 기존 파일 보존 + 명확한 BLOCKED
- `sap.env` 값과 process env secret이 stdout/stderr/JSON report에 없음
- vN 설치 → vN+1 업데이트 → 새 캐시 경로에서 MCP와 setup 정상
- legacy 전역 MCP와 훅(사용자+프로젝트) 탐지, 무승인 상태에서 변경 0

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

다음 중 하나라도 있으면 "Codex도 Claude처럼 설치 한 번"을 완료로 선언하지 않는다.

- Codex MCP가 절대 캐시경로를 요구함
- Codex plugin path를 얻기 위해 project cwd를 잃음
- `codex exec`에서 prompt 정책이 fail-open인데 해당 도구가 노출됨
- bundled 서버와 legacy 전역 서버가 동시에 기동함
- 훅 미설치 상태에서 QA/PRD write 또는 서버 blocklist가 우회됨
- 실데이터 2종의 배포 기본(템플릿 2종 제외 · Codex 하드차단/§7-3 판정)이 현행보다 약화된 채 출시됨
- 훅 스위치(`install-hooks.mjs` 설치·제거)가 손상된 채 출시됨
- 업데이트 뒤 이전 캐시를 가리키는 설정이 남음

## 15. 기각·보류한 대안

| 대안 | 처분·이유 |
|---|---|
| `engine/` 소스 삭제 (v1 §10 · P5·P6) | **보류·범위 제외** — D-040⑦ 충돌 · 이득 0 · 수리 실수요 실증. 재론 트리거·선행조건은 §10 |
| 훅 파일·설치기 완전 삭제 | **기각** — "설정으로 되돌릴 수 있다"는 전제 보존(사용자 결정, R-SWITCH). 비배선 파일 비용 0 |
| launcher가 config.json blocklistProfile을 서버 env로 브리지 | **기각(현 시점)** — 훅 스위치 보존으로 해당 기능의 거처가 이미 있음. 훅 없이 그 기능을 원하는 실수요가 확인되면 재론 |
| Codex README에 현재 절대경로 명령만 더 친절하게 작성 | 기각 — 사용자가 바뀔 때마다 경로가 다르고 업데이트 때 다시 깨짐 |
| setup이 `~/.codex/config.toml`에 전체 MCP 블록 복사 | 기각 — plugin-bundled MCP와 정본이 둘로 갈라지고 캐시 버전을 고정함 |
| Claude `.mcp.json` 하나를 Codex가 그대로 읽는다고 가정 | 기각 — wrapper·변수·cwd 차이를 검증하지 않으면 silent failure 가능 |
| Claude 6훅을 Codex에 그대로 등록 | 기각 — `ask` 의미가 다르고(공식 문서 검증) 훅 신뢰 절차가 새 설치 장벽이 됨 |
| 훅을 안전의 유일한 정본으로 유지 | 기각 — 클라이언트별 지원 차이와 사용자의 비활성화로 우회 가능 |
| 원격 one-liner 설치 스크립트 | 기각 — 신뢰하기 전 코드를 즉시 실행시키는 배포 방식 |

## 16. 리뷰 이력

- **2026-08-02 Claude Code 실물 대조 리뷰(v1 대상)** — §3 진단 전 항목 실측 재현(CLI 버전
  포함), 번들 내부 grep(blocklist 기본값·tier 게이트), 훅 6종·설치기·doctor·생성기·CI·setup
  원문 대조, DECISIONS 원문 확인, §17 근거 URL 3건 fetch 검증. 판정: BLOCKER 2(D-040⑦
  미인용 충돌 · HANDOFF §8-4/D-043③ 미인용 충돌) · MAJOR 4(훅↔서버 blocklist 격차 ·
  engine 삭제 CI 파급 인벤토리 누락 · readonly 실행 도구 미고지 · 훅 진단 과장/스캔 범위) ·
  MINOR 6 · INFO 5. **전건 v2에 반영.**
- **사용자 결정(동일자)** — ① 훅 = 기본 미설치 + 스위치 보존(삭제 아님) ② `engine/` 소스
  유지(트랙 A ENGINE과의 혼동 해소 후 확정) ③ 최종 범위 = Codex 온보딩 동등화 + 잔소리
  제거.

## 17. 근거 문서

전부 2026-08-02 리뷰 세션에서 실재·내용 검증 완료:

- OpenAI, [Package your plugin](https://developers.openai.com/plugins/build/plugins)
  — `mcpServers` 필드, plugin-scoped per-tool `approval_mode`, lifecycle hooks, 매니페스트
  경로의 플러그인 루트 상대 해석 규칙.
- OpenAI, [Codex Hooks](https://learn.chatgpt.com/docs/hooks)
  — PreToolUse `deny` 지원 · `ask`는 "parsed but not supported yet" · 미지원 출력은 hook
  실패 기록 후 도구 호출 계속.
- OpenAI, [Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp)
  — CLI/IDE/app의 MCP 설정 공유, plugin-bundled MCP 서버 명문.
- Anthropic, [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
  — Claude plugin-bundled MCP와 `${CLAUDE_PLUGIN_ROOT}`.
- Anthropic, [Discover and install plugins](https://code.claude.com/docs/en/discover-plugins)
  — marketplace 설치·reload·update/auto-update UX.
- Anthropic, [Create and distribute a plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
  — 캐시 복사·version resolution·`plugin validate`.

---

**판정:** **채택 — 구현 대기.** 기본 경로는 bundled MCP + server-side safety + 훅 기본
0개(스위치 보존)다. 집행은 P0 probe 통과가 조건이며, 착수 커밋에 §7-5 supersede 목록을 담은
신규 D-항목과 HANDOFF §8-4 개정을 동반한다. `engine/` 소스는 삭제하지 않는다(§10).
