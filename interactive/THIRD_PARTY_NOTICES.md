# Third-Party Notices

SAPKIT은 다음 상류 프로젝트의 파생·재구성물이다. 각 라이선스 전문은 해당 저장소 참조.
자체 저작으로 **대체가 끝난** 부품은 그 사실을 함께 적는다 — 고지는 실제로 배포되는 것에
붙어야 하기 때문이다.

**⚠ 2026-08-22 판8이 이 고지의 범위를 36파일로 좁혔고, 2026-08-23 독립 리뷰가 그것을
되돌리게 했다 (D-103 → D-104).** 좁힘은 `class: copy`만 세었고 **`class: transform`
범주를 통째로 빠뜨렸다** — 그 범주는 지금 `interactive/` 아래 **42건**이 살아 있고
그중 **38파일이 상류 원본과 60자 초과 동일 행을 공유한다**(합계 1,326행 · **페르소나 26이
전부 이 범주**이고 그중 25파일이 자기 실질 행의 **54~95%**). 그러므로 **상류 고지 1건(`interactive/LICENSE`)은
`interactive/` 서브트리 전체에 걸린다.**

아래 표는 **알려진 만큼**을 적는다 — 무엇이 재저작으로 해소됐고, 무엇이 남았으며,
남은 것 중 무엇이 영구 존치이고 무엇이 갚을 것인지.

| 구성요소 | 출처 | 라이선스 |
|---|---|---|
| ~~지식·정책 원천 (`copy` 갈래)~~ (**아래 GPL 서브트리 제외**) | `babamba2/superclaude-for-sap` → `hjaewon/sc4sap-custom` (동결) | **MIT — 2026-08-18 재저작 소진으로 해소.** 명부 **170/170**이 자체 집필로 치환됐다(`docs/reference/copy-baseline.md` · 각 파일이 독립 리뷰를 통과했다). ⚠ **그 명부는 `copy`만 센다 — 페르소나·절차는 그 안에 한 줄도 없다**(아래 `transform` 행). **계보는 지워지지 않고 이 행으로 남는다** |
| ~~`core/knowledge/abap/reference/` (31파일)~~ | `secondsky/sap-skills`의 `sap-abap` 스킬 — babamba2 경유 무변경 전달(`migration-map.json` `class: copy`). 내용 원자료는 `SAP-samples/abap-cheat-sheets`(Apache-2.0) | **GPL-3.0 — 2026-08-09 제거로 해소.** 아래 §GPL 참조 |
| `server/server.bundle.cjs` (MCP 서버 번들) | **자체 저작 — 소스 정본 `sapkit-engine/`.** 2026-08-19 판7-b(D-095)에 `hjaewon/abap-mcp-adt-powerup` 포크 번들을 대체했다. 판·소스 커밋은 `server/VERSION` | MIT (루트 LICENSE) |
| ~~`server/server.bundle.cjs`의 이전 판~~ | ~~`hjaewon/abap-mcp-adt-powerup` (업스트림 `babamba2` 네임스페이스 모듈 베이크인)~~ | **MIT — 2026-08-19 교체로 배포물에서 빠졌다.** 소스 `engine/`도 판7.5(2026-08-22)에 레포에서 은퇴했다 — 그때까지 적용되던 `engine/LICENSE`도 함께 떠났다 |
| `server/runtime-deps/keyring/` | `@napi-rs/keyring` (네이티브 키링 바인딩) | MIT |
| 번들 external 런타임 의존 | `node-rfc`(옵션, SAP RFC SDK 별도 라이선스 유의) · `@napi-rs/keyring`(옵션) | 각 패키지 라이선스 |
| 번들 인라인 의존 | `@modelcontextprotocol/sdk` · `zod` · `fast-xml-parser` | 각 패키지 라이선스 (MIT) |
| `server/sap-assets/` — **30파일** (동결) | `hjaewon/sc4sap-custom` 차용분. SAP 측 `ZMCP_ADT_*`·`Z*_S4SAP_*` 오브젝트의 **설치 소스**이고, 이식 커밋 `038085c2` 이후 **변경 커밋 0**이다 — 우리가 개작·유지보수하지 않는다 | MIT — `interactive/LICENSE`에 고지 승계. **영구 존치** — D-079 ⑥(SAP 오브젝트 무접촉)이 정했고 D-103 ⓓ가 끝그림에 명시했다 |
| `server/tool-catalog/sc4sap-mcp-tools*.md` (**4** — `README.md`는 자체 저작) · `server/verify-engine.mjs` · `server/bundle-keyring.mjs` — **6파일** (활성) | `hjaewon/sc4sap-custom` 차용분. ⑴ 교체가 대체하지 않았고(D-095 ⓔ) **우리가 계속 고쳐 왔다**(판8 착수 실측 — 이식 이후 각각 6·3·3 커밋) — 즉 유지보수 부채가 살아 있다 | MIT — `interactive/LICENSE`에 고지 승계. **은퇴 대상** — 판10이 `tool-catalog/`을 엔진 등록점 생성으로 바꾸고 `verify-engine.mjs` 골격을 재저작한다(D-103 ⓔ) |
| `core/personas/` **26 전량** · `core/procedures/` 5 · `core/knowledge/modules/` 3 · `tools/extract/` 2 · 훅 2 · 정책 2 · 그 밖 — **현존 42파일** (`transform`) | `hjaewon/sc4sap-custom` **형태 변환 이식분**(`MIGRATION-MANIFEST.md` 분류 정의 — 「무변환 이식」인 `copy`와 나란한 **이식**이지 재저작이 아니다). 2026-08-23 동결 원본 대조에서 **38파일이 60자 초과 동일 행 1,326행을 공유**한다 — `sap-architect.md` 58/61(95%) · `sap-critic.md` 69/76(91%) · `extract-customizations.mjs` 111/217 · `sap-doc-specialist.md`만 0/51 | MIT — `interactive/LICENSE`에 고지 승계. **미판정 — 아무 명부도 이 범주를 센 적이 없다**(D-104 ⓒ). 재저작은 **판3.7** |
| `checker/sapkit-checker.bundle.cjs` (오프라인 ABAP 검사기 번들) | 자체 저작 — 소스 정본 `sapkit-cli/`. 런타임 외부 의존 0 | MIT (루트 LICENSE) |

