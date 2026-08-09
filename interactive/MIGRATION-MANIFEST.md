# MIGRATION-MANIFEST — sc4sap-custom → sc4sap-lite 전 파일 분류

> ## ⛔ 은퇴 — 이식 완료 기록 (이후 갱신 의무 없음)
>
> **이 문서는 역사다.** 2026-07-10에 끝난 이식이 무엇을 어떻게 옮겼는지를 남기는
> 기록이며, 앞으로 벌어지는 콘텐츠 변경을 따라 갱신하지 않는다.
>
> **왜 은퇴했나** — **이식 시대가 끝났다.** 이 레포의 콘텐츠는 이제 원본에서
> **의도적으로 갈라진다**(차용 후 완전 소유). "목적지가 원본과 여전히 대응하는가"를
> 묻는 검증은 그래서 존재 이유를 잃었다 — 정당한 편집이 전부 위반으로 잡히기 때문이다.
> 콘텐츠 무결성의 소유자는 이제 **git 이력**이다.
>
> **함께 은퇴한 것**(실행 경로에서 제거 · 복원은 git 이력에서):
> `interactive/scripts/check-migration-snapshot.mjs`(게이트, 로컬·CI) ·
> `test-check-migration-snapshot.mjs`(그 음성시험) ·
> `build-migration-snapshot.mjs`(스냅샷 재생성) ·
> `report-sc4sap-public-drift.mjs`(상류 드리프트 리포트).
>
> **보존하는 것**: 이 문서와 `interactive/provenance/`의 이식 스냅샷
> (`sc4sap-public-source.json` · `migration-map.json` · `upstream-drift-dispositions.json`).
> 삭제하지 않는다 — 저작권 고지의 계보 근거이기도 하다
> (`interactive/THIRD_PARTY_NOTICES.md`가 `migration-map.json`의 `class: copy`를 인용한다).
>
> 아래 본문은 **은퇴 시점의 상태 그대로**다. 현행 사실이 아니라 2026-07-10 이식의 기록으로 읽을 것.

> 원본: `D:\claude for SAP\sc4sap-custom` (동결 · R-004).
> 규칙은 **위에서 아래로 첫 매칭 우선**. 이 표가 **분류의 정본**이다.
>
> 분류: `copy`(무변환 이식) · `transform`(형태 변환 이식) · `archive`(참고 보존, 이식 안 함) ·
> `exclude-private`(영구 미포함) · `obsolete`(폐기).
>
> **검증은 pinned snapshot 방식이다 (S3 · D-027 §9.2).** 구
> `check-migration-coverage.mjs`(원본 파일시스템 live walk)는 **폐기**했다 — 원본 전체를
> 재귀 순회하며 `private/` 엔트리 이름을 열거해 R-004 정신에 저촉했고, 원본이 이식 이후
> 변동하면서 수치도 흔들렸다(508 → 494). 대체물은 원본에 **접근하지 않는다**:
> `provenance/`의 고정 스냅샷만 읽으므로 CI 러너에서 그대로 돈다.
>
> **파일 수가 문서마다 다른 이유** — 셋은 서로 다른 계약이다:
> - **508** = 2026-07-10 파일시스템 walk(untracked 런타임 상태 `.omc/`·`.sc4sap/` 포함).
> - **494** = 구 게이트가 원본 변동 이후 walk한 수치.
> - **487** = **현 계약** — pin `a95eb0f`의 tracked public 파일. 유일하게 재현 가능하다.

## 규칙 (첫 매칭 우선)

