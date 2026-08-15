#!/usr/bin/env node
// compare-baseline — 두 판정 집합을 맞대어 **갈림 목록**을 낸다.
//
// 뒤의 코퍼스 대조 게이트가 이것을 소비한다: 「새 CLI 판정 vs 기준 파일」을 넣으면
// 갈림이 나오고, 갈림 0이 diff 0의 기계 정의다.
//
// 사용:
//   node harness/compare-baseline.mjs <기준> <대상> [--json]
//     · 두 인자가 디렉터리면 lint/analyze/parse 세 표면을 한 번에 맞댄다.
//     · 파일이면 그 한 표면만 맞댄다.
//   exit 0 = 갈림 없음 · 1 = 갈림 있음 · 2 = 사용·입력 오류
//
// 판정 형식은 `record-baseline.mjs`가 쓰는 것과 같다(RECORDING.md §형식).

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SURFACES } from './corpus.mjs';

// --- 표면별 대조 규칙 ---------------------------------------------------

// 표면마다 「무엇이 판정인가」가 다르다. lint·analyze는 순서 없는 다중집합이고
// parse는 순서가 곧 판정인 시퀀스다.
const SPEC = {
  lint: { kind: 'multiset', tuple: ['rule', 'line', 'col', 'severity'], list: 'findings', scalars: ['exit_code'] },
  analyze: { kind: 'multiset', tuple: ['rule', 'line', 'severity', 'category'], list: 'findings', scalars: ['rules_applied'] },
  parse: { kind: 'sequence', tuple: ['type', 'line'], list: 'statements', scalars: [] },
};

const MAX_SEQ_DIVERGENCES = 50; // 시퀀스가 통째로 어긋나면 목록이 폭발한다 — 앞쪽만 보인다.

function key(spec, entry) {
  return spec.tuple.map((f) => String(entry?.[f])).join('|');
}

function label(spec, entry) {
  return spec.tuple.map((f) => `${f}=${entry?.[f]}`).join(' ');
}

/**
 * 한 표면의 두 판정 문서를 맞댄다.
 * @returns {{kind: string, file?: string, detail: string}[]} 갈림 목록 (빈 배열 = 동일)
 */
export function compareSurface(surface, expected, actual) {
  const spec = SPEC[surface];
  if (!spec) throw new Error(`알 수 없는 표면: ${surface}`);
  const out = [];

  for (const [name, doc] of [['기준', expected], ['대상', actual]]) {
    if (doc?.surface !== surface) {
      out.push({ kind: 'surface_mismatch', detail: `${name} 문서의 surface가 '${doc?.surface}' — '${surface}'이어야 한다` });
    }
    if (!doc?.files || typeof doc.files !== 'object') {
      out.push({ kind: 'malformed', detail: `${name} 문서에 files 객체가 없다` });
    }
  }
  if (out.length > 0) return out;

  const expFiles = Object.keys(expected.files).sort();
  const actFiles = Object.keys(actual.files).sort();
  const actSet = new Set(actFiles);
  const expSet = new Set(expFiles);

  for (const f of expFiles) {
    if (!actSet.has(f)) out.push({ kind: 'file_missing', file: f, detail: '대상에 이 파일의 판정이 없다' });
  }
  for (const f of actFiles) {
    if (!expSet.has(f)) out.push({ kind: 'file_unexpected', file: f, detail: '기준에 없는 파일이 대상에 있다' });
  }

  for (const f of expFiles) {
    if (!actSet.has(f)) continue;
    const e = expected.files[f];
    const a = actual.files[f];

    for (const s of spec.scalars) {
      if (e[s] !== a[s]) {
        out.push({ kind: 'scalar_mismatch', file: f, detail: `${s}: 기준 ${e[s]} ≠ 대상 ${a[s]}` });
      }
    }

    const eList = e[spec.list] ?? [];
    const aList = a[spec.list] ?? [];

    if (spec.kind === 'multiset') {
      const counts = new Map();
      for (const item of eList) counts.set(key(spec, item), (counts.get(key(spec, item)) ?? 0) + 1);
      for (const item of aList) counts.set(key(spec, item), (counts.get(key(spec, item)) ?? 0) - 1);
      // 원본 항목을 붙여 사람이 읽을 수 있게 한다.
      const sample = new Map();
      for (const item of [...eList, ...aList]) if (!sample.has(key(spec, item))) sample.set(key(spec, item), item);
      for (const k of [...counts.keys()].sort()) {
        const n = counts.get(k);
        if (n === 0) continue;
        const what = label(spec, sample.get(k));
        out.push(
          n > 0
            ? { kind: 'finding_missing', file: f, detail: `기준에만 ${n}건: ${what}` }
            : { kind: 'finding_unexpected', file: f, detail: `대상에만 ${-n}건: ${what}` },
        );
      }
    } else {
      if (eList.length !== aList.length) {
        out.push({ kind: 'sequence_length_mismatch', file: f, detail: `길이: 기준 ${eList.length} ≠ 대상 ${aList.length}` });
      }
      let shown = 0;
      for (let i = 0; i < Math.min(eList.length, aList.length); i += 1) {
        if (key(spec, eList[i]) === key(spec, aList[i])) continue;
        if (shown >= MAX_SEQ_DIVERGENCES) {
          out.push({ kind: 'sequence_truncated', file: f, detail: `이후 갈림은 생략 (표시 상한 ${MAX_SEQ_DIVERGENCES})` });
          break;
        }
        shown += 1;
        out.push({
          kind: 'sequence_mismatch',
          file: f,
          detail: `#${i}: 기준 [${label(spec, eList[i])}] ≠ 대상 [${label(spec, aList[i])}]`,
        });
      }
    }
  }

  return out;
}

