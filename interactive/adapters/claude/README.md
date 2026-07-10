# Claude Code 어댑터 (기준 구현)

레포 루트가 곧 플러그인 루트다 — 플러그인 캐시에 core/·server/가 포함되어야 하므로
매니페스트(.claude-plugin/)·스킬 래퍼(skills/)·리뷰 에이전트(agents/)·MCP 등록(.mcp.json)은
루트에 있고, 이 디렉토리는 **패키지 밖 설치물**(안전훅·권한 템플릿)을 담는다.

## 설치

```
/plugin marketplace add D:\claude for SAP\sc4sap-lite
/plugin install sc4sap-lite@sc4sap-lite
```

재시작 후 확인: `/sc4sap-lite:troubleshooting` 스킬 존재 + `sap` MCP 서버 연결
(프로파일 없으면 inspection-only 모드로 뜸 — 정상).

## SAP 연결 (connected 프로필)

1. `~/.sc4sap/profiles/<alias>/sap.env` 작성 — 키 목록은
   [core/project-context.md](../../core/project-context.md) · **SAP_TIER 필수**
2. 프로젝트에 `.sc4sap/active-profile.txt`(별칭 1줄) + `.sc4sap/config.json`
   (sapVersion·abapRelease·activeModules·industry·country)

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
빠져 있다** — 매 호출 사람 승인 유지. 네임스페이스 접두어(`mcp__plugin_sc4sap-lite_sap__`)는
설치 후 실제 도구명과 대조해 다르면 `SC4SAP_LITE_NS=<실측 접두어> node scripts/gen-permissions.mjs`로 재생성.

## E2E 체크리스트 (L3 완료 기준)

- [ ] 플러그인 설치 + MCP 연결 (inspection-only라도 tools 노출 확인)
- [ ] 네임스페이스 접두어 실측 → 권한 템플릿 재생성 여부 판정
- [ ] install-hooks 경로 재배선 확인 (플러그인 캐시 경로 기준)
- [ ] FI 상담 1건: `/sc4sap-lite:ask-consultant` → FI 페르소나 로드 → 프로젝트 컨텍스트 반영 답변
- [ ] `/sc4sap-lite:create-program` 1건: 스펙 승인 게이트 → 구현 → **sap-reviewer 새 컨텍스트 리뷰** → 기계 검증 체인
