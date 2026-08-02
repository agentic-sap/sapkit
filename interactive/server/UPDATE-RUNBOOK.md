# Server Update Runbook

번들 갱신·무결성 검증 절차. 원천: sc4sap-custom `docs/engine-bundle-integrity.md`,
`docs/bundle-integrity.md` (archive 분류 — 상세는 원본 참조).

## 현재 번들

- `server.bundle.cjs` — `@hjaewon/abap-mcp-adt-powerup` (VERSION 파일에 버전·커밋·빌드 방법)
- externals: `node-rfc`(옵션), `@napi-rs/keyring`(runtime-deps/keyring, NODE_PATH 주입 필수),
  `pino`, `pino-pretty`
- `integrity.json` — 소스 커밋·해시 고정

## 갱신 절차

> 엔진 소스는 2026-07-11부터 **레포 내 `engine/`** (D-017 편입 — GitHub 포크는 히스토리
> 아카이브). 수리→번들→반영이 한 레포에서 끝난다.

1. `engine/`에서 소스 수정 → **`npm run build:bundle`** → `engine/dist/server.bundle.cjs`
   (의존성이 없으면 `cd engine && npm install` 선행. 버전 범프는 `npm version <semver>
   --no-git-tag-version` + CHANGELOG 항목 — engine/CLAUDE.md 컨벤션 준수)

   > ⚠ **`npm run bundle` 단독은 소스 변경을 반영하지 않는다.** 번들 엔트리는
   > `dist/server/launcher.js` = **tsc 산출물**이라 `npm run build`가 선행돼야 한다
   > (`build:bundle` = build && bundle). 2026-08-02 4.14.2가 이 함정에 빠져 수리가
   > 빠진 번들을 만들었고 jest는 소스를 보므로 green이었다 — **번들 반영 검증은
   > `grep -c <신규 식별자> dist/server.bundle.cjs`가 가장 싸다**(0이면 미반영).
2. lite로 복사: `server/server.bundle.cjs` + `VERSION`(commit은 sah 커밋 sha) +
   `integrity.json` 갱신(`node interactive/server/verify-engine.mjs --refresh`)
3. **capability diff**: 갱신 전후 `node scripts/smoke-mcp.mjs`의 tools 목록을 비교 —
   추가/삭제/이름 변경을 기록하고, 변경이 있으면 `server/tool-catalog/`와
   어댑터 노출 프리셋·권한 정책을 함께 갱신 (DESIGN.md §6 리뷰 5.4 대응)
   — write/runtime 도구 증감 시 `interactive/agents/sap-reviewer.md`의
   disallowedTools 열거를 동기화한다.
4. 스모크: 무프로파일 기동(inspection-only 확인) + 연결 프로파일로 read 1회 왕복
5. `.gitattributes`의 `-text` 보호가 유지되는지 확인 (EOL 변환 = 번들 파손)

## 알려진 노출 제어

- `--exposition` CLI 플래그 (노출 그룹 축소 — L4에서 프리셋 실측 예정)
- `MCP_BLOCKLIST_PROFILE` / `MCP_BLOCKLIST_EXTEND` — 테이블 블록리스트
- `MCP_UNSAFE` — 위험 도구 게이트 (의미 실측 필요)
- `SAP_TIER`(프로파일) — qas/prd에서 write 차단 (연결 시에만 유효 — L2 검증 기록 참조)
