// 구 번들의 tools/list를 오프라인(무접속)으로 채록해 M1 19종의 발행 계약을 뽑는다.
//
// SAP에 접속하지 않는다 — 물리는 프로파일이 존재하지 않는 호스트를 가리키고,
// tools/list는 등록된 선언을 그대로 돌려줄 뿐이기 때문이다. 구 번들은 실행만
// 하고 수정하지 않는다.
//
// PowerShell로 실행할 것 — 자식 프로세스를 띄운다.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const BUNDLE = here('../../../interactive/server/server.bundle.cjs');
const FAKE_ENV = here('./fake-sap.env');
const OUT = here('./m1-tools.json');

const M1 = [
  'SearchObject', 'GetInclude', 'GetClass', 'GetProgram', 'GetFunctionModule',
  'GetInactiveObjects', 'GrepObjects', 'CheckSyntax', 'GetSourceDiff',
  'CreateProgram', 'CreateInclude', 'UpdateProgram', 'UpdateInclude',
  'UpdateClass', 'UpdateSourceByPatch', 'ActivateObjects',
  'GetTable', 'GetStructure', 'GetSqlQuery',
];

/**
 * 한 번의 기동에서 tools/list 한 판을 받아 온다.
 * @param exposition `--exposition`으로 넘길 값
 * @param withProfile 가짜 프로파일(`SAP_SYSTEM_TYPE=onprem`)을 물릴지 여부.
 *   물리지 않으면 배포 축이 기본값 cloud가 되어 노출 집합이 줄어든다.
 */
function ask(exposition, withProfile) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const k of Object.keys(env)) {
      if (k.startsWith('SAP_') || k.startsWith('MCP_')) delete env[k];
    }
    if (withProfile) env.MCP_ENV_PATH = FAKE_ENV;

    const child = spawn(process.execPath, [BUNDLE, `--exposition=${exposition}`], {
      env, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buf = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 60000);
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 2) {
          clearTimeout(timer);
          child.kill();
          resolve(msg);
        }
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05', capabilities: {},
        clientInfo: { name: 'surface-capture', version: '0' },
      },
    })}\n`);
    setTimeout(() => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    }, 1500);
  });
}

const [connected, noProfile, connectedReadonly, noProfileReadonly] = await Promise.all([
  ask('readonly,high', true),
  ask('readonly,high', false),
  ask('readonly', true),
  ask('readonly', false),
]);

const names = (r) => (r?.result?.tools ?? []).map((t) => t.name).sort();
const byName = new Map((connected?.result?.tools ?? []).map((t) => [t.name, t]));

const m1 = {};
for (const n of M1) m1[n] = byName.get(n) ?? null;

const report = {
  _: '구 번들이 tools/list로 발행하는 선언 그대로. 손으로 고치지 말 것 — capture.mjs를 다시 돌린다.',
  counts: {
    connected_default: names(connected).length,
    noProfile_default: names(noProfile).length,
    connected_readonly: names(connectedReadonly).length,
    noProfile_readonly: names(noProfileReadonly).length,
  },
  connectedOnly: names(connected).filter((n) => !names(noProfile).includes(n)),
  m1Missing: M1.filter((n) => !byName.has(n)),
  m1,
};

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  counts: report.counts,
  connectedOnlyCount: report.connectedOnly.length,
  m1Missing: report.m1Missing,
}, null, 2));
process.exit(0);
