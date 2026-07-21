#!/usr/bin/env node
// MCP 도구 표면 게이트 (S3 · D-027 로드맵 §9.4).
//
// 구 스모크는 도구 수를 **출력만** 하고 언제나 exit 0이었다 — 안전 표면이 회귀해도
// CI는 초록이었다(로드맵 §15 "smoke 출력만 PASS" 리스크). 이제 assert한다.
//
// 검사 대상:
//   ① inspection-only 서버가 실제로 기동하고 tools/list에 응답하는가
//   ② exposition별 도구 **이름 집합**이 고정 스냅샷과 일치하는가 (수만이 아니라 이름)
//   ③ readonly에 mutation 도구가 0개인가
//   ④ readonly에 노출되는 **실행(execution)** 도구가 사전 등재된 것뿐인가
//      — readonly는 실행 무풍지대가 아니다. 새 실행 도구가 슬며시 들어오면 잡는다
//   ⑤ row-data 도구(GetTableContents/GetSqlQuery)의 노출/차단 상태가 기대대로인가
//   ⑥ 어댑터 3사의 deny 계약이 문서 표면에 살아 있는가 (오프라인)
//
// 도구 표면이 바뀌면 실패한다. 의도된 변경이면 --update로 스냅샷을 **일부러** 갱신한다.
//
// 사용: node interactive/scripts/smoke-mcp.mjs [--exposition=<name>] [--update]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './lib/target-hash.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// 도구 네임스페이스는 **플러그인 이름**에서 파생한다. 하드코딩하면 개명 시 아래 must_not_mention이
// 존재할 수 없는 문자열을 찾게 되어 **부정 단언이 조용히 공허해진다**(D-041 개명에서 실제로 발견).
const NS = `mcp__plugin_${JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin-metadata.json'), 'utf8')).name}_sap__`;

const argv = process.argv.slice(2);
const UPDATE = argv.includes('--update');
let only;
let surfaceOverride;
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--exposition=')) only = argv[i].slice('--exposition='.length);
  else if (argv[i] === '--exposition') only = argv[++i];
  // --surface <file>: 음성시험이 변조 스냅샷을 먹이기 위한 override.
  else if (argv[i] === '--surface') surfaceOverride = argv[++i];
}
const SURFACE = surfaceOverride ? path.resolve(surfaceOverride) : path.join(ROOT, 'provenance', 'mcp-surface.json');

const fail = [];
const warn = [];

// ── 도구 분류 ──────────────────────────────────────────────────────────────
// 이름 규칙만으로는 안 된다: RuntimeListDumps/RuntimeAnalyzeDump는 읽기인데 'Run'으로
// 시작하고, RuntimeCreateProfilerTraceParameters는 'Runtime'인데 Create다.
// → 실행/서버제어는 **명시 열거**하고, mutation은 접두어 규칙에서 그 둘을 뺀다.
const EXECUTION = [
  'RunUnitTest',
  'RuntimeRunClassWithProfiling',
  'RuntimeRunProgramWithProfiling',
  'RuntimeCreateProfilerTraceParameters',
];
const SERVER_CONTROL = ['ReloadProfile'];
const ROW_DATA = ['GetTableContents', 'GetSqlQuery'];
const MUTATION_RE = /^(Create|Update|Delete|Activate|Release|Patch|Write|Install)/;

const classify = (n) => {
  if (EXECUTION.includes(n)) return 'execution';
  if (SERVER_CONTROL.includes(n)) return 'server-control';
  if (ROW_DATA.includes(n)) return 'row-data';
  // `Runtime` 접두어를 벗겨서도 판정한다. MUTATION_RE가 ^앵커라 `Runtime*`는 구조적으로
  // 매칭되지 않는데, 그러면 가상의 `RuntimeDeleteFoo`가 조용히 read로 분류된다.
  // (구 `!/^Runtime/` 가드는 애초에 걸릴 수 없는 것을 막던 사역이었다 — S4 리뷰 N2.)
  // 실제 Runtime 읽기 도구는 벗겨도 List/Get/Analyze로 시작해 매칭되지 않는다.
  if (MUTATION_RE.test(n) || MUTATION_RE.test(n.replace(/^Runtime/, ''))) return 'mutation';
  return 'read';
};

