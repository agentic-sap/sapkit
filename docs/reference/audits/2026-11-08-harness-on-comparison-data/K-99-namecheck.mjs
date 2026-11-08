#!/usr/bin/env node
// K-99-namecheck.mjs — 판K 자료 폴더 이름 검사 (금지 문자열 검출 · 판K T0 · 2026-11-08)
//
// 사용(레포 루트 또는 어디서든 · PowerShell):
//   node docs/reference/audits/2026-11-08-harness-on-comparison-data/K-99-namecheck.mjs <파일|폴더> [<파일|폴더> …]
//   node …/K-99-namecheck.mjs --selftest        음성시험 — 임시 폴더에 금지 문자열을 심어 잡히는지 · 팩 URL은 통과하는지
//   선택: --pack <폴더>   URL·SID·uuid 허용 목록을 만들 팩 폴더(knowledge\ · personas\ 를 담은 폴더) — 기본은 레포의
//                         interactive/core/ 아래 knowledge · personas(판K 하네스 폴더와 같은 트리 — K-02-canary/tree-check.txt)
// 종료 코드: 0 = 위반 0 · 1 = 위반 있음 · 2 = 사용법 오류 · 3 = 음성시험 실패
//
// 지키는 것
//   - 내장 모듈만 쓴다(node:fs · node:path · node:os · node:child_process · node:url). 검사 대상 파일을 고치지 않는다.
//   - 출력은 레포 상대 경로(또는 검사 루트 상대) · 줄 번호 · 범주 · 수만이다. 찾은 글자 자체는 찍지 않는다.
//   - 금지 문자열은 이 파일 안에 글자 그대로 두지 않는다(판J 84-selfcheck.mjs 머리 주석의 규칙) — 실행 중에 조립하거나
//     (웹 주소 머리 · 비추적 작업 폴더 이름), 환경에서 읽거나(사용자 이름 · 컴퓨터 이름 · 홈 경로 · 레포 위치),
//     파일에서 읽는다(프로파일 sap.env 값 · 프로파일 폴더 이름 · 판J 00 머리의 다른 프로젝트 · 프로파일 이름).
//   - sap.env 값은 메모리에서만 쓴다 — 어디에도 출력하지 않는다(키 이름도 찍지 않고 「sap.env 값」 범주의 수만 찍는다).
//
// 금지 범주 (각 범주의 일치 규칙)
//   [user]     사용자 이름 — 홈 경로 꼴(…Users\<이름> · …/Users/<이름>)은 언제나 위반 · 낱말 경계 · 대소문자 구분 단독 출현은
//              그 낱말이 팩 본문에도 낱말로 있으면 허용(이름이 흔한 낱말인 컴퓨터에서 오탐을 막는다 — 허용했다는 사실은 찍는다)
//   [host]     컴퓨터 이름 — 대소문자 무시 부분 일치(팩 예외 없음)
//   [home]     홈 경로 — 두 구분자 꼴 · 대소문자 무시
//   [repo]     레포 절대 경로 — 작업 트리 루트 · 주 저장소 루트 · 각 두 구분자 꼴과 /d/ 꼴 · 대소문자 무시
//   [sapenv]   ~/.sapkit/profiles/*/sap.env 의 모든 값(길이 3 미만 제외). 비밀 키(이름에 USER · PASS · URL · HOST ·
//              DESCRIPTION · SECRET · TOKEN · KEY 가 든 키)의 값과 URL 값의 호스트 부분은 언제나 위반(대소문자 무시 부분 일치).
//              그 밖의 값(설정 낱말 · 숫자)은 낱말 경계 일치이되 **팩 본문에 같은 낱말로 있으면 허용**(예: 인증 방식 · 층 이름 ·
//              릴리스 번호처럼 팩이 공개적으로 쓰는 낱말). 허용한 값의 수는 찍는다(값은 찍지 않는다).
//   [names]    다른 프로젝트 · 프로파일 이름 — 판J 00-switches.txt 머리 12 · 14행의 괄호 안 목록 + ~/.sapkit/profiles/ 폴더 이름
//              + 그 이름들끼리 공통 머리(4자 이상) · 대소문자 무시 부분 일치
//   [sid]      SID 후보 — 영문 대문자로 시작하는 3자 대문자·숫자 낱말 가운데 팩 본문에 같은 낱말로 없는 것.
//              예외(고정 · 이 목록 밖은 전부 위반): 과업 번호 꼴 T + 두 자리 · 아래 GENERIC 낱말(판J 러너·레시피와 판K 자료가
//              쓰는 일반 기술 낱말 — 실측). 단 GENERIC 낱말이 sap.env 값 · 이름 목록과 겹치면 예외에서 뺀다.
//              판J 자료 폴더(docs/reference/audits/2026-11-05-harness-necessity-review-data/) 본문의 낱말도 허용
//              (판J 기록은 이미 공개·검토됨 · 2026-11-08 메인 추가) — 팩 토큰과 같은 규칙으로 모으며, 같은 방식으로
//              sap.env 값 · 이름 목록과 겹치면 뺀다.
//   [uuid]     세션 id 꼴(8-4-4-4-12 16진) — 팩 본문에 없는 것
//   [url]      웹 주소 — 팩 본문에 글자 그대로 있는 주소만 허용(D-160 ⓪ ④ · 끝의 . , ; : ) 를 뗀 뒤 대조)
//   [forge]    비추적 작업 폴더 이름(판J 84와 같은 처리) — 대소문자 무시 부분 일치
//   [binary]   널 바이트가 든 파일 — 검사할 수 없으므로 위반(fail-closed)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const DATA = path.dirname(SELF);
const ROOT = path.resolve(DATA, '..', '..', '..', '..');
const J = (...p) => p.join('');
const say = (s = '') => console.log(s);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const read = (p) => fs.readFileSync(p, 'utf8');

