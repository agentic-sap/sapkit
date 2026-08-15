#!/usr/bin/env node
// check-baseline-coverage — 기준 파일이 **코퍼스 전 파일 × 세 표면**을 빠짐없이 담고,
// 손으로 고쳐지지 않았음을 기계로 확인한다.
//
// 구 vsp가 은퇴하면 기준 파일을 재채록할 수단이 사라진다. 그때부터 「빠진 칸」은
// 영영 못 메운다 — 그래서 커버 누락은 경고가 아니라 실패다.
//
// 함께 보는 것:
//   · 항목 모양(필수 필드) — 새 CLI가 맞춰야 할 계약
//   · 정렬 정규형 — 손으로 고친 기준 파일은 정렬이 깨져 여기서 걸린다
//   · 대장(MANIFEST)의 `measured_hits` ↔ 기준 파일 — 실측 기록이 조용히 낡는 것을 막는다
//
// exit 0 = 이상 없음 · 1 = 문제 있음

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASELINE_DIR, CORPUS_DIR, SURFACES, assertCorpusIsLF, listCorpusFiles } from './corpus.mjs';

const SHAPE = {
  lint: { list: 'findings', fields: ['rule', 'line', 'col', 'severity'], scalars: ['exit_code'], order: ['line', 'col', 'rule', 'severity'] },
  analyze: { list: 'findings', fields: ['rule', 'line', 'severity', 'category'], scalars: ['rules_applied'], order: ['line', 'rule', 'severity', 'category'] },
  parse: { list: 'statements', fields: ['type', 'line'], scalars: [], order: null },
};

const problems = [];
const fail = (msg) => problems.push(msg);

function orderKey(entry, fields) {
  return fields.map((f) => (typeof entry[f] === 'number' ? String(entry[f]).padStart(9, '0') : String(entry[f]))).join('|');
}

function checkSurface(surface, corpusFiles) {
  const path = join(BASELINE_DIR, `${surface}.json`);
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`${surface}: 기준 파일을 읽을 수 없다 (${path}) — ${e.message}`);
    return null;
  }
  const shape = SHAPE[surface];

  if (doc.schema !== 1) fail(`${surface}: schema가 1이 아니다 (${doc.schema})`);
  if (doc.surface !== surface) fail(`${surface}: surface 필드가 '${doc.surface}'다`);
  if (!doc.files || typeof doc.files !== 'object') {
    fail(`${surface}: files 객체가 없다`);
    return null;
  }

  const recorded = Object.keys(doc.files);
  if (doc.file_count !== recorded.length) fail(`${surface}: file_count(${doc.file_count}) ≠ 실제 항목 수(${recorded.length})`);

  const recSet = new Set(recorded);
  const missing = corpusFiles.filter((f) => !recSet.has(f));
  const extra = recorded.filter((f) => !corpusFiles.includes(f));
  if (missing.length) fail(`${surface}: 코퍼스에 있으나 기준에 없는 파일 ${missing.length}건 — ${missing.join(', ')}`);
  if (extra.length) fail(`${surface}: 코퍼스에 없는 파일이 기준에 있다 ${extra.length}건 — ${extra.join(', ')}`);

  const sorted = [...recorded].sort();
  if (recorded.join('\n') !== sorted.join('\n')) fail(`${surface}: 파일 키가 정렬되어 있지 않다 (재실행 바이트 동일성이 깨진다)`);

  for (const rel of recorded) {
    const entry = doc.files[rel];
    for (const s of shape.scalars) {
      if (typeof entry[s] !== 'number') fail(`${surface}/${rel}: ${s}가 숫자가 아니다 (${entry[s]})`);
    }
    const list = entry[shape.list];
    if (!Array.isArray(list)) {
      fail(`${surface}/${rel}: ${shape.list} 배열이 없다`);
      continue;
    }
    for (const [i, item] of list.entries()) {
      for (const f of shape.fields) {
        if (item[f] === undefined || item[f] === null) fail(`${surface}/${rel}#${i}: 필드 ${f}가 없다`);
      }
      const surplus = Object.keys(item).filter((k) => !shape.fields.includes(k));
      if (surplus.length) fail(`${surface}/${rel}#${i}: 정규화에서 빠져야 할 필드가 남아 있다 — ${surplus.join(', ')}`);
    }
    if (shape.order) {
      for (let i = 1; i < list.length; i += 1) {
        if (orderKey(list[i - 1], shape.order) > orderKey(list[i], shape.order)) {
          fail(`${surface}/${rel}: ${shape.list}가 정규 정렬(${shape.order.join('→')})을 벗어났다 (#${i})`);
          break;
        }
      }
    }
  }
  return doc;
}

// 대장의 실측 기록 ↔ 기준 파일. 예측(`predicted_hits`)은 손대지 않는다 — 예측과 실측을
// 구분해 두는 것이 이 대조의 목적이다.
function checkManifestMeasured(baselines) {
  const path = join(CORPUS_DIR, 'synthetic', 'MANIFEST.json');
  let man;
  try {
    man = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`대장을 읽을 수 없다 — ${e.message}`);
    return;
  }
  if (!baselines.lint || !baselines.analyze) return;

  for (const entry of man.files ?? []) {
    const rel = entry.path;
    const measured = entry.measured_hits;
    if (!measured) {
      fail(`대장 ${rel}: measured_hits가 없다 — 재채록 후 derive-measured-hits로 갱신하라 (RECORDING.md)`);
      continue;
    }
    const rule = entry.targets?.[0]?.rule ?? null;
    for (const surface of ['lint', 'analyze']) {
      const found = baselines[surface].files[rel];
      if (!found) {
        fail(`대장 ${rel}: ${surface} 기준에 이 파일이 없다`);
        continue;
      }
      const all = found.findings.length;
      const ruleHits = rule === null ? null : found.findings.filter((f) => f.rule === rule).length;
      const got = measured[surface];
      if (!got || got.all !== all || got.rule !== ruleHits) {
        fail(
          `대장 ${rel}: measured_hits.${surface}가 기준과 다르다 — 대장 {rule:${got?.rule}, all:${got?.all}} ≠ 기준 {rule:${ruleHits}, all:${all}}`,
        );
      }
    }
  }
}

function main() {
  try {
    assertCorpusIsLF();
  } catch (e) {
    fail(e.message);
  }

  const corpusFiles = listCorpusFiles();
  const baselines = {};
  for (const surface of SURFACES) baselines[surface] = checkSurface(surface, corpusFiles);
  checkManifestMeasured(baselines);

  if (problems.length > 0) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error(`[coverage] ✗ 문제 ${problems.length}건`);
    process.exit(1);
  }
  console.log(`[coverage] ✓ 코퍼스 ${corpusFiles.length}개 파일 × 표면 ${SURFACES.length}종 = ${corpusFiles.length * SURFACES.length}칸, 누락 0`);
  console.log('[coverage] ✓ 항목 모양·정규 정렬·대장 실측 기록 일치');
}

main();