// ── 서버 기동 → tools/list ─────────────────────────────────────────────────
function probe(exposition) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, NODE_PATH: path.join(ROOT, 'server', 'runtime-deps', 'keyring', 'node_modules') };
    for (const k of Object.keys(env)) if (k.startsWith('SAP_') || k.startsWith('MCP_')) delete env[k];
    const args = [path.join(ROOT, 'server', 'server.bundle.cjs')];
    if (exposition) args.push(`--exposition=${exposition}`);
    const srv = spawn('node', args, { cwd: ROOT, env });
    let buf = '';
    let stderr = '';
    const to = setTimeout(() => {
      srv.kill();
      reject(new Error('TIMEOUT (30s) — 서버가 tools/list에 응답하지 않음'));
    }, 30000);
    srv.stderr.on('data', (d) => (stderr += d));
    srv.on('exit', (c) => {
      if (c) {
        clearTimeout(to);
        reject(new Error(`서버가 exit ${c}로 종료${stderr ? ': ' + stderr.trim().split('\n')[0] : ''}`));
      }
    });
    srv.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 1) {
          srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
          srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
        } else if (msg.id === 2) {
          clearTimeout(to);
          srv.kill();
          resolve((msg.result?.tools ?? []).map((t) => t.name).sort());
        }
      }
    });
    srv.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'surface-gate', version: '0' } },
      }) + '\n'
    );
  });
}

// ── 어댑터 deny 계약 (오프라인 · 서버 무관) ─────────────────────────────────
// 각 어댑터가 row-data 2종을 어떻게 막는지가 문서 표면에서 사라지면 잡는다.
// P2는 exposition으로 막히지 않으므로(아래 ⑤) 이 계약이 유일한 기계적 차단면이다.
function checkAdapterDeny(expected) {
  const results = [];
  for (const [adapter, spec] of Object.entries(expected)) {
    if (adapter.startsWith('_')) continue;
    const f = path.join(ROOT, spec.file);
    if (!fs.existsSync(f)) {
      fail.push(`어댑터 deny 계약: ${spec.file} 부재 (${adapter})`);
      continue;
    }
    const text = fs.readFileSync(f, 'utf8');
    const missing = (spec.must_mention ?? []).filter((s) => !text.includes(s));
    if (missing.length) fail.push(`어댑터 deny 계약 소실: ${adapter} (${spec.file})에 없음 → ${missing.join(' · ')}`);
    for (const forbidden of spec.must_not_mention ?? []) {
      if (text.includes(forbidden)) fail.push(`어댑터 금지 문구 등장: ${adapter} → "${forbidden}"`);
    }
    results.push(`${adapter} ${missing.length ? '❌' : '✅'}`);
  }
  return results;
}

// ── 실행 ───────────────────────────────────────────────────────────────────
const pinned = fs.existsSync(SURFACE) ? JSON.parse(fs.readFileSync(SURFACE, 'utf8')) : null;
if (!pinned && !UPDATE) {
  console.error('❌ 표면 스냅샷 부재: interactive/provenance/mcp-surface.json');
  console.error('   최초 생성: node interactive/scripts/smoke-mcp.mjs --update');
  process.exit(1);
}

const expositions = only ? [only] : ['default', 'readonly'];
const measured = {};
for (const e of expositions) {
  try {
    measured[e] = await probe(e === 'default' ? null : e);
  } catch (err) {
    fail.push(`${e} exposition 기동 실패: ${err.message}`);
  }
}

