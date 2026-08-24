/**
 * 재생 러너의 keyring 배선 음성시험 — **접속 없이 잴 수 있는 데까지.**
 *
 * D-122 ⑤가 등재한 결함은 「`replay-attended.mjs`에 `node-path`/`NODE_PATH`가
 * 0건이라, `SAP_PASSWORD`가 `keychain:` 참조인 프로파일은 재생이 도달해도 인증
 * 오류로 무너진다」였다. 그 판이 **고치지 않은 이유가 「고쳤는지 확인할 수단이
 * 없다」**였으므로(D-122 ⓒ), 수리에는 확인 수단이 딸려야 한다. 이 파일이 그것이다.
 *
 * 재는 것은 넷이다.
 *   ① 인자 없이 띄우면 **기본 keyring 경로를 물고** 그 사실을 화면에 적는다
 *   ② `--node-path=<경로>`가 그 기본을 덮는다
 *   ③ 러너가 쓰는 두 걸음(`process.env.NODE_PATH` + `Module._initPaths()`)이
 *      **실제로 해석 경로를 바꾼다** — 그리고 `NODE_PATH`만으로는 안 바뀐다
 *      (자기 판별: 두 번째가 없으면 이 시험이 아무것도 재지 않는 것이 된다)
 *   ④ 녹화와 재생이 **같은 기본 경로**를 문다 — 짝이 갈리면 결함이 되돌아온다
 *
 * ⚠ **여기서 재지 못하는 것**: 「keychain 참조 프로파일로 실제 인증이 선다」는
 * SAP 접속이 필요하고 이 시험 밖이다. 이 시험이 세우는 것은 **배선이 있고 그
 * 배선이 모듈 해석에 먹는다**까지다. 그 둘을 같은 것으로 읽지 말 것.
 *
 * 자식 프로세스를 쓰므로 jest 안에서 돌리지 않고 `gates/run-all.mjs`에도 넣지
 * 않는다(이 머신의 수거 함정 — `keyring-fallback-smoke.mjs`와 같은 이유).
 * **PowerShell로 실행할 것.**
 *
 *   node gates/test-replay-keyring.mjs
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanupTempDirs, createReport, tempDir } from './lib.mjs';

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const REPLAY = here('../harness/replay-attended.mjs');
const RECORD = here('../harness/record-attended.mjs');
const KEYRING = path.resolve(here('../../interactive/server/runtime-deps/keyring/node_modules'));

/** 러너가 keyring 경로를 물었을 때 내는 줄. 문구가 바뀌면 이 시험이 먼저 빨개진다. */
const WIRED = 'keyring 해석 경로 — NODE_PATH=';

/**
 * 러너를 띄운다. `--env-path`를 주지 않으므로 **SAP에 붙기 전에 죽는다** —
 * keyring 배선은 그보다 앞에서 도므로 화면에 남는다. 그것이 이 시험이 접속 없이
 * 배선을 관찰할 수 있는 이유다.
 */
function runReplay(args) {
  const result = spawnSync(process.execPath, [REPLAY, ...args], { encoding: 'utf8', timeout: 60000 });
  return { out: `${result.stdout ?? ''}${result.stderr ?? ''}`, status: result.status };
}

const report = createReport('재생 러너 keyring 배선');

