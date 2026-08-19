/**
 * 안전 게이트 적합성 + 음성시험 — 게이트가 **정말 거부하는지**.
 *
 * 통과만 확인하는 시험은 게이트가 통째로 빠져도 초록이다. 구 엔진이 실제로
 * 그렇게 무너졌다: tier 가드가 어떤 서버도 지나지 않는 경로에만 배선돼
 * QA·PRD·미해석 어디서든 요청이 SAP까지 도달했다
 * (`interactive/scripts/conformance-server-gates.mjs` 헤더 GAP-1).
 *
 * 그래서 여기서는 **거부됐다**에 더해 **접속을 한 번도 시도하지 않았다**까지
 * 확인한다 — 접속 공장을 주입해 호출 횟수를 센다.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { boot, cleanupTempDirs, createReport, server, writeProfileEnv } from './lib.mjs';

/** 부르면 안 되는 접속 공장. 불리면 그 자체가 실패 증거다. */
function countingConnections() {
  const state = { calls: 0 };
  return {
    state,
    factory() {
      state.calls += 1;
      throw new Error('접속을 열려고 했다 — 게이트가 앞에서 막았어야 한다');
    },
  };
}

async function callTool({ exposition, envPath, env, tool, args }) {
  const startup = boot({ exposition, envPath, env });
  const conn = countingConnections();
  const audit = [];
  const core = server.createServerCore({
    startup,
    connectionFactory: conn.factory,
    stderr: (line) => audit.push(line),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await core.server.connect(serverTransport);
  const client = new Client({ name: 'safety-gate', version: '0.0.0' });
  await client.connect(clientTransport);
  try {
    let result;
    let threw = null;
    try {
      result = await client.callTool({ name: tool, arguments: args });
    } catch (error) {
      threw = error;
    }
    const text = threw
      ? String(threw?.message ?? threw)
      : (result?.content ?? []).map((c) => c.text ?? '').join('\n');
    return { text, isError: threw ? true : Boolean(result?.isError), connections: conn.state.calls, audit };
  } finally {
    await client.close();
    await core.server.close();
  }
}

export async function run() {
  const report = createReport('안전 게이트 적합성 + 음성시험');

  // ── tier 게이트 ────────────────────────────────────────────────────────────
  for (const tier of ['QA', 'PRD']) {
    const envPath = writeProfileEnv({ SAP_TIER: tier, SAP_SYSTEM_TYPE: 'onprem' });
    const r = await callTool({
      exposition: 'readonly,high',
      envPath,
      tool: 'UpdateClass',
      args: { class_name: 'ZCL_GATE_PROBE', source_code: 'CLASS zcl_gate_probe DEFINITION.' },
    });
    report.check(
      `${tier} tier에서 write 거부`,
      r.isError && /ERR_READONLY_TIER/.test(r.text),
      r.text.slice(0, 90),
    );
    report.check(`${tier} tier 거부 시 접속 시도 0`, r.connections === 0, `실제 ${r.connections}회`);
  }

  {
    // tier 미해석(SAP_TIER 없음) — fail-closed여야 한다.
    const envPath = writeProfileEnv({ SAP_TIER: '', SAP_SYSTEM_TYPE: 'onprem' });
    const r = await callTool({
      exposition: 'readonly,high',
      envPath,
      tool: 'UpdateClass',
      args: { class_name: 'ZCL_GATE_PROBE', source_code: 'CLASS zcl_gate_probe DEFINITION.' },
    });
    report.check(
      'tier 미해석에서 write 거부 (fail-closed)',
      r.isError && /ERR_READONLY_TIER/.test(r.text),
      r.text.slice(0, 90),
    );
    report.check('미해석 거부 시 접속 시도 0', r.connections === 0, `실제 ${r.connections}회`);
  }

  {
    // 과수리 역검증 — DEV에서까지 막으면 제품이 죽는다.
    const envPath = writeProfileEnv({ SAP_TIER: 'DEV', SAP_SYSTEM_TYPE: 'onprem' });
    const r = await callTool({
      exposition: 'readonly,high',
      envPath,
      tool: 'UpdateClass',
      args: { class_name: 'ZCL_GATE_PROBE', source_code: 'CLASS zcl_gate_probe DEFINITION.' },
    });
    report.check(
      'DEV tier는 게이트를 지나 접속까지 간다 (과수리 역검증)',
      r.connections > 0 && !/ERR_READONLY_TIER/.test(r.text),
      `접속 시도 ${r.connections}회`,
    );
  }

  // ── 실데이터 상시 게이트 ───────────────────────────────────────────────────
  {
    const envPath = writeProfileEnv({ SAP_TIER: 'DEV', SAP_SYSTEM_TYPE: 'onprem' });
    const denied = await callTool({
      exposition: 'readonly',
      envPath,
      tool: 'GetSqlQuery',
      args: { sql_query: 'SELECT kunnr FROM KNA1' },
    });
    report.check(
      '블록리스트 테이블의 실데이터 추출 거부',
      denied.isError && /refused/i.test(denied.text),
      denied.text.slice(0, 90),
    );
    report.check('실데이터 거부 시 접속 시도 0', denied.connections === 0, `실제 ${denied.connections}회`);

    const ask = await callTool({
      exposition: 'readonly',
      envPath,
      tool: 'GetSqlQuery',
      args: { sql_query: 'SELECT belnr FROM BKPF' },
    });
    report.check(
      '승인 없는 ask 등급 테이블 거부',
      ask.isError && /confirmation/i.test(ask.text),
      ask.text.slice(0, 90),
    );

    // 허용 목록은 **활성 프로파일 파일**에 적는다 — 프로세스 env로는 열리지 않기
    // 때문이다(`resolveSafetyEnv`: 푸는 노브는 파일 소유 · 결정 D-096). 전에는 이
    // 픽스처가 `env:`로 줬고, 통로가 닫히자 우회가 아예 일어나지 않아 아래 감사줄
    // 단언이 빨개졌다 — 게이트가 제 몫을 한 것이다.
    const bypassEnvPath = writeProfileEnv({
      SAP_TIER: 'DEV',
      SAP_SYSTEM_TYPE: 'onprem',
      MCP_ALLOW_TABLE: 'BNKA',
    });
    const bypass = await callTool({
      exposition: 'readonly',
      envPath: bypassEnvPath,
      tool: 'GetSqlQuery',
      args: { sql_query: 'SELECT a~banks FROM BNKA AS a INNER JOIN KNA1 AS b ON a~banks = b~land1' },
    });
    // `isError`만 보면 헛돈다 — 게이트를 통째로 들어내도 접속 공장이 던져서
    // isError가 참이 된다(리뷰가 사보타주로 실증). 거부 문구와 **접속 시도 0회**
    // 까지 함께 봐야 이 체크가 혼자서도 진짜 음성이 된다.
    report.check(
      '허용 목록 우회가 다른 차단 테이블을 열지 못한다',
      bypass.isError && /refused/i.test(bypass.text) && bypass.connections === 0,
      `${bypass.text.slice(0, 70)} · 접속 시도 ${bypass.connections}회`,
    );
    report.check(
      '거부 판정에서도 감사 줄이 남는다',
      bypass.audit.some((l) => /AUDIT: MCP_ALLOW_TABLE bypass for BNKA/.test(l)),
      bypass.audit.find((l) => /AUDIT/.test(l)) ?? '(AUDIT 줄 없음)',
    );

    // 같은 허용 목록을 **프로세스 env**로 주면 아무것도 열리지 않는다 — 바닥선을
    // 밖에서 낮출 수 없다는 규칙(D-096)을 엔진 자체 게이트에서도 붙든다. 우회가
    // 없었으므로 감사줄도 없어야 한다: 열지도 않고 열었다고 적지도 않는다.
    const notBypassed = await callTool({
      exposition: 'readonly',
      envPath,
      env: { MCP_ALLOW_TABLE: 'BNKA' },
      tool: 'GetSqlQuery',
      args: { sql_query: 'SELECT banks FROM BNKA' },
    });
    report.check(
      '프로세스 env의 허용 목록은 가드를 열지 못한다',
      notBypassed.isError &&
        /refused/i.test(notBypassed.text) &&
        notBypassed.connections === 0 &&
        !notBypassed.audit.some((l) => /MCP_ALLOW_TABLE bypass/.test(l)),
      `${notBypassed.text.slice(0, 60)} · 접속 ${notBypassed.connections}회 · 감사줄 ${notBypassed.audit.filter((l) => /bypass/.test(l)).length}건`,
    );
  }

  // ── 무프로파일 정직 실패 ───────────────────────────────────────────────────
  {
    const r = await callTool({
      exposition: 'readonly',
      tool: 'GetInclude',
      args: { include_name: 'ZGATE_PROBE' },
    });
    report.check(
      '무프로파일에서 접속이 필요한 호출은 정직하게 실패한다',
      r.isError && /ERR_NO_CONNECTION/.test(r.text),
      r.text.slice(0, 90),
    );
  }

  cleanupTempDirs();
  return report;
}
