#!/usr/bin/env node
// trust-session 대체: 서버 번들을 직접 기동해 live tools/list에서 정적 권한 템플릿 생성.
// (카탈로그 문서는 4.13 번들과 어긋남이 실측됨 — 리뷰 2-2. 정본은 live 목록이다.)
// GetTableContents/GetSqlQuery는 정책상 절대 포함하지 않는다 (매 호출 사람 승인).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// 네임스페이스는 **플러그인 이름**에서 파생한다 — 하드코딩하면 개명 때 조용히 갈라진다(실측: D-041 개명 시 발견).
// 접두어의 `sap` 부분은 .mcp.json의 서버 이름이다(플러그인 이름과 무관).
const PLUGIN_NAME = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin-metadata.json'), 'utf8')).name;
const NAMESPACE = process.env.SC4SAP_LITE_NS ?? `mcp__plugin_${PLUGIN_NAME}_sap__`;
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
    'sapkit 정적 권한 템플릿 (구 trust-session 대체). live tools/list 기반 생성.',
    '프로젝트 .claude/settings.local.json의 permissions.allow에 병합해 사용.',
    'GetTableContents/GetSqlQuery는 의도적으로 제외 — 매 호출 사람 승인 (data-extraction-policy).',
    '주의: 네임스페이스 접두어는 설치 후 실제 도구명으로 검증할 것 (README 참조).',
    '재생성: 연결 상태에서 생성해야 프로그램/화면 계열 write 도구가 포함됨 (gen-permissions.mjs는 inspection-only라 미포함 — 백로그).',
    '네임스페이스는 interactive/plugin-metadata.json의 플러그인 이름에서 파생한다 (D-041 개명 시 하드코딩 발견·수리).',
  ],
  permissions: {
    allow: [
      ...names.map((n) => NAMESPACE + n),
      // 경로 규칙의 도구 이름은 Read/Edit 두 개뿐이다 — Read가 Glob 등 읽기 계열 전부를,
      // Edit이 Write 등 편집 계열 전부를 커버한다. Write(경로)·Glob(경로)로 쓰면 매칭되지
      // 않아 죽은 줄이 되고 설치자가 매 세션 경고를 본다 (2026-07-23 사용자 신고로 발견).
      'Read(.sc4sap/**)',
      'Edit(.sc4sap/**)',
      'Grep(.sc4sap/**)',
    ],
  },
};
const out = path.join(ROOT, 'adapters', 'claude', 'permissions-template.json');

// 축소 거부 가드. 프로파일 없이 기동하면 서버가 inspection-only(155)로 떠서, connected(186) 기준으로
// 만든 템플릿을 덮어쓰며 프로그램/화면 계열 write 31종을 조용히 날린다 — 2026-07-21 실사고(D-041 리뷰
// M-1: 189→158로 과거 수리 9727dc7이 되돌아갔고 커밋 메시지·결정 로그 어디에도 안 남았다).
if (fs.existsSync(out) && !process.argv.includes('--force')) {
  const prev = JSON.parse(fs.readFileSync(out, 'utf8')).permissions?.allow ?? [];
  const prevTools = prev.filter((e) => e.startsWith('mcp__plugin_')).length;
  if (prevTools > names.length) {
    console.error(`❌ 축소 거부: 기존 템플릿 도구 ${prevTools}개 → 이번 생성 ${names.length}개`);
    console.error('   프로파일이 없으면 inspection-only로 떠서 프로그램/화면 계열 write가 빠진다.');
    console.error('   connected 상태(프로파일 활성)에서 재실행할 것. 의도한 축소면 --force.');
    process.exit(1);
  }
}

fs.writeFileSync(out, JSON.stringify(template, null, 2) + '\n');
console.log(`live ${live.length}개 중 ${names.length}개 허용 (제외 ${live.length - names.length}) → ${path.relative(ROOT, out)}`);