try {
  // ── ① 기본 ────────────────────────────────────────────────────────────────
  const bare = runReplay([]);
  report.check(
    '① 인자 없이도 keyring 경로를 물고 그 사실을 적는다',
    bare.out.includes(WIRED),
    bare.out.includes(WIRED)
      ? (bare.out.split('\n').find((l) => l.includes(WIRED)) ?? '').trim()
      : `그 줄이 없다 · 출력=${bare.out.trim().slice(0, 200) || '(비어 있음)'}`,
  );
  report.check(
    '① 그 기본이 레포의 runtime-deps 다',
    bare.out.includes(`${WIRED}${KEYRING}`),
    `기대 ${KEYRING}`,
  );
  report.check(
    '① 배선은 --env-path 검사보다 **앞에서** 돈다 (접속 전에 이미 물렸다)',
    bare.out.includes(WIRED) && bare.out.includes('--env-path 가 없다'),
    `exit ${bare.status}`,
  );

  // ── ② 덮어쓰기 ────────────────────────────────────────────────────────────
  const custom = tempDir('sapkit-replay-nodepath-');
  const overridden = runReplay([`--node-path=${custom}`]);
  report.check(
    '② --node-path 가 기본을 덮는다',
    overridden.out.includes(`${WIRED}${custom}`),
    overridden.out.includes(`${WIRED}${custom}`)
      ? custom
      : `덮이지 않았다 · 출력=${overridden.out.trim().slice(0, 200)}`,
  );
  report.check(
    '② 덮었으면 기본 경로는 물지 않는다',
    !overridden.out.includes(`${WIRED}${KEYRING}`),
    '두 경로가 동시에 물리면 어느 쪽이 먹는지 알 수 없다',
  );

  // ── ③ 두 걸음이 정말 해석을 바꾸는가 ──────────────────────────────────────
  // 러너가 쓰는 것과 **같은 두 줄**을 임시 트리에 대고 세운다. `@napi-rs/keyring`
  // 자체를 쓰지 않는 이유는, 이 머신의 `sapkit-engine/node_modules`에 그 모듈이
  // 이미 있어(optional 설치 성공) 일반 해석이 먼저 이기기 때문이다 — 그러면
  // NODE_PATH가 먹었는지 안 먹었는지 구별되지 않는다. 아무 데도 없는 이름을
  // 써야 두 걸음의 효과가 홀로 드러난다.
  const probeRoot = tempDir('sapkit-nodepath-probe-');
  const modDir = path.join(probeRoot, 'mods', '@sapkit-test', 'nodepath-probe');
  fs.mkdirSync(modDir, { recursive: true });
  fs.writeFileSync(
    path.join(modDir, 'package.json'),
    '{"name":"@sapkit-test/nodepath-probe","version":"0.0.0","main":"index.js"}\n',
    'utf8',
  );
  fs.writeFileSync(path.join(modDir, 'index.js'), "module.exports = { wired: true };\n", 'utf8');

  const probe = path.join(probeRoot, 'probe.mjs');
  fs.writeFileSync(
    probe,
    `import Module, { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const NAME = '@sapkit-test/nodepath-probe';
const dir = process.argv[2];
const step = process.argv[3];
const tryLoad = () => { try { return require(NAME).wired === true ? 'resolved' : 'odd'; } catch (e) { return e.code ?? 'threw'; } };
const before = tryLoad();
process.env.NODE_PATH = dir;
if (step === 'both') Module._initPaths();
process.stdout.write(JSON.stringify({ before, after: tryLoad() }) + '\\n');
`,
    'utf8',
  );

  const readProbe = (step) => {
    const r = spawnSync(process.execPath, [probe, path.join(probeRoot, 'mods'), step], {
      encoding: 'utf8',
      timeout: 60000,
    });
    try {
      return JSON.parse((r.stdout ?? '').trim());
    } catch {
      return null;
    }
  };

  const both = readProbe('both');
  report.check(
    '③ NODE_PATH + _initPaths() 를 거치면 없던 모듈이 해석된다',
    both?.before === 'MODULE_NOT_FOUND' && both?.after === 'resolved',
    `before=${both?.before ?? '(판정 없음)'} · after=${both?.after ?? '(판정 없음)'}`,
  );

  const envOnly = readProbe('env-only');
  report.check(
    "③' 자기 판별 — NODE_PATH만 넣으면 아무 일도 일어나지 않는다",
    envOnly?.before === 'MODULE_NOT_FOUND' && envOnly?.after === 'MODULE_NOT_FOUND',
    envOnly?.after === 'MODULE_NOT_FOUND'
      ? '두 번째 걸음이 없으면 해석은 그대로다 — ③의 초록이 _initPaths() 덕이라는 인과가 선다'
      : `after=${envOnly?.after ?? '(판정 없음)'} — 인과를 세우지 못했다`,
  );

  // ── ④ 짝 대조 ─────────────────────────────────────────────────────────────
  const defaultOf = (file) =>
    /KEYRING_NODE_PATH\s*=\s*here\((['"])([^'"]+)\1\)/.exec(fs.readFileSync(file, 'utf8'))?.[2] ?? null;
  const replayDefault = defaultOf(REPLAY);
  const recordDefault = defaultOf(RECORD);
  report.check(
    '④ 녹화와 재생이 같은 기본 keyring 경로를 문다',
    replayDefault !== null && replayDefault === recordDefault,
    `재생=${replayDefault ?? '(못 읽음)'} · 녹화=${recordDefault ?? '(못 읽음)'}`,
  );
} catch (error) {
  report.check('음성시험 실행', false, error?.message ?? String(error));
} finally {
  cleanupTempDirs();
}

const green = report.print();
if (green) {
  console.log('   ⚠ 이 초록은 「배선이 있고 모듈 해석에 먹는다」까지다 — keychain 참조로 실제 인증이 서는지는 SAP 접속이 필요하다.');
}
process.exit(green ? 0 : 1);
