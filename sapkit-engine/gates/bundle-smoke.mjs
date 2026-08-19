/**
 * 번들 스모크 — **실려 나가는 파일 하나**가 뜨고, 소스와 같은 표면을 내는가.
 *
 * `stdio-smoke.mjs`는 `dist/src/server/entry.js`(tsc 산출물 + `node_modules`)를
 * 띄운다. 제품에 실리는 것은 그것이 아니라 `dist/server.bundle.cjs` **한 파일**이다
 * (`tools/bundle.mjs`). 번들링은 모듈 해석 방식을 통째로 바꾸므로, 소스가 뜬다는
 * 사실이 번들도 뜬다는 뜻은 아니다 — 그 간격을 이 게이트가 메운다.
 *
 * 네 가지를 본다:
 *   ① 번들이 자식 프로세스로 뜨고 stdio MCP 왕복이 성사된다
 *   ② `serverInfo.version`이 `package.json`과 같다 — 빌드 스탬프
 *      (`__SAPKIT_ENGINE_VERSION__`)가 실제로 박혔다는 뜻이다.
 *
 *      **그래서 번들을 임시 디렉터리로 복사해 거기서 띄운다.** `dist/`에 둔 채
 *      띄우면 스탬프가 빠져도 `readEngineVersion()`의 폴백이 위로 훑다가
 *      `sapkit-engine/package.json`을 만나 같은 값을 돌려준다 — 단언이 공허해진다
 *      (사보타주로 실측: define을 지우고 빌드해도 통과했다). 제품에서 번들은
 *      `interactive/server/` 아래에 홀로 놓이고 그 위 어디에도 `sapkit-engine`
 *      package.json이 없으므로 폴백은 **0.0.0**을 낸다. 임시 디렉터리가 그 상황이다.
 *   ③ 무프로파일·readonly 노출 이름 집합이 `stdio-smoke`와 **같은 규칙**으로
 *      계산한 기대와 일치한다 — 번들러가 도구를 떨어뜨리지 않았다는 뜻이다.
 *   ④ external 2종(`node-rfc` · `@napi-rs/keyring`)이 번들 안에 인라인되지
 *      **않았다**. 둘 다 네이티브·선택 의존이라 인라인되면 없는 호스트에서 기동이
 *      통째로 죽는다. `require` 호출이 그대로 남아 있는지로 확인한다.
 *
 * SAP에 접속하지 않는다 — 프로파일을 주지 않으므로 inspection-only로 뜬다.
 * 자식 프로세스를 쓰므로 jest 안에서 돌리지 않는다(이 머신의 수거 함정).
 * PowerShell로 실행할 것.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanupTempDirs, requireDist, tempDir } from './lib.mjs';

const BUNDLE = fileURLToPath(new URL('../dist/server.bundle.cjs', import.meta.url));
const PKG = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));

/** `stdio-smoke.mjs`와 같은 규칙: 채록본의 「무프로파일 + readonly」 ∩ 등록점. */
function expectedNames() {
  const captured = JSON.parse(
    fs.readFileSync(fileURLToPath(new URL('../harness/old-surface/m1-tools.json', import.meta.url)), 'utf8'),
  );
  const names = captured?.exposures?.noProfile_readonly?.names;
  if (!Array.isArray(names) || names.length === 0) {
    console.error('[bundle-smoke] 채록본에 무프로파일·readonly 이름 집합이 없다 — 기대를 계산할 수 없다.');
    process.exit(2);
  }
  const { TOOL_REGISTRY } = requireDist('src/tools/registry.js');
  const registered = new Set(TOOL_REGISTRY.map((tool) => tool.definition.name));
  return names.filter((name) => registered.has(name)).sort();
}

if (!fs.existsSync(BUNDLE)) {
  console.error(
    `[bundle-smoke] 번들이 없다: ${BUNDLE}\n` +
      '        `npm run build:bundle`(= build && bundle)을 먼저 돌려라. `npm run bundle` 단독은\n' +
      '        tsc 산출물을 엔트리로 삼으므로 소스 변경을 반영하지 않는다.',
  );
  process.exit(2);
}

// ④ external 잔존 — 텍스트로 본다. 인라인됐다면 이 호출은 사라지고 모듈 본문이
//    번들 안에 들어와 있다.
const text = fs.readFileSync(BUNDLE, 'utf8');
const externalProblems = [];
for (const mod of ['node-rfc', '@napi-rs/keyring']) {
  if (!text.includes(`require("${mod}")`)) {
    externalProblems.push(`${mod}의 require 호출이 번들에 없다 — 인라인됐거나 호출점이 사라졌다`);
  }
}

