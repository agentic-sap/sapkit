/**
 * HTTP 기동 스모크 — 빌드된 엔진이 **HTTP로도 뜨고 대답하는가.**
 *
 * `stdio-smoke.mjs`와 같은 결이다. 다른 시험은 같은 프로세스 안에서 전송을 주입해
 * 돌지만, 그건 로직이 맞다는 증거이지 **실려 나가는 물건이 기동한다**는 증거가
 * 아니다. 여기서는 산출물을 자식 프로세스로 띄우고 실제 소켓으로 MCP 왕복을 한다.
 *
 * 한 가지를 더 본다 — **전송이 달라져도 노출 집합이 같은가.** 같은 argv·env로
 * stdio 자식과 HTTP 자식을 각각 띄워 `tools/list` 이름 집합을 대조한다. 전송을
 * 하나 더 붙일 때 표면이 조용히 갈라지는 것을 여기서 잡는다.
 *
 * SAP에 접속하지 않는다 — 프로파일을 주지 않으므로 inspection-only로 뜨고,
 * 바인딩은 루프백의 임시 포트다. 자식 프로세스를 쓰므로 **PowerShell로 실행할 것**
 * (이 머신에서 Bash로 돌리면 수거에서 블록된 실측 기록이 있다).
 *
 *   node gates/http-smoke.mjs      # 단독 실행
 *   node gates/run-all.mjs         # 다른 게이트와 함께
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createReport } from './lib.mjs';

const ENTRY = fileURLToPath(new URL('../dist/src/server/entry.js', import.meta.url));
const EXPOSITION = '--exposition=readonly';
const TIMEOUT_MS = 30000;

/** 프로파일·안전 노브가 새어 들어오지 않은 환경. */
function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k.startsWith('SAP_') || k.startsWith('MCP_')) delete env[k];
  }
  return env;
}

/** 커널에게 비어 있는 포트 하나를 받아 곧바로 돌려준다. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function deadline(promise, why) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(why)), TIMEOUT_MS);
    }),
  ]);
}

// ── stdio 쪽 (대조군) ───────────────────────────────────────────────────────

function listOverStdio() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, EXPOSITION], {
      env: cleanEnv(),
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

    const send = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);
    child.on('error', (e) => reject(new Error(`stdio 자식을 띄우지 못했다: ${e.message}`)));

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'http-smoke', version: '0.0.0' },
      },
    });
    setTimeout(() => {
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    }, 800);

    const poll = setInterval(() => {
      const listed = messages.find((m) => m.id === 2);
      if (!listed) return;
      clearInterval(poll);
      child.kill();
      const tools = listed.result?.tools;
      if (!Array.isArray(tools)) {
        reject(new Error(`stdio tools/list 응답이 배열이 아니다 — stderr: ${stderr.join('')}`));
        return;
      }
      resolve(tools.map((t) => t.name).sort());
    }, 100);
  });
}

// ── HTTP 쪽 ─────────────────────────────────────────────────────────────────

async function post(endpoint, body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });
  if (response.status === 202) return { status: response.status, json: null };
  return { status: response.status, json: await response.json() };
}

function startHttpChild(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [ENTRY, EXPOSITION, '--transport=http', `--http-port=${port}`],
      { env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const stderr = [];
    child.on('error', (e) => reject(new Error(`HTTP 자식을 띄우지 못했다: ${e.message}`)));
    child.on('exit', (code) =>
      reject(new Error(`핸드셰이크 전에 종료했다 (exit ${code}) — stderr: ${stderr.join('')}`)),
    );
    child.stderr.on('data', (d) => {
      stderr.push(d.toString());
      // **실제로 붙은 뒤**의 줄만 본다 — 해석 진단에도 endpoint=가 있어서,
      // 그것을 잡으면 아직 듣지 않는 주소로 요청을 보내게 된다.
      const match = /http listening · endpoint=(\S+)/.exec(stderr.join(''));
      if (match) resolve({ child, endpoint: match[1], stderr });
    });
  });
}

// ── 본체 ────────────────────────────────────────────────────────────────────

export async function run() {
  const report = createReport('HTTP 기동 스모크');

  if (!fs.existsSync(ENTRY)) {
    report.check('빌드 산출물이 있다', false, `${ENTRY} — \`npm run build\`를 먼저 돌려라`);
    return report;
  }

  const port = await freePort();
  let started;
  try {
    started = await deadline(startHttpChild(port), '시간 안에 HTTP 바인딩 진단이 오지 않았다');
  } catch (error) {
    report.check('HTTP로 기동한다', false, error instanceof Error ? error.message : String(error));
    return report;
  }
  started.child.removeAllListeners('exit');

  try {
    report.check(
      'HTTP로 기동해 예고한 주소에 붙는다',
      started.endpoint === `http://127.0.0.1:${port}/mcp/stream/http`,
      started.endpoint,
    );

    const health = await deadline(
      fetch(new URL('/mcp/health', started.endpoint)),
      'health 응답이 오지 않았다',
    );
    report.check('health가 200을 준다', health.status === 200, `status=${health.status}`);

    const initialize = await deadline(
      post(started.endpoint, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'http-smoke', version: '0.0.0' },
        },
      }),
      'initialize 응답이 오지 않았다',
    );
    const serverInfo = initialize.json?.result?.serverInfo;
    report.check(
      'initialize 왕복이 성사된다',
      Boolean(serverInfo?.name),
      serverInfo ? `${serverInfo.name}@${serverInfo.version}` : '(serverInfo 없음)',
    );

    const listed = await deadline(
      post(started.endpoint, { jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      'tools/list 응답이 오지 않았다',
    );
    const tools = listed.json?.result?.tools;
    const overHttp = Array.isArray(tools) ? tools.map((t) => t.name).sort() : [];
    report.check('tools/list 왕복이 성사된다', overHttp.length > 0, `${overHttp.length}종`);

    // 구와 같이 GET(SSE 스트림)을 열지 않는다 — 전송이 표면을 넓히지 않는다.
    const viaGet = await deadline(fetch(started.endpoint), 'GET 응답이 오지 않았다');
    report.check('MCP 경로의 GET은 405다', viaGet.status === 405, `status=${viaGet.status}`);

    const notFound = await deadline(
      fetch(new URL('/nope', started.endpoint)),
      '404 확인 응답이 오지 않았다',
    );
    report.check('모르는 경로는 404다', notFound.status === 404, `status=${notFound.status}`);

    // 노출 집합이 전송에 무관한가 — 같은 argv·env의 stdio 자식과 대조한다.
    const overStdio = await deadline(listOverStdio(), 'stdio 대조 자식이 응답하지 않았다');
    report.check(
      '노출 집합이 stdio와 같다',
      overHttp.length > 0 && JSON.stringify(overHttp) === JSON.stringify(overStdio),
      `stdio=${overStdio.length}종 · http=${overHttp.length}종`,
    );
  } catch (error) {
    report.check(
      'HTTP 왕복이 끝까지 간다',
      false,
      `${error instanceof Error ? error.message : String(error)} · stderr: ${started.stderr
        .join('')
        .trim()
        .slice(0, 400)}`,
    );
  } finally {
    started.child.kill();
  }

  return report;
}

// 직접 실행하면 단독 스크립트로도 돈다 — CI가 부르는 모양과 맞춘다.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const report = await run();
  process.exit(report.print() ? 0 : 1);
}