if (UPDATE) {
  const doc = {
    _: 'MCP 도구 표면 고정 스냅샷 (S3 · D-027 로드맵 §9.4). smoke-mcp.mjs가 이것에 대해 assert한다.',
    _contract:
      '도구 표면이 바뀌면 게이트가 실패한다. 의도된 변경일 때만 --update로 갱신하고 사유를 커밋 메시지에 남긴다. 수가 아니라 **이름 집합**을 고정한다.',
    _measured: '2026-07-16 · 프로파일 미설정(inspection-only) · SAP 무접속',
    classes: {
      _: '이름 규칙만으로는 오분류된다(RuntimeListDumps는 읽기인데 Run으로 시작, RuntimeCreateProfilerTraceParameters는 Runtime인데 Create). 실행/서버제어는 명시 열거하고 mutation은 접두어에서 그 둘을 뺀다.',
      execution: EXECUTION,
      server_control: SERVER_CONTROL,
      row_data: ROW_DATA,
      mutation_prefix_re: MUTATION_RE.source,
    },
    expositions: {},
    findings: {
      readonly_is_not_execution_free:
        'readonly에도 RuntimeRunClassWithProfiling(ABAP 실행)과 RuntimeCreateProfilerTraceParameters가 노출된다 — readonly라는 이름의 인상과 다르다. 리뷰어는 P0/P1만 수행해야 하는데(AGENTS) exposition이 그것을 강제하지 않는다. 차단은 에이전트/어댑터 층에만 있다. sap_mutation_boundary=unverified와 정합하는 실측.',
      exposition_does_not_gate_row_data:
        'GetTableContents/GetSqlQuery는 default·readonly **양쪽 모두** 노출된다. 즉 P2는 exposition으로 막히지 않는다. 기계적 차단면은 어댑터 deny(Codex disabled_tools / Antigravity excludeTools / Claude allow-list 제외)뿐이고 그 위에 호출별 사람 승인이 있다.',
      run_program_vs_run_class:
        'RuntimeRunProgramWithProfiling은 inspection-only 155에 없고 RuntimeRunClassWithProfiling은 있다. 상류 비대칭으로 보이며 이 스냅샷은 실측을 그대로 고정한다.',
    },
    adapter_deny: {
      _: 'row-data 2종에 대한 어댑터별 기계 차단 계약이 문서 표면에서 사라지면 게이트가 잡는다.',
      codex: {
        file: 'adapters/codex/README.md',
        mechanism: 'disabled_tools (스키마가 인식·집행 — 실측)',
        must_mention: ['disabled_tools', 'GetTableContents', 'GetSqlQuery'],
      },
      antigravity: {
        file: 'adapters/antigravity/README.md',
        mechanism: 'excludeTools (권장 — 현 버전 실증 전 P2 unsupported)',
        must_mention: ['excludeTools', 'GetTableContents', 'GetSqlQuery'],
      },
      claude: {
        file: 'adapters/claude/permissions-template.json',
        mechanism: 'allow-list에서 row-data 의도적 제외 → 호출별 승인',
        must_mention: ['GetTableContents/GetSqlQuery는 의도적으로 제외'],
        must_not_mention: [`${NS}GetTableContents`, `${NS}GetSqlQuery`],
      },
    },
  };
  for (const [e, names] of Object.entries(measured)) {
    const byClass = {};
    for (const n of names) (byClass[classify(n)] ??= []).push(n);
    doc.expositions[e] = {
      count: names.length,
      names_sha256: sha256(names.join('\n')),
      class_counts: Object.fromEntries(Object.entries(byClass).map(([k, v]) => [k, v.length])),
      execution_exposed: byClass.execution ?? [],
      row_data_exposed: byClass['row-data'] ?? [],
      names,
    };
  }
  fs.mkdirSync(path.dirname(SURFACE), { recursive: true });
  fs.writeFileSync(SURFACE, JSON.stringify(doc, null, 2) + '\n');
  console.log('표면 스냅샷 갱신: interactive/provenance/mcp-surface.json');
  for (const [e, d] of Object.entries(doc.expositions)) {
    console.log(`  ${e.padEnd(9)} ${String(d.count).padStart(3)} tools · ${JSON.stringify(d.class_counts)}`);
  }
  console.log('\n⚠️ 의도된 변경인지 확인하고 사유를 커밋 메시지에 남길 것.');
  process.exit(0);
}

