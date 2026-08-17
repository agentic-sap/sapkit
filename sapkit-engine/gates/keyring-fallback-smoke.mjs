/**
 * 키체인 폴백 스모크 — **네이티브 키체인 모듈이 없을 때 정말 강등되는가.**
 *
 * `src/profile/secrets.ts`의 `nativeReader()`는 `require('@napi-rs/keyring')`을
 * try/catch로 감싸 실패하면 `null`을 돌려주고, 그 `null`이 `KEYCHAIN_UNAVAILABLE`이
 * 되어 **접속을 만들지 않는다**. 설계는 fail-closed로 옳다. 그런데 기존 시험은
 * 전부 `reader`를 주입해 그 갈래를 흉내 낸 것이라 **실제 `require`가 실패하는
 * 경로는 한 번도 실행된 적이 없었다** — 모듈 이름 오타 하나, 번들러의 정적 해석
 * 하나면 조용히 다른 곳에서 터지고, 주입 시험은 그걸 못 본다.
 *
 * 여기서 재는 것은 둘이다.
 *   ① 모듈을 부를 수 없는 환경에서 `resolveSecret`이 **주입 없이** 실제
 *      `nativeReader()`를 타고 `KEYCHAIN_UNAVAILABLE`로 끝나는가.
 *   ② `keychain:` 참조 프로파일로 **빌드 산출물을 자식 프로세스로 띄우면**
 *      크래시 없이 inspection-only로 강등되고, 접속이 필요한 도구 호출이
 *      `ERR_NO_CONNECTION`으로 정직하게 끝나는가(= 참조 문자열이 비밀번호
 *      자리에 실려 나가 실패 로그온을 쌓는 갈래가 없다).
 *
 * ── 왜 `npm ci --omit=optional`이 아니라 차단인가 ──────────────────────────
 * production 코드가 이 모듈과 닿는 자리는 `require('@napi-rs/keyring')` **한
 * 곳뿐**이다. optional을 뺀 트리에서 그 자리에 일어나는 일은 `MODULE_NOT_FOUND`
 * 하나이고, 이 스모크는 `Module._load`를 그 이름에 대해서만 가로채 **같은 오류를
 * 같은 자리에 세운다** — 관측 가능한 차이가 없다.
 *
 * 게다가 차단 쪽이 **증거로는 더 강하다**: 가로채기가 걸렸다는 사실을
 * `[keyring-block]` 마커로 남기므로 「require가 실제로 시도됐다」가 증명된다.
 * 모듈이 없는 트리는 그걸 증명하지 못한다 — 코드가 require를 아예 부르지 않아도
 * 똑같이 초록이기 때문이다. 그게 정확히 이 스모크가 메우려는 공백이다.
 * 비용도 설치 0 · 빌드 0 · 자식 프로세스 3개라 상시로 돌릴 수 있다.
 *
 * production 코드는 건드리지 않는다 — 이 파일은 관측만 한다.
 * 자식 프로세스를 쓰므로 jest 안에서 돌리지 않고 `gates/run-all.mjs`에도 넣지
 * 않는다(이 머신의 수거 함정 — `stdio-smoke.mjs`와 같은 이유). PowerShell로
 * 실행할 것.
 */
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanupTempDirs, createReport, exposedNames, tempDir } from './lib.mjs';

const ENTRY = fileURLToPath(new URL('../dist/src/server/entry.js', import.meta.url));
const SECRETS = fileURLToPath(new URL('../dist/src/profile/secrets.js', import.meta.url));
const MODULE_ID = '@napi-rs/keyring';
const MARKER = '[keyring-block]';

/**
 * `nativeReader()`가 null을 돌려준 갈래에서만 나오는 문구.
 *
 * 같은 `KEYCHAIN_UNAVAILABLE` 코드가 **조회 자체가 실패한** 갈래에서도 나오므로
 * (`secrets.ts`의 두 번째 throw) 코드만으로는 둘을 못 가른다. 판별은 문구로
 * 한다 — 이 스모크가 재려는 것은 "모듈을 못 불렀다" 쪽 하나다.
 */
