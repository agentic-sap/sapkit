# Third-Party Notices

sc4sap-lite는 다음 상류 프로젝트의 파생·재구성물이다. 각 라이선스 전문은 해당 저장소 참조.

| 구성요소 | 출처 | 라이선스 |
|---|---|---|
| 지식·페르소나·절차·정책 원천 (**아래 GPL 서브트리 제외**) | `babamba2/superclaude-for-sap` → `hjaewon/sc4sap-custom` (동결) | MIT — 루트 LICENSE에 고지 승계 |
| ~~`core/knowledge/abap/reference/` (31파일)~~ | `secondsky/sap-skills`의 `sap-abap` 스킬 — babamba2 경유 무변경 전달(`migration-map.json` `class: copy`). 내용 원자료는 `SAP-samples/abap-cheat-sheets`(Apache-2.0) | **GPL-3.0 — 2026-08-09 제거로 해소.** 아래 §GPL 참조 |
| `server/server.bundle.cjs` (MCP 서버 번들) | `hjaewon/abap-mcp-adt-powerup` (업스트림 `babamba2` 네임스페이스 모듈 베이크인) — 버전·커밋은 `server/VERSION` | MIT |
| `server/runtime-deps/keyring/` | `@napi-rs/keyring` (네이티브 키링 바인딩) | MIT |
| 번들 external 런타임 의존 | `node-rfc`(옵션, SAP RFC SDK 별도 라이선스 유의) · `pino` · `pino-pretty` | 각 패키지 라이선스 |

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

**향후 경로**: 같은 주제(ABAP 언어 레퍼런스)를 공백으로 남기지 않는다. SAP 공식
`SAP-samples/abap-cheat-sheets`(Apache-2.0) 원자료를 근거로 **선별·순서·구성부터 새로
자체 집필**한다 — 항목 배열을 그대로 두고 문장만 바꾸는 것은 재작성이 아니라 편집
저작물의 파생이므로 이 구분을 지킨다. 착수·완료는 재구성 청사진 `docs/BLUEPRINT.md`의
교체 사다리 ⑶-a(GPL 주제 자체 집필)가 정본이며, 실수요 트리거와 별도 결정을 요구한다.

이 항목의 상세 판정은 `docs/reference/DECISIONS.md` D-068.
