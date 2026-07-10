#!/usr/bin/env node
// MCP 서버 스모크: stdio로 initialize → tools/list, 도구 수와 write 도구 노출 여부 보고.
// 용도: L2 수용 테스트(프로파일 미설정 시 write 미노출 여부 실측) + L4/L6 하네스별 재사용.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, NODE_PATH: path.join(ROOT, 'server', 'runtime-deps', 'keyring', 'node_modules') };
for (const k of Object.keys(env)) if (k.startsWith('SAP_') || k.startsWith('MCP_')) delete env[k];

const srv = spawn('node', [path.join(ROOT, 'server', 'server.bundle.cjs')], { cwd: ROOT, env });
const send = (o) => srv.stdin.write(JSON.stringify(o) + '\n');

let buf = '';
const timeout = setTimeout(() => { console.error('TIMEOUT (30s)'); srv.kill(); process.exit(1); }, 30000);

srv.stderr.on('data', (d) => process.stderr.write('[srv] ' + d));
srv.stdout.on('data', (d) => {
  buf += d.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id === 1) {
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    } else if (msg.id === 2) {
      clearTimeout(timeout);
      const tools = msg.result?.tools ?? [];
      const names = tools.map((t) => t.name);
      const writeRe = /^(Create|Update|Delete|Activate|Release|Install)/;
      const writes = names.filter((n) => writeRe.test(n));
      const rowData = names.filter((n) => /GetTableContents|GetSqlQuery/.test(n));
      console.log(`tools: ${names.length}`);
      console.log(`write-class tools exposed: ${writes.length}${writes.length ? ' (예: ' + writes.slice(0, 5).join(', ') + ')' : ''}`);
      console.log(`row-data tools exposed: ${rowData.join(', ') || 'none'}`);
      console.log(`sample: ${names.slice(0, 8).join(', ')}`);
      srv.kill();
      process.exit(0);
    }
  }
});
srv.on('exit', (c) => { if (c) { console.error(`server exited ${c}`); process.exit(1); } });

send({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'sc4sap-lite-smoke', version: '0' } },
});