const env = { ...process.env };
for (const k of Object.keys(env)) {
  if (k.startsWith('SAP_') || k.startsWith('MCP_')) delete env[k];
}

// 제품 배치 재현 — 번들 한 파일만 남의 트리에 놓는다. cwd도 그쪽으로 옮겨
// 레포의 런타임 디렉터리가 우연히 잡히지 않게 한다.
const stage = tempDir('sapkit-bundle-smoke-');
const staged = path.join(stage, 'server.bundle.cjs');
fs.copyFileSync(BUNDLE, staged);

const child = spawn(process.execPath, [staged, '--exposition=readonly'], {
  cwd: stage,
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
});

const stderr = [];
child.stderr.on('data', (d) => stderr.push(d.toString()));

const messages = [];
let buf = '';
child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      messages.push(JSON.parse(line));
    } catch {
      // 프로토콜이 아닌 잡음은 무시한다 — 진단은 stderr로 나가야 한다.
    }
  }
});

const fail = (why) => {
  console.error(`❌ 번들 스모크 실패 — ${why}`);
  if (stderr.length > 0) console.error(`   stderr: ${stderr.join('').trim().slice(0, 400)}`);
  child.kill();
  cleanupTempDirs();
  process.exit(1);
};

const timer = setTimeout(() => fail('시간 안에 tools/list 응답이 오지 않았다'), 30000);

child.on('error', (e) => fail(`자식 프로세스를 띄우지 못했다: ${e.message}`));
let done = false;
child.on('exit', (code) => {
  if (!done) fail(`핸드셰이크 전에 종료했다 (exit ${code})`);
});

const send = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);

send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'bundle-smoke', version: '0.0.0' },
  },
});

setTimeout(() => {
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
}, 1200);

const poll = setInterval(() => {
  const init = messages.find((m) => m.id === 1);
  const listed = messages.find((m) => m.id === 2);
  if (!listed) return;

  clearInterval(poll);
  clearTimeout(timer);
  done = true;

  const problems = [...externalProblems];
  const info = init?.result?.serverInfo;
  if (!info?.name) problems.push('initialize 응답에 serverInfo가 없다');
  else {
    if (info.name !== PKG.name) problems.push(`serverInfo.name=${info.name} ≠ package.json ${PKG.name}`);
    if (info.version !== PKG.version) {
      problems.push(
        `serverInfo.version=${info.version} ≠ package.json ${PKG.version} — ` +
          '빌드 스탬프(__SAPKIT_ENGINE_VERSION__)가 박히지 않았다',
      );
    }
  }

  const tools = listed?.result?.tools;
  if (!Array.isArray(tools)) problems.push('tools/list 응답이 배열이 아니다');
  else {
    const expected = expectedNames();
    const actual = tools.map((t) => t.name).sort();
    if (expected.length === 0) problems.push('기대 집합이 비었다 — 채록본이나 등록점이 이상하다');
    else if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      const missing = expected.filter((n) => !actual.includes(n));
      const extra = actual.filter((n) => !expected.includes(n));
      problems.push(
        `무프로파일·readonly 노출이 채록본∩등록점과 다르다 ` +
          `(기대 ${expected.length}종 · 실제 ${actual.length}종` +
          `${missing.length > 0 ? ` · 빠짐 [${missing.join(', ')}]` : ''}` +
          `${extra.length > 0 ? ` · 여분 [${extra.join(', ')}]` : ''})`,
      );
    }
  }

  child.kill();

  if (problems.length > 0) {
    console.error(`❌ 번들 스모크 실패 — ${problems.join(' · ')}`);
    if (stderr.length > 0) console.error(`   stderr: ${stderr.join('').trim().slice(0, 400)}`);
    cleanupTempDirs();
    process.exit(1);
  }

  console.log(
    `✅ 번들 스모크 통과 — ${info.name}@${info.version}(스탬프 일치) · 단일 파일 ` +
      `${(fs.statSync(BUNDLE).size / 1048576).toFixed(2)}MB · stdio 왕복 성사 · ` +
      `무프로파일 readonly에서 ${tools.length}종 노출 · external 2종 잔존 · SAP 무접속`,
  );
  cleanupTempDirs();
  process.exit(0);
}, 100);
