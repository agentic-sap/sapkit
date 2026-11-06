#!/usr/bin/env node
// 93-recovery-measure.mjs — 판J 마감 리뷰 회수 때 다시 잰 두 가지 (2026-11-06)
//
// 사용(레포 루트 · PowerShell):
//   node docs/reference/audits/2026-11-05-harness-necessity-review-data/93-recovery-measure.mjs
// 출력은 93-final-dispositions.txt 「다시 잰 값」에 그대로 옮겼다. 파일을 고치지 않는다 · 내장 모듈만 쓴다.
//
// ⑴ 도구 항목 하나의 구성 — 20이 남긴 tools/list 캡처(20-tokens-raw/tools-list.<표면>.json)를 그대로 읽는다.
//    셈은 20 §1과 같다: 전체 = tools 배열 JSON의 UTF-8 바이트 · 평균 = 전체 ÷ 도구 수 · 설명 = 문자열 값 그대로의 바이트.
//    「인자 안 설명」 = inputSchema 아래에서 값이 문자열인 description 키다(이름이 description인 인자의 스키마 객체는 세지 않는다).
//    「지운 평균」 = 그 키를 뺀 tools 배열을 다시 JSON으로 만든 바이트 ÷ 도구 수 — 키 · 따옴표 · 이스케이프도 함께 빠진다.
//    「남길 수 있는 몫」 = 선 ⓑ(평균 500 B/도구) − 설명을 전부 지운 평균. 설명이 든 바이트 가운데 그만큼만 남아야 선에 닿는다.
// ⑵ Claude 밖 두 하네스가 세션마다 싣는 규칙 블록 — 20 §2-c와 같이 CRLF→LF로 고친 뒤 「## 제목」부터 다음 「## 」 직전까지.
//    Codex       = interactive/adapters/codex/AGENTS-template.md 「SAP Development Standards」 절
//                  (어댑터 안내가 사용자 프로젝트의 AGENTS.md에 붙여 넣으라는 블록)
//    Antigravity = interactive/core/policies/sap-standards.md 「Always-on summary」 절
//                  (어댑터 안내가 워크스페이스 규칙 파일로 복사하라는 블록)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const B = (s) => Buffer.byteLength(s, 'utf8');
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const LINE_B = 500;

const isObj = (o) => o !== null && typeof o === 'object';
// 값이 문자열인 description 키를 모두 뺀 사본 (배열 · 객체를 따라 내려간다)
const stripDesc = (o) => {
  if (Array.isArray(o)) return o.map(stripDesc);
  if (!isObj(o)) return o;
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'description' && typeof v === 'string') continue;
    r[k] = stripDesc(v);
  }
  return r;
};
// 값이 문자열인 description 키의 바이트 합과 개수
const sumDesc = (o, acc = { bytes: 0, count: 0 }) => {
  if (Array.isArray(o)) o.forEach((x) => sumDesc(x, acc));
  else if (isObj(o)) {
    for (const [k, v] of Object.entries(o)) {
      if (k === 'description' && typeof v === 'string') { acc.bytes += B(v); acc.count++; }
      else sumDesc(v, acc);
    }
  }
  return acc;
};

