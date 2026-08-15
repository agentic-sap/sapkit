#!/usr/bin/env node
// test-corpus-gate — 코퍼스 대조 게이트(`gates/corpus-baseline.mjs`)의 **음성시험**.
//
// 통과만 확인하면 게이트가 늘 "같다"고 답해도 아무도 모른다. 그러면 게이트는 green인
// 채 아무것도 지키지 않는 장식이 된다(`test-compare-baseline.mjs`와 같은 규율).
//
// 여기서 어긋뜨리는 것은 **게이트의 두 입력**이다:
//   ⓐ 판정 입력(코퍼스 파일 내용) — 판정이 달라지면 잡는가
//   ⓑ 코퍼스 구성(기준에 없는 파일) — 기준 없는 픽스처가 몰래 들어오면 잡는가
//   ⓒ 코퍼스 EOL(CRLF 혼입) — 행·열 판정이 조용히 갈릴 입력을 잡는가
//   ⓓ 낡은 `dist/` — 고친 소스를 대조하지 않고 green을 내지 않는가
//
// 기준 파일 자체는 건드리지 않는다 — 구 vsp 은퇴 뒤 재채록이 불가능한 원본이다.
//
// exit 0 = 전부 통과 · 1 = 실패

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLI_ROOT, corpusPath, listCorpusFiles } from './corpus.mjs';

const GATE = join(CLI_ROOT, 'gates', 'corpus-baseline.mjs');

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

function runGate() {
  const r = spawnSync(process.execPath, [GATE], { cwd: CLI_ROOT, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

// --- 0. 손대지 않은 상태 → exit 0 (거짓 실패 방어) ----------------------

{
  const r = runGate();
  check('손대지 않은 코퍼스 → exit 0', r.code === 0, `exit ${r.code}\n${r.out.slice(0, 600)}`);
}

// --- ⓐ 판정 입력을 어긋뜨린다 -------------------------------------------

{
  const victim = listCorpusFiles()[0];
  const path = corpusPath(victim);
  const original = readFileSync(path); // 바이트 그대로 — 복원도 바이트 그대로
  try {
    // 130자를 넘는 줄 하나. lint(상한 120)·analyze(상한 130) 양쪽에서 line_length가
    // 늘고, parse에는 문장이 하나 더 붙는다 — 세 표면이 동시에 갈린다.
    const long = `WRITE '${'a'.repeat(140)}'.`;
    writeFileSync(path, Buffer.concat([original, Buffer.from(`${long}\n`, 'utf8')]));

    const r = runGate();
    check('코퍼스 한 줄 추가 → exit 1', r.code === 1, `exit ${r.code}`);
    check('갈린 파일 이름을 지목한다', r.out.includes(victim), r.out.slice(0, 600));
    check('세 표면이 모두 갈림을 보고한다', ['lint', 'analyze', 'parse'].every((s) => r.out.includes(`✗ ${s}:`)), r.out.slice(0, 900));
  } finally {
    writeFileSync(path, original);
  }
  check('복원 뒤 다시 exit 0', runGate().code === 0);
}

// --- ⓑ 기준 없는 픽스처가 코퍼스에 들어온 경우 --------------------------

{
  const stray = corpusPath('synthetic/zz_stray_probe.abap');
  try {
    writeFileSync(stray, 'REPORT zz_stray_probe.\nWRITE lv_a.\n', 'utf8');
    const r = runGate();
    check('기준 없는 파일 추가 → exit 1', r.code === 1, `exit ${r.code}`);
    check('file_unexpected로 지목한다', r.out.includes('file_unexpected'), r.out.slice(0, 600));
  } finally {
    rmSync(stray, { force: true });
  }
}

// --- ⓒ CRLF 혼입 --------------------------------------------------------

{
  const stray = corpusPath('synthetic/zz_crlf_probe.abap');
  try {
    writeFileSync(stray, 'REPORT zz_crlf_probe.\r\nWRITE lv_a.\r\n', 'utf8');
    const r = runGate();
    check('CRLF 혼입 → exit 1', r.code === 1, `exit ${r.code}`);
    check('CRLF를 이유로 든다', r.out.includes('CRLF'), r.out.slice(0, 600));
  } finally {
    rmSync(stray, { force: true });
  }
}

// --- ⓓ 낡은 `dist/`를 그대로 쓰지 않는다 --------------------------------

{
  // 판정 코드를 고쳤는데 게이트가 옛 `dist/`를 그대로 쓰면, 고친 코드는 한 번도
  // 대조되지 않은 채 green이 나온다 — 가장 흔한 거짓 통과 경로다. 그래서 **소스를
  // 실제로 고쳐** 게이트가 다시 빌드하고 그 판정으로 대조하는지 본다.
  const src = join(CLI_ROOT, 'src', 'rules', 'line-length.ts');
  const original = readFileSync(src);
  const text = original.toString('utf8');
  const from = 'export const DEFAULT_MAX_LINE_LENGTH = 120;';
  const to = 'export const DEFAULT_MAX_LINE_LENGTH = 60;';
  check('시험이 겨냥한 상수가 소스에 있다', text.includes(from));

  try {
    // lint 상한만 낮춘다(analyze는 자기 상한 130을 따로 쓴다) — lint 표면만 갈려야 한다.
    writeFileSync(src, text.replace(from, to), 'utf8');
    const r = runGate();
    check('소스를 고치면 다시 빌드해 갈림을 잡는다 → exit 1', r.code === 1, `exit ${r.code}\n${r.out.slice(0, 600)}`);
    check('갈린 표면이 lint다', r.out.includes('✗ lint:'), r.out.slice(0, 600));
    check('line_length 갈림으로 지목한다', r.out.includes('line_length'), r.out.slice(0, 600));
  } finally {
    writeFileSync(src, original);
  }
  check('소스를 되돌리면 다시 exit 0', runGate().code === 0);
}

// --- 결과 --------------------------------------------------------------

if (failures.length > 0) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`[test-corpus-gate] ✗ ${pass}/${pass + failures.length} 통과`);
  process.exit(1);
}
console.log(`[test-corpus-gate] ✓ ${pass}/${pass} 통과`);