// --- 입출력 ------------------------------------------------------------

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** 디렉터리(3표면) 또는 파일(1표면)을 맞댄다. `{surface, divergences}[]`. */
export function compareAny(expectedPath, actualPath) {
  if (isDir(expectedPath) !== isDir(actualPath)) {
    throw new Error('한쪽만 디렉터리다 — 둘 다 디렉터리이거나 둘 다 파일이어야 한다');
  }
  if (isDir(expectedPath)) {
    return SURFACES.map((surface) => ({
      surface,
      divergences: compareSurface(
        surface,
        readJson(join(expectedPath, `${surface}.json`)),
        readJson(join(actualPath, `${surface}.json`)),
      ),
    }));
  }
  const expected = readJson(expectedPath);
  const actual = readJson(actualPath);
  const surface = expected.surface;
  if (!SURFACES.includes(surface)) throw new Error(`기준 문서의 surface가 알 수 없는 값이다: ${surface}`);
  return [{ surface, divergences: compareSurface(surface, expected, actual) }];
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const paths = args.filter((a) => a !== '--json');
  if (paths.length !== 2) {
    console.error('사용: node harness/compare-baseline.mjs <기준> <대상> [--json]');
    process.exit(2);
  }

  let results;
  try {
    results = compareAny(paths[0], paths[1]);
  } catch (e) {
    console.error(`[compare] ✗ ${e.message}`);
    process.exit(2);
  }

  const total = results.reduce((n, r) => n + r.divergences.length, 0);
  if (asJson) {
    console.log(JSON.stringify({ total, results }, null, 2));
  } else {
    for (const { surface, divergences } of results) {
      if (divergences.length === 0) {
        console.log(`[compare] ✓ ${surface}: 갈림 없음`);
        continue;
      }
      console.log(`[compare] ✗ ${surface}: 갈림 ${divergences.length}건`);
      for (const d of divergences) {
        console.log(`  - [${d.kind}] ${d.file ? `${d.file}: ` : ''}${d.detail}`);
      }
    }
    console.log(`[compare] 갈림 합계 ${total}건`);
  }
  process.exit(total === 0 ? 0 : 1);
}

// 직접 실행일 때만 CLI로 동작한다 (import 시에는 모듈로만 쓰인다).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
