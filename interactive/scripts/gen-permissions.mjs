#!/usr/bin/env node
// trust-session 대체: 서버 번들을 직접 기동해 live tools/list에서 정적 권한 템플릿 생성.
// (카탈로그 문서는 4.13 번들과 어긋남이 실측됨 — 리뷰 2-2. 정본은 live 목록이다.)
// GetTableContents/GetSqlQuery는 정책상 절대 포함하지 않는다 (매 호출 사람 승인).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMESPACE = process.env.SC4SAP_LITE_NS ?? 'mcp__plugin_sc4sap-lite_sap__';
const EXCLUDE = new Set(['GetTableContents', 'GetSqlQuery']);

function listLiveTools() {
  return new Promise((resolveP, rejectP) => {
    const env = { ...process.env, NODE_PATH: path.join(ROOT, 'server', 'runtime-deps', 'keyring', 'node_modules') };
    for (const k of Object.keys(env)) if (k.startsWith('SAP_') || k.startsWith('MCP_')) delete env[k];
    const srv = spawn('node', [path.join(ROOT, 'server', 'server.bundle.cjs')], { cwd: ROOT, env });
    const send = (o) => srv.stdin.write(JSON.stringify(o) + '\n');
    const timeout = setTimeout(() => { srv.kill(); rejectP(new Error('TIMEOUT')); }, 30000);
    let buf = '';
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
          srv.kill();
          resolveP((msg.result?.tools ?? []).map((t) => t.name));
        }
      }
    });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'gen-permissions', version: '0' } } });
  });
}

const live = await listLiveTools();
const names = live.filter((n) => !EXCLUDE.has(n)).sort();
if (names.length < 50) { console.error(`live 도구 ${names.length}개 — 비정상, 중단`); process.exit(1); }

const template = {
  _comment: [
    'sc4sap-lite 정적 권한 템플릿 (구 trust-session 대체). live tools/list 기반 생성.',
    '프로젝트 .claude/settings.local.json의 permissions.allow에 병합해 사용.',
    'GetTableContents/GetSqlQuery는 의도적으로 제외 — 매 호출 사람 승인 (data-extraction-policy).',
    '주의: 네임스페이스 접두어는 설치 후 실제 도구명으로 검증할 것 (README 참조).',
    '재생성: node scripts/gen-permissions.mjs (서버 번들 갱신 시 필수 — UPDATE-RUNBOOK step 3)',
  ],
  permissions: {
    allow: [
      ...names.map((n) => NAMESPACE + n),
      'Read(.sc4sap/**)',
      'Write(.sc4sap/**)',
      'Edit(.sc4sap/**)',
      'Glob(.sc4sap/**)',
      'Grep(.sc4sap/**)',
    ],
  },
};
const out = path.join(ROOT, 'adapters', 'claude', 'permissions-template.json');
fs.writeFileSync(out, JSON.stringify(template, null, 2) + '\n');
console.log(`live ${live.length}개 중 ${names.length}개 허용 (제외 ${live.length - names.length}) → ${path.relative(ROOT, out)}`);
