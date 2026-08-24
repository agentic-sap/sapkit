# Third-Party Notices

SAPKIT은 다음 상류 프로젝트의 파생·재구성물이다. 각 라이선스 전문은 해당 저장소 참조.
자체 저작으로 **대체가 끝난** 부품은 그 사실을 함께 적는다 — 고지는 실제로 배포되는 것에
붙어야 하기 때문이다.

**2026-08-23 · 재저작 장부가 완주됐다 (D-109~D-113).** 상류 고지 1건(`interactive/LICENSE`)은
`interactive/` **서브트리 전체**에 걸린 채 남는다 — 파일 목록으로 좁히려던 두 번의
시도가 리뷰에서 물러났고(D-104 · D-106), 완주가 그 이유를 확정했다: 상류 저작물로
남은 것은 **파일이 아니라 산재한 계약행·참조 데이터**라 경로로 표현할 수 없다.
수치는 **`server/` 밖 ~2,200행/~130파일**(§3.4 갈래 ~570/39 · 재저작 체크된 `copy`
파일의 잔존 ~950/64 · **무변경 검증 참조표** ~660/25 — 참조표 **26편**(그중 겹침이 잡힌 25)은 재저작이 아니라
**바이트 동일 유지가 의도**다 · D-088 ②)이고, 성격은 참조표 · 출력 템플릿 ·
print-verbatim 블록 · 사용자 노출 문구 · 승인 키워드다. **체크리스트 규범항은 이제 여기
없다** — 보존 판정이 아니라 재저작 **보류**였던 그 체크박스 문장들(`review-checklist.md` 24 ·
`troubleshooting.md` 11)을 2026-08-24에 재저작했고, 위 §3.4 수치가 그만큼 내려간 것이다. 파일
단위 차용은 **`server/sap-assets/` 30**(영구 존치 · D-079 ⑥)뿐이다.
장부: `docs/reference/copy-baseline.md`(copy 170/170 · §3.4 56/56).

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
| ~~`server/tool-catalog/sc4sap-mcp-tools*.md` (**4** — `README.md`는 자체 저작) · `server/verify-engine.mjs` · `server/bundle-keyring.mjs` — **6파일** (활성)~~ | ~~`hjaewon/sc4sap-custom` 차용분. ⑴ 교체가 대체하지 않았고(D-095 ⓔ) **우리가 계속 고쳐 왔다**(판8 착수 실측 — **이식 커밋 포함 총계** 각각 6·3·3 · 이식 이후로만 세면 5·2·2)~~ | **MIT — 2026-08-23 판10 소진 · D-107.** `tool-catalog`는 **엔진 등록점 생성물**로 대체됐고(생성기 + 대조 게이트 · 손으로 고치면 거부된다 · 생성 목록은 구 카탈로그와 **diff 0**), 유틸 2종은 **골격 재저작**됐다(계약·exit 코드·핀 형식 보존). **역방향 스캔 잔존 0** — 6파일 전부 겹침 3행 미만이고 잔여 2행은 Node 관용구와 핀 형식 계약 문자열이다. **계보는 이 행으로 남는다** |
| ~~`core/personas/` 25 · `core/procedures/` 16 · 어댑터 5 · `core/knowledge/` 5 · 정책 2 · 도구 3 — 56파일~~ | `hjaewon/sc4sap-custom` 형태 변환 이식분 + 장부 밖 누락분 | **MIT — 2026-08-23 재저작 소진으로 해소**(판3.7 · D-109~D-111 · §3.4 명부 **56/56** · 배치 3회 · 독립 리뷰 누계 4회). 남은 것은 위 머리말의 **산재 계약행**뿐이며 계보는 이 행으로 남는다 |
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
