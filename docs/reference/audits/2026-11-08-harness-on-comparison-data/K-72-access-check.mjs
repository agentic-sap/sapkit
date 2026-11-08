#!/usr/bin/env node
// K-72-access-check.mjs — 판K 접근 기록 검사 (채점자 · 제3 판정 · R-F 컨텍스트의 도구 호출을 허용 목록과 대조 · 판K T8c · 2026-11-08)
//
// 사용(PowerShell · 어디서든):
//   node …/K-72-access-check.mjs --round <N> --out <K-72-access.txt>
//        [--expect-model <id>]                                         (모든 역할의 기본 지정 모델)
//        --role <A|B|third|R-F> --log <JSONL> [--expect-model <id>] [--notes <메모 파일>]
//                               [--outputs <레포 상대,…>] [--msg <스크래치 메시지 파일 이름>] [--extra-read <레포 상대,…>]
//        [--role … 반복]
//   --role 뒤의 --log · --expect-model · --notes · --outputs · --msg · --extra-read 는 그 역할에만 걸린다.
//   A · B 는 출력 둘 · 메시지 파일 · 메모 파일의 기본값을 갖는다. third · R-F 는 --outputs · --msg · --notes 를 줘야 한다.
// 종료 코드: 0 = 전 역할 PASS · 1 = 하나라도 FAIL 또는 MODEL MISMATCH(기록은 남긴다) · 2 = 사용법 오류
//
// 하는 일
//   - 기록(Claude Code 세션 JSONL)의 type "assistant" 줄에서 message.content[] 의 tool_use 를 뽑는다. 요청 사본 줄
//     (api-request-blob 등 — 앞선 assistant 메시지를 다시 담은 줄)은 세지 않고, 같은 tool_use id 는 한 번만 센다.
//   - 각 호출을 allowed / contact 로 가른다. 이름 모르는 도구 = contact. 경로는 정규화(대소문자 무시 · \ → /) 뒤
//     작업 트리 · 주 저장소 절대 경로 접두어를 떼어 레포 상대로 대조한다. 한 역할이 둘 이상의 트리에 닿았으면 다수 트리
//     밖의 호출은 contact 다.
//   - 관측 모델 id: assistant 줄의 message.model 집합과 요청 줄(api-request)의 params.model 집합. 지정과 다르면
//     MODEL MISMATCH(그 채점은 비교 불가 — D-160 ⓑ).
//   - 메모 머리 모델 id: 메모 파일 첫 줄이 「model: <지정 id>」 인가.
//   - 결과를 --out 파일에 회차 절로 덧붙인다(없으면 만든다).
//
// 지키는 것
//   - 내장 모듈만(node:fs · node:path · node:os · node:child_process). 기록 파일은 읽기만 한다.
//   - 출력에 절대 경로를 찍지 않는다: 레포 · 작업 트리 → 레포 상대(트리는 이름만) · 홈 → <home> · 스크래치패드 →
//     <scratchpad>/<파일명> · 그 밖 → <외부>/…/<파일명>. 긴 16진 id · uuid 꼴은 <id> 로 가린다. 기록 파일 경로는
//     출력하지 않는다. 비추적 작업 폴더 이름은 이 파일에 글자 그대로 두지 않는다(실행 중 조립 — K-99 와 같은 규칙).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const J = (...p) => p.join('');
const FORGE = J('.dry', 'forge');
const DATA = path.dirname(fileURLToPath(import.meta.url));
const KREL = 'docs/reference/audits/2026-11-08-harness-on-comparison-data';
const JREL = 'docs/reference/audits/2026-11-05-harness-necessity-review-data';

// ── 허용 목록(채점자 블라인드 · 레포 상대 · 소문자로 대조) ─────────────────────────────
const READ_FILES = [
  `${KREL}/K-65-grader-brief.txt`,
  `${KREL}/K-65-blind-knowledge.json`,
  `${KREL}/K-65-blind-code.json`,
  `${JREL}/10-knowledge-items.json`,
  `${JREL}/11-code-tasks.txt`,
  `${JREL}/01-convention-split.txt`,
];
const READ_DIRS = ['interactive/core/knowledge', 'interactive/core/personas'];
const ROLE_DEFAULTS = {
  A: { outputs: [`${KREL}/K-70-grading-A.csv`, `${KREL}/K-70-notes-A.txt`], msg: 'T8a-commit-msg.txt', notes: `${KREL}/K-70-notes-A.txt` },
  B: { outputs: [`${KREL}/K-71-grading-B.csv`, `${KREL}/K-71-notes-B.txt`], msg: 'T8b-commit-msg.txt', notes: `${KREL}/K-71-notes-B.txt` },
};
const HANDBACK = new Set(['SubagentHandback']);   // 보고 전달 — 파일 · 망 접근 없음

