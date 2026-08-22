# Server Update Runbook

제품 MCP 서버 번들의 **갱신·검증 절차 정본**. 이 파일이 시키는 대로만 번들을 바꾼다 —
반쪽 갱신(소스만 · 번들만 · 핀만)이 조용히 낡은 서버를 배포하는 자리이기 때문이다.

## 현재 번들

- `server.bundle.cjs` — **`sapkit-engine`**(자체 저작 · 레포 내 `sapkit-engine/`).
  판·소스 커밋·빌드 방법은 `VERSION`, 바이트 핀은 `integrity.json`.
- **externals 2종** — `node-rfc`(선택 · SAP NW RFC SDK가 있는 호스트에서만) ·
  `@napi-rs/keyring`(선택 · `runtime-deps/keyring`, **NODE_PATH 주입 필수**).
  둘 다 네이티브라 번들에 넣을 수 없다.
- 판 번호는 **빌드 스탬프**(`__SAPKIT_ENGINE_VERSION__`)로 박힌다. 스탬프가 없으면
  이 배치 위치에서는 무조건 `0.0.0`이 된다 — 위로 훑어도 `sapkit-engine`
  package.json이 없기 때문이다.

> **이력**: 2026-08-19 판7-b(D-095) 전까지 이 자리는 `engine/` 포크
> (`@hjaewon/abap-mcp-adt-powerup` 5.0.0)의 번들이었다. 그 소스 트리는
> **2026-08-22 판7.5(D-101)에 레포를 떠났다** — 그래서 롤백은 이제 **두 걸음**이다:
> ① `engine/`이 온전한 마지막 커밋 `2264f89d`에서 트리를 되뜨고 ② 그 위에서
> 교체분을 되돌린다(정본은 `HANDOFF.md` 🔙 절 — 외우지 말고 거기서 읽을 것).

## 갱신 절차

1. **`sapkit-engine/`에서 소스 수정 → `npm run build:bundle`** →
   `sapkit-engine/dist/server.bundle.cjs`.
   판을 올릴 때는 `npm version <semver> --no-git-tag-version`.

   > ⚠ **`npm run bundle` 단독은 소스 변경을 반영하지 않는다.** 번들 엔트리가
   > `dist/src/server/entry.js` = tsc 산출물이라 `npm run build`가 선행돼야 한다
   > (`build:bundle` = build && bundle). 구 엔진이 2026-08-02에 이 함정으로 수리가
   >빠진 번들을 냈고 jest는 소스를 보므로 초록이었다 — **반영 확인의 가장 싼 방법은
   > `grep -c <신규 식별자> dist/server.bundle.cjs`다**(0이면 미반영).

2. **소스 변경을 먼저 커밋한다.** 번들·핀은 그다음 커밋이다.

   > 왜 두 커밋인가: `check-engine-provenance.mjs`가 「`integrity.json.sourceCommit` ==
   > 엔진 소스를 마지막으로 바꾼 커밋」을 단언한다. 한 커밋에 다 넣으면 자기 SHA를
   > 미리 적어야 해서 성립할 수 없다. 소스 경로는 그 스크립트의 `ENGINE_SOURCE_PATHS`
   > 목록이 정본이다(`src` · `package.json` · `package-lock.json` · `tsconfig.json` ·
   > `tools/bundle.mjs`).

3. **번들 반입**: `sapkit-engine/dist/server.bundle.cjs` → `interactive/server/server.bundle.cjs`
   복사 → `VERSION` 갱신(1행 `sapkit-engine <semver>` · `source commit <40자 SHA>` =
   2단계의 커밋) → `node interactive/server/verify-engine.mjs --refresh`로 재핀.

