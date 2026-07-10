# Server Update Runbook

번들 갱신·무결성 검증 절차. 원천: sc4sap-custom `docs/engine-bundle-integrity.md`,
`docs/bundle-integrity.md` (archive 분류 — 상세는 원본 참조).

## 현재 번들

- `server.bundle.cjs` — `@hjaewon/abap-mcp-adt-powerup` (VERSION 파일에 버전·커밋·빌드 방법)
- externals: `node-rfc`(옵션), `@napi-rs/keyring`(runtime-deps/keyring, NODE_PATH 주입 필수),
  `pino`, `pino-pretty`
- `integrity.json` — 소스 커밋·해시 고정

## 갱신 절차

1. 엔진 포크(`hjaewon/abap-mcp-adt-powerup`)에서 `npm run bundle` → `dist/server.bundle.cjs`
2. lite로 복사: `server/server.bundle.cjs` + `VERSION` + `integrity.json` 갱신
3. **capability diff**: 갱신 전후 `node scripts/smoke-mcp.mjs`의 tools 목록을 비교 —
   추가/삭제/이름 변경을 기록하고, 변경이 있으면 `server/tool-catalog/`와
   어댑터 노출 프리셋·권한 정책을 함께 갱신 (DESIGN.md §6 리뷰 5.4 대응)
4. 스모크: 무프로파일 기동(inspection-only 확인) + 연결 프로파일로 read 1회 왕복
5. `.gitattributes`의 `-text` 보호가 유지되는지 확인 (EOL 변환 = 번들 파손)

## 알려진 노출 제어

- `--exposition` CLI 플래그 (노출 그룹 축소 — L4에서 프리셋 실측 예정)
- `MCP_BLOCKLIST_PROFILE` / `MCP_BLOCKLIST_EXTEND` — 테이블 블록리스트
- `MCP_UNSAFE` — 위험 도구 게이트 (의미 실측 필요)
- `SAP_TIER`(프로파일) — qas/prd에서 write 차단 (연결 시에만 유효 — L2 검증 기록 참조)
