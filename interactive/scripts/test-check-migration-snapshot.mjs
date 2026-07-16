#!/usr/bin/env node
// check-migration-snapshot.mjs 음성시험 — 게이트가 '통과만 하는 장식'이 아님을 증명한다.
// 실제 provenance를 임시 디렉터리로 복사해 변조하고, 게이트가 기대 exit code로 거부하는지 본다.
// 원본 provenance는 건드리지 않는다. SAP 무접촉 · 외부 원본 무접촉.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const GATE = path.join(HERE, 'check-migration-snapshot.mjs');

let pass = 0;
let fail = 0;

// 변조 스냅샷만 임시 디렉터리에 쓰고 --prov로 먹인다. 목적지 자산은 실제 트리를
// 그대로 쓰므로(복사 없음) 케이스당 비용이 JSON 2개 쓰기로 끝난다.
function runGateWith(mutate) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migsnap-'));
  try {
    const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'provenance', 'sc4sap-public-source.json'), 'utf8'));
    const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'provenance', 'migration-map.json'), 'utf8'));
    mutate(src, map);
    fs.writeFileSync(path.join(tmp, 'sc4sap-public-source.json'), JSON.stringify(src, null, 2) + '\n');
    fs.writeFileSync(path.join(tmp, 'migration-map.json'), JSON.stringify(map, null, 2) + '\n');
    try {
      const out = execFileSync('node', [GATE, '--prov', tmp], { encoding: 'utf8' });
      return { code: 0, out };
    } catch (e) {
      return { code: e.status, out: (e.stdout ?? '') + (e.stderr ?? '') };
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function t(name, mutate, expectCode, expectText) {
  const { code, out } = runGateWith(mutate);
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

console.log('check-migration-snapshot 음성시험\n');

console.log('무변조 기준선');
t('변조 없으면 통과(exit 0)', () => {}, 0, '이식 provenance 통과');

console.log('\nprivate 봉인 (exit 3 = 치명)');
t(
  'inventory에 private 경로 유입 → exit 3',
  (src) => src.inventory.entries.push({ path: 'private/secret-client.md', blob: 'f'.repeat(40) }),
  3,
  'private 경로'
);
t(
  'transform source list에 private 경로 유입 → exit 3',
  (src, map) => {
    const r = map.rules.find((x) => x.class === 'transform' && x.sources);
    r.sources.push('private/leak.md');
  },
  3,
  'private 경로'
);
t(
  'allowlist에 private root 추가 → 거부',
  (src) => src.public_root_allowlist.push('private'),
  1,
  'private root 포함'
);
t('private_roots_never_read 선언 삭제 → 거부', (src) => (src.private_roots_never_read = []), 1, '선언이 비어 있음');

console.log('\npin 정합');
t('pinned_commit이 SHA가 아님 → 거부', (src) => (src.source.pinned_commit = 'HEAD'), 1, '40자 SHA가 아님');
t(
  'map과 source의 pin 불일치 → 거부',
  (src, map) => (map.pinned_commit = '0'.repeat(40)),
  1,
  'pin 불일치'
);

console.log('\ninventory 무결성');
t(
  'inventory hash 변조 → 거부',
  (src) => (src.inventory.hash = '0'.repeat(64)),
  1,
  'inventory hash 불일치'
);
t(
  'inventory 엔트리 blob 변조 → hash 재계산 불일치로 거부',
  (src) => (src.inventory.entries[0].blob = '0'.repeat(40)),
  1,
  'inventory hash 불일치'
);
t(
  'inventory count 변조 → 거부',
  (src) => (src.inventory.count = 1),
  1,
  'inventory count 불일치'
);

console.log('\n커버리지 (구 게이트 실질 보존)');
t(
  '규칙을 지워 원본 경로 미분류 발생 → 거부',
  (src, map) => (map.rules = map.rules.filter((r) => r.pattern !== 'configs/**')),
  1,
  '미분류'
);
t(
  'source_matches 위조 → 재계산 불일치로 거부',
  (src, map) => (map.rules.find((r) => r.pattern === 'configs/**').source_matches = 999),
  1,
  'source_matches 불일치'
);
t(
  'expect_zero 규칙(private/**)에 매칭 발생 → 거부',
  (src, map) => {
    // private/** 가 실제로 무언가를 잡으면 곧 private 유출이다. exit 3이 먼저 걸리지 않도록
    // private이 아닌 경로를 private/** 패턴이 잡도록 규칙 패턴만 넓힌다.
    map.rules.find((r) => r.pattern === 'private/**').pattern = 'configs/**';
  },
  1,
  'expect_zero 규칙에 매칭 발생'
);

console.log('\n목적지 드리프트 (구 게이트에 없던 검사)');
t(
  '목적지 내용 해시 변조 → 이식 자산 드리프트 검출',
  (src, map) => {
    const r = map.rules.find((x) => (x.targets ?? []).some((t) => !t.missing && t.kind === 'tree'));
    r.targets.find((t) => t.kind === 'tree').sha256 = '0'.repeat(64);
  },
  1,
  '이식 자산 드리프트'
);
t(
  '목적지 종류 변경(tree→file) → 거부',
  (src, map) => {
    const r = map.rules.find((x) => (x.targets ?? []).some((t) => !t.missing && t.kind === 'tree'));
    r.targets.find((t) => t.kind === 'tree').kind = 'file';
  },
  1,
  '목적지 종류 변경'
);
t(
  '기록에 없던 목적지 부재 표시 → 거부',
  (src, map) => {
    const r = map.rules.find((x) => (x.targets ?? []).some((t) => !t.missing));
    const tgt = r.targets.find((t) => !t.missing);
    delete tgt.sha256;
    tgt.missing = true;
    r.deferred = false;
  },
  1,
  '목적지 부재'
);

console.log('\n스냅샷 부재');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migsnap-none-'));
  let code = 0;
  let out = '';
  try {
    out = execFileSync('node', [GATE, '--prov', tmp], { encoding: 'utf8' });
  } catch (e) {
    code = e.status;
    out = (e.stdout ?? '') + (e.stderr ?? '');
  }
  if (code === 1 && out.includes('스냅샷 부재')) {
    console.log('  ✅ provenance 파일 없으면 fail-closed(exit 1)');
    pass++;
  } else {
    console.log(`  ❌ provenance 파일 없을 때 fail-closed 실패 (exit ${code})`);
    fail++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass + fail}건 중 ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
