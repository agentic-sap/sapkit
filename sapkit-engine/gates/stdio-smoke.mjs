/**
 * 기동 스모크 — 빌드된 엔진이 **진짜로 뜨고 대답하는가.**
 *
 * 시험은 전부 같은 프로세스 안에서 전송을 주입해 돈다. 그건 로직이 맞다는
 * 증거이지 **실려 나가는 물건이 기동한다**는 증거가 아니다. 여기서는 산출물을
 * 자식 프로세스로 띄우고 stdio로 실제 MCP 왕복을 한 번 한다.
 *
 * SAP에 접속하지 않는다 — 프로파일을 주지 않으므로 inspection-only로 뜬다.
 * 자식 프로세스를 쓰므로 jest 안에서 돌리지 않는다(이 머신의 수거 함정).
 * PowerShell로 실행할 것.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { requireDist } from './lib.mjs';

const ENTRY = fileURLToPath(new URL('../dist/src/server/entry.js', import.meta.url));

/**
 * 기대 집합은 **세지 않고 계산한다.**
 *
 * 전에는 `7종`이 상수로 박혀 있었다. 도구를 하나 지을 때마다 이 수가 틀려져
 * 스모크가 빨개지고, 그때마다 사람이 상수를 고치게 된다 — 그 습관이 붙으면
 * 스모크는 노출 제어를 지키는 게 아니라 지금 상태를 추인하는 장치가 된다.
 * 그래서 표면 게이트 ⓑ와 **같은 규칙**으로 계산한다:
 * 채록본의 「무프로파일 + readonly」 이름 집합 ∩ 등록점.
 */
function expectedNames() {
  const captured = JSON.parse(
    fs.readFileSync(fileURLToPath(new URL('../harness/old-surface/m1-tools.json', import.meta.url)), 'utf8'),
  );
  const names = captured?.exposures?.noProfile_readonly?.names;
  if (!Array.isArray(names) || names.length === 0) {
    console.error('[smoke] 채록본에 무프로파일·readonly 이름 집합이 없다 — 기대를 계산할 수 없다.');
    process.exit(2);
  }
  const { TOOL_REGISTRY } = requireDist('src/tools/registry.js');
  const registered = new Set(TOOL_REGISTRY.map((tool) => tool.definition.name));
  return names.filter((name) => registered.has(name)).sort();
}

if (!fs.existsSync(ENTRY)) {
  console.error(`[smoke] 빌드 산출물이 없다: ${ENTRY}\n        \`npm run build\`를 먼저 돌려라.`);
  process.exit(2);
}

const env = { ...process.env };
for (const k of Object.keys(env)) {
  if (k.startsWith('SAP_') || k.startsWith('MCP_')) delete env[k];
}

const child = spawn(process.execPath, [ENTRY, '--exposition=readonly'], {
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
  console.error(`❌ 기동 스모크 실패 — ${why}`);
  if (stderr.length > 0) console.error(`   stderr: ${stderr.join('').trim().slice(0, 400)}`);
  child.kill();
  process.exit(1);
};

const timer = setTimeout(() => fail('시간 안에 tools/list 응답이 오지 않았다'), 30000);

child.on('error', (e) => fail(`자식 프로세스를 띄우지 못했다: ${e.message}`));
child.on('exit', (code) => {
  if (!done) fail(`핸드셰이크 전에 종료했다 (exit ${code})`);
});

let done = false;
const send = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);

send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'stdio-smoke', version: '0.0.0' },
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

  const problems = [];
  if (!init?.result?.serverInfo?.name) problems.push('initialize 응답에 serverInfo가 없다');
  const tools = listed?.result?.tools;
  if (!Array.isArray(tools)) problems.push('tools/list 응답이 배열이 아니다');
  else {
    // 노출 제어가 **실제 기동에서도** 도는지. 수가 아니라 이름으로 본다 —
    // 수만 맞고 이름이 뒤바뀐 경우를 놓치지 않기 위해서다.
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
    console.error(`❌ 기동 스모크 실패 — ${problems.join(' · ')}`);
    if (stderr.length > 0) console.error(`   stderr: ${stderr.join('').trim().slice(0, 400)}`);
    process.exit(1);
  }

  console.log(
    `✅ 기동 스모크 통과 — ${init.result.serverInfo.name}@${init.result.serverInfo.version} · ` +
      `stdio 왕복 성사 · 무프로파일 readonly에서 ${tools.length}종 노출 · SAP 무접속`,
  );
  process.exit(0);
}, 100);
