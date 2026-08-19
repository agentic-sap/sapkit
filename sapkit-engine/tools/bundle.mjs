#!/usr/bin/env node
/**
 * 단일 파일 서버 번들을 만든다 — `dist/server.bundle.cjs`.
 *
 * **왜 번들인가.** 제품은 플러그인 하나를 통째로 내려받는 형태이고, 설치 중에
 * `npm install`을 돌리지 않는다(CLAUDE.md — "설치가 완전 오프라인"). 그러므로
 * 엔진은 `node_modules`를 동반하지 않는 **파일 하나**로 실려야 한다. `dist/`
 * 트리를 그대로 복사하면 `@modelcontextprotocol/sdk`·`zod`·`fast-xml-parser`가
 * 따라가야 하고, 그 순간 설치 부담과 무결성 핀이 파일 수만큼 늘어난다.
 *
 * **엔트리는 `dist/src/server/entry.js` = tsc 산출물이다.** 그래서
 * `npm run bundle` 단독은 소스 변경을 반영하지 않는다 — `npm run build`가
 * 선행돼야 한다(`build:bundle` = build && bundle). 구 엔진이 2026-08-02에
 * 정확히 이 함정에 빠져 수리가 빠진 번들을 냈고, jest는 소스를 보므로 초록이었다.
 * 번들 반영을 확인하는 가장 싼 방법은 `grep -c <신규 식별자> dist/server.bundle.cjs`다.
 *
 * **external 2종**은 둘 다 네이티브·선택 의존이라 번들에 넣을 수 없다:
 *   · `node-rfc`          — SAP NW RFC SDK가 있는 호스트에서만 `require`된다
 *                            (`src/rfc/native.ts` 지연 적재).
 *   · `@napi-rs/keyring`  — 키체인 참조 비밀번호를 풀 때만 `require`된다
 *                            (`src/profile/secrets.ts`). 제품은 이 모듈을
 *                            `interactive/server/runtime-deps/keyring/`에 두고
 *                            `NODE_PATH`로 물린다.
 * 구 엔진 번들의 external에 있던 `pino`·`pino-pretty`는 여기 없다 — 이 엔진은
 * 그 로거를 쓰지 않는다(`src/**`에 참조 0건).
 *
 * 판 번호는 빌드 시점에 박는다(`__SAPKIT_ENGINE_VERSION__`). 박지 않으면
 * `readEngineVersion()`이 위로 훑다가 **호스트 패키지**의 package.json을 만나고,
 * 제품 배포 형태에서는 `sapkit-engine`이라는 이름을 끝내 못 찾아 `0.0.0`이 된다.
 */

import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['dist/src/server/entry.js'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/server.bundle.cjs',
  external: ['node-rfc', '@napi-rs/keyring'],
  logLevel: 'warning',
  define: { __SAPKIT_ENGINE_VERSION__: JSON.stringify(pkg.version) },
});

console.log(`bundled dist/server.bundle.cjs (${pkg.name}@${pkg.version})`);