const NATIVE_MISSING = `${MODULE_ID} 을 불러오지 못했다`;
const READER_FAILED = '키체인 조회가 실패했다';

/** 어느 OS 키체인에도 항목이 없는 참조. 대조군이 실 키체인을 읽어도 실패뿐이다. */
const SERVICE = 'sapkit-keyring-fallback-smoke';
const ACCOUNT = `no-such-account-${Math.random().toString(16).slice(2, 10)}`;
const KEYCHAIN_REF = `keychain:${SERVICE}/${ACCOUNT}`;

/** 접속이 필요한 읽기 도구 하나 — 인자가 없고 readonly 표면에 있다. */
const CONNECTED_TOOL = 'GetSystemInfo';

for (const [label, file] of [
  ['서버 엔트리', ENTRY],
  ['secrets 모듈', SECRETS],
]) {
  if (!fs.existsSync(file)) {
    console.error(
      `[keyring-smoke] 빌드 산출물이 없다 (${label}): ${file}\n` +
        '           `npm run build`를 먼저 돌려라. 스모크는 소스가 아니라 산출물을 검사한다.',
    );
    process.exit(2);
  }
}

// ── 자식 프로세스 재료 ───────────────────────────────────────────────────────

const dir = tempDir('sapkit-keyring-gate-');
const homeDir = tempDir('sapkit-keyring-home-');
const BLOCK = path.join(dir, 'block.cjs');
const PROBE = path.join(dir, 'probe.cjs');
const BOOT = path.join(dir, 'boot.cjs');
const ENV_FILE = path.join(dir, 'sap.env');

// 모듈 해석의 **그 자리**를 막는다. `--omit=optional` 트리가 만드는 것과 같은
// 오류(`MODULE_NOT_FOUND`)를 같은 지점에 세우고, 걸렸다는 사실을 stderr에 남긴다
// — stdout은 MCP 프로토콜 채널이라 진단을 실을 수 없다.
fs.writeFileSync(
  BLOCK,
  `'use strict';
const Module = require('node:module');
const TARGET = ${JSON.stringify(MODULE_ID)};
const original = Module._load;
Module._load = function (request, ...rest) {
  if (request === TARGET || request.startsWith(TARGET + '/')) {
    process.stderr.write(${JSON.stringify(MARKER)} + " blocked require('" + request + "')\\n");
    const err = new Error("Cannot find module '" + request + "'");
    err.code = 'MODULE_NOT_FOUND';
    throw err;
  }
  return original.call(this, request, ...rest);
};
`,
  'utf8',
);

// 주입 없이 `resolveSecret`을 부른다 — 옵션을 주는 순간 재려던 갈래가 사라진다.
// 돌아온 값은 **길이만** 보고한다(비밀은 출력하지 않는다).
fs.writeFileSync(
  PROBE,
  `'use strict';
if (process.env.KEYRING_BLOCK === '1') require(${JSON.stringify(BLOCK)});
const { resolveSecret } = require(process.env.SECRETS_PATH);
let out;
try {
  const value = resolveSecret(process.env.KEYCHAIN_REF);
  out = { threw: false, returnedLength: String(value).length };
} catch (err) {
  out = { threw: true, name: err && err.name, code: err && err.code, message: String(err && err.message) };
}
process.stdout.write(JSON.stringify(out) + '\\n');
`,
  'utf8',
);

// 셰임(`interactive/server/launch.cjs`)이 하는 그대로 — argv를 손질한 뒤 같은
// 프로세스에서 엔트리를 require한다. 엔트리는 최상위에서 스스로 뜬다.
fs.writeFileSync(
  BOOT,
  `'use strict';
require(${JSON.stringify(BLOCK)});
require(${JSON.stringify(ENTRY)});
`,
  'utf8',
);

