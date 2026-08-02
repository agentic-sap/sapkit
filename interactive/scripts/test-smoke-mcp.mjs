#!/usr/bin/env node
// smoke-mcp.mjs 음성시험 — 표면 게이트가 '통과만 하는 장식'이 아님을 증명한다.
// 실제 스냅샷을 변조해 먹이고 게이트가 거부하는지 본다. 원본 스냅샷은 건드리지 않는다.
// 서버는 실제로 기동하되(진짜 표면을 재므로) readonly 하나만 재서 비용을 줄인다.
// SAP 무접촉 · 프로파일 미설정.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const GATE = path.join(HERE, 'smoke-mcp.mjs');
const REAL = path.join(ROOT, 'provenance', 'mcp-surface.json');

let pass = 0;
let fail = 0;

function runGate(mutate, { exposition = 'readonly', env } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpsurf-'));
  const f = path.join(tmp, 'mcp-surface.json');
  try {
    const doc = JSON.parse(fs.readFileSync(REAL, 'utf8'));
    mutate(doc, tmp);
    fs.writeFileSync(f, JSON.stringify(doc, null, 2) + '\n');
    const args = [GATE, '--surface', f];
    if (exposition) args.push(`--exposition=${exposition}`);
    const opts = { encoding: 'utf8', env: { ...process.env, ...(env ?? {}) } };
    try {
      return { code: 0, out: execFileSync('node', args, opts) };
    } catch (e) {
      return { code: e.status, out: (e.stdout ?? '') + (e.stderr ?? '') };
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// 에이전트 차단 계약(agents/*.md)은 스냅샷 JSON이 아니라 파일에 산다 — 실물 파일을 tmp로
// 복사해 변조하고 SC4SAP_AGENTS_DIR로 게이트를 그쪽으로 겨눈다. 원본은 건드리지 않는다.
function tAgents(name, mutateFiles, expectText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpagents-'));
  try {
    for (const f of fs.readdirSync(path.join(ROOT, 'agents')))
      fs.copyFileSync(path.join(ROOT, 'agents', f), path.join(dir, f));
    mutateFiles(dir);
    t(name, () => {}, 1, expectText, { env: { SC4SAP_AGENTS_DIR: dir } });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function t(name, mutate, expectCode, expectText, opts) {
  const { code, out } = runGate(mutate, opts);
  const codeOk = code === expectCode;
  const textOk = !expectText || out.includes(expectText);
  if (codeOk && textOk) {
    console.log(`  ✅ ${name}`);
    pass++;
  } else {
    console.log(`  ❌ ${name}`);
    if (!codeOk) console.log(`       exit 기대 ${expectCode} / 실제 ${code}`);
    if (!textOk) console.log(`       출력에 "${expectText}" 없음`);
    fail++;
  }
}

console.log('smoke-mcp 표면 게이트 음성시험\n');

console.log('기준선');
t('무변조 readonly → 통과', () => {}, 0, '도구 표면 계약 통과');

console.log('\n도구 이름 집합 고정 (수가 아니라 이름)');
t(
  '스냅샷에서 도구 이름 1개 제거 → 내부 불일치로 검출',
  (d) => {
    d.expositions.readonly.names = d.expositions.readonly.names.filter((n) => n !== 'ReadClass');
    d.expositions.readonly.count = d.expositions.readonly.names.length;
  },
  1,
  'names와 names_sha256이 어긋남'
);
t(
  '이름은 그대로 두고 해시만 변조 → 검출',
  (d) => (d.expositions.readonly.names_sha256 = '0'.repeat(64)),
  1,
  '도구 표면 변경'
);
t(
  '실재하지 않는 도구를 스냅샷에 추가 → 내부 불일치로 검출',
  (d) => {
    d.expositions.readonly.names.push('ZZZNotARealTool');
    d.expositions.readonly.names.sort();
  },
  1,
  'names와 names_sha256이 어긋남'
);
t(
  'names/해시를 짝맞춰 위조해도 → 실측과 달라 표면 변경으로 검출',
  (d) => {
    // 공격자가 내부 정합까지 맞춰도 실측 서버 표면과는 어긋난다.
    const names = d.expositions.readonly.names.filter((n) => n !== 'ReadClass');
    d.expositions.readonly.names = names;
    d.expositions.readonly.count = names.length;
    d.expositions.readonly.names_sha256 = crypto.createHash('sha256').update(names.join('\n')).digest('hex');
  },
  1,
  '추가: ReadClass'
);
t(
  'count만 위조 → 내부 불일치로 검출',
  (d) => (d.expositions.readonly.count = 1),
  1,
  'count(1)와 names 길이'
);

console.log('\nrow-data 노출 상태');
t(
  'row-data가 차단됐다고 거짓 기록 → 실제 노출과 불일치로 검출',
  (d) => (d.expositions.readonly.row_data_exposed = []),
  1,
  'row-data 노출 상태 변경'
);
t(
  'row-data 일부만 기록 → 검출',
  (d) => (d.expositions.readonly.row_data_exposed = ['GetTableContents']),
  1,
  'row-data 노출 상태 변경'
);

console.log('\nreadonly 실행 도구 등재 (readonly는 실행 무풍지대가 아니다)');
t(
  '등재 목록에서 실행 도구를 빼면 → 미등재 실행 도구 유입으로 검출',
  (d) => (d.expositions.readonly.execution_exposed = []),
  1,
  '미등재 실행 도구 유입'
);
console.log('\n분류 정의의 정본은 코드 (JSON 편집으로 게이트를 약화시킬 수 없다)');
t(
  'classes.execution에서 실행 도구를 빼도 → 코드 정본과 불일치로 검출',
  (d) => (d.classes.execution = d.classes.execution.filter((n) => n !== 'RuntimeRunClassWithProfiling')),
  1,
  'classes.execution이 코드 정본과 다름'
);
t(
  'mutation 도구를 execution 목록에 숨겨 mutation 0을 위조 → 검출',
  (d) => d.classes.execution.push('CreateClass'),
  1,
  'classes.execution이 코드 정본과 다름'
);
t(
  'mutation 접두어 규칙을 무력화 → 검출',
  (d) => (d.classes.mutation_prefix_re = '^ZZZ'),
  1,
  'classes.mutation_prefix_re가 코드 정본과 다름'
);

console.log('\n어댑터 deny 계약');
t(
  'deny 계약 파일이 사라지면 → 검출',
  (d) => (d.adapter_deny.codex.file = 'adapters/codex/NOPE.md'),
  1,
  '부재'
);
t(
  'codex README에서 disabled_tools가 사라지면 → 검출',
  (d) => (d.adapter_deny.codex.must_mention = ['disabled_tools', 'ZZZ_NEVER_PRESENT']),
  1,
  'deny 계약 소실'
);
t(
  'claude allow-list에 row-data가 들어오면 → 금지 문구로 검출',
  (d) => (d.adapter_deny.claude.must_not_mention = ['permissions']),
  1,
  '금지 문구 등장'
);

console.log('\n에이전트 차단 계약 (fail-open 방향 — 조용히 열리는 자리)');
tAgents(
  '워커 파일이 사라지면 → 검출',
  (d) => fs.rmSync(path.join(d, 'sap-worker.md')),
  '워커 차단 계약: agents/sap-worker.md 부재'
);
tAgents(
  '워커에서 실데이터 2종(P2) 차단이 빠지면 → 검출',
  (d) => {
    const f = path.join(d, 'sap-worker.md');
    fs.writeFileSync(
      f,
      fs
        .readFileSync(f, 'utf8')
        .replace(/^\s*- mcp__plugin_\w+_sap__(GetTableContents|GetSqlQuery)\r?\n/gm, '')
    );
  },
  '워커 차단 계약 소실'
);
tAgents(
  '워커에서 이송 2종(P4) 차단이 빠지면 → 검출',
  (d) => {
    const f = path.join(d, 'sap-worker.md');
    fs.writeFileSync(
      f,
      fs
        .readFileSync(f, 'utf8')
        .replace(/^\s*- mcp__plugin_\w+_sap__(CreateTransport|ReleaseTransport)\r?\n/gm, '')
    );
  },
  '워커 차단 계약 소실'
);
tAgents(
  '워커 차단 목록이 낡은 네임스페이스면 → 죽은 문자열로 검출',
  (d) => {
    const f = path.join(d, 'sap-worker.md');
    fs.writeFileSync(
      f,
      fs.readFileSync(f, 'utf8').replace(/mcp__plugin_\w+_sap__/g, 'mcp__plugin_sap-agentic-harness_sap__')
    );
  },
  '워커 차단 계약이 낡은 네임스페이스 사용'
);

console.log('\n스냅샷 부재');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpsurf-none-'));
  let code = 0;
  let out = '';
  try {
    out = execFileSync('node', [GATE, '--surface', path.join(tmp, 'nope.json'), '--exposition=readonly'], {
      encoding: 'utf8',
    });
  } catch (e) {
    code = e.status;
    out = (e.stdout ?? '') + (e.stderr ?? '');
  }
  if (code === 1 && out.includes('표면 스냅샷 부재')) {
    console.log('  ✅ 스냅샷 없으면 fail-closed(exit 1)');
    pass++;
  } else {
    console.log(`  ❌ 스냅샷 없을 때 fail-closed 실패 (exit ${code})`);
    fail++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass + fail}건 중 ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