const out = [];
const moved = {};
out.push('⑴ 도구 항목 하나의 구성 (캡처 = 20-tokens-raw/tools-list.<표면>.json · 선 ⓑ = 평균 500 B/도구)');
for (const surface of ['default', 'readonly']) {
  const j = JSON.parse(fs.readFileSync(path.join(HERE, '20-tokens-raw', `tools-list.${surface}.json`), 'utf8'));
  const tools = j.result?.tools ?? j.tools ?? j;
  const n = tools.length;
  const total = B(JSON.stringify(tools));
  const top = tools.reduce((a, t) => a + (typeof t.description === 'string' ? B(t.description) : 0), 0);
  const inSchema = sumDesc(tools.map((t) => t.inputSchema ?? {}));
  const outside = sumDesc(tools.map(({ description, inputSchema, ...rest }) => rest));
  const noTop = B(JSON.stringify(tools.map(({ description, ...rest }) => rest)));
  const noAll = B(JSON.stringify(stripDesc(tools)));
  const bearing = (total - noAll) / n;
  const room = LINE_B - noAll / n;
  out.push(`  ${surface} — 도구 ${n} · 전체 ${fmt(total)} B · 평균 ${fmt(total / n)} B/도구`);
  out.push(`    최상위 설명      : 합 ${fmt(top)} B · 평균 ${fmt(top / n)}`);
  out.push(`    인자 안 설명     : 합 ${fmt(inSchema.bytes)} B · ${inSchema.count}개 · 평균 ${fmt(inSchema.bytes / n)}`);
  out.push(`    그 밖의 설명     : ${outside.count}개`);
  out.push(`    설명 합          : ${fmt(top + inSchema.bytes)} B · 평균 ${fmt((top + inSchema.bytes) / n)}`);
  out.push(`    최상위만 지우면  : 평균 ${fmt(noTop / n)} B/도구`);
  out.push(`    설명을 다 지우면 : 평균 ${fmt(noAll / n)} B/도구`);
  out.push(`    설명이 든 바이트 : 평균 ${fmt(bearing)} B/도구 (키 · 따옴표 · 이스케이프 포함 = 평균 − 다 지운 평균)`);
  out.push(`    선까지 줄일 양   : ${fmt(total - LINE_B * n)} B (전체 − 500 × 도구 수)`);
  out.push(`    남길 수 있는 몫  : ${fmt(room)} B/도구 = 설명이 든 바이트의 ${((room / bearing) * 100).toFixed(1)}%`);
  moved[surface] = { all: fmt((top + inSchema.bytes) / n), top: fmt(top / n), inside: fmt(inSchema.bytes / n), noTop: fmt(noTop / n), noAll: fmt(noAll / n), bearing: fmt(bearing), room: fmt(room) };
}

const norm = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
// 20-measure-tokens.mjs의 sectionOf와 같은 자르기
function sectionOf(text, headingPrefix) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith('## ') && l.slice(3).startsWith(headingPrefix));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (lines[i].startsWith('## ')) { end = i; break; }
  return lines.slice(start, end).join('\n');
}
out.push('');
out.push('⑵ Claude 밖 두 하네스가 세션마다 싣는 규칙 블록 (CRLF→LF · ÷4 = 반올림)');
const blocks = [
  ['Codex 병합 블록', 'interactive/adapters/codex/AGENTS-template.md', 'SAP Development Standards'],
  ['Antigravity 복사 블록', 'interactive/core/policies/sap-standards.md', 'Always-on summary'],
];
for (const [label, rel, head] of blocks) {
  const s = sectionOf(norm(rel), head);
  if (s == null) { out.push(`  ${label}: 절 부재 (${rel} 「## ${head}」)`); process.exitCode = 1; continue; }
  out.push(`  ${label}: ${fmt(B(s))} B · ÷4 ${fmt(B(s) / 4)} — ${rel} 「## ${head}」 절`);
  moved[label] = `${fmt(B(s))} B · ÷4 ${fmt(B(s) / 4)}`;
}

out.push('');
out.push('문서에 옮긴 값 (default · readonly 순)');
const d = moved.default, r = moved.readonly;
out.push(`  설명문 ${d.all} · ${r.all} (최상위 ${d.top} · ${r.top} · 인자 안 ${d.inside} · ${r.inside})`);
out.push(`  최상위만 지우면 ${d.noTop} · ${r.noTop} B/도구 · 다 지우면 ${d.noAll} · ${r.noAll} B/도구`);
out.push(`  설명이 든 바이트 ${d.bearing} · ${r.bearing} B/도구 · 남길 수 있는 몫 ${d.room} · ${r.room} B/도구`);
out.push(`  Codex 병합 블록 ${moved['Codex 병합 블록']} · Antigravity 복사 블록 ${moved['Antigravity 복사 블록']}`);
console.log(out.join('\n'));
