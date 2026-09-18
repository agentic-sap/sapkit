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
const NAMESPACE = process.env.SAPKIT_TOOL_NS ?? `mcp__plugin_${PLUGIN_NAME}_sap__`;
const EXCLUDE = new Set(['GetTableContents', 'GetSqlQuery']);

const TEMPLATE_OUT = path.join(ROOT, 'adapters', 'claude', 'permissions-template.json');
const BUILD_OUT = path.join(ROOT, 'adapters', 'claude', 'permissions-build.json');

// ── 빌드 권한 부분 목록 ─────────────────────────────────────────────────────
// 설계 승인 직후 「한 번에 허용」 제안이 병합하는 목록이다. 전체 템플릿에서 **되돌리기
// 어려운 일**(삭제 · 이송 생명주기 · 런타임 실행)과 **실데이터**를 뺀 나머지 — 즉
// 만들기 · 고치기 · 활성화 · 구문검사 · 단위테스트 · 읽기.
// 제외 목록의 세부는 tunable이지만 **원칙은 고정**이다: 뺀 것들은 계속 호출별 승인 창이 뜬다.
// live tools/list가 아니라 **템플릿을 걸러서** 만든다 — 프로파일 없이 기동하면 서버가
// inspection-only로 떠서 write 도구가 목록에 아예 없기 때문이다(아래 축소 거부 가드와 같은 사고).
const BUILD_EXCLUDE_EXACT = new Set(['CreateTransport', 'ReleaseTransport', 'GetTableContents', 'GetSqlQuery']);
const BUILD_EXCLUDE_PREFIX = ['Delete', 'Runtime'];
const isBuildExcluded = (tool) =>
  BUILD_EXCLUDE_EXACT.has(tool) || BUILD_EXCLUDE_PREFIX.some((p) => tool.startsWith(p));
// 네임스페이스를 다시 조립하지 않고 **마지막 `__` 뒤**를 도구 이름으로 본다 —
// SAPKIT_TOOL_NS로 다른 접두어를 써서 템플릿을 만들었어도 제외가 여전히 먹는다.
const toolNameOf = (entry) => (entry.startsWith('mcp__') ? entry.slice(entry.lastIndexOf('__') + 2) : null);

function deriveBuildSubset() {
  const all = JSON.parse(fs.readFileSync(TEMPLATE_OUT, 'utf8')).permissions?.allow ?? [];
  // 경로 규칙(Read/Edit/Grep)은 SAP 도구가 아니므로 제외 대상이 아니다 — 만드는 동안 .sapkit/를 읽고 쓴다.
  const allow = all.filter((entry) => {
    const tool = toolNameOf(entry);
    return tool === null || !isBuildExcluded(tool);
  });
  const doc = {
    _comment: [
      'sapkit 빌드 권한 부분 목록. permissions-template.json에서 파생한다 (gen-permissions.mjs --derive-build).',
      '파생 규칙: 템플릿 permissions.allow에서 제외 패턴에 걸리는 항목만 뺀다. 손으로 고치지 않는다 — 다음 재생성에 덮인다.',
      '제외 패턴: Delete* · CreateTransport · ReleaseTransport · Runtime* · GetTableContents · GetSqlQuery.',
      '제외 원칙: 되돌리기 어려운 일(삭제 · 이송 생명주기 · 런타임 실행)과 실데이터는 목록 밖에 둔다 — 계속 호출별 승인 창이 뜬다.',
      'GetTableContents/GetSqlQuery는 의도적으로 제외 — 매 호출 사람 승인 (data-extraction-policy).',
      '남는 것: 만들기 · 고치기 · 활성화 · 구문검사 · 단위테스트 · 읽기 도구.',
      '용도: 설계 승인 직후의 「한 번에 허용」 제안이 이 목록만 프로젝트 .claude/settings.local.json에 추가 병합한다 — 사용자가 예라고 답했을 때만, 삭제·재정렬 없이.',
      '정직 유보: 제외는 도구 이름 패턴으로 정한다. 새 도구가 패턴 밖으로 새면 이 목록에 들어올 수 있으므로, 재생성 시 새 이름을 확인할 것.',
    ],
    permissions: { allow },
  };
  fs.writeFileSync(BUILD_OUT, JSON.stringify(doc, null, 2) + '\n');
  return { total: all.length, kept: allow.length };
}

// 파생은 live 기동 **전에** 갈라진다 — 부분 목록은 템플릿에서 나오므로 서버를 띄울 이유가 없고,
// inspection-only로 뜬 서버가 끼어들 여지도 없다.
if (process.argv.includes('--derive-build')) {
  const { total, kept } = deriveBuildSubset();
  console.log(
    `부분 목록 파생: 템플릿 ${total}줄 중 ${kept}줄 유지 (제외 ${total - kept}) → ${path.relative(ROOT, BUILD_OUT)}`
  );
  process.exit(0);
}

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
      'Read(.sapkit/**)',
      'Edit(.sapkit/**)',
      'Grep(.sapkit/**)',
    ],
  },
};
const out = TEMPLATE_OUT;

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

// 템플릿을 새로 썼으면 부분 목록도 같은 실행에서 다시 쓴다 — 따로 돌리게 두면 둘이 조용히 갈라지고,
// 갈라진 쪽은 게이트가 아니라 사용자가 먼저 만난다.
const derived = deriveBuildSubset();
console.log(
  `부분 목록 재파생: 템플릿 ${derived.total}줄 중 ${derived.kept}줄 유지 (제외 ${derived.total - derived.kept}) → ${path.relative(ROOT, BUILD_OUT)}`
);
