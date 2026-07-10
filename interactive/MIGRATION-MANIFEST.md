# MIGRATION-MANIFEST — sc4sap-custom → sc4sap-lite 전 파일 분류

> 원본: `D:\claude for SAP\sc4sap-custom` (동결 예정, 508파일 · 2026-07-10 실측).
> 규칙은 **위에서 아래로 첫 매칭 우선**. `scripts/check-migration-coverage.mjs`가
> 원본 전 파일이 정확히 분류되는지(미분류 0, 죽은 규칙 0) 검증한다.
>
> 분류: `copy`(무변환 이식) · `transform`(형태 변환 이식) · `archive`(참고 보존, 이식 안 함) ·
> `exclude-private`(영구 미포함) · `obsolete`(폐기).

## 규칙 (첫 매칭 우선)

| 원본 패턴 | 분류 | 목적지 / 처리 |
|---|---|---|
| `private/**` | exclude-private | 영구 denylist — 어떤 산출물에도 미포함 |
| `.omc/**` | obsolete | 세션 상태 기록물 |
| `.claude/settings.local.json` | obsolete | 로컬 권한 상태 |
| `.claude-plugin/**` | transform | `adapters/claude/` 매니페스트 원형 (L3) |
| `.github/**` | archive | CI 신규 작성 시 참고 (rebundle.yml 포함) |
| `hooks/hooks.json` | obsolete | LEAN 훅 배선 — 선행 설계(2026-07-06)에서 무동작 실증 |
| `configs/**` | copy | `core/knowledge/modules/` — 14모듈+common, 대소문자 보존 |
| `industry/**` | copy | `core/knowledge/industry/` |
| `country/**` | copy | `core/knowledge/country/` |
| `agents/agent_details/bc/**` | transform | `core/knowledge/modules/BC/` (신규 합성 명시) |
| `agents/**` | transform | `core/personas/` — 배선 제거 + capability 태그 |
| `skills/sap-abap/**` | copy | `core/knowledge/abap/reference/` |
| `skills/create-object/ecc/**` | copy | `core/knowledge/abap/templates/ecc/` (DDIC 헬퍼 3종) |
| `skills/team/**` | obsolete | 명시 폐기 — Claude 전용 팀 오케스트레이션 |
| `skills/trust-session/**` | obsolete | 명시 폐기 — 정적 권한 템플릿으로 대체 |
| `skills/setup/**` | transform | `scripts/install-*` + `core/procedures/troubleshooting.md` 원천 |
| `skills/mcp-setup/**` | transform | 설치 가이드 원천 (하네스별 3벌) |
| `skills/sap-doctor/**` | transform | `scripts/doctor.mjs` + troubleshooting.md 원천 |
| `skills/sap-option/**` | transform | 프로파일 관리 유틸 + `core/project-context.md` 원천 |
| `skills/**` | transform | `core/procedures/` — 10개 스킬 → 1인 절차화 |
| `common/alv-sample/**` | copy | `core/knowledge/abap/templates/alv-sample/` |
| `common/oop-sample/**` | copy | `core/knowledge/abap/templates/oop-sample/` |
| `common/procedural-sample/**` | copy | `core/knowledge/abap/templates/procedural-sample/` |
| `common/data-extraction-policy.md` | transform | `core/policies/data-protection/` |
| `common/transport-client-rule.md` | transform | `core/policies/` |
| `common/spro-lookup.md` | transform | `core/procedures/` (추출 산출물 전제 문구 수정 — 리뷰 3-9) |
| `common/customization-lookup.md` | transform | `core/procedures/` (동상) |
| `common/help-portal-fetch.md` | transform | `core/procedures/` |
| `common/active-modules.md` | transform | `core/knowledge/modules/common/active-modules.md` (크로스모듈 지식) + `core/project-context.md`에서 참조 |
| `common/model-routing-rule.md` | obsolete | Claude 모델 라우팅 — 폐기 |
| `common/team-consultation-protocol.md` | obsolete | 팀 프로토콜 — 폐기 |
| `common/context-loading-protocol.md` | obsolete | Tier 로딩 — 어댑터 로딩 계약으로 대체 |
| `common/multi-profile-artifact-resolution.md` | obsolete | Claude 전용 경로 해석 — 폐기 |
| `common/**` | copy | `core/knowledge/abap/conventions/` (규약 18종) |
| `abap/**` | copy | `server/sap-assets/` (설치 manifest는 L2 신규 작성) |
| `engine/**` | copy | `server/` (번들·VERSION·integrity) |
| `runtime-deps/**` | copy | `server/runtime-deps/` (keyring — NODE_PATH 배선) |
| `data/**` | copy | `server/tool-catalog/` |
| `exceptions/**` | copy | `core/policies/data-protection/` |
| `asset/**` | copy | `assets/spec/` (program-to-spec xlsx 템플릿) |
| `scripts/hooks/**` | copy | `adapters/claude/hooks/` (안전 3종) |
| `scripts/install-hooks.mjs` | copy | `adapters/claude/hooks/` |
| `scripts/transport-validator.mjs` | transform | `adapters/claude/hooks/` (유지 훅 — L3 재배선) |
| `scripts/syntax-checker.mjs` | transform | `adapters/claude/hooks/` (유지 훅 — L3 재배선) |
| `scripts/lib/**` | transform | 유지 훅·도구 공용 lib — 필요분만 (L3) |
| `scripts/spec/**` | copy | `tools/spec/` (xlsx 산출 파이프라인) |
| `scripts/extract-spro.mjs` | transform | `tools/extract/` — **deferred(L6+)**: 수동 fallback 문서화됨(spro-lookup.md) |
| `scripts/extract-customizations.mjs` | transform | `tools/extract/` — **deferred(L6+)**: 수동 fallback 문서화됨(customization-lookup.md) |
| `scripts/fetch-abap-keyword-doc.mjs` | transform | `tools/fetch/` — **deferred(L6+)**: 수동 fallback 문서화됨(help-portal-fetch.md) |
| `scripts/fetch-sap-help-doc.mjs` | transform | `tools/fetch/` — **deferred(L6+)** |
| `scripts/sap-profile-cli.mjs` | transform | `scripts/` — **deferred(L6+)**: 수동 절차는 troubleshooting.md |
| `scripts/sap-option-tui.mjs` | transform | **deferred(L6+ 재심사)**: config.json 직접 편집으로 대체 중 |
| `scripts/bundle-keyring.mjs` | copy | `server/` (keyring 번들 도구) |
| `scripts/verify-engine.mjs` | copy | `server/` (번들 무결성 검증 — UPDATE-RUNBOOK 부속) |
| `scripts/ci/**` | archive | CI 신규 작성 시 참고 |
| `scripts/**` | obsolete | LEAN/오케스트레이션 훅·HUD·세션 장치 일괄 폐기 |
| `docs/bundle-integrity.md` | transform | `server/UPDATE-RUNBOOK.md` 원천 |
| `docs/engine-bundle-integrity.md` | transform | `server/UPDATE-RUNBOOK.md` 원천 |
| `docs/INSTALLATION.md` | transform | `docs/installation/` 재작성 참고 |
| `docs/INSTALLATION.*.md` | transform | 동상 (다국어) |
| `docs/odata-backend.md` | transform | `server/sap-assets/` 문서 참고 |
| `docs/multi-profile-*.md` | transform | `core/project-context.md` 참고 |
| `docs/**` | archive | 기록물 (CHANGELOG/FEATURES 다국어, 구조 문서) |
| `src/**` | obsolete | 구형 npm entry stub |
| `tests/**` | transform | `scripts/check-*` 개조 원천 (링크·구조 검증) |
| `LICENSE` | copy | `LICENSE` (MIT 고지 승계) |
| `CLAUDE.md` | transform | 새 CLAUDE/AGENTS 인덱스 참고 원천 |
| `README.md` | transform | 새 README 참고 |
| `README.*.md` | archive | 다국어 README — 재작성 여부 L6 이후 결정 |
| `.mcp.json` | transform | 어댑터 MCP 등록 원형 (NODE_PATH 배선 포함) |
| `.gitattributes` | transform | 번들 EOL 보호 라인 승계 |
| `.gitignore` | transform | 신규 작성 참고 |
| `CHANGELOG.md` | archive | 기록물 |
| `sc4sap.png` | archive | 브랜딩 자산 |
| `sc4sap_unleashed.png` | archive | 브랜딩 자산 |
| `package.json` | obsolete | lite 자체 package.json 신규 |
| `package-lock.json` | obsolete | 동상 |
| `tsconfig.json` | obsolete | TS 미사용 |
| `vitest.config.ts` | obsolete | 테스트 신규 구성 |
| `.release-exclude` | obsolete | custom 공개 배포 장치 |

## 검증

```
node scripts/check-migration-coverage.mjs
```

미분류 파일이 1개라도 있으면 exit 1, 매칭 0건인 죽은 규칙이 있으면 exit 2.
L1 이식 작업은 이 표의 분류를 그대로 따르며, 분류 변경은 이 파일 수정 + 재검증으로만 한다.
