#!/usr/bin/env node
// `sapkit` 실행 껍데기. 빌드 산출물의 진입점을 부르는 것이 전부다.
//
// **이 판은 PATH 설치도 npm 발행도 하지 않는다** — 로컬 실행은
// `node bin/sapkit.js …` 또는 `npm run sapkit -- …`면 충분하다.
// 먼저 `npm run build`를 돌려야 `dist/`가 선다.

require('../dist/src/cli/entry.js');
