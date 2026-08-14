/**
 * SSE 기동 스모크 — 빌드된 엔진이 **SSE로도 뜨고 대답하는가.**
 *
 * `http-smoke.mjs`와 같은 결이다. 다른 시험은 같은 프로세스 안에서 전송을 주입해
 * 돌지만, 그건 로직이 맞다는 증거이지 **실려 나가는 물건이 기동한다**는 증거가
 * 아니다. 여기서는 산출물을 자식 프로세스로 띄우고 실제 소켓으로 MCP 왕복을 한다.
 *
 * 클라이언트는 **날것으로** 짠다. SDK의 `SSEClientTransport`를 쓸 수도 있지만,
 * 그러면 실려 나가는 물건의 **전선 위 형식**(`event: endpoint` 프레임 · 세션
 * 번호가 붙은 POST 주소 · 응답이 POST가 아니라 스트림으로 돌아오는 것)이
 * 라이브러리 뒤로 숨는다. 스모크가 보려는 것이 바로 그것이다.
 *
 * 기대 노출 집합은 **세지 않고 계산한다** — `stdio-smoke.mjs`와 **같은 규칙**
 * (채록본의 「무프로파일 + readonly」 이름 집합 ∩ 등록점)이다. 상수를 박으면 도구를
 * 하나 지을 때마다 사람이 그 수를 고치게 되고, 그러면 스모크는 노출 제어를
 * 지키는 게 아니라 지금 상태를 추인하는 장치가 된다. 세 전송이 **같은 자**로
 * 재이므로, 이 게이트가 초록이면 stdio·HTTP·SSE의 노출 집합이 같다는 뜻이다.
 *
 * SAP에 접속하지 않는다 — 프로파일을 주지 않으므로 inspection-only로 뜨고,
 * 바인딩은 루프백의 임시 포트다. 자식 프로세스를 쓰므로 **PowerShell로 실행할 것**
 * (이 머신에서 Bash로 돌리면 수거에서 블록된 실측 기록이 있다).
 *
 *   node gates/sse-smoke.mjs      # 단독 실행
 *   node gates/run-all.mjs        # 다른 게이트와 함께
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as nodeHttp from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createReport, requireDist } from './lib.mjs';

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

/**
 * 기대 집합은 세지 않고 계산한다 — `stdio-smoke.mjs`의 `expectedNames`와 같은 규칙.
 * (그 파일은 이 값을 내보내지 않으므로 규칙만 같게 다시 적는다.)
 */
function expectedNames() {
  const captured = JSON.parse(
    fs.readFileSync(
      fileURLToPath(new URL('../harness/old-surface/m1-tools.json', import.meta.url)),
      'utf8',
    ),
  );
  const names = captured?.exposures?.noProfile_readonly?.names;
  if (!Array.isArray(names) || names.length === 0) return [];
  const { TOOL_REGISTRY } = requireDist('src/tools/registry.js');
  const registered = new Set(TOOL_REGISTRY.map((tool) => tool.definition.name));
  return names.filter((name) => registered.has(name)).sort();
}

// ── 날것의 SSE 클라이언트 ───────────────────────────────────────────────────

/** `event: x\ndata: y\n\n` 한 덩이를 뜯는다. */
function parseFrame(raw) {
  let event = 'message';
  const data = [];
  for (const line of raw.split('\n')) {
    const l = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (l.startsWith(':')) continue;
    if (l.startsWith('event:')) event = l.slice('event:'.length).trim();
    else if (l.startsWith('data:')) data.push(l.slice('data:'.length).replace(/^ /, ''));
  }
  return { event, data: data.join('\n') };
}

/**
 * 스트림을 열고, 프레임을 모으고, 조건에 맞는 것을 기다린다.
 *
 * `fetch`가 아니라 `node:http`를 쓴다. 스트리밍 `fetch`의 응답 본문을 끊고 곧바로
 * `process.exit`를 부르면 이 머신의 node가 정리 중인 핸들에서 죽는다(실측:
 * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) … win\async.c:76` —
 * 판정은 11건 전부 통과했는데 종료 코드만 비정상이 됐다). 게이트의 다른 요청들과
 * 같은 부품을 쓰면 그 갈래 자체가 없다.
 */
