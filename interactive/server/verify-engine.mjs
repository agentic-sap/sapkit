#!/usr/bin/env node
// 엔진 번들 3자 대조 게이트 — VERSION · integrity.json · 배포되는 바이트.
//
// 플러그인은 MCP 엔진을 미리 만 **단일 파일**(`server.bundle.cjs`)로 싣는다. 그
// 파일을 만드는 소스 정본은 레포 안 `sapkit-engine/`이고, 이 자리는 2026-08-19
// 판7-b에서 `engine/` 포크로부터 넘어왔다(D-095 · 사다리 ⑴). 그 포크는 2026-08-22에
// 레포를 떠났으므로(D-101) **되돌리기는 한 걸음이 아니라 두 걸음이다** — 커밋
// `2264f89d`에서 옛 트리를 되뜬 뒤에야 그 위에서 교체분을 revert할 수 있다.
//
// 판과 소스 커밋은 사람이 읽는 `VERSION`이 자유 문장으로 적고, 실제로 배포되는
// 바이트는 `integrity.json`이 해시·크기로 못박는다. 이 파일이 묻는 것은 오직
// **그 셋이 서로 어긋나지 않는가**다. 「그 바이트가 정말 저 커밋에서 나왔는가」는
// 다른 축이고 `interactive/scripts/check-engine-provenance.mjs`가 그쪽을 맡는다.
// keyring 런타임 의존도 같은 모양의 핀을 갖는다(`bundle-keyring.mjs` · 갱신 절차의
// 정본은 `interactive/server/UPDATE-RUNBOOK.md`).
//
// 사용:
//   node interactive/server/verify-engine.mjs            # 대조 (게이트), exit 0/1
//   node interactive/server/verify-engine.mjs --refresh  # 엔진을 올린 뒤 재핀

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = join(SERVER_DIR, 'server.bundle.cjs');
const VERSION_PATH = join(SERVER_DIR, 'VERSION');
const PIN_PATH = join(SERVER_DIR, 'integrity.json');

// 핀과 실물을 맞대 보는 축. `file`은 이 스크립트가 고정값으로 적는 라벨이라 대조하지 않는다.
const COMPARED = ['name', 'version', 'sourceCommit', 'sha256', 'bytes'];

function abort(reason) {
  console.error(`[verify-engine] FAIL: ${reason}`);
  process.exit(1);
}

// VERSION의 계약은 두 줄뿐이다 — 1행 "<패키지> <semver>", 그리고 어딘가의
// "commit <sha>". 나머지 산문은 사람이 읽는 이력이므로 파서가 건드리지 않는다.
function readVersionFile() {
  const text = readFileSync(VERSION_PATH, 'utf8');
  const head = text.match(/^(\S+)\s+(\d+\.\d+\.\d+)/);
  if (!head) abort(`VERSION 1행이 "<패키지> <semver>" 꼴이 아니다: ${text.split('\n')[0]}`);
  const commit = text.match(/commit\s+([0-9a-f]{7,40})/);
  // 커밋이 없으면 대조축 하나가 통째로 사라진다. 옛 판은 그 자리를 null로 두고
  // 핀도 null이면 조용히 통과시켰다 — 이제 여기서 끊는다.
  if (!commit) abort('VERSION에 "commit <sha>"가 없다 — 소스 커밋 없는 핀은 대조축이 하나 빈 핀이다');
  return { name: head[1], version: head[2], sourceCommit: commit[1] };
}

// 지금 배포되는 상태. --refresh는 이 값을 그대로 integrity.json에 적는다.
function shippedState() {
  if (!existsSync(BUNDLE_PATH)) abort('interactive/server/server.bundle.cjs가 없다');
  const bytes = readFileSync(BUNDLE_PATH);
  const { name, version, sourceCommit } = readVersionFile();
  return {
    name,
    version,
    sourceCommit,
    file: 'interactive/server/server.bundle.cjs',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  };
}

const state = shippedState();
const shortHash = `${state.sha256.slice(0, 12)}…`;

if (process.argv.includes('--refresh')) {
  writeFileSync(PIN_PATH, `${JSON.stringify(state, null, 2)}\n`);
  console.log(`[verify-engine] pinned ${state.name}@${state.version} (${shortHash}, ${state.bytes} bytes)`);
  process.exit(0);
}

if (!existsSync(PIN_PATH)) {
  abort('interactive/server/integrity.json이 없다 — node interactive/server/verify-engine.mjs --refresh 로 세운다');
}

const pinned = JSON.parse(readFileSync(PIN_PATH, 'utf8'));
const drifted = COMPARED.filter((key) => String(pinned[key]) !== String(state[key]));
if (drifted.length > 0) {
  abort(
    `핀과 실물이 어긋난다 (${drifted.length}곳)\n` +
      drifted.map((key) => `  ${key}: integrity.json "${pinned[key]}" ↔ 배포 번들 "${state[key]}"`).join('\n') +
      '\n  의도한 엔진 교체였다면 --refresh 로 다시 핀을 세운다.',
  );
}

console.log(`[verify-engine] OK: ${state.name}@${state.version} (${shortHash})`);
