# Third-Party Notices

SAPKIT은 다음 상류 프로젝트의 파생·재구성물이다. 각 라이선스 전문은 해당 저장소 참조.
자체 저작으로 **대체가 끝난** 부품은 그 사실을 함께 적는다 — 고지는 실제로 배포되는 것에
붙어야 하고, 남아 있는 고지가 무엇을 덮는지가 사다리 ⑷의 판단 재료이기 때문이다.

| 구성요소 | 출처 | 라이선스 |
|---|---|---|
| 지식·페르소나·절차·정책 원천 (**아래 GPL 서브트리 제외**) | `babamba2/superclaude-for-sap` → `hjaewon/sc4sap-custom` (동결) | MIT — **`interactive/LICENSE`**에 고지 승계(루트 `LICENSE` 표가 `interactive/` **서브트리 전체**를 그 파일에 건다) |
| ~~`core/knowledge/abap/reference/` (31파일)~~ | `secondsky/sap-skills`의 `sap-abap` 스킬 — babamba2 경유 무변경 전달(`migration-map.json` `class: copy`). 내용 원자료는 `SAP-samples/abap-cheat-sheets`(Apache-2.0) | **GPL-3.0 — 2026-08-09 제거로 해소.** 아래 §GPL 참조 |
| `server/server.bundle.cjs` (MCP 서버 번들) | **자체 저작 — 소스 정본 `sapkit-engine/`.** 2026-08-19 판7-b(D-095)에 `hjaewon/abap-mcp-adt-powerup` 포크 번들을 대체했다. 판·소스 커밋은 `server/VERSION` | MIT (루트 LICENSE) |
| ~~`server/server.bundle.cjs`의 이전 판~~ | ~~`hjaewon/abap-mcp-adt-powerup` (업스트림 `babamba2` 네임스페이스 모듈 베이크인)~~ | **MIT — 2026-08-19 교체로 배포물에서 빠졌다.** 소스 `engine/`도 판7.5(2026-08-22)에 레포에서 은퇴했다 — 그때까지 적용되던 `engine/LICENSE`도 함께 떠났다 |
| `server/runtime-deps/keyring/` | `@napi-rs/keyring` (네이티브 키링 바인딩) | MIT |
| 번들 external 런타임 의존 | `node-rfc`(옵션, SAP RFC SDK 별도 라이선스 유의) · `@napi-rs/keyring`(옵션) | 각 패키지 라이선스 |
| 번들 인라인 의존 | `@modelcontextprotocol/sdk` · `zod` · `fast-xml-parser` | 각 패키지 라이선스 (MIT) |
| `server/sap-assets/` · `server/tool-catalog/` · `server/verify-engine.mjs` · `server/bundle-keyring.mjs` | `hjaewon/sc4sap-custom` 차용분 **36파일** — ⑴ 교체가 대체하지 않는다(판7-b 판정 · D-095 ⓔ). SAP 측 `ZMCP_ADT_*` 오브젝트는 D-079 ⑥이 존치로 정했다 | MIT — `interactive/LICENSE`에 고지 승계 |
| `checker/sapkit-checker.bundle.cjs` (오프라인 ABAP 검사기 번들) | 자체 저작 — 소스 정본 `sapkit-cli/`. 런타임 외부 의존 0 | MIT (루트 LICENSE) |

**검사기의 계보 각주** (의무 아님 — 정직한 기록): 이 번들이 대체한 구 `vsp/pkg/abaplint`는
상류 **abaplint**(Lars Hvam Petersen · MIT)의 기계 번역이었고, 그 고지는 Go 소스 헤더에만
있어 `vsp/` 은퇴(D-085)와 함께 레포를 떠났다. `sapkit-cli`는 abaplint 유래 **이름**
(문장 유형명 · 규칙 키)을 기능 계약으로 승계하되 **코드 표현은 복제하지 않았다**(독립
리뷰가 Go 원본과 대조해 확인). MIT상 고지 의무는 없으나 계보가 조용히 사라지지 않도록
여기 남긴다.

`assets/spec/template_base.xlsx`·ABAP 템플릿·샘플은 sc4sap-custom 저작물로 MIT 승계 대상이다.

## GPL — `core/knowledge/abap/reference/` (제거로 해소, 2026-08-09)

이 배포물은 MIT를 선언하지만 위 서브트리 **31파일은 GPL-3.0 저작물**이었다. 두 조건은
양립하지 않는다(GPL-3.0은 파생·결합물의 동일 조건 배포를 요구하고 MIT 하위 라이선싱을
허용하지 않는다). **2026-08-09, 해당 서브트리 31파일을 레포에서 전량 삭제해 이 충돌을
해소했다** — 재작성이 아니라 제거로 법적 꼬리를 끊었다. 부분 인용·사본은 다른 지식
파일로 옮기지 않았다.

**계보** (2026-08-04 규명, 삭제된 서브트리에 대한 기록으로 보존):

```
SAP-samples/abap-cheat-sheets   Apache-2.0   원자료(각 파일 3행에 Source 링크)
        ↓ secondsky가 재구성·요약 = 편집 저작물
secondsky/sap-skills            GPL-3.0      실질 원천
        ↓ babamba2/superclaude-for-sap (레포는 MIT 선언) → hjaewon/sc4sap-custom
        ↓ class: copy — 개작 없이 바이트 사본 전달
core/knowledge/abap/reference/               ← 2026-08-09 삭제됨
```

**확정 근거**: `SKILL.md` frontmatter `name: sap-abap` · `license: GPL-3.0` ·
`mcpmarket-version` / `SKILL.md`의 Related Skills 5개(`sap-abap-cds` ·
`sap-btp-cloud-platform` · `sap-cap-capire` · `sap-fiori-tools` · `sap-api-style`)가
전부 `secondsky/sap-skills` 플러그인 목록과 일치 / `migration-map.json` `class: copy`,
`source_matches: 31`.

**미확정**: babamba2가 secondsky에서 직접 받았는지 `mcpmarket` 카탈로그를 경유했는지 —
처분에는 영향이 없었다(어느 경로든 원천과 GPL-3.0 조건은 동일).

**향후 경로 (2026-08-16 확정 — `docs/reference/DECISIONS.md` D-086)**: 빈자리를 **제품 내
사전(辭典) 재수록으로 채우지 않는다.** 같은 주제(ABAP 언어 레퍼런스)가 필요하면 이미
동봉된 **help.sap.com 조회 체계**(`core/procedures/help-portal-fetch.md` +
`tools/fetch/fetch-abap-keyword-doc.mjs` · `fetch-sap-help-doc.mjs`)로 SAP 공식 ABAP
Keyword Documentation을 **필요할 때 가져와** 출처와 함께 답한다. 제품에 남는 참조 지식은
실전에서 확인한 함정 모음(`core/knowledge/abap/conventions/`)이다.
`SAP-samples/abap-cheat-sheets`(Apache-2.0)는 **향후 자체 집필이 필요해질 경우의 인용 가능
원자료**로 여기 기록만 남긴다 — 제품의 수요 지점에서는 가리키지 않는다. 그때가 오면
선별·순서·구성부터 새로 쓴다는 제약(항목 배열을 그대로 두고 문장만 바꾸는 것은 재작성이
아니라 편집 저작물의 파생)이 그대로 적용된다. 사다리 ⑶-a의 **진행 상태**는 재구성 청사진
`docs/BLUEPRINT.md`가, 그 **결정의 '왜'** 는 `docs/reference/DECISIONS.md`가 정본이다.

이 항목의 상세 판정은 `docs/reference/DECISIONS.md` D-068.