function openStream(url) {
  const frames = [];
  const waiters = [];
  const notify = () => {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const hit = frames.find(waiters[i].match);
      if (hit) waiters.splice(i, 1)[0].resolve(hit);
    }
  };

  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = nodeHttp.request(
      {
        host: target.hostname,
        port: Number(target.port),
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        headers: { accept: 'text/event-stream' },
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`스트림이 열리지 않았다 — status=${response.statusCode}`));
          return;
        }
        let buffer = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          buffer += chunk;
          let i;
          while ((i = buffer.search(/\r?\n\r?\n/)) >= 0) {
            const end = /\r?\n\r?\n/.exec(buffer.slice(i))[0].length;
            frames.push(parseFrame(buffer.slice(0, i)));
            buffer = buffer.slice(i + end);
            notify();
          }
        });
        resolve({
          waitFor(match, why) {
            return deadline(
              new Promise((hit) => {
                waiters.push({ match, resolve: hit });
                notify();
              }),
              why,
            );
          },
          close() {
            request.destroy();
            response.destroy();
          },
        });
      },
    );
    request.once('error', reject);
    request.end();
  });
}

/** JSON-RPC 한 통을 올린다. 응답은 이 요청이 아니라 스트림으로 돌아온다. */
async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  // 본문을 비워 두면 소켓이 남는다.
  await response.text();
  return response.status;
}

/** `fetch`가 갈아치우는 Host 헤더를 그대로 보내기 위한 날것의 요청. */
function rawStatus(url, method, headers) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = nodeHttp.request(
      {
        host: target.hostname,
        port: Number(target.port),
        path: `${target.pathname}${target.search}`,
        method,
        headers: { accept: 'text/event-stream, application/json', ...headers },
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode ?? 0));
      },
    );
    request.once('error', reject);
    request.end();
  });
}

// ── 자식 ────────────────────────────────────────────────────────────────────

function startSseChild(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [ENTRY, EXPOSITION, '--transport=sse', `--sse-port=${port}`],
      { env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const stderr = [];
    child.on('error', (e) => reject(new Error(`SSE 자식을 띄우지 못했다: ${e.message}`)));
    child.on('exit', (code) =>
      reject(new Error(`핸드셰이크 전에 종료했다 (exit ${code}) — stderr: ${stderr.join('')}`)),
    );
    child.stderr.on('data', (d) => {
      stderr.push(d.toString());
      // **실제로 붙은 뒤**의 줄만 본다 — 해석 진단에도 endpoint=가 있어서,
      // 그것을 잡으면 아직 듣지 않는 주소로 요청을 보내게 된다.
      const match = /sse listening · endpoint=(\S+) · post=(\S+)/.exec(stderr.join(''));
      if (match) resolve({ child, endpoint: match[1], postEndpoint: match[2], stderr });
    });
  });
}

// ── 본체 ────────────────────────────────────────────────────────────────────

