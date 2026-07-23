# Claude Code 어댑터 (기준 구현)

레포 루트가 곧 플러그인 루트다 — 플러그인 캐시에 core/·server/가 포함되어야 하므로
매니페스트(.claude-plugin/)·스킬 래퍼(skills/)·리뷰 에이전트(agents/)·MCP 등록(.mcp.json)은
루트에 있고, 이 디렉토리는 **패키지 밖 설치물**(안전훅·권한 템플릿)을 담는다.

## 설치

```
/plugin marketplace add D:\claude for SAP\sap-agentic-harness
/plugin install sapkit@agentic-sap
```

배포본은 로컬 경로 대신 `/plugin marketplace add agentic-sap/sapkit`.

재시작 후 확인: `/sapkit:troubleshooting` 스킬 존재 + `sap` MCP 서버 연결
(프로파일 없으면 inspection-only 모드로 뜸 — 정상).

## 빠른 시작 — `/sapkit:setup` (권장)

설치·재시작 후 `/sapkit:setup`을 실행하면 아래 수동 단계 전부(SAP 연결 프로파일·
`.sc4sap/` 파일 2개·권한 템플릿 병합·안전훅 등록·선택적 vsp 설치)를 대화형 마법사가
대신하고 층별 자가 점검으로 끝난다. 아래 절들은 수동 경로 정본이자 마법사 폴백이다.
정본 절차 = `core/procedures/setup.md`.

## SAP 연결 (connected 프로필)

1. `~/.sc4sap/profiles/<alias>/sap.env` 작성(`$SC4SAP_HOME_DIR` 설정 시 그 하위) — 키 목록은
   [core/project-context.md](../../core/project-context.md) · **SAP_TIER 필수**
2. 프로젝트에 `.sc4sap/active-profile.txt`(별칭 1줄) + `.sc4sap/config.json`
   (sapVersion·abapRelease·activeModules·industry·country)

## 로컬 오프라인 검증 (vsp, 선택)

SAP 반영 전 `.abap` 파일을 로컬에서 미리 점검하고 싶으면 `vsp`(오프라인 ABAP
검증기)를 설치한다 — 없어도 플러그인 동작에는 지장 없다.

```
node interactive/scripts/get-vsp.mjs   # ~/.sc4sap/bin/vsp(.exe) 설치
```

설치 후 `vsp lint <파일>` / `vsp parse <파일>`로 사용. 자세한 내용:
[core/procedures/troubleshooting.md §7](../../core/procedures/troubleshooting.md#7-vsp-local-verification-optional).

## 안전훅 3종 + 유지 훅 (프로젝트 단위, 선택 권장)

`hooks/`의 block-forbidden-tables·tier-readonly-guard·prefer-sqlquery-explicit-fields
(+ 유지 훅 transport-validator·syntax-checker)를 프로젝트 settings에 등록:

```
node adapters/claude/hooks/install-hooks.mjs --project <프로젝트 경로>
```

주의: install-hooks.mjs는 원본(sc4sap-custom) 경로 후보를 탐색하므로 **L3 E2E에서
lite 경로로 재배선 검증 필요** (아래 체크리스트).

## 권한 템플릿 (구 trust-session 대체)

`permissions-template.json`의 allow 목록을 프로젝트 `.claude/settings.local.json`에
병합하면 SAP 도구 승인 프롬프트가 사라진다. **GetTableContents/GetSqlQuery는 의도적으로
빠져 있다** — 매 호출 사람 승인 유지. 네임스페이스 접두어(`mcp__plugin_sapkit_sap__`)는
설치 후 실제 도구명과 대조해 다르면 `SC4SAP_LITE_NS=<실측 접두어> node scripts/gen-permissions.mjs`로 재생성.

## E2E 체크리스트 (L3 완료 기준)

어댑터-코어 동기화 전반 점검: `node interactive/scripts/doctor.mjs` (3사 동기화 점검)

- [ ] 플러그인 설치 + MCP 연결 (inspection-only라도 tools 노출 확인)
- [ ] 네임스페이스 접두어 실측 → 권한 템플릿 재생성 여부 판정
- [ ] install-hooks 경로 재배선 확인 (플러그인 캐시 경로 기준)
- [ ] FI 상담 1건: `/sapkit:ask-consultant` → FI 페르소나 로드 → 프로젝트 컨텍스트 반영 답변
- [ ] `/sapkit:create-program` 1건: 스펙 승인 게이트 → 구현 → **sap-reviewer 새 컨텍스트 리뷰** → 기계 검증 체인

## 활성 스코프 (2026-07-10 실측)

`claude plugin install ... --scope local`로 설치하면 이 프로젝트의
`.claude/settings.local.json`(git 미추적)에만 enabledPlugins가 기록된다 —
**나만 + 이 프로젝트만**. 다른 프로젝트 세션에는 로드되지 않는다.
전 프로젝트 공유가 필요하면 `--scope user`, 팀 공유는 `--scope project`.
