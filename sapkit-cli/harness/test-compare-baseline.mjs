#!/usr/bin/env node
// test-compare-baseline — 대조기의 **음성시험**.
//
// 통과만 확인하면 대조기가 항상 "같다"고 답해도 아무도 모른다. 그러면 뒤의 코퍼스
// 대조 게이트는 늘 green인 채 아무것도 지키지 않는 장식이 된다. 그래서 여기서는
// **일부러 어긋난 입력**을 넣어 갈림을 잡는지 확인한다.
//
// 앞부분은 단위 수준(표면별 갈림 종류), 뒷부분은 진짜 기준 파일을 변조한 사본으로
// CLI를 돌려 exit 1이 나오는지 본다.
//
// exit 0 = 전부 통과 · 1 = 실패

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE_DIR } from './corpus.mjs';
import { compareSurface } from './compare-baseline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

function kinds(divergences) {
  return [...new Set(divergences.map((d) => d.kind))].sort();
}

// --- 표본 문서 ----------------------------------------------------------

const lintDoc = (files) => ({ schema: 1, surface: 'lint', files });
const analyzeDoc = (files) => ({ schema: 1, surface: 'analyze', files });
const parseDoc = (files) => ({ schema: 1, surface: 'parse', files });

const baseLint = {
  'a.abap': { exit_code: 1, findings: [{ rule: 'empty_statement', line: 4, col: 1, severity: 'Error' }] },
  'b.abap': { exit_code: 0, findings: [] },
};

// --- 1. 같은 입력이면 갈림 0 (거짓 양성 방어) ---------------------------

check('동일 입력 → 갈림 0', compareSurface('lint', lintDoc(baseLint), lintDoc(baseLint)).length === 0);

// --- 2. lint: 발견이 사라짐 / 늘어남 / 값이 바뀜 -------------------------

{
  const actual = structuredClone(baseLint);
  actual['a.abap'].findings = [];
  const d = compareSurface('lint', lintDoc(baseLint), lintDoc(actual));
  check('lint 발견 소실을 잡는다', kinds(d).includes('finding_missing'), JSON.stringify(kinds(d)));
}
{
  const actual = structuredClone(baseLint);
  actual['b.abap'].findings.push({ rule: 'double_space', line: 2, col: 3, severity: 'Warning' });
  const d = compareSurface('lint', lintDoc(baseLint), lintDoc(actual));
  check('lint 없던 발견을 잡는다', kinds(d).includes('finding_unexpected'), JSON.stringify(kinds(d)));
}
{
  // 행이 1 어긋난 것도 갈림이다 — 규칙·건수만 맞으면 통과시키는 대조기는 쓸모가 없다.
  const actual = structuredClone(baseLint);
  actual['a.abap'].findings[0].line = 5;
  const d = compareSurface('lint', lintDoc(baseLint), lintDoc(actual));
  check('lint 행 어긋남을 잡는다', d.length === 2 && kinds(d).join() === 'finding_missing,finding_unexpected', JSON.stringify(d));
}
{
  const actual = structuredClone(baseLint);
  actual['a.abap'].findings[0].col = 9;
  check('lint 열 어긋남을 잡는다', compareSurface('lint', lintDoc(baseLint), lintDoc(actual)).length > 0);
}
{
  const actual = structuredClone(baseLint);
  actual['a.abap'].findings[0].severity = 'Warning';
  check('lint 심각도 어긋남을 잡는다', compareSurface('lint', lintDoc(baseLint), lintDoc(actual)).length > 0);
}

// --- 3. lint: exit code (구 계약의 핵 — 여기가 뚫리면 계약이 무검증이 된다) ---

{
  const actual = structuredClone(baseLint);
  actual['a.abap'].exit_code = 0;
  const d = compareSurface('lint', lintDoc(baseLint), lintDoc(actual));
  check('lint exit code 어긋남을 잡는다', kinds(d).includes('scalar_mismatch'), JSON.stringify(kinds(d)));
}

// --- 4. 중복 보존(다중집합) — 건수가 줄어도 잡는가 ----------------------

{
  const twice = {
    'c.abap': {
      exit_code: 0,
      findings: [
        { rule: 'obsolete_statement', line: 7, col: 1, severity: 'Warning' },
        { rule: 'obsolete_statement', line: 7, col: 1, severity: 'Warning' },
      ],
    },
  };
  const once = structuredClone(twice);
  once['c.abap'].findings.pop();
  const d = compareSurface('lint', lintDoc(twice), lintDoc(once));
  check('같은 튜플 2건 → 1건 축소를 잡는다', d.length === 1 && d[0].kind === 'finding_missing' && d[0].detail.includes('1건'), JSON.stringify(d));
}

// --- 5. 파일 누락 / 잉여 ------------------------------------------------

{
  const actual = structuredClone(baseLint);
  delete actual['b.abap'];
  const d = compareSurface('lint', lintDoc(baseLint), lintDoc(actual));
  check('파일 누락을 잡는다', kinds(d).includes('file_missing'), JSON.stringify(kinds(d)));
}
{
  const actual = structuredClone(baseLint);
  actual['z.abap'] = { exit_code: 0, findings: [] };
  const d = compareSurface('lint', lintDoc(baseLint), lintDoc(actual));
  check('없어야 할 파일을 잡는다', kinds(d).includes('file_unexpected'), JSON.stringify(kinds(d)));
}