**검사기의 계보 각주** (의무 아님 — 정직한 기록): 이 번들이 대체한 구 `vsp/pkg/abaplint`는
상류 **abaplint**(Lars Hvam Petersen · MIT)의 기계 번역이었고, 그 고지는 Go 소스 헤더에만
있어 `vsp/` 은퇴(D-085)와 함께 레포를 떠났다. `sapkit-cli`는 abaplint 유래 **이름**
(문장 유형명 · 규칙 키)을 기능 계약으로 승계하되 **코드 표현은 복제하지 않았다**(독립
리뷰가 Go 원본과 대조해 확인). MIT상 고지 의무는 없으나 계보가 조용히 사라지지 않도록
여기 남긴다.

~~`assets/spec/template_base.xlsx`·ABAP 템플릿·샘플은 sc4sap-custom 저작물로 MIT 승계 대상이다.~~
**정정 (2026-08-23 · D-104 ⓑ)** — 셋 다 더는 상류 저작물이 아니다. `template_base.xlsx`는
판3.6에서 **생성 스크립트째 재제작**됐고(커밋 `4d7e8ce5` · `tools/spec/gen-template-base.mjs`),
ABAP 견본 5(`templates/ecc` 3 · alv-sample 1 · procedural-sample 1)는 명부 1부에서 체크됐으며,
oop 템플릿 20은 판6.2에서 자체 저작본으로 **교체·제거**됐다(D-093 ⓓ). 이 문장은 판8이 같은
파일의 머리말과 표를 고치면서 놓쳐 **고지가 스스로를 반박하게** 만들었던 자리다.

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