// ── 인자 ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let round = null, outFile = null, defModel = null;
const roles = [];
const usage = (m) => { console.log(`usage error: ${m}`); process.exit(2); };
const list = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], v = argv[i + 1];
  const cur = roles[roles.length - 1];
  const need = () => { if (v === undefined) usage(`${a} needs a value`); i++; return v; };
  if (a === '--round') round = need();
  else if (a === '--out') outFile = need();
  else if (a === '--role') roles.push({ role: need() });
  else if (a === '--expect-model') { const x = need(); if (cur) cur.model = x; else defModel = x; }
  else if (['--log', '--notes', '--outputs', '--msg', '--extra-read'].includes(a)) {
    if (!cur) usage(`${a} must follow --role`);
    cur[a.slice(2)] = need();
  } else usage(`unknown argument ${a}`);
}
if (!round || !outFile || roles.length === 0) usage('--round, --out and at least one --role are required');
for (const r of roles) {
  if (!['A', 'B', 'third', 'R-F'].includes(r.role)) usage(`unknown role ${r.role}`);
  if (!r.log) usage(`role ${r.role}: --log required`);
  r.model = r.model || defModel;
  if (!r.model) usage(`role ${r.role}: --expect-model required`);
  const d = ROLE_DEFAULTS[r.role] || {};
  r.outputs = r.outputs ? list(r.outputs) : d.outputs;
  r.msg = r.msg || d.msg;
  r.notes = r.notes || d.notes;
  r.extra = list(r['extra-read']);
  if (!r.outputs || !r.msg || !r.notes) usage(`role ${r.role}: --outputs, --msg and --notes required`);
}