4. **capability diff**: 갱신 전후 `node interactive/scripts/smoke-mcp.mjs`의 도구 이름
   집합을 비교한다. 추가/삭제/개명이 있으면 **의도한 것일 때만**
   `smoke-mcp.mjs --update`로 스냅샷을 갱신하고, `server/tool-catalog/`를 **재생성**하며,
   어댑터 노출 프리셋·권한 정책을 함께 고친다. write/runtime 도구가 늘거나 줄면
   `interactive/agents/sap-reviewer.md`의 `disallowedTools` 열거를 동기화한다.

   > ⚠ **`server/tool-catalog/`는 손으로 고치지 않는다.** 그 4파일
   > (`sc4sap-mcp-tools*.md`)은 2026-08-23 판10(D-107 ⓐ)부터 **엔진 등록점
   > (`TOOL_REGISTRY`)에서 만드는 기계 생성물**이고, 손으로 고치면 엔진 게이트
   > 「카탈로그」가 거부한다 — `TOOL-LEDGER.md`와 같은 지위다. 재생성은 이렇게 한다:
   >
   > ```bash
   > cd sapkit-engine && npm run build && node harness/render-tool-catalog.mjs
   > ```
   >
   > 등록점이 입력이므로 **프로파일도 SAP 접속도 필요 없다.** 어댑터 노출 프리셋과
   > 권한 정책은 생성기가 만들지 않는다 — 그쪽은 여전히 **사람 몫**이다.

5. **게이트 전종**(아래 「닫는 법」)을 돌린다.

6. `.gitattributes`의 `-text` 보호가 유지되는지 확인한다 — EOL 변환 = 번들 파손.

## 닫는 법 (이 순서로 전부 exit 0이어야 반입이 끝난 것이다)

```bash
node interactive/server/verify-engine.mjs                 # VERSION ↔ integrity.json ↔ 바이트
node interactive/scripts/check-engine-provenance.mjs      # 소스 커밋 ↔ 번들 (--rebuild면 재현까지)
node interactive/scripts/smoke-mcp.mjs                    # 도구 표면 계약 (번들)
node interactive/scripts/smoke-mcp.mjs --target=engine    # 같은 계약을 소스 산출물에도
node interactive/scripts/conformance-server-gates.mjs     # 서버 안전 게이트 (번들)
node interactive/scripts/conformance-server-gates.mjs --target=engine
cd sapkit-engine && node harness/render-tool-catalog.mjs --check   # 카탈로그 4파일 ↔ 등록점
```

`--target`은 **번들 vs 소스**를 가른다(교체 전에는 구 vs 신이었다). 둘의 판정이
갈리면 엔진이 아니라 **번들러**를 의심할 자리다.

마지막 줄이 4단계의 재생성을 닫는다 — **커밋된 카탈로그 4파일 == 등록점에서 만든
결과**를 재고 어긋나면 exit 1이다. 같은 대조가 엔진 게이트 「카탈로그」
(`gates/catalog.mjs`)로도 돌고, CI의 `sapkit-engine` 잡이 그것을 매번 돌린다.

`sapkit-engine/` 안에서는 `npm run verify`(= build:bundle + typecheck + test) ·
`npm run gates`(**6종** — 표면 · 카탈로그 · 안전 · 대장 · HTTP 기동 · SSE 기동) ·
`node gates/bundle-smoke.mjs`가 같은 물건을 반대편에서 잰다.

## 알려진 노출 제어

- `--exposition` CLI 플래그 — 노출 그룹. 런처 셰임이 프로젝트
  `<runtime dir>/config.json`의 `toolSurface`에서 정해 **정확히 하나** 넘긴다.
- `MCP_BLOCKLIST_PROFILE` / `MCP_BLOCKLIST_EXTEND` / `MCP_ALLOW_TABLE` — 테이블
  blocklist. **통로가 둘이다**(활성 프로파일 `sap.env` · 서버 프로세스 env) **그러나
  프로세스 env는 조일 수는 있어도 풀 수는 없다**: `MCP_ALLOW_TABLE`은 프로파일 파일만 ·
  층 이름은 프로파일보다 **더 조일 때만** · `MCP_BLOCKLIST_EXTEND`는 **합집합**.
  (구 엔진은 프로세스 env 값을 통째로 지웠다 — 옛 GAP-2. 방향을 가른 근거는 D-096,
  표는 `adapters/claude/hooks/README.md`.)
- `MCP_UNSAFE` / `--unsafe` — **해석은 하되 게이트에는 손대지 않는다.** 구 문서가
  「의미 실측 필요」로 남겨 둔 노브인데, 자체 저작 엔진이 실측해 결론을 냈다
  (`sapkit-engine/src/server/startup.ts` + `src/safety/__tests__/unsafe.test.ts`의
  음성시험). 값은 `true`만 참으로 읽고 `TRUE`는 거짓이다. **이 노브로 열리는 도구는 없다.**
- `SAP_TIER`(프로파일) — QA/PRD에서 write·실행 차단. 연결 시에만 유효.