// --- 6. analyze: category·rulesApplied ----------------------------------

{
  const exp = { 'a.abap': { rules_applied: 13, findings: [{ rule: 'select_star', line: 7, severity: 'medium', category: 'performance' }] } };
  const act = structuredClone(exp);
  act['a.abap'].findings[0].category = 'quality';
  check('analyze category 어긋남을 잡는다', compareSurface('analyze', analyzeDoc(exp), analyzeDoc(act)).length > 0);

  const act2 = structuredClone(exp);
  act2['a.abap'].rules_applied = 8;
  const d = compareSurface('analyze', analyzeDoc(exp), analyzeDoc(act2));
  check('analyze rulesApplied 어긋남을 잡는다', kinds(d).includes('scalar_mismatch'), JSON.stringify(kinds(d)));
}

// --- 7. parse: 순서가 곧 판정이다 ---------------------------------------

{
  const exp = { 'a.abap': { statements: [{ type: 'Report', line: 1 }, { type: 'Data', line: 2 }, { type: 'Write', line: 3 }] } };
  const swapped = { 'a.abap': { statements: [{ type: 'Data', line: 2 }, { type: 'Report', line: 1 }, { type: 'Write', line: 3 }] } };
  const d = compareSurface('parse', parseDoc(exp), parseDoc(swapped));
  check('parse 순서 뒤바뀜을 잡는다', d.length === 2 && kinds(d).join() === 'sequence_mismatch', JSON.stringify(d));

  const shorter = { 'a.abap': { statements: exp['a.abap'].statements.slice(0, 2) } };
  const d2 = compareSurface('parse', parseDoc(exp), parseDoc(shorter));
  check('parse 길이 차이를 잡는다', kinds(d2).includes('sequence_length_mismatch'), JSON.stringify(kinds(d2)));

  const retyped = structuredClone(exp);
  retyped['a.abap'].statements[1].type = 'Move';
  check('parse 유형 바뀜을 잡는다', compareSurface('parse', parseDoc(exp), parseDoc(retyped)).length > 0);
}

// --- 8. 표면 자체가 어긋난 문서 -----------------------------------------

{
  const d = compareSurface('lint', lintDoc(baseLint), analyzeDoc({}));
  check('표면 불일치를 잡는다', kinds(d).includes('surface_mismatch'), JSON.stringify(kinds(d)));
}

// --- 9. CLI 종단 시험: 진짜 기준 파일 vs 변조 사본 ----------------------

{
  const tmp = mkdtempSync(join(tmpdir(), 'sapkit-cmp-'));
  try {
    const cli = join(here, 'compare-baseline.mjs');
    const run = (a, b) => spawnSync(process.execPath, [cli, a, b], { encoding: 'utf8' });

    // ⓐ 기준 vs 기준 자신 → exit 0
    const same = run(BASELINE_DIR, BASELINE_DIR);
    check('CLI: 기준 vs 자신 → exit 0', same.status === 0, `exit ${same.status} ${same.stdout}${same.stderr}`);

    // ⓑ 한 발견의 행을 1 밀어 놓은 사본 → exit 1
    for (const surface of ['lint', 'analyze', 'parse']) {
      const doc = JSON.parse(readFileSync(join(BASELINE_DIR, `${surface}.json`), 'utf8'));
      writeFileSync(join(tmp, `${surface}.json`), JSON.stringify(doc, null, 2), 'utf8');
    }
    const lint = JSON.parse(readFileSync(join(tmp, 'lint.json'), 'utf8'));
    const victim = Object.keys(lint.files).find((k) => lint.files[k].findings.length > 0);
    lint.files[victim].findings[0].line += 1;
    writeFileSync(join(tmp, 'lint.json'), JSON.stringify(lint, null, 2), 'utf8');

    const drifted = run(BASELINE_DIR, tmp);
    check('CLI: 변조 사본 → exit 1', drifted.status === 1, `exit ${drifted.status}`);
    check('CLI: 변조된 파일 이름을 지목한다', drifted.stdout.includes(victim), drifted.stdout.slice(0, 400));

    // ⓒ --json 모드도 같은 판정을 낸다
    const asJson = run(BASELINE_DIR, tmp);
    check('CLI: 변조 판정이 재현된다', asJson.status === 1);

    // ⓓ 인자 오용은 갈림(1)이 아니라 사용 오류(2)여야 한다 — 게이트가 둘을 섞으면 안 된다
    const misuse = spawnSync(process.execPath, [cli, BASELINE_DIR], { encoding: 'utf8' });
    check('CLI: 인자 오용 → exit 2', misuse.status === 2, `exit ${misuse.status}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 결과 --------------------------------------------------------------

if (failures.length > 0) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`[test-compare] ✗ ${pass}/${pass + failures.length} 통과`);
  process.exit(1);
}
console.log(`[test-compare] ✓ ${pass}/${pass} 통과`);