export async function run() {
  const report = createReport('SSE 기동 스모크');

  if (!fs.existsSync(ENTRY)) {
    report.check('빌드 산출물이 있다', false, `${ENTRY} — \`npm run build\`를 먼저 돌려라`);
    return report;
  }

  const port = await freePort();
  let started;
  try {
    started = await deadline(startSseChild(port), '시간 안에 SSE 바인딩 진단이 오지 않았다');
  } catch (error) {
    report.check('SSE로 기동한다', false, error instanceof Error ? error.message : String(error));
    return report;
  }
  started.child.removeAllListeners('exit');

  let stream;
  try {
    report.check(
      'SSE로 기동해 예고한 주소에 붙는다',
      started.endpoint === `http://127.0.0.1:${port}/sse` &&
        started.postEndpoint === `http://127.0.0.1:${port}/messages`,
      `${started.endpoint} · post=${started.postEndpoint}`,
    );

    const health = await deadline(
      fetch(new URL('/mcp/health', started.endpoint)),
      'health 응답이 오지 않았다',
    );
    const healthBody = health.status === 200 ? await health.json() : {};
    report.check(
      'health가 200을 주고 전송을 sse로 밝힌다',
      health.status === 200 && healthBody.transport === 'sse',
      `status=${health.status} · transport=${healthBody.transport}`,
    );

    stream = await deadline(openStream(started.endpoint), '스트림이 열리지 않았다');
    const endpointFrame = await stream.waitFor(
      (f) => f.event === 'endpoint',
      'endpoint 프레임이 오지 않았다',
    );
    const postUrl = new URL(endpointFrame.data, started.endpoint);
    report.check(
      '스트림이 세션 번호가 붙은 POST 주소를 알려 준다',
      postUrl.pathname === '/messages' && (postUrl.searchParams.get('sessionId') ?? '').length > 0,
      endpointFrame.data,
    );

    const accepted = await deadline(
      post(postUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'sse-smoke', version: '0.0.0' },
        },
      }),
      'initialize POST가 끝나지 않았다',
    );
    report.check('메시지 POST는 202로 받는다', accepted === 202, `status=${accepted}`);

    const initialize = JSON.parse(
      (await stream.waitFor((f) => {
        try {
          return JSON.parse(f.data)?.id === 1;
        } catch {
          return false;
        }
      }, 'initialize 응답이 스트림으로 오지 않았다')).data,
    );
    const serverInfo = initialize?.result?.serverInfo;
    report.check(
      'initialize 왕복이 성사된다',
      Boolean(serverInfo?.name),
      serverInfo ? `${serverInfo.name}@${serverInfo.version}` : '(serverInfo 없음)',
    );

    await post(postUrl, { jsonrpc: '2.0', method: 'notifications/initialized' });
    await post(postUrl, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const listed = JSON.parse(
      (await stream.waitFor((f) => {
        try {
          return JSON.parse(f.data)?.id === 2;
        } catch {
          return false;
        }
      }, 'tools/list 응답이 스트림으로 오지 않았다')).data,
    );
    const tools = listed?.result?.tools;
    const overSse = Array.isArray(tools) ? tools.map((t) => t.name).sort() : [];
    report.check('tools/list 왕복이 성사된다', overSse.length > 0, `${overSse.length}종`);

    // 노출 집합이 전송에 무관한가 — stdio 스모크와 **같은 자**로 잰다.
    const expected = expectedNames();
    const missing = expected.filter((n) => !overSse.includes(n));
    const extra = overSse.filter((n) => !expected.includes(n));
    report.check(
      '노출 집합이 채록본∩등록점과 같다 (stdio 스모크와 같은 자)',
      expected.length > 0 && missing.length === 0 && extra.length === 0,
      `기대 ${expected.length}종 · 실제 ${overSse.length}종` +
        `${missing.length > 0 ? ` · 빠짐 [${missing.join(', ')}]` : ''}` +
        `${extra.length > 0 ? ` · 여분 [${extra.join(', ')}]` : ''}`,
    );

    // 전송이 표면을 넓히지 않는다.
    const notFound = await deadline(
      fetch(new URL('/nope', started.endpoint)),
      '404 확인 응답이 오지 않았다',
    );
    report.check('모르는 경로는 404다', notFound.status === 404, `status=${notFound.status}`);
    const wrongMethod = await deadline(
      rawStatus(started.endpoint, 'POST'),
      '스트림 경로의 POST 응답이 오지 않았다',
    );
    report.check('스트림 경로의 POST는 405다', wrongMethod === 405, `status=${wrongMethod}`);
    const badSession = await deadline(
      rawStatus(`${started.postEndpoint}?sessionId=nope`, 'POST', {
        'content-type': 'application/json',
      }),
      '모르는 세션 응답이 오지 않았다',
    );
    report.check('모르는 세션의 POST는 400이다', badSession === 400, `status=${badSession}`);

    // HTTP가 세운 잠금이 SSE에도 걸린다 — 스트림·메시지·health 전부.
    const evil = { host: 'evil.example' };
    const hostChecks = await Promise.all([
      rawStatus(started.endpoint, 'GET', evil),
      rawStatus(`${started.postEndpoint}?sessionId=nope`, 'POST', {
        ...evil,
        'content-type': 'application/json',
      }),
      rawStatus(new URL('/mcp/health', started.endpoint).href, 'GET', evil),
    ]);
    report.check(
      '허용 목록 밖의 Host 헤더는 스트림·메시지·health 전부에서 403이다',
      hostChecks.every((status) => status === 403),
      `statuses=[${hostChecks.join(', ')}]`,
    );
  } catch (error) {
    report.check(
      'SSE 왕복이 끝까지 간다',
      false,
      `${error instanceof Error ? error.message : String(error)} · stderr: ${started.stderr
        .join('')
        .trim()
        .slice(0, 400)}`,
    );
  } finally {
    stream?.close();
    started.child.kill();
    // 끊은 것들이 정리될 틈을 한 번 준다. 곧바로 `process.exit`를 부르면 이
    // 머신의 node가 **정리 중인 핸들**에서 죽는다(실측:
    // `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) … win\async.c:76`
    // — 판정 11건이 전부 통과했는데 종료 코드만 비정상이 됐다). 열어 둔 스트림이
    // 있는 전송이라 다른 스모크에는 없는 자리다.
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return report;
}

// 직접 실행하면 단독 스크립트로도 돈다 — CI가 부르는 모양과 맞춘다.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const report = await run();
  process.exit(report.print() ? 0 : 1);
}