| 원본 패턴 | 분류 | 목적지 / 처리 |
|---|---|---|
| `private/**` | exclude-private | 영구 denylist — 어떤 산출물에도 미포함 |
| `.omc/**` | obsolete | 세션 상태 기록물 |
| `.sc4sap/**` | obsolete | MCP 런타임 상태(로그·프로파일 포인터) — 전역 활성 sc4sap 플러그인이 동결 레포에서 기동하며 생성, 자산 아님 (2026-07-12 드리프트 실측) |
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
| `skills/setup/**` | transform | `scripts/install-*` + `core/procedures/troubleshooting.md` 원천 · wizard-step-09 → `core/procedures/install-sap-assets.md` |
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
| `common/**` | copy | `core/knowledge/abap/conventions/` (규약 20종) |
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
| `scripts/spec/**` | copy | `tools/spec/` (xlsx 산출 파이프라인) — **제2출처 발생(2026-07-31 · D-053)**: 4파일(screen-image-renderer / build-spec / render-process-images / render-md-images)은 이제 핀 커밋의 바이트 사본이 **아니고** 상류 babamba2/superclaude-for-sap PR #46(78b5c2f)에서 이식됐다. template-clone은 핀 사본 + **로컬 1줄 수리**(기본 템플릿 경로 asset/ → assets/spec/ — 이식 때 폴더가 개명됐는데 상속된 기본값이 안 따라와 build-spec CLI가 전건 실패하고 있었다, 2026-07-31 실측). image-swap / xlsx-zip 2파일만 핀 사본 그대로 |
| `scripts/extract-spro.mjs` | transform | `tools/extract/` — **이식 완료(2026-07-26)**: MCP 전송을 SDK→레포 내 stdio 클라이언트(lib/mcp-stdio.mjs)로 교체, 경로·버전 해석 sapkit 관례, 승인 게이트 dry-run 신설. 검증 = 오프라인 한정(node --check · 무인자 usage exit 2 · 15모듈 dry-run 481테이블), 라이브 추출 미검증 |
| `scripts/extract-customizations.mjs` | transform | `tools/extract/` — **이식 완료(2026-07-26)**: 동상 + 도구 인자를 현행 번들 스키마로 정합(enhancement_spot · object_name/maxResults). 검증 = 오프라인 한정(node --check · usage · 15모듈 dry-run), 라이브 추출 미검증 |
| `scripts/fetch-abap-keyword-doc.mjs` | copy | `tools/fetch/` — 무변환 이식(5-5 완료), 실동작 검증(abenwhere_all_entries) |
| `scripts/fetch-sap-help-doc.mjs` | copy | `tools/fetch/` — 무변환 이식(5-5 완료), 실동작 검증(MM-PUR 릴리스전략 페이지) |
| `scripts/sap-profile-cli.mjs` | transform | `scripts/` — **deferred(L6+)**: 수동 절차는 troubleshooting.md |
| `scripts/sap-option-tui.mjs` | transform | **deferred(L6+ 재심사)**: config.json 직접 편집으로 대체 중 |
| `scripts/bundle-keyring.mjs` | copy | `server/` (keyring 번들 도구) |
| `scripts/verify-engine.mjs` | copy | `server/` (번들 무결성 검증 — UPDATE-RUNBOOK 부속) |
| `scripts/ci/**` | archive | CI 신규 작성 시 참고 |
| `scripts/**` | obsolete | LEAN/오케스트레이션 훅·HUD·세션 장치 일괄 폐기 |
| `docs/bundle-integrity.md` | transform | `server/UPDATE-RUNBOOK.md` 원천 |
| `docs/engine-bundle-integrity.md` | transform | `server/UPDATE-RUNBOOK.md` 원천 |
| `docs/INSTALLATION.md` | transform | `adapters/` README 3벌(하네스별 설치 가이드)로 재작성 — 구 계획 docs/installation/ 폴더는 미채택(2026-07-11 정정) |
| `docs/INSTALLATION.*.md` | transform | 동상 (다국어) |
| `docs/odata-backend.md` | transform | `server/sap-assets/` 문서 참고 |
| `docs/multi-profile-*.md` | transform | `core/project-context.md` 참고 |
| `docs/**` | archive | 기록물 (CHANGELOG/FEATURES 다국어, 구조 문서) |
| `src/**` | obsolete | 구형 npm entry stub |
| `tests/**` | transform | `scripts/check-*` 개조 원천 (링크·구조 검증) |
| `LICENSE` | copy | `LICENSE` (MIT 고지 승계) |
| `CLAUDE.md` | transform | 새 CLAUDE/AGENTS 인덱스 참고 원천 |
| `README.md` | transform | 새 README 참고 |
| `README.*.md` | archive | 다국어 README — **재작성 안 함 확정(2026-07-11)**: 개인 도구라 다국어 소비자 없음, 코어(영어)·운영(한국어) 역할 분담으로 충분. 수요 발생 시 재론 |
| `.mcp.json` | transform | 어댑터 MCP 등록 원형 (NODE_PATH 배선 포함). 2026-08-02부터 그 목적지 파일은 gen-plugin-manifests 생성물이다(정본 = plugin-metadata.json) — 원본 분류(transform)는 역사 사실로 불변 |
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

## 검증 — 은퇴함 (실행 경로 없음)

**이 절의 도구는 전부 은퇴했다.** 아래는 은퇴 시점까지 무엇이 검증되고 있었는지를
남기는 기록이며, 실행 가능한 명령이 아니다(스크립트 4종은 삭제됐고 git 이력에만 있다).

은퇴한 게이트 `check-migration-snapshot.mjs`가
`provenance/sc4sap-public-source.json`(pin·allowlist·인벤토리)과
`provenance/migration-map.json`(규칙별 분류·목적지 해시)에 대해 assert하던 것:

| 검사 | 위반 시 |
|---|---|
| pinned inventory의 모든 원본 경로가 규칙에 배정됨 (구 게이트의 '미분류 0') | exit 1 |
| `expect_zero` 아닌 규칙의 매칭 0건 (죽은 규칙) | exit 1 |
| inventory hash·count 재계산 일치 | exit 1 |
| copy/transform 목적지 실재 + **내용 해시 무드리프트** (구 게이트엔 없던 검사) | exit 1 |
| provenance 기록에 private 경로 열거 0건 | **exit 3** |

마지막 줄의 **private 열거 0건**은 게이트가 사라져도 유효한 불변 규칙이다 — 스냅샷
파일 자체가 private 경로를 담지 않는다는 사실은 파일에 박제돼 있고, `private/**`는
영구 denylist(R-004)로 남는다.

`expect_zero` 4건(`private/**`·`.omc/**`·`.sc4sap/**`·`.claude/settings.local.json`)은
매칭 0이 **정상**이었다 — private은 애초에 질의하지 않고, 나머지 셋은 untracked 런타임
상태라 git tree에 없다.

**목적지 해시 재핀은 더 이상 하지 않는다.** 이식 이후의 콘텐츠 변경은 원본 대응을
깨는 것이 정상이며(의도된 분기), 그 이력은 git이 갖는다. 스냅샷의 해시는 **2026-07-10
이식 시점의 값**으로 동결이고, 현재 트리와 일치할 의무가 없다.

상류(`sc4sap-custom`) public 드리프트 감시도 함께 은퇴했다
(`report-sc4sap-public-drift.mjs`). 마지막 기록: **2026-07-16 실측 pin 이후 public
변경 45건 전부 pending**(그중 copy/transform 36건이 검토 대상이었다). 그 판단 기록처
`provenance/upstream-drift-dispositions.json`도 갱신 의무 없는 역사로 동결한다 —
상류 미추종 자세는 D-039 ⑧에서 이미 정해졌고, 이제 감시선 자체가 없다.