/**
 * 프로파일이 가리키는 주소를 **세는 주소**로 만든다.
 *
 * 죽은 포트를 적어 두고 "전송 오류 문자열이 안 보이니 안 나갔다"로 판정하면
 * 안 된다 — 도구 핸들러가 전송 실패를 곱게 접어 "지원하지 않는다"로 답하는
 * 갈래가 있어서, 실제로 나갔는데도 그 문자열이 안 보인다(변이 시험 실측).
 * 그래서 루프백에 리스너를 세우고 **들어온 접속을 센다**. 0건이 판정이다.
 */
let inbound = 0;
const listener = net.createServer((socket) => {
  inbound += 1;
  socket.destroy();
});
await new Promise((resolve, reject) => {
  listener.once('error', reject);
  listener.listen(0, '127.0.0.1', resolve);
});
const sapPort = listener.address().port;

// 키체인 참조 비밀번호. `SAP_TIER=DEV`를 일부러 적어 둔다 — 접속이 서지 않으면
// tier도 함께 UNKNOWN으로 떨어지는지 보기 위해서다.
fs.writeFileSync(
  ENV_FILE,
  [
    `SAP_URL=http://127.0.0.1:${sapPort}`,
    'SAP_CLIENT=100',
    'SAP_USERNAME=keyring-fallback-smoke',
    `SAP_PASSWORD=${KEYCHAIN_REF}`,
    'SAP_TIER=DEV',
    '',
  ].join('\n'),
  'utf8',
);

/** 상속 env에서 이 서버가 읽는 변수를 지운다 — 머신 상태가 판정에 새지 않게. */
function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('SAP_') || key.startsWith('MCP_') || key.startsWith('SAPKIT_')) delete env[key];
  }
  return env;
}

// ── ① 주입 없는 해석 ────────────────────────────────────────────────────────

function runProbe({ blocked }) {
  const result = spawnSync(process.execPath, [PROBE], {
    env: {
      ...cleanEnv(),
      SECRETS_PATH: SECRETS,
      KEYCHAIN_REF,
      ...(blocked ? { KEYRING_BLOCK: '1' } : {}),
    },
    encoding: 'utf8',
    timeout: 30000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  let parsed = null;
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // 프로토콜이 아닌 잡음은 무시한다.
    }
  }
  return { parsed, stdout, stderr, status: result.status };
}

// ── ② 실기동 강등 ───────────────────────────────────────────────────────────