// ── 경로 정규화 · 가림 ──────────────────────────────────────────────────────────
const norm = (p) => String(p).replace(/\\+/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase();
let worktreeRoot = path.resolve(DATA, '..', '..', '..', '..');
let mainRoot = worktreeRoot;
try {
  worktreeRoot = execFileSync('git', ['-C', DATA, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  mainRoot = path.dirname(execFileSync('git', ['-C', DATA, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim());
} catch { /* git 없음 — 스크립트 위치에서 잰 루트만 쓴다 */ }
const MAIN = norm(mainRoot);
const HOME = norm(os.homedir());
const WT_PREFIX = `${MAIN}/${FORGE}/worktrees/`;

// 절대 경로 → { tree, rel } (레포 안) 또는 { outside } (레포 밖). 상대 경로는 tree=null(호출자가 트리 기준으로 본다).
function locate(p) {
  const n = norm(p);
  if (!/^[a-z]:\/|^\//.test(n)) return { tree: null, rel: n.replace(/^\.\//, '') };
  if (n.startsWith(WT_PREFIX)) {
    const rest = n.slice(WT_PREFIX.length);
    const k = rest.indexOf('/');
    return k < 0 ? { tree: rest, rel: '' } : { tree: rest.slice(0, k), rel: rest.slice(k + 1) };
  }
  if (n === MAIN) return { tree: 'main', rel: '' };
  if (n.startsWith(`${MAIN}/`)) return { tree: 'main', rel: n.slice(MAIN.length + 1) };
  return { outside: n };
}
const maskId = (s) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>').replace(/(?<![0-9a-z])[0-9a-f]{12,}(?![0-9a-z])/gi, '<id>').replace(/agent-a[0-9a-f]{10,}/gi, 'agent-<id>');
// 알려진 절대 경로 접두어를 글자 그대로(대소문자 보존) 가린다 — 공백이 든 경로가 따옴표 없이 나와도 새지 않게
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const prefRe = (n) => n.split('/').map(escRe).join('[\\\\/]+');
const PREFIX_MASKS = [
  [new RegExp(`${prefRe(WT_PREFIX.replace(/\/$/, ''))}[\\\\/]+([^\\\\/\\s"']+)`, 'gi'), (m, t) => `[트리 ${t.toUpperCase()}]`],
  [new RegExp(prefRe(MAIN), 'gi'), () => '[트리 주]'],
  [new RegExp(`${prefRe(HOME)}[\\\\/]+[^"'\\s]*?[\\\\/]+scratchpad`, 'gi'), () => '<scratchpad>'],
  [new RegExp(prefRe(HOME), 'gi'), () => '<home>'],
];
const maskPrefixes = (s) => PREFIX_MASKS.reduce((acc, [re, f]) => acc.replace(re, f), String(s));
function show(p) {
  const L = locate(p);
  if (!L.outside) {
    if (L.tree === null) return maskId(String(p).replace(/\\+/g, '/'));
    const shown = maskPrefixes(String(p)).replace(/\\+/g, '/').replace(/\/+/g, '/').replace(/^(\[트리 [^\]]+\])\/?/, '$1 ');
    return maskId(shown.split(`${FORGE}/`).join('<비추적 작업 폴더>/').replace(/\s$/, ' (트리 루트)'));
  }
  const o = L.outside;
  const base = maskId(String(p).replace(/\\+/g, '/').split('/').pop());
  if (/\/temp\/claude\/[^/]+\/[^/]+\/scratchpad\//.test(o)) return `<scratchpad>/${base}`;
  if (o === HOME) return '<home>';
  if (o.startsWith(`${HOME}/`)) return `<home>/…/${base}`;
  return `<외부>/…/${base}`;
}
function maskText(s) {   // 명령 문자열 요지 — 알려진 접두어를 먼저 가리고, 남은 절대 경로 토큰은 파일명만 남긴다
  const pre = maskPrefixes(s);
  return maskId(pre.replace(/"([^"]*)"|'([^']*)'|(\S+)/g, (m, d, q, b) => {
    const t = d ?? q ?? b;
    return /^[a-z]:[\\/]|^\/(?!\/)/i.test(t) ? `<외부>/…/${t.replace(/\\+/g, '/').split('/').pop()}` : m;
  })).split(FORGE).join('<비추적 작업 폴더>').replace(/\\+/g, '/').replace(/\s+/g, ' ').slice(0, 200);
}
const isScratchMsg = (p, msg) => { const L = locate(p); return !!L.outside && /\/temp\/claude\/[^/]+\/[^/]+\/scratchpad\/[^/]+$/.test(L.outside) && L.outside.endsWith(`/${msg.toLowerCase()}`); };

// ── 명령 분해(따옴표 존중) ───────────────────────────────────────────────────────
function tokenize(seg) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|([^\s"']+)/g;
  let m;
  while ((m = re.exec(seg))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
function splitOutsideQuotes(cmd) {   // ; 와 && 로 나눈다 · 따옴표 밖의 | > < ` $( & 는 거부 표시
  const segs = []; let cur = ''; let q = null; let bad = false;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === ';' || c === '\n') { segs.push(cur); cur = ''; continue; }
    if (c === '&' && cmd[i + 1] === '&') { segs.push(cur); cur = ''; i++; continue; }
    if ('|<>`&'.includes(c) || (c === '$' && cmd[i + 1] === '(')) bad = true;
    cur += c;
  }
  if (q) bad = true;
  segs.push(cur);
  return { segs: segs.map((s) => s.trim()).filter(Boolean), bad };
}
// git [-C <트리 루트>] add <자기 출력…>  |  git [-C <트리 루트>] commit -F <스크래치 메시지>
// PowerShell 의 「A; if ($?) { B }」 는 「A; B」 와 같이 본다(레포 셸 규약의 연결 꼴).
function shellAllowed(cmd, r, treeOf) {
  const c = String(cmd).replace(/\bif\s*\(\s*\$\?\s*\)\s*\{([\s\S]*)\}\s*$/, ';$1');
  const { segs, bad } = splitOutsideQuotes(c);
  if (bad || segs.length === 0) return false;
  const own = new Set(r.outputs.map(norm));
  for (const s of segs) {
    const t = tokenize(s);
    if (t[0] !== 'git') return false;
    let k = 1;
    if (t[k] === '-C') { const L = locate(t[k + 1] || ''); if (L.outside || L.tree === null || L.rel !== '') return false; treeOf(L.tree); k += 2; }
    if (t[k] === 'add') {
      const files = t.slice(k + 1);
      if (files.length === 0) return false;
      for (const f of files) { const L = locate(f); if (L.outside || !own.has(L.rel)) return false; if (L.tree) treeOf(L.tree); }
    } else if (t[k] === 'commit') {
      if (t.length !== k + 3 || t[k + 1] !== '-F' || !isScratchMsg(t[k + 2], r.msg)) return false;
    } else return false;
  }
  return true;
}

// ── 한 역할 검사 ───────────────────────────────────────────────────────────────
function check(r) {
  const res = { lines: 0, asst: 0, calls: [], byTool: {}, models: {}, reqModels: {}, trees: {}, err: null };
  let raw;
  try { raw = fs.readFileSync(r.log, 'utf8'); } catch { res.err = '기록을 읽을 수 없음'; return res; }
  const lines = raw.split(/\r?\n/);
  const seen = new Set();
  let bad = 0;
  lines.forEach((l, i) => {
    if (!l.trim()) return;
    res.lines++;
    let o; try { o = JSON.parse(l); } catch { bad++; return; }
    if (o.type === 'api-request' && o.params && o.params.model) res.reqModels[o.params.model] = (res.reqModels[o.params.model] || 0) + 1;
    if (o.type !== 'assistant') return;
    res.asst++;
    const m = o.message || {};
    const mid = m.model || '(없음)';
    res.models[mid] = (res.models[mid] || 0) + 1;
    for (const c of Array.isArray(m.content) ? m.content : []) {
      if (c.type !== 'tool_use') continue;
      if (c.id && seen.has(c.id)) continue;
      if (c.id) seen.add(c.id);
      res.calls.push({ line: i + 1, name: c.name, input: c.input || {} });
    }
  });
  if (res.lines === 0) res.err = '빈 기록';
  if (bad) res.err = `JSON 해석 실패 줄 ${bad}`;

  const own = new Set(r.outputs.map(norm));
  const readOk = new Set([...READ_FILES, ...r.extra].map(norm));
  const inDirs = (rel) => READ_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`));
  const cats = {};
  const bump = (k) => { cats[k] = (cats[k] || 0) + 1; };
  for (const c of res.calls) {
    res.byTool[c.name] = (res.byTool[c.name] || 0) + 1;
    const inp = c.input;
    const trees = [];
    const treeOf = (t) => trees.push(t);
    let ok = false, cat = null, what = '';
    const relOf = (p) => { const L = locate(p); if (L.tree) treeOf(L.tree); return L; };
    if (c.name === 'Read') {
      what = show(inp.file_path || '');
      const L = relOf(inp.file_path || '');
      if (!L.outside && L.tree !== null) {
        if (readOk.has(L.rel)) { ok = true; cat = '읽기 허용 목록'; }
        else if (inDirs(L.rel)) { ok = true; cat = '지식 · 페르소나 읽기'; }
        else if (own.has(L.rel)) { ok = true; cat = '자기 출력 되읽기'; }
      }
    } else if (c.name === 'Grep' || c.name === 'Glob') {
      what = `${inp.path ? show(inp.path) : '(path 없음)'}${inp.glob ? ` glob=${maskText(inp.glob)}` : ''}${c.name === 'Glob' ? ` pattern=${maskText(inp.pattern || '')}` : ''}`;
      if (inp.path) {
        const L = relOf(inp.path);
        const extraOk = !(inp.glob && /\.\.|^[a-z]:|^\//i.test(inp.glob)) && !(c.name === 'Glob' && /\.\.|^[a-z]:|^\/|\\/i.test(inp.pattern || ''));
        if (!L.outside && L.tree !== null && extraOk && (inDirs(L.rel) || readOk.has(L.rel))) { ok = true; cat = '지식 · 페르소나 검색'; }
      }
    } else if (['Write', 'Edit', 'NotebookEdit'].includes(c.name)) {
      const fp = inp.file_path || inp.notebook_path || '';
      what = show(fp);
      const L = relOf(fp);
      if (!L.outside && L.tree !== null && own.has(L.rel)) { ok = true; cat = '자기 출력 쓰기'; }
      else if (c.name === 'Write' && isScratchMsg(fp, r.msg)) { ok = true; cat = '스크래치 메시지 쓰기'; }
    } else if (c.name === 'Bash' || c.name === 'PowerShell') {
      what = maskText(inp.command || '');
      if (shellAllowed(inp.command || '', r, treeOf)) { ok = true; cat = 'git add · commit'; }
    } else if (HANDBACK.has(c.name)) {
      ok = true; cat = '보고 전달'; what = '(보고 본문 — 파일 접근 없음)';
    } else {
      what = `이름 · 종류: ${maskText(c.name)}${c.name.startsWith('mcp__') ? ' (MCP)' : ''}`;
    }
    for (const t of trees) res.trees[t] = (res.trees[t] || 0) + 1;
    c.trees = trees; c.ok = ok; c.cat = cat; c.what = what;
  }
  // 다수 트리 밖의 호출은 contact
  const treeNames = Object.keys(res.trees);
  const major = treeNames.sort((a, b) => res.trees[b] - res.trees[a])[0];
  for (const c of res.calls) if (c.ok && c.trees.some((t) => t !== major)) { c.ok = false; c.what += ' (다른 트리)'; }
  for (const c of res.calls) if (c.ok) bump(c.cat);
  res.cats = cats;
  res.major = major;
  return res;
}

// ── 실행 · 기록 ────────────────────────────────────────────────────────────────
const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmt = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(' · ') || '없음';
const repoFile = (rel) => path.join(worktreeRoot, ...rel.split('/'));
const out = [];
let allPass = true;
for (const r of roles) {
  const res = check(r);
  const contacts = res.calls.filter((c) => !c.ok);
  const allowed = res.calls.length - contacts.length;
  const mset = Object.keys(res.models), rset = Object.keys(res.reqModels);
  const modelOk = mset.length === 1 && mset[0] === r.model && rset.every((x) => x === r.model);
  let head = '(읽을 수 없음)';
  try { head = fs.readFileSync(repoFile(r.notes), 'utf8').replace(/^﻿/, '').split(/\r?\n/)[0]; } catch { /* 아래에서 불일치로 */ }
  const headOk = head.trim() === `model: ${r.model}`;
  const pass = !res.err && contacts.length === 0 && modelOk && headOk;
  if (!pass) allPass = false;
  const verdict = pass ? 'PASS' : (!modelOk ? 'FAIL (MODEL MISMATCH — 이 채점은 비교 불가 · D-160 ⓑ)' : 'FAIL');
  out.push(`== 회차 ${round} · 역할 ${r.role} · ${today} ==`);
  out.push(`기록: 레포 밖 원 기록(JSONL · 읽기만) · 줄 ${res.lines} · assistant 줄 ${res.asst}${res.err ? ` · 오류: ${res.err}` : ''}`);
  out.push('      도구 호출 = assistant 줄의 tool_use (요청 사본 줄은 세지 않음 · 같은 tool_use id 는 한 번)');
  out.push(`작업 트리: ${Object.keys(res.trees).map((t) => `${t === 'main' ? '주 저장소' : t.toUpperCase()} ${res.trees[t]}`).join(' · ') || '없음'} (경로가 닿은 호출 수)`);
  out.push(`도구 호출 총수: ${res.calls.length} (${fmt(res.byTool)})`);
  out.push(`allowed: ${allowed} (${fmt(res.cats)})`);
  out.push(`  자기 출력 되읽기: ${res.cats['자기 출력 되읽기'] || 0}`);
  out.push(`contact: ${contacts.length}`);
  for (const c of contacts) out.push(`  줄 ${c.line} · ${c.name} · ${c.what}`);
  out.push(`관측 모델 id: message.model {${mset.join(', ')}} (assistant 줄 ${res.asst}) · 요청 params.model {${rset.join(', ')}} (${Object.values(res.reqModels).reduce((a, b) => a + b, 0)}건) · 지정 ${r.model} → ${modelOk ? '일치' : 'MODEL MISMATCH'}`);
  out.push(`메모 머리 모델 id: ${path.posix.basename(r.notes)} 첫 줄 「${maskText(head)}」 → ${headOk ? '일치' : '불일치'}`);
  out.push(`판정: ${verdict}`);
  out.push('');
}
const text = out.join('\n');
fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
const prev = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
const header = prev ? '' : 'K-72 접근 기록 검사 — 회차별 절을 덧붙인다(만든 스크립트: K-72-access-check.mjs · 허용 목록은 그 스크립트 머리)\n\n';
fs.writeFileSync(outFile, prev + (prev && !prev.endsWith('\n') ? '\n' : '') + header + text, 'utf8');
console.log(text);
process.exit(allPass ? 0 : 1);