// ── 인자 ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let packDir = null;
const targets = [];
let selftest = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--pack') { packDir = argv[++i]; continue; }
  if (argv[i] === '--selftest') { selftest = true; continue; }
  targets.push(argv[i]);
}
if (!selftest && targets.length === 0) {
  say('usage: node K-99-namecheck.mjs <file|dir> [...] | --selftest   [--pack <dir with knowledge/ personas/>]');
  process.exit(2);
}

// ── 팩 본문(허용 목록의 근거) ───────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(p);
  }
  return out;
}
const packRoots = packDir
  ? [path.join(packDir, 'knowledge'), path.join(packDir, 'personas')]
  : [path.join(ROOT, 'interactive', 'core', 'knowledge'), path.join(ROOT, 'interactive', 'core', 'personas')];
for (const r of packRoots) if (!fs.existsSync(r)) { say(`FAIL: pack folder missing — ${path.basename(r)}`); process.exit(2); }
const packFiles = packRoots.flatMap((r) => walk(r));
const PACK = packFiles.map(read).join('\n');
const URL_HEAD = J('ht', 'tp');
const URL_RE = () => new RegExp(`${URL_HEAD}s?:\\/\\/[^\\s)\\]>"'\`<]+`, 'g');
const trimUrl = (u) => u.replace(/[.,;:)]+$/, '');
const PACK_URLS = new Set([...PACK.matchAll(URL_RE())].map((m) => trimUrl(m[0])));
const SID_RE = () => /(?<![A-Za-z0-9_])[A-Z][A-Z0-9]{2}(?![A-Za-z0-9_])/g;
const PACK_SID = new Set([...PACK.matchAll(SID_RE())].map((m) => m[0]));
const UUID_RE = () => /(?<![0-9a-fA-F])[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?![0-9a-fA-F])/g;
const PACK_UUID = new Set([...PACK.matchAll(UUID_RE())].map((m) => m[0].toLowerCase()));
const wordIn = (text, w, flags = '') => new RegExp(`(?<![A-Za-z0-9_])${esc(w)}(?![A-Za-z0-9_])`, flags).test(text);