// ── assert ─────────────────────────────────────────────────────────────────
// ⓪ 분류 정의의 **정본은 이 코드**다. 스냅샷의 classes 블록은 그 기록일 뿐이며,
//    둘이 어긋나면 스냅샷이 낡았거나 게이트를 우회하려 한 것이다. 정본을 JSON에 두면
//    mutation 도구를 execution 목록에 슬쩍 넣어 "mutation 0"을 통과시킬 수 있다 —
//    분류를 바꾸려면 코드 변경(=리뷰에 보이는 변경)을 거치게 한다.
{
  const c = pinned.classes ?? {};
  const eq = (a, b) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
  if (!eq(c.execution, EXECUTION)) fail.push('클래스 정의 불일치: classes.execution이 코드 정본과 다름');
  if (!eq(c.server_control, SERVER_CONTROL)) fail.push('클래스 정의 불일치: classes.server_control이 코드 정본과 다름');
  if (!eq(c.row_data, ROW_DATA)) fail.push('클래스 정의 불일치: classes.row_data가 코드 정본과 다름');
  if (c.mutation_prefix_re !== MUTATION_RE.source)
    fail.push('클래스 정의 불일치: classes.mutation_prefix_re가 코드 정본과 다름');
}

// ⓪' 같은 이유로 **금지 문구의 네임스페이스도 코드 정본(NS)과 대조**한다. 스냅샷의
//     must_not_mention이 낡은 접두어를 담고 있으면 "그 문자열이 파일에 없다"는 검사가
//     항상 참이 되어 **부정 단언이 조용히 공허해진다** — 실데이터 2종 차단이 그 대상이라
//     실패해도 초록으로 보인다. D-041 개명에서 실제로 발생할 뻔했다(리뷰 M-3).
{
  const stale = Object.entries(pinned.adapter_deny ?? {})
    .filter(([a]) => !a.startsWith('_'))
    .flatMap(([a, spec]) =>
      (spec.must_not_mention ?? [])
        .filter((s) => s.startsWith('mcp__plugin_') && !s.startsWith(NS))
        .map((s) => `${a} → "${s}"`)
    );
  if (stale.length)
    fail.push(
      `금지 문구가 현 네임스페이스(${NS})와 불일치 — 부정 단언이 공허해짐: ${stale.join(' · ')} (--update로 재생성할 것)`
    );
}

// ⓪'' 리뷰어 차단 계약. agents/sap-reviewer.md의 disallowedTools는 손으로 유지되는데
//     **실패 방향이 fail-open**이다: 접두어가 낡으면 84개 차단이 전부 죽은 문자열이 되어
//     리뷰어가 Create/Update/Delete/Activate/ReleaseTransport를 되찾는다(AGENTS "reviewers
//     perform no transport operation" 저촉). 권한 템플릿이 틀리면 프롬프트가 늘 뿐이지만
//     이건 조용히 열린다 — 그래서 이름 규약과 계약 생존을 함께 assert한다(리뷰 M-2).
{
  const f = path.join(ROOT, 'agents', 'sap-reviewer.md');
  if (!fs.existsSync(f)) fail.push('리뷰어 차단 계약: agents/sap-reviewer.md 부재');
  else {
    const text = fs.readFileSync(f, 'utf8');
    const tools = [...text.matchAll(/mcp__plugin_[A-Za-z0-9_-]+_sap__(\w+)/g)];
    const wrongNs = [...new Set(tools.filter((m) => !m[0].startsWith(NS)).map((m) => m[0]))];
    if (wrongNs.length)
      fail.push(
        `리뷰어 차단 계약이 낡은 네임스페이스 사용 — 차단이 무효(fail-open): ${wrongNs.slice(0, 3).join(' · ')}${wrongNs.length > 3 ? ` 외 ${wrongNs.length - 3}건` : ''}`
      );
    const denied = new Set(tools.map((m) => m[1]));
    const MUST_DENY = ['ReleaseTransport', 'CreateTransport', 'ActivateObjects', 'UpdateClass', 'DeleteClass'];
    const missing = MUST_DENY.filter((t) => !denied.has(t));
    if (missing.length) fail.push(`리뷰어 차단 계약 소실: ${missing.join(' · ')} 가 disallowedTools에 없음`);
  }
}