function bootServer() {
  const child = spawn(process.execPath, [BOOT, '--exposition=readonly'], {
    env: { ...cleanEnv(), MCP_ENV_PATH: ENV_FILE, HOME: homeDir, USERPROFILE: homeDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const stderrChunks = [];
  child.stderr.on('data', (d) => stderrChunks.push(d.toString()));

  const pending = new Map();
  let exited = null;
  const settleAll = (error) => {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      pending.delete(id);
      entry.reject(error);
    }
  };
  child.on('exit', (code) => {
    exited = code;
    settleAll(new Error(`서버가 응답 전에 종료했다 (exit ${code})`));
  });
  child.on('error', (err) => settleAll(new Error(`자식 프로세스를 띄우지 못했다: ${err.message}`)));

  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // 프로토콜이 아닌 잡음. 진단은 stderr로 나가야 한다.
      }
      const entry = msg.id === undefined ? undefined : pending.get(msg.id);
      if (!entry) continue;
      clearTimeout(entry.timer);
      pending.delete(msg.id);
      entry.resolve(msg);
    }
  });

  let nextId = 0;
  return {
    child,
    get exited() {
      return exited;
    },
    stderr: () => stderrChunks.join(''),
    request(method, params) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} 응답이 20초 안에 오지 않았다`));
        }, 20000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    },
    notify(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    },
  };
}

// ── 판정 ────────────────────────────────────────────────────────────────────

const report = createReport('키체인 폴백 스모크');
let server = null;

try {
  // ① 차단된 트리 — 주입 없이 실제 `nativeReader()`를 탄다.
  const blocked = runProbe({ blocked: true });
  const b = blocked.parsed;
  report.check(
    `① 차단 트리에서 require('${MODULE_ID}')가 실제로 시도됐다`,
    blocked.stderr.includes(MARKER),
    blocked.stderr.includes(MARKER)
      ? '가로채기 마커 관측 — 주입이 아니라 실 해석 경로다'
      : `마커 없음 · stderr=${blocked.stderr.trim().slice(0, 200) || '(비어 있음)'}`,
  );
  report.check(
    '① nativeReader()가 null로 떨어져 KEYCHAIN_UNAVAILABLE이 된다',
    b?.threw === true && b?.name === 'SecretResolutionError' && b?.code === 'KEYCHAIN_UNAVAILABLE',
    b === null
      ? `판정을 읽지 못했다 (exit ${blocked.status}) · stderr=${blocked.stderr.trim().slice(0, 200)}`
      : `threw=${b.threw} name=${b.name} code=${b.code}`,
  );
  report.check(
    '① 그 실패가 "모듈을 못 불렀다" 갈래다 (조회 실패 갈래가 아니다)',
    typeof b?.message === 'string' &&
      b.message.includes(NATIVE_MISSING) &&
      !b.message.includes(READER_FAILED),
    (b?.message ?? '(없음)').slice(0, 160),
  );
  report.check(
    '① 참조 문자열이 비밀번호로 되돌아오는 갈래가 없다',
    b?.threw === true && b?.returnedLength === undefined,
    b?.threw === true ? '값을 돌려주지 않고 던졌다' : '값을 돌려줬다 — fail-closed가 깨졌다',
  );

  // ①' 자기 판별 — 차단이 없으면 같은 호출이 **다른** 판정으로 끝나야 한다.
  //     그래야 위 초록이 차단 때문이라는 인과가 선다.
  //
  //     대조군은 세 갈래로 끝난다. **앞의 둘은 실패가 아니다** — 대조군이 성립하지
  //     않는 환경이 있을 뿐이고, 그때 인과는 위의 가로채기 마커가 대신 증명한다.
  //     여기서 빨개지면 「키체인이 없는 러너」가 곧 빨간 CI가 되어, 정작 재려던
  //     성질과 무관한 이유로 이 스모크가 무시당한다.
  const control = runProbe({ blocked: false });
  const c = control.parsed;
  const controlMessage = typeof c?.message === 'string' ? c.message : null;
  if (c === null) {
    console.log(
      `  ⏭ 자기 판별 — 대조군이 판정을 내지 못했다 (exit ${control.status}) · 대조군 성립 불가 · ` +
        '인과는 가로채기 마커로 대신한다',
    );
  } else if (controlMessage !== null && controlMessage.includes(NATIVE_MISSING)) {
    // 이 트리에는 키체인 모듈이 아예 없다(= optional을 뺀 설치, 또는 미지원 플랫폼).
    console.log(
      `  ⏭ 자기 판별 — 이 트리에서는 ${MODULE_ID}를 부를 수 없어 대조군이 성립하지 않는다 ` +
        '(차단 없이도 같은 판정) · 인과는 가로채기 마커로 대신한다',
    );
  } else {
    // 대조군이 **다른** 판정으로 끝났다. 남은 확인은 하나 — 그 대조군이 정말
    // 차단 없이 돌았는가(마커가 없어야 한다). 있으면 두 실행이 같은 조건이었다는
    // 뜻이고, 그러면 이 판별 자체가 무의미하다.
    report.check(
      "①' 자기 판별 — 차단이 없으면 같은 호출이 다른 판정으로 끝난다",
      !control.stderr.includes(MARKER),
      `대조군 code=${c.code ?? '(없음)'} · ${String(controlMessage ?? `값 반환(길이 ${c.returnedLength})`).slice(0, 110)}`,
    );
  }

  // ② `keychain:` 참조 프로파일로 산출물을 실제로 띄운다.
  server = bootServer();
  const init = await server.request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'keyring-fallback-smoke', version: '0.0.0' },
  });
  server.notify('notifications/initialized');
  const listed = await server.request('tools/list', {});
  const called = await server.request('tools/call', { name: CONNECTED_TOOL, arguments: {} });
  const stderr = server.stderr();

  report.check(
    '② 참조를 해석하지 못해도 서버는 뜨고 MCP에 답한다 (크래시 0)',
    Boolean(init?.result?.serverInfo?.name) && server.exited === null,
    init?.result?.serverInfo
      ? `${init.result.serverInfo.name}@${init.result.serverInfo.version} · 핸드셰이크 성사`
      : `initialize 응답에 serverInfo가 없다 (exit ${server.exited})`,
  );
  report.check(
    '② 기동 진단이 KEYCHAIN_UNAVAILABLE을 이름으로 남긴다',
    stderr.includes('KEYCHAIN_UNAVAILABLE') && stderr.includes(NATIVE_MISSING),
    stderr.includes('KEYCHAIN_UNAVAILABLE') ? '원인이 진단에 실렸다' : '진단에 원인이 없다',
  );
  report.check(
    '② 접속을 만들지 않고 tier까지 잠근다 (프로파일이 DEV라고 적어도)',
    stderr.includes('connection=none') && stderr.includes('tier=UNKNOWN'),
    (stderr.split('\n').find((l) => l.includes('[sapkit] profile:')) ?? '(요약 줄 없음)').trim().slice(0, 150),
  );

  // 강등의 실체 — 노출 집합이 **프로파일이 아예 없을 때와 같다**. 반쯤 선
  // 프로파일이 표면을 넓히는 갈래가 없다는 뜻이다.
  const expected = exposedNames({ exposition: 'readonly' }).names;
  const actual = Array.isArray(listed?.result?.tools)
    ? listed.result.tools.map((t) => t.name).sort()
    : null;
  report.check(
    '② 노출 표면이 무프로파일 inspection-only와 같다',
    actual !== null && expected.length > 0 && JSON.stringify(actual) === JSON.stringify(expected),
    actual === null
      ? 'tools/list 응답이 배열이 아니다'
      : `기대 ${expected.length}종 · 실제 ${actual.length}종`,
  );

  // 접속이 필요한 호출은 **정직하게 실패한다** — 참조 문자열을 비밀번호로 실어
  // 보내 실패 로그온을 쌓는 갈래가 없다.
  const callText = JSON.stringify(called ?? {});
  report.check(
    `② 접속이 필요한 호출(${CONNECTED_TOOL})이 ERR_NO_CONNECTION으로 끝난다`,
    callText.includes('ERR_NO_CONNECTION'),
    callText.slice(0, 160),
  );
  report.check(
    '② 프로파일 주소로 나간 접속이 0건이다 (실패 로그온이 쌓이지 않는다)',
    inbound === 0,
    inbound === 0
      ? `127.0.0.1:${sapPort} 인바운드 0건 — 접속을 만들지 않았으므로 나갈 것도 없었다`
      : `인바운드 ${inbound}건 — 해석하지 못한 참조로 로그온을 시도했다`,
  );
  report.check(
    '② 실패 응답이 원인을 그대로 전한다 (키체인 진단 동봉)',
    callText.includes('KEYCHAIN_UNAVAILABLE'),
    '호출 응답에서 원인 확인',
  );
} catch (error) {
  report.check('스모크 실행', false, error?.message ?? String(error));
} finally {
  if (server) {
    server.child.stdin.end();
    server.child.kill();
  }
  listener.close();
  cleanupTempDirs();
}

const green = report.print();
process.exit(green ? 0 : 1);