// ── 금지 목록 조립 ─────────────────────────────────────────────────────────────
const home = os.homedir();
const user = os.userInfo().username;
const envUser = process.env.USERNAME || process.env.USER || '';
const hostName = os.hostname();
const envHost = process.env.COMPUTERNAME || '';
const slashForms = (p) => {
  const b = p.split('/').join('\\');
  const f = p.split('\\').join('/');
  const out = [b, f, b.split('\\').join('\\\\')];   // JSON 문자열 안의 겹 역슬래시 꼴도
  const m = f.match(/^([A-Za-z]):\/(.*)$/);
  if (m) out.push(`/${m[1].toLowerCase()}/${m[2]}`);
  return out;
};
let worktreeRoot = ROOT;
let mainRoot = ROOT;
try {
  worktreeRoot = execFileSync('git', ['-C', DATA, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const common = execFileSync('git', ['-C', DATA, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
  mainRoot = path.dirname(common);
} catch { /* git 없음 — 스크립트 위치에서 잰 ROOT 만 쓴다 */ }

// sap.env 값
const SECRET_KEY = /USER|PASS|URL|HOST|DESCRIPTION|SECRET|TOKEN|KEY/i;
const envAlways = new Set();   // 언제나 위반(부분 일치)
const envWord = new Set();     // 낱말 경계 일치 · 팩 낱말이면 허용
let envExempt = 0;
let envRead = 0;
const profBase = path.join(home, '.sapkit', 'profiles');
const profNames = [];
if (fs.existsSync(profBase)) {
  for (const e of fs.readdirSync(profBase, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    profNames.push(e.name);
    const f = path.join(profBase, e.name, 'sap.env');
    if (!fs.existsSync(f)) continue;
    for (const line of read(f).split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, '');
      if (v.length < 3) continue;
      envRead++;
      if (SECRET_KEY.test(m[1])) envAlways.add(v);
      const hm = v.match(/^[a-z]+:\/\/([^/:?#]+)/i);
      if (hm) { envAlways.add(v); if (hm[1].length >= 3) envAlways.add(hm[1]); continue; }
      if (SECRET_KEY.test(m[1])) continue;
      if (wordIn(PACK, v, 'i')) { envExempt++; continue; }
      envWord.add(v);
    }
  }
}

// 다른 프로젝트 · 프로파일 이름
const swPath = path.join(ROOT, 'docs', 'reference', 'audits', '2026-11-05-harness-necessity-review-data', '00-switches.txt');
const grab = (line) => {
  const m = (line || '').match(/\(([^()]*)\)\s*$/);
  if (!m) return [];
  const inner = m[1].includes(':') ? m[1].split(':').slice(1).join(':') : m[1];
  return inner.split('·').map((s) => s.trim()).filter(Boolean);
};
const sw = fs.existsSync(swPath) ? read(swPath).replace(/\r\n/g, '\n').split('\n') : [];
const NAMES = [...new Set([...grab(sw[11]), ...grab(sw[13]), ...profNames])];
const lc = (s) => s.toLowerCase();
const stems = new Set();
for (const a of NAMES) for (const b of NAMES) {
  if (a === b) continue;
  let k = 0;
  while (k < a.length && k < b.length && lc(a[k]) === lc(b[k])) k++;
  if (k >= 4) stems.add(a.slice(0, k));
}

const userWordExempt = user && wordIn(PACK, user);
const SUBSTR = [   // 대소문자 무시 부분 일치
  ['user(home-path)', [...new Set([user, envUser].filter(Boolean))].flatMap((u) => [J('Users', '\\', u), J('Users', '\\\\', u), J('Users', '/', u)])],
  ['host', [...new Set([hostName, envHost].filter((s) => s && s.length >= 3))]],
  ['home', slashForms(home)],
  ['repo', [...new Set([...slashForms(worktreeRoot), ...slashForms(mainRoot)])]],
  ['sapenv', [...envAlways]],
  ['names', [...NAMES, ...stems]],
  ['forge', [J('dry', 'forge')]],
];

// SID 예외 — 일반 기술 낱말(판J 러너 · 레시피 실측 + 판K 자료가 쓰는 낱말). 금지 목록과 겹치면 예외에서 뺀다.
// MOD CTY IND — 판J J-10 문항 id 구성 토큰(K-MOD/K-CTY/K-IND) · 이벤트·로그·summary에 등장 · 2026-11-08 메인 추가
// ERR L47 LPF NIC OOS — 판K T5 답안 속 일반 약어(모델 작성 · 폴더 밖 읽기 0 · sapenv·names 불일치) · 2026-11-08 메인 추가
const GENERIC = new Set(['CLI', 'NET', 'RED', 'RAW', 'MET', 'BOM', 'UTF', 'CSV', 'TXT', 'UAC', 'ACE', 'XOR', 'FNV', 'INC', 'ACL', 'CNT', 'MOD', 'CTY', 'IND', 'ERR', 'L47', 'LPF', 'NIC', 'OOS']);   // INC = 판J 문항 꼬리표 K-INC · C-INC  // CNT — 판K T6 opus C-04 ABAP ALV 열 이름(모델 작명) · sapenv·names 불일치 확인 · 2026-11-08 메인 추가
const forbiddenLc = new Set([...envAlways, ...envWord, ...NAMES, ...stems].map(lc));
for (const g of [...GENERIC]) if (forbiddenLc.has(lc(g))) GENERIC.delete(g);
// 판J 자료 폴더 본문의 3자 토큰 — 팩 토큰과 같은 정규식 · 같은 낱말 경계. 널 바이트가 든 파일은 건너뛴다. 금지 목록과 겹치면 뺀다.
const PANJ_DIR = path.join(ROOT, 'docs', 'reference', 'audits', '2026-11-05-harness-necessity-review-data');
const PANJ_SID = new Set();
if (fs.existsSync(PANJ_DIR)) {
  for (const f of walk(PANJ_DIR)) {
    const buf = fs.readFileSync(f);
    if (buf.includes(0)) continue;
    for (const m of buf.toString('utf8').matchAll(SID_RE())) PANJ_SID.add(m[0]);
  }
} else say('WARN: panJ data folder missing — panJ tokens not allowed');
for (const t of [...PANJ_SID]) if (forbiddenLc.has(lc(t))) PANJ_SID.delete(t);
const sidAllowed = (t) => PACK_SID.has(t) || PANJ_SID.has(t) || GENERIC.has(t) || /^T\d\d$/.test(t);

function countSub(text, needle) {
  if (!needle) return [];
  const t = lc(text), n = lc(needle);
  const hits = [];
  let i = 0;
  while ((i = t.indexOf(n, i)) !== -1) { hits.push(i); i += n.length; }
  return hits;
}
function lineOf(text, idx) { let n = 1; for (let i = 0; i < idx && i < text.length; i++) if (text.charCodeAt(i) === 10) n++; return n; }

function scanText(text) {
  const v = [];   // [category, index]
  for (const [cat, needles] of SUBSTR) for (const n of needles) for (const i of countSub(text, n)) v.push([cat, i]);
  if (user && !userWordExempt) for (const m of text.matchAll(new RegExp(`(?<![A-Za-z0-9_])${esc(user)}(?![A-Za-z0-9_])`, 'g'))) v.push(['user(word)', m.index]);
  for (const w of envWord) for (const m of text.matchAll(new RegExp(`(?<![A-Za-z0-9_])${esc(w)}(?![A-Za-z0-9_])`, 'gi'))) v.push(['sapenv', m.index]);
  for (const m of text.matchAll(SID_RE())) if (!sidAllowed(m[0])) v.push(['sid', m.index]);
  for (const m of text.matchAll(UUID_RE())) if (!PACK_UUID.has(m[0].toLowerCase())) v.push(['uuid', m.index]);
  // 전자우편 주소(계정 식별) — 팩 본문에 글자 그대로 있는 것만 예외
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) if (!PACK.includes(m[0])) v.push(['email', m.index]);
  for (const m of text.matchAll(URL_RE())) { const u = trimUrl(m[0]); if (!PACK_URLS.has(u) && !PACK.includes(u)) v.push(['url', m.index]); }
  return v;
}

function scanPaths(paths, baseForRel) {
  const files = [];
  for (const p of paths) {
    const a = path.resolve(p);
    if (!fs.existsSync(a)) { files.push([a, 'missing']); continue; }
    if (fs.statSync(a).isDirectory()) for (const f of walk(a)) files.push([f, 'file']); else files.push([a, 'file']);
  }
  const rows = [];
  let total = 0;
  const byCat = {};
  for (const [f, kind] of files) {
    const rel = path.relative(baseForRel, f).split(path.sep).join('/');
    if (kind === 'missing') { rows.push(`  MISSING ${rel}`); total++; byCat.missing = (byCat.missing || 0) + 1; continue; }
    const buf = fs.readFileSync(f);
    if (buf.subarray(0, 8192).includes(0)) { rows.push(`  ${rel} — binary (null byte) 1`); total++; byCat.binary = (byCat.binary || 0) + 1; continue; }
    const text = buf.toString('utf8');
    const v = scanText(text);
    if (v.length) {
      total += v.length;
      const per = {};
      for (const [cat, idx] of v) { (per[cat] ||= []).push(lineOf(text, idx)); byCat[cat] = (byCat[cat] || 0) + 1; }
      rows.push(`  ${rel} — ` + Object.entries(per).map(([c, ls]) => `${c} ${ls.length} (lines ${[...new Set(ls)].slice(0, 12).join(',')})`).join(' · '));
    }
  }
  return { files: files.length, total, rows, byCat };
}

function header() {
  say(`K-99-namecheck — pack files ${packFiles.length} · pack URLs ${PACK_URLS.size} · pack 3-char tokens ${PACK_SID.size} · panJ 3-char tokens ${PANJ_SID.size}`);
  say(`  forbidden sets: user ${user ? 1 : 0} (word exempt as pack word: ${userWordExempt ? 'yes' : 'no'}) · host ${SUBSTR[1][1].length} · home ${SUBSTR[2][1].length} · repo ${SUBSTR[3][1].length} · sap.env values read ${envRead} (always ${envAlways.size} · word ${envWord.size} · pack-word exempt ${envExempt}) · names ${NAMES.length} + stems ${stems.size} · forge 1 · sid generic exempt ${GENERIC.size} + T\\d\\d`);
}

if (selftest) {
  header();
  say('');
  say('[selftest] 임시 폴더에 금지 문자열을 심고 각각 잡히는지 · 팩 URL과 팩 낱말은 통과하는지');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'k99-'));
  const cases = [];
  const plant = (name, content, expectCat) => { const f = path.join(tmp, `${name}.txt`); fs.writeFileSync(f, content, 'utf8'); cases.push([name, f, expectCat]); };
  plant('user-home', `path ${J('C:', '\\', 'Users', '\\')}${user}${J('\\', 'x')}\n`, 'user(home-path)');
  plant('home-json', `${JSON.stringify({ file_path: `${home}${J('\\', 'x')}` })}\n`, 'home');
  plant('email', `owner ${J('someone', '@', 'example-mail', '.test')}\n`, 'email');
  plant('host', `machine ${hostName}\n`, 'host');
  plant('repo', `at ${worktreeRoot.split('\\').join('/')}/x\n`, 'repo');
  const anyEnv = [...envAlways][0];
  if (anyEnv) plant('sapenv', `v ${anyEnv}\n`, 'sapenv');
  if (NAMES[0]) plant('names', `p ${NAMES[0]}\n`, 'names');
  plant('sid', `system ${J('QZ', '9')} here\n`, 'sid');
  plant('uuid', `id ${J('0f1e2d3c', '-4b5a-', '6978-', '8a9b-', '0c1d2e3f4a5b')}\n`, 'uuid');
  plant('url-outside', `see ${URL_HEAD}s://${J('example', '.invalid')}/a\n`, 'url');
  plant('forge', `dir .${J('dry', 'forge')}/x\n`, 'forge');
  const packUrl = [...PACK_URLS][0];
  const packTok = [...PACK_SID].find((t) => /^[A-Z]{3}$/.test(t)) || 'SAP';
  plant('pass-pack', `pack url ${packUrl || ''} and token ${packTok} and plain words\n`, null);
  let bad = 0;
  for (const [name, f, expectCat] of cases) {
    const v = scanText(read(f));
    const cats = [...new Set(v.map(([c]) => c))];
    const ok = expectCat === null ? v.length === 0 : cats.includes(expectCat);
    if (!ok) bad++;
    say(`  ${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(12)} expect ${expectCat === null ? 'no violation (pack URL + pack token)' : `caught as [${expectCat}]`} — got ${v.length} violation(s)${cats.length ? ` [${cats.join(',')}]` : ''}`);
  }
  if (!anyEnv) { say('  FAIL sapenv       no sap.env value available to plant'); bad++; }
  if (!packUrl) { say('  FAIL pass-pack    pack has no URL to test with'); bad++; }
  // 폴더 단위 스캔도 같은 결과를 내는지(종료 코드 계약)
  const dirRes = scanPaths([tmp], tmp);
  const expectedDir = cases.filter(([, , c]) => c !== null).length;
  const dirFilesWithV = dirRes.rows.length;
  const okDir = dirFilesWithV === expectedDir;
  if (!okDir) bad++;
  say(`  ${okDir ? 'OK  ' : 'FAIL'} folder scan  files with violations ${dirFilesWithV}/${expectedDir} (pass-pack file must not appear)`);
  for (const [, f] of cases) fs.unlinkSync(f);
  fs.rmdirSync(tmp);
  say(`  temp folder removed: ${!fs.existsSync(tmp)}`);
  say(`SELFTEST: ${bad === 0 ? 'PASS' : 'FAIL'}`);
  process.exit(bad === 0 ? 0 : 3);
}

header();
const res = scanPaths(targets, ROOT);
say(`scanned files ${res.files} · violations ${res.total}${res.total ? ' · by category ' + Object.entries(res.byCat).map(([c, n]) => `${c} ${n}`).join(' · ') : ''}`);
for (const r of res.rows) say(r);
say(`RESULT: ${res.total === 0 ? 'PASS' : 'FAIL'}`);
process.exit(res.total === 0 ? 0 : 1);
