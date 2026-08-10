// 구 번들의 tools/list를 오프라인(무접속)으로 채록해 M1 19종의 발행 계약을 뽑는다.
//
// SAP에 접속하지 않는다 — 물리는 프로파일이 존재하지 않는 호스트를 가리키고,
// tools/list는 등록된 선언을 그대로 돌려줄 뿐이기 때문이다. 구 번들은 실행만
// 하고 수정하지 않는다.
//
// PowerShell로 실행할 것 — 자식 프로세스를 띄운다.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const BUNDLE = here('../../../interactive/server/server.bundle.cjs');
const OUT = here('./m1-tools.json');

const M1 = [
  'SearchObject', 'GetInclude', 'GetClass', 'GetProgram', 'GetFunctionModule',
  'GetInactiveObjects', 'GrepObjects', 'CheckSyntax', 'GetSourceDiff',
  'CreateProgram', 'CreateInclude', 'UpdateProgram', 'UpdateInclude',
  'UpdateClass', 'UpdateSourceByPatch', 'ActivateObjects',
  'GetTable', 'GetStructure', 'GetSqlQuery',
];

/**
 * 가짜 프로파일은 **실행 시점에 임시 디렉터리로 직접 쓴다.**
 *
 * 파일로 커밋해 두면 `*.env` 무시 규칙에 걸려 신선한 체크아웃에는 없고, 그러면
 * 이 스크립트가 조용히 무프로파일 채록으로 강등된다 — 연결 시에만 뜨는 31종이
 * 통째로 빠진 채로. 자족화가 그 함정을 없앤다.
 *
 * 값은 전부 명백한 가짜다: 존재하지 않는 호스트와 비밀 아닌 문자열.
 */
function writeFakeProfile(dir) {
  const file = path.join(dir, 'sap.env');
  writeFileSync(
    file,
    [
      'SAP_URL=https://sap.example.test:44300',
      'SAP_CLIENT=100',
      'SAP_AUTH_TYPE=basic',
      'SAP_USERNAME=surface-capture',
      'SAP_PASSWORD=not-a-secret',
      'SAP_TIER=DEV',
      'SAP_SYSTEM_TYPE=onprem',
      '',
    ].join('\n'),
    'utf8',
  );
  return file;
}

const workDir = mkdtempSync(path.join(os.tmpdir(), 'sapkit-surface-'));
const FAKE_ENV = writeFakeProfile(workDir);

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

rmSync(workDir, { recursive: true, force: true });

// 강등 감지 — 채록이 반쪽이면 **덮어쓰지 않고 실패한다.**
// 조용히 줄어든 채록본을 커밋하면 신 엔진이 맞추는 기준 자체가 틀어진다.
const problems = [];
if (report.m1Missing.length > 0) {
  problems.push(
    `M1 ${report.m1Missing.length}종이 표면에 없다 [${report.m1Missing.join(', ')}] — ` +
      '프로파일이 먹지 않아 무프로파일 채록으로 강등된 모양이다.',
  );
}
if (report.connectedOnly.length === 0) {
  problems.push(
    '프로파일 유무로 표면이 갈리지 않았다 — 연결 시에만 뜨는 도구가 0종이다. ' +
      '가짜 프로파일이 서버에 닿지 않았다는 뜻이다.',
  );
}
if (problems.length > 0) {
  console.error('❌ 표면 채록 실패 — 기존 채록본을 그대로 둔다.');
  for (const p of problems) console.error(`   · ${p}`);
  process.exit(1);
}

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  counts: report.counts,
  connectedOnlyCount: report.connectedOnly.length,
  m1Missing: report.m1Missing,
}, null, 2));
process.exit(0);