for (const [e, names] of Object.entries(measured)) {
  const pin = pinned.expositions?.[e];
  if (!pin) {
    fail.push(`스냅샷에 exposition '${e}' 없음 — --update로 등재할 것`);
    continue;
  }
  // ①' 스냅샷 자체의 내부 정합: names와 names_sha256이 어긋나면 실패 진단이 거짓말을 한다
  //     (해시는 맞는데 names만 조작돼 있으면 아래 added/removed 목록이 허구가 된다).
  if (sha256((pin.names ?? []).join('\n')) !== pin.names_sha256)
    fail.push(`${e} 스냅샷 내부 불일치: names와 names_sha256이 어긋남 — --update로 재생성할 것`);
  if ((pin.names ?? []).length !== pin.count)
    fail.push(`${e} 스냅샷 내부 불일치: count(${pin.count})와 names 길이(${(pin.names ?? []).length})가 어긋남`);

  // ② 이름 집합 고정 (수가 아니라 이름)
  if (sha256(names.join('\n')) !== pin.names_sha256) {
    const added = names.filter((n) => !pin.names.includes(n));
    const removed = pin.names.filter((n) => !names.includes(n));
    fail.push(
      `${e} 도구 표면 변경 (${pin.count} → ${names.length})` +
        (added.length ? `\n      추가: ${added.join(', ')}` : '') +
        (removed.length ? `\n      삭제: ${removed.join(', ')}` : '') +
        '\n      의도된 변경이면: node interactive/scripts/smoke-mcp.mjs --update'
    );
  }

  const byClass = {};
  for (const n of names) (byClass[classify(n)] ??= []).push(n);

  if (e === 'readonly') {
    // ③ readonly mutation 0
    const mut = byClass.mutation ?? [];
    if (mut.length) fail.push(`readonly에 mutation 도구 ${mut.length}개 노출: ${mut.slice(0, 5).join(', ')}`);

    // ④ readonly 실행 도구는 사전 등재분과 정확히 일치
    const exec = (byClass.execution ?? []).slice().sort();
    const allowed = (pin.execution_exposed ?? []).slice().sort();
    const unexpected = exec.filter((n) => !allowed.includes(n));
    const gone = allowed.filter((n) => !exec.includes(n));
    if (unexpected.length) fail.push(`readonly에 미등재 실행 도구 유입: ${unexpected.join(', ')}`);
    if (gone.length) warn.push(`readonly 실행 도구가 사라짐(개선일 수 있음 — 확인 후 --update): ${gone.join(', ')}`);
  }

  // ⑤ row-data 노출 상태가 기대대로
  const row = (byClass['row-data'] ?? []).slice().sort();
  const rowPin = (pin.row_data_exposed ?? []).slice().sort();
  if (JSON.stringify(row) !== JSON.stringify(rowPin))
    fail.push(`${e} row-data 노출 상태 변경: 기대 [${rowPin}] · 실제 [${row}]`);
}

// ⑥ 어댑터 deny 계약
const denyLines = checkAdapterDeny(pinned.adapter_deny ?? {});

// ── 보고 ───────────────────────────────────────────────────────────────────
for (const [e, names] of Object.entries(measured)) {
  const byClass = {};
  for (const n of names) (byClass[classify(n)] ??= []).push(n);
  const c = (k) => (byClass[k] ?? []).length;
  console.log(
    `${e.padEnd(9)} ${String(names.length).padStart(3)} tools · read ${c('read')} · mutation ${c('mutation')} · 실행 ${c(
      'execution'
    )} · row-data ${c('row-data')}`
  );
}
console.log(`어댑터 deny : ${denyLines.join(' · ')}`);
if (measured.readonly) {
  const exec = measured.readonly.filter((n) => EXECUTION.includes(n));
  console.log(`\nℹ readonly는 실행 무풍지대가 아니다 — 등재된 실행 도구 ${exec.length}개 노출: ${exec.join(', ')}`);
  console.log('ℹ row-data는 양쪽 exposition 모두 노출 — P2 차단은 어댑터 deny + 호출별 사람 승인이 담당');
}
for (const w of warn) console.log(`\n⚠ ${w}`);

if (fail.length) {
  console.log(`\n❌ 표면 계약 위반 ${fail.length}건:`);
  for (const f of fail) console.log('  - ' + f);
  process.exit(1);
}
console.log('\n✅ 도구 표면 계약 통과 — 이름 집합 고정 · readonly mutation 0 · 실행/row-data 등재분 일치 · 어댑터 deny 유지');
