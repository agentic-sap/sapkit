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

const ENTRY = fileURLToPath(new URL('../dist/src/server/entry.js', import.meta.url));

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
  // 무프로파일 + readonly = M1 ∩ 65 = 7종. 노출 제어가 실제 기동에서도 도는지.
  else if (tools.length !== 7) {
    problems.push(`무프로파일·readonly에서 7종이 떠야 하는데 ${tools.length}종이다`);
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
