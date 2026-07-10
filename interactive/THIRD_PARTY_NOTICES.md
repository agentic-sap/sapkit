# Third-Party Notices

sc4sap-lite는 다음 상류 프로젝트의 파생·재구성물이다. 각 라이선스 전문은 해당 저장소 참조.

| 구성요소 | 출처 | 라이선스 |
|---|---|---|
| 지식·페르소나·절차·정책 원천 | `babamba2/superclaude-for-sap` → `hjaewon/sc4sap-custom` (동결) | MIT — 루트 LICENSE에 고지 승계 |
| `server/server.bundle.cjs` (MCP 서버 번들) | `hjaewon/abap-mcp-adt-powerup` (업스트림 `babamba2` 네임스페이스 모듈 베이크인) — 버전·커밋은 `server/VERSION` | MIT |
| `server/runtime-deps/keyring/` | `@napi-rs/keyring` (네이티브 키링 바인딩) | MIT |
| 번들 external 런타임 의존 | `node-rfc`(옵션, SAP RFC SDK 별도 라이선스 유의) · `pino` · `pino-pretty` | 각 패키지 라이선스 |

`assets/spec/template_base.xlsx`·ABAP 템플릿·샘플은 sc4sap-custom 저작물로 MIT 승계 대상이다.
