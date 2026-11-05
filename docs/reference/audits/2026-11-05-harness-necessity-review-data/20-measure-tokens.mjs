#!/usr/bin/env node
// 판J T2 — 토큰 실측 (M-A). 재실행 가능한 측정 스크립트. 레포 의존성 0 (node 내장만).
//
// 무엇을 재는가 (E-1 · D-156 사전 등록 선):
//   1. MCP 도구 설명 — 제품 번들을 **프로파일 없이** `--exposition=<값>`으로 띄워 tools/list 바이트
//      (D-105 ⓔ 방식 · smoke-mcp.mjs probe() 패턴 그대로). 값별로 한 칸.
//   2. 제품 세션 고정(도구 설명 제외) — 스킬 description 19 · 에이전트 frontmatter 2 ·
//      project-context always-on 블록 · Claude 어댑터 매니페스트 · (크기만) 소유자 프로젝트의 실인스턴스.
//   3. 절차 호출 적재 5종 — 절차 본문 + 1-hop 정적 참조(규칙은 아래 TRACING RULE) · 2-hop은 별도 열.
//   4. 공방 세션 고정 — CLAUDE.md(+@include) · HANDOFF.md · 세션 시작 훅 주입 바이트.
//   5. 근사 두 가지 병기 — 바이트÷4 (D-105 관례) · 로컬 토크나이저(gpt-tokenizer cl100k_base; 있을 때만).
//   6. 선 대비 판정 — ÷4 값으로, 사전 등록된 선 그대로.
//   7. L5 기준선 대조 — abap-mcp-adt-powerup(실행 안 함 · 정적 grep만) vs sapkit-engine.
//
// 사용:
//   node docs/reference/audits/2026-11-05-harness-necessity-review-data/20-measure-tokens.mjs \
//        [--tokenizer-dir=<gpt-tokenizer가 설치된 디렉터리 · 레포 밖>] \
//        [--powerup=<abap-mcp-adt-powerup 체크아웃>] [--projects=<dir1;dir2>] [--workspace-root=<dir>]
//   산출: 같은 폴더의 20-tokens.txt (표) · 20-tokens-raw/ (원자료: tools/list JSON · 도구별 CSV · summary.json)
//
// 결정성: 같은 트리에서 두 번 돌리면 20-tokens.txt · summary.json이 바이트 동일해야 한다.
//   (훅 주입분이 `git status`를 읽으므로 산출 파일을 **훅 측정 전에** 먼저 만들어 둔다.)
//
// 안전: SAP 접속 0 (P0). 번들은 빈 임시 cwd + 빈 SAPKIT_HOME_DIR + SAP_*/MCP_* 제거 환경에서 뜬다 —
//   프로파일이 활성화될 길이 없다. 소유자 프로젝트 `.sapkit/`은 statSync(크기)만, 내용은 읽지 않는다.
//   powerup은 파일을 읽기만 하고 실행·설치하지 않는다.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// ── 경로 ────────────────────────────────────────────────────────────────────
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const INTERACTIVE = path.join(REPO, 'interactive');
const CORE = path.join(INTERACTIVE, 'core');
const BUNDLE = path.join(INTERACTIVE, 'server', 'server.bundle.cjs');
const LAUNCH = path.join(INTERACTIVE, 'server', 'launch.cjs');
const KEYRING_NODE_PATH = path.join(INTERACTIVE, 'server', 'runtime-deps', 'keyring', 'node_modules');
const RAW = path.join(HERE, '20-tokens-raw');
const OUT = path.join(HERE, '20-tokens.txt');

if (!fs.existsSync(BUNDLE)) {
  console.error(`번들 부재: ${BUNDLE} — 레포 루트 해석이 틀렸거나 체크아웃이 불완전하다`);
  process.exit(2);
}

// ── 인자 ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (k, d) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const TOKENIZER_DIR = argOf('tokenizer-dir', process.env.SAPKIT_T2_TOKENIZER_DIR || '');
const POWERUP = argOf('powerup', 'D:\\claude for SAP\\abap-mcp-adt-powerup');
const PROJECTS = argOf('projects', 'D:\\claude for SAP\\ZUNIVAT_RAP;D:\\claude for SAP\\JNC')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);
const WORKSPACE_ROOT = argOf('workspace-root', 'D:\\claude for SAP');
const DATE = new Date().toISOString().slice(0, 10);

// ── 산출 자리 선점 (결정성 — 훅이 읽는 git status를 1회차·2회차 동일하게) ───────
fs.mkdirSync(RAW, { recursive: true });
if (!fs.existsSync(OUT)) fs.writeFileSync(OUT, '');
const SUMMARY = path.join(RAW, 'summary.json');
if (!fs.existsSync(SUMMARY)) fs.writeFileSync(SUMMARY, '');

// ── 측정 도우미 ─────────────────────────────────────────────────────────────
const B = (s) => Buffer.byteLength(s, 'utf8');
const readText = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); // 레포 정본은 LF — CRLF 체크아웃 편차 제거
const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : String(n));
const div4 = (bytes) => Math.round(bytes / 4);

// 토크나이저 — 레포 밖에서만 든다. 없으면 n/a.
function loadTokenizer(dir) {
  if (!dir) return { available: false, reason: '--tokenizer-dir 미지정' };
  try {
    const req = createRequire(path.join(dir, 'package.json'));
    const cl = req('gpt-tokenizer/encoding/cl100k_base');
    const o2 = req('gpt-tokenizer/encoding/o200k_base');
    const ver = req('gpt-tokenizer/package.json').version;
    const safe = (enc) => (s) => {
      try {
        return enc.encode(s, { disallowedSpecial: new Set() }).length;
      } catch {
        return enc.encode(s).length;
      }
    };
    return { available: true, name: `gpt-tokenizer@${ver}`, cl100k: safe(cl), o200k: safe(o2) };
  } catch (e) {
    return { available: false, reason: `로드 실패: ${e.message}` };
  }
}
const TOK = loadTokenizer(TOKENIZER_DIR);

function measure(text) {
  const bytes = B(text);
  return {
    bytes,
    div4: div4(bytes),
    tok: TOK.available ? TOK.cl100k(text) : null,
    tok_o200k: TOK.available ? TOK.o200k(text) : null,
  };
}
function measureFile(p) {
  return { file: rel(p), ...measure(readText(p)) };
}
const sumM = (ms) => ({
  bytes: ms.reduce((a, m) => a + m.bytes, 0),
  div4: div4(ms.reduce((a, m) => a + m.bytes, 0)),
  tok: TOK.available ? ms.reduce((a, m) => a + (m.tok ?? 0), 0) : null,
  tok_o200k: TOK.available ? ms.reduce((a, m) => a + (m.tok_o200k ?? 0), 0) : null,
});
const cell = (m) => `${fmt(m.bytes)} B · ÷4 ${fmt(m.div4)} · tok ${m.tok == null ? 'n/a' : fmt(m.tok)}`;

// ── 사전 등록된 선 (D-156) — 그대로 적용. 선 사이 구간은 「측정 후 결정」으로 표기 ──
const judgeA = (t) => (t <= 3000 ? '가볍다 (≤3k)' : t > 8000 ? '과함 (>8k)' : '측정 후 결정 (3k~8k)');
const judgeB = (avg) =>
  avg <= 500 ? '가볍다 (≤500 B/도구)' : avg >= 740 ? '축소 후보 (≥740 B — D-105 수준)' : '선 사이 (500~740 · 미등록 구간)';
const judgeC = (t) => (t <= 15000 ? '가볍다 (≤15k)' : t > 30000 ? '축소 후보 (>30k)' : '선 사이 (15k~30k · 미등록 구간)');
const judgeD = (t) => (t <= 10000 ? '가볍다 (≤10k)' : t > 20000 ? '과함 (>20k)' : '선 사이 (10k~20k · 미등록 구간)');

// ── 1. MCP tools/list ───────────────────────────────────────────────────────
// smoke-mcp.mjs probe()와 같은 프로토콜: initialize → notifications/initialized → tools/list.
// 다른 점은 환경이다 — 프로파일이 절대 붙지 않도록 빈 cwd·빈 홈·SAP_*/MCP_* 제거.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-t2-'));
const EMPTY_CWD = path.join(TMP, 'cwd');
const EMPTY_HOME = path.join(TMP, 'home');
fs.mkdirSync(EMPTY_CWD);
fs.mkdirSync(EMPTY_HOME);
const redact = (s) =>
  s
    .split(TMP).join('<tmp>')
    .split(os.homedir()).join('<home>')
    .split(REPO).join('<repo>');

function probe(entry, expositionArg) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const k of Object.keys(env)) if (k.startsWith('SAP_') || k.startsWith('MCP_')) delete env[k];
    env.SAPKIT_HOME_DIR = EMPTY_HOME;
    env.NODE_PATH = KEYRING_NODE_PATH;
    const args = [entry];
    if (expositionArg != null) args.push(`--exposition=${expositionArg}`);
    const srv = spawn('node', args, { cwd: EMPTY_CWD, env });
    let buf = '';
    let stderr = '';
    const to = setTimeout(() => {
      srv.kill();
      reject(new Error('TIMEOUT (30s) — tools/list 무응답'));
    }, 30000);
    srv.stderr.on('data', (d) => (stderr += d));
    srv.on('exit', (c) => {
      if (c) {
        clearTimeout(to);
        reject(new Error(`서버 exit ${c}: ${redact(stderr).trim().split('\n')[0] || ''}`));
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
          resolve({ result: msg.result ?? {}, stderr: redact(stderr) });
        }
      }
    });
    srv.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'T2-measure', version: '0' } },
      }) + '\n'
    );
  });
}

const NS = 'mcp__plugin_sapkit_sap__'; // Claude Code가 도구 이름에 붙이는 접두어 (이 세션의 지연 도구 목록에서 관측)
const SURFACES = [
  { label: 'default', arg: null, note: '인자 없음 → 번들 기본값 readonly,high (exposition.ts DEFAULT_EXPOSITION)' },
  { label: 'readonly', arg: 'readonly', note: 'launch.cjs SURFACE_READONLY — toolSurface readonly · 미설정 · 알 수 없는 값 · tier≠DEV 전부' },
  { label: 'readonly,high', arg: 'readonly,high', note: 'launch.cjs SURFACE_DEVELOPMENT — toolSurface development (DEV tier에서만 허가)' },
  { label: 'high', arg: 'high', note: 'KNOWN_SETS 단독' },
  { label: 'compact', arg: 'compact', note: 'KNOWN_SETS 단독' },
  { label: 'low', arg: 'low', note: 'KNOWN_SETS 단독' },
  { label: 'system', arg: 'system', note: 'KNOWN_SETS 단독 (readonly가 함께 켜는 묶음)' },
  { label: 'search', arg: 'search', note: 'KNOWN_SETS 단독 (항상 켜지는 묶음)' },
  { label: 'all-sets', arg: 'readonly,high,compact,low,system,search', note: 'KNOWN_SETS 전부 (unknownArguments.test.ts ALL_SETS)' },
  { label: 'development(literal)', arg: 'development', note: 'D-105 ⓔ 함정 — 번들이 모르는 값 → 기본으로 안 돌아가고 거의 빈 표면' },
  { label: 'launch.cjs(config 없음)', arg: null, entry: LAUNCH, note: '런처 경유 · .sapkit/config.json 없음 → TOOLSURFACE_DEFAULT → readonly' },
];

async function measureSurfaces() {
  const rows = [];
  for (const s of SURFACES) {
    const safeLabel = s.label.replace(/[^A-Za-z0-9.-]+/g, '_');
    let r;
    try {
      r = await probe(s.entry ?? BUNDLE, s.arg);
    } catch (e) {
      rows.push({ ...s, error: e.message });
      continue;
    }
    const tools = r.result.tools ?? [];
    const toolsJson = JSON.stringify(tools);
    const resultJson = JSON.stringify(r.result);
    fs.writeFileSync(path.join(RAW, `tools-list.${safeLabel}.json`), resultJson);
    fs.writeFileSync(path.join(RAW, `stderr.${safeLabel}.txt`), r.stderr);
    const perTool = tools
      .map((t) => ({
        name: t.name,
        total: B(JSON.stringify(t)),
        description: B(t.description ?? ''),
        schema: B(JSON.stringify(t.inputSchema ?? {})),
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    fs.writeFileSync(
      path.join(RAW, `tools-per-tool.${safeLabel}.csv`),
      'name,total_bytes,description_bytes,schema_bytes\n' + perTool.map((t) => `${t.name},${t.total},${t.description},${t.schema}`).join('\n') + '\n'
    );
    const names = tools.map((t) => t.name).sort();
    const namesJson = JSON.stringify(names);
    const namesPrefixed = names.map((n) => NS + n).join('\n');
    const m = measure(toolsJson);
    rows.push({
      ...s,
      count: tools.length,
      bytes_tools: m.bytes,
      len16_result: resultJson.length,
      div4: m.div4,
      tok: m.tok,
      tok_o200k: m.tok_o200k,
      avg: tools.length ? Math.round(m.bytes / tools.length) : 0,
      avg_description: tools.length ? Math.round(perTool.reduce((a, t) => a + t.description, 0) / tools.length) : 0,
      description_total: perTool.reduce((a, t) => a + t.description, 0),
      schema_total: perTool.reduce((a, t) => a + t.schema, 0),
      names_json: measure(namesJson),
      names_prefixed: measure(namesPrefixed),
      top10: perTool.slice(0, 10),
      stderr_first: r.stderr.trim().split('\n').filter(Boolean).slice(0, 3),
    });
  }
  return rows;
}

// ── 2. 제품 세션 고정 (도구 설명 제외) ──────────────────────────────────────
function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return { fm: {}, fmText: '', body: text };
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return { fm: {}, fmText: '', body: text };
  const fmText = text.slice(4, end);
  const lines = fmText.split('\n');
  const fm = {};
  let key = null;
  let mode = null; // 'list' | 'fold' | 'keep'
  for (const line of lines) {
    const kv = /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(line);
    if (kv && !line.startsWith(' ')) {
      key = kv[1];
      const v = kv[2].trim();
      if (v === '' ) { fm[key] = []; mode = 'list'; }
      else if (v === '>' || v === '>-' || v === '>+') { fm[key] = ''; mode = 'fold'; }
      else if (v === '|' || v === '|-' || v === '|+') { fm[key] = ''; mode = 'keep'; }
      else { fm[key] = v.replace(/^(['"])(.*)\1$/, '$2'); mode = null; }
      continue;
    }
    if (key == null) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && (mode === 'list' || Array.isArray(fm[key]))) { if (!Array.isArray(fm[key])) fm[key] = []; fm[key].push(item[1].trim()); continue; }
    if (mode === 'fold') fm[key] = (fm[key] ? fm[key] + ' ' : '') + line.trim();
    else if (mode === 'keep') fm[key] = fm[key] + line.trim() + '\n';
  }
  for (const k of Object.keys(fm)) if (typeof fm[k] === 'string') fm[k] = fm[k].trim();
  return { fm, fmText, body: text.slice(end + 5) };
}

function sectionOf(text, headingPrefix) {
  // `## <headingPrefix>…` 부터 다음 `## ` 직전까지 (헤딩 줄 포함)
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith('## ') && l.slice(3).startsWith(headingPrefix));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (lines[i].startsWith('## ')) { end = i; break; }
  return lines.slice(start, end).join('\n');
}

function measureProductFixed() {
  // (a) 스킬 19 — frontmatter description
  const skillsDir = path.join(INTERACTIVE, 'skills');
  const skills = fs
    .readdirSync(skillsDir)
    .filter((d) => fs.existsSync(path.join(skillsDir, d, 'SKILL.md')))
    .sort()
    .map((d) => {
      const p = path.join(skillsDir, d, 'SKILL.md');
      const text = readText(p);
      const { fm, fmText } = parseFrontmatter(text);
      const desc = typeof fm.description === 'string' ? fm.description : '';
      return {
        skill: d,
        name: fm.name,
        description: measure(desc),
        rendered: measure(`- sapkit:${fm.name}: ${desc}`), // 이 세션의 스킬 목록에서 관측한 호스트 렌더 형식
        frontmatter: measure(fmText),
        wrapper: measure(text),
        description_text: desc,
      };
    });

  // (b) 에이전트 2
  const agentsDir = path.join(INTERACTIVE, 'agents');
  const agents = fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const p = path.join(agentsDir, f);
      const text = readText(p);
      const { fm, fmText } = parseFrontmatter(text);
      const desc = typeof fm.description === 'string' ? fm.description : '';
      const deny = Array.isArray(fm.disallowedTools) ? fm.disallowedTools : [];
      const toolsClause = deny.length ? ` (Tools: All tools except ${deny.join(', ')})` : '';
      return {
        agent: f,
        name: fm.name,
        description: measure(desc),
        disallowed_count: deny.length,
        frontmatter: measure(fmText),
        rendered: measure(`- sapkit:${fm.name}: ${desc}${toolsClause}`), // 이 세션의 에이전트 목록에서 관측한 호스트 렌더 형식
        body: measure(text),
      };
    });

  // (c) project-context always-on 블록
  const pcPath = path.join(CORE, 'project-context.md');
  const pcText = readText(pcPath);
  const ladder = sectionOf(pcText, 'Consumption contract');
  const talk = sectionOf(pcText, 'How this talks to the user');
  const ssPath = path.join(CORE, 'policies', 'sap-standards.md');
  const ssAlways = sectionOf(readText(ssPath), 'Always-on summary');
  const projectContext = {
    whole: measureFile(pcPath),
    ladder: ladder ? measure(ladder) : null,
    talk: talk ? measure(talk) : null,
    sap_standards_always_on: ssAlways ? measure(ssAlways) : null,
  };

  // (c′) 실인스턴스 — 크기만 (statSync · 내용 무접촉)
  const instanceFiles = ['config.json', 'active-profile.txt', 'RULES.md', 'LESSONS.md', 'knowledge/domain.md', 'knowledge/system.md'];
  const instances = PROJECTS.map((dir) => {
    const sk = path.join(dir, '.sapkit');
    const exists = fs.existsSync(sk);
    const files = {};
    for (const f of instanceFiles) {
      const p = path.join(sk, f);
      files[f] = fs.existsSync(p) ? fs.statSync(p).size : null;
    }
    return { project: path.basename(dir), sapkit_dir: exists, files };
  });

  // (d) Claude 어댑터 매니페스트 — 호스트가 세션 시작에 읽는 것 (파싱용 · 컨텍스트 주입 아님)
  const manifests = [
    path.join(INTERACTIVE, '.claude-plugin', 'plugin.json'),
    path.join(INTERACTIVE, '.mcp.json'),
    path.join(INTERACTIVE, 'plugin.json'),
  ]
    .filter((p) => fs.existsSync(p))
    .map(measureFile);
  const hooksInstalledByDefault = 0; // D-062 — 훅은 선택 기능 · 기본 미설치

  return { skills, agents, projectContext, instances, manifests, hooksInstalledByDefault };
}

// ── 3. 절차 호출 적재 — 1-hop 정적 참조 추적 ─────────────────────────────────
// TRACING RULE (적용 규칙 — 결과를 다시 내려면 이 규칙으로):
//   R1  마크다운 링크 `[..](<상대경로>.md[#앵커])` — 절차 파일 위치 기준으로 해석.
//   R2  백틱 경로 `` `<경로>.md` `` — `../`·`./`·`PLUGIN_ROOT/`·`${CLAUDE_PLUGIN_ROOT}/`·맨 이름 전부 시도.
//       중괄호 열거 `{a,b}.md`는 전개. `{MODULE}`·`<key>`·`<iso>`·`*` 같은 자리표시는 「매개(parametric)」로
//       따로 두고 합계에 넣지 않는다.
//   포함 조건  해석된 파일이 실존하고 `interactive/core/**` 아래이며 자기 자신이 아닐 것.
//   제외       frontmatter · 펜스 코드 블록(```) 안 · 「길 안내」 절(Related* · See also · Use When ·
//              Do Not Use When · When to Use · When NOT to Use)의 링크 — 이것들은 다른 절차로 보내는
//              안내지 읽으라는 지시가 아니다. 제외분은 목록으로 남겨 재계산 가능하게 한다.
//   선택군     「하나만 고르라」는 열거 — 같은 줄 또는 같은 표 안에 같은 디렉터리의 파일이 3개 이상 있고,
//   (one-of-N) 그 줄(표면 표의 바로 앞 소개 줄)에 선택 단서(e.g. · matching · selected · pick · choose)가
//              있으면 선택군이다(README.md·INDEX.md는 선택군 원소가 아니다 — 색인은 늘 읽는다). 선택군은
//              **가장 큰 원소 1개**만 합계에 넣고(한 번의 호출이 고르는 것은 하나이므로 · 상한 쪽 대표) 나머지는
//              「선택군 대안」으로 열거한다. 선택군을 전부 더한 값은 「전수 상한」으로 따로 둔다.
//              단서가 없는 열거(예: create-program 「Shared Conventions — load and apply each one」)는 전부 더한다.
//   비-core    실존하되 core 밖(adapters/README 등)은 「non-core」로 열거만. 실존하지 않는 것(.sapkit 산출물
//              이름 · 템플릿 파일명)은 「unresolved」로 센다.
//   2-hop      1-hop 파일 각각에 같은 규칙(선택군 포함)을 적용해 {절차, 1-hop} 밖의 core 파일 — 별도 열, 합계 분리.
const NAV_RE = /^(related|see also|use when|do not use when|when to use|when not to use)/i;
const SEL_CUE = /e\.g\.|\b(matching|selected|pick|choose)\b/i; // "e.g.,"는 \b가 안 걸린다(.와 , 사이) — 앞에 둔다
const INDEX_RE = /^(README|INDEX)\.md$/i;

function expandBraces(s) {
  const m = /\{([^{}]*,[^{}]*)\}/.exec(s);
  if (!m) return [s];
  return m[1].split(',').flatMap((alt) => expandBraces(s.slice(0, m.index) + alt.trim() + s.slice(m.index + m[0].length)));
}
const isParametric = (s) => /\{[A-Za-z_]+\}|<[^>]+>|\*/.test(s);

function extractRefs(filePath) {
  const text = readText(filePath);
  const { body } = parseFrontmatter(text);
  const dir = path.dirname(filePath);
  const found = []; // {raw, resolved, cls, nav, line, heading, group, cue}
  let inFence = false;
  let heading = '';
  let tableId = 0;
  let inTable = false;
  let tableIntro = '';
  const lines = body.split('\n');
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (h) { heading = h[1].trim(); inTable = false; return; }
    const isTableRow = /^\s*\|/.test(line);
    if (isTableRow && !inTable) {
      // 표 시작 — 바로 앞의 비어 있지 않은 줄(최대 3줄 위)이 소개 줄
      inTable = true;
      tableId += 1;
      tableIntro = '';
      for (let k = i - 1; k >= Math.max(0, i - 3); k--) if (lines[k].trim()) { tableIntro = lines[k].trim(); break; }
    } else if (!isTableRow) inTable = false;
    const nav = NAV_RE.test(heading);
    const raws = [];
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+?\.md)(?:#[^)]*)?\)/g)) raws.push({ raw: m[1], rule: 'R1' });
    for (const m of line.matchAll(/`([^`\n]*?\.md)`/g)) raws.push({ raw: m[1], rule: 'R2' });
    const group = isTableRow ? `table#${tableId}` : `line#${i + 1}`;
    const cueText = isTableRow ? tableIntro : line;
    const cue = SEL_CUE.test(cueText);
    for (const { raw, rule } of raws) {
      if (isParametric(raw)) { found.push({ raw, rule, cls: 'parametric', nav, line: i + 1, heading, group, cue }); continue; }
      for (const one of expandBraces(raw)) {
        let target = one.replace(/^\$\{CLAUDE_PLUGIN_ROOT\}\//, 'PLUGIN_ROOT/');
        const resolved = target.startsWith('PLUGIN_ROOT/') ? path.join(INTERACTIVE, target.slice('PLUGIN_ROOT/'.length)) : path.resolve(dir, target);
        if (path.resolve(resolved) === path.resolve(filePath)) continue;
        let cls;
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) cls = 'unresolved';
        else if (!path.resolve(resolved).startsWith(CORE + path.sep)) cls = 'non-core';
        else cls = 'core';
        found.push({ raw: one, rule, cls, nav, line: i + 1, heading, group, cue, cueText: cueText.slice(0, 90), resolved: cls === 'unresolved' ? null : path.resolve(resolved) });
      }
    }
  });
  // 선택군 판정 — 같은 group 안에서 같은 디렉터리의 core 파일이 3개 이상이고 단서가 있으면, 가장 큰 1개만 대표
  const groups = new Map();
  for (const f of found) {
    if (f.cls !== 'core' || f.nav || !f.cue || INDEX_RE.test(path.basename(f.resolved))) continue;
    const key = `${f.group}|${path.dirname(f.resolved)}`;
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key).set(f.resolved, f);
  }
  const selections = [];
  for (const [key, members] of groups) {
    if (members.size < 3) continue;
    const sized = [...members.keys()].map((p) => ({ p, bytes: B(readText(p)) })).sort((a, b) => b.bytes - a.bytes || a.p.localeCompare(b.p));
    const rep = sized[0].p;
    for (const f of found) if (f.cls === 'core' && members.has(f.resolved) && f.resolved !== rep) f.selAlt = true;
    const any = members.values().next().value;
    selections.push({ group: key.split('|')[0], line: any.line, cueText: any.cueText, representative: rel(rep), members: sized.map((s) => `${path.basename(s.p)} ${s.bytes}`) });
  }
  return Object.assign(found, { selections });
}

// collapse=true → 선택군은 대표 1개만(환산) · false → 전부(전수 상한)
function hopSet(found, collapse = true) {
  const set = new Map();
  for (const f of found) if (f.cls === 'core' && !f.nav && !(collapse && f.selAlt)) set.set(f.resolved, f);
  return set;
}

const PROCEDURES = ['create-program', 'program-to-spec', 'ask-consultant', 'modify-object', 'troubleshooting'];

function measureProcedures() {
  const rows = [];
  for (const name of PROCEDURES) {
    const procPath = path.join(CORE, 'procedures', `${name}.md`);
    const wrapperPath = path.join(INTERACTIVE, 'skills', name, 'SKILL.md');
    const pcPath = path.join(CORE, 'project-context.md');
    const found = extractRefs(procPath);
    const hop1 = hopSet(found, true); // 환산 (선택군 대표 1개)
    const hop1All = hopSet(found, false); // 전수 상한
    const hop1Files = [...hop1.keys()].sort().map(measureFile);
    const hop1AllFiles = [...hop1All.keys()].sort().map(measureFile);
    const selAlts = [...hop1All.keys()].filter((p) => !hop1.has(p)).sort().map(measureFile);
    const navExcluded = [...new Set(found.filter((f) => f.cls === 'core' && f.nav).map((f) => rel(f.resolved)))].sort();
    const parametric = [...new Set(found.filter((f) => f.cls === 'parametric').map((f) => f.raw))].sort();
    const nonCore = [...new Set(found.filter((f) => f.cls === 'non-core').map((f) => rel(f.resolved)))].sort();
    const unresolved = [...new Set(found.filter((f) => f.cls === 'unresolved').map((f) => f.raw))].sort();
    // 2-hop (환산 규칙 그대로)
    const seen = new Set([path.resolve(procPath), ...hop1.keys()]);
    const hop2 = new Map();
    for (const p of hop1.keys()) for (const [q, f] of hopSet(extractRefs(p), true)) if (!seen.has(q) && !hop2.has(q)) hop2.set(q, { via: rel(p), ...f });
    const hop2Files = [...hop2.keys()].sort().map((q) => ({ ...measureFile(q), via: hop2.get(q).via }));

    const wrapper = measureFile(wrapperPath);
    const projectContext = measureFile(pcPath);
    const procedure = measureFile(procPath);
    const hop1Sum = sumM(hop1Files);
    const hop1AllSum = sumM(hop1AllFiles);
    const hop2Sum = sumM(hop2Files);
    const procPlusHop1 = sumM([procedure, ...hop1Files]);
    const total = sumM([wrapper, projectContext, procedure, ...hop1Files]);
    const totalAll = sumM([wrapper, projectContext, procedure, ...hop1AllFiles]);
    rows.push({ name, wrapper, projectContext, procedure, hop1Files, hop1Sum, hop1AllCount: hop1AllFiles.length, hop1AllSum, selAlts, selections: found.selections, procPlusHop1, total, totalAll, hop2Files, hop2Sum, navExcluded, parametric, nonCore, unresolved });
  }
  // ask-consultant + 페르소나 1명(sap-fi-consultant): 페르소나 파일 + 그 파일이 Load:/See로 지시하는 1-hop (같은 규칙)
  const ac = rows.find((r) => r.name === 'ask-consultant');
  const personaPath = path.join(CORE, 'personas', 'sap-fi-consultant.md');
  const pFound = extractRefs(personaPath);
  const pHop = hopSet(pFound, true);
  const already = new Set([path.resolve(path.join(CORE, 'procedures', 'ask-consultant.md')), ...ac.hop1Files.map((m) => path.resolve(REPO, m.file))]);
  const personaHopFiles = [...pHop.keys()].filter((p) => !already.has(p)).sort().map(measureFile);
  const persona = measureFile(personaPath);
  const personaParametric = [...new Set(pFound.filter((f) => f.cls === 'parametric').map((f) => f.raw))].sort();
  const personaRow = {
    name: 'ask-consultant + sap-fi-consultant',
    base: ac.total,
    persona,
    personaHopFiles,
    personaHopSum: sumM(personaHopFiles),
    personaParametric,
    personaSelections: pFound.selections,
    total: sumM([ac.wrapper, ac.projectContext, ac.procedure, ...ac.hop1Files, persona, ...personaHopFiles]),
  };
  return { rows, personaRow };
}

// ── 4. 공방 세션 고정 ───────────────────────────────────────────────────────
function measureWorkshop() {
  const claudeMd = path.join(REPO, 'CLAUDE.md');
  const claudeText = readText(claudeMd);
  const includes = [...claudeText.matchAll(/^@(\S+)\s*$/gm)].map((m) => m[1]).map((f) => path.resolve(REPO, f)).filter((p) => fs.existsSync(p));
  const files = [claudeMd, ...includes, path.join(REPO, 'HANDOFF.md')].map(measureFile);

  // 세션 시작 훅 — 호스트 계약: `python <hook>` · cwd=프로젝트 루트 · stdin에 이벤트 JSON · stdout에
  // {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}} 한 줄.
  // 훅 소스 확인: git rev-parse/status/log 읽기 + print 뿐 — 쓰기 없음. HARNESS_RUN이 있으면 아무것도 안 낸다.
  const hookPath = path.join(REPO, '.claude', 'hooks', 'session-start-context.py');
  let hook;
  if (!fs.existsSync(hookPath)) hook = { available: false, reason: '훅 파일 부재' };
  else {
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
    delete env.HARNESS_RUN;
    const r = spawnSync('python', ['-I', hookPath], {
      cwd: REPO,
      env,
      input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: REPO }),
      encoding: 'utf8',
      timeout: 20000,
    });
    if (r.error || r.status !== 0) hook = { available: false, reason: `실행 실패: ${r.error?.message ?? `exit ${r.status}`}` };
    else {
      const stdout = r.stdout ?? '';
      let ctx = null;
      try { ctx = JSON.parse(stdout.trim()).hookSpecificOutput.additionalContext; } catch { ctx = null; }
      fs.writeFileSync(path.join(RAW, 'hook-session-start.stdout.txt'), redact(stdout));
      hook = {
        available: true,
        stdout: measure(stdout),
        additionalContext: ctx == null ? null : measure(ctx),
        note: 'additionalContext에 git 브랜치·status(상위 20줄)·최근 커밋 5줄이 들어가므로 트리 상태에 따라 변한다 — 고정 문구(RESUME_NOTE)는 그 일부',
      };
    }
  }
  const cellFiles = sumM(files);
  const cellTotal = sumM([...files, ...(hook.available && hook.additionalContext ? [hook.additionalContext] : [])]);

  // 참고 — 셀 밖 (이 머신에서 세션에 같이 들어오지만 사전 등록 셀은 레포 루트 3종 + 훅)
  const refs = [path.join(WORKSPACE_ROOT, 'CLAUDE.md'), path.join(WORKSPACE_ROOT, 'AGENTS.md'), path.join(os.homedir(), '.claude', 'CLAUDE.md')]
    .filter((p) => fs.existsSync(p))
    .map((p) => ({ label: p.startsWith(os.homedir()) ? '~/.claude/CLAUDE.md (사용자 전역)' : `${path.basename(WORKSPACE_ROOT)}/${path.basename(p)} (상위 폴더)`, ...measure(readText(p)) }));
  return { files, hook, cellFiles, cellTotal, refs };
}

// ── 7. L5 기준선 — 정적 분석만 (실행·설치 없음) ───────────────────────────────
function grepLines(file, re) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  readText(file).split('\n').forEach((l, i) => { if (re.test(l)) out.push({ line: i + 1, text: l.trim().slice(0, 140) }); });
  return out;
}
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '__tests__') walk(p, acc); }
    else acc.push(p);
  }
  return acc;
}
function stringLiterals(ts) {
  const out = [];
  for (const m of ts.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) out.push(m[1] ?? m[2] ?? m[3] ?? '');
  return out;
}

function measurePowerup() {
  if (!fs.existsSync(POWERUP)) return { available: false, reason: `체크아웃 부재: ${POWERUP}` };
  const pkg = JSON.parse(fs.readFileSync(path.join(POWERUP, 'package.json'), 'utf8'));
  const head = spawnSync('git', ['-C', POWERUP, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  const groupsDir = path.join(POWERUP, 'src', 'lib', 'handlers', 'groups');
  const groups = fs.readdirSync(groupsDir).filter((f) => f.endsWith('HandlersGroup.ts')).sort();
  const byGroup = {};
  const nameToGroups = new Map();
  const descBytes = new Map();
  for (const g of groups) {
    const gPath = path.join(groupsDir, g);
    const text = readText(gPath);
    const names = [];
    for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      if (!/TOOL_DEFINITION/.test(m[1])) continue;
      const hPath = path.resolve(path.dirname(gPath), m[2] + (m[2].endsWith('.ts') ? '' : '.ts'));
      if (!fs.existsSync(hPath)) { names.push(`?missing:${m[2]}`); continue; }
      const h = readText(hPath);
      const defIdx = h.indexOf('export const TOOL_DEFINITION');
      const after = defIdx >= 0 ? h.slice(defIdx) : h;
      const nm = /name:\s*['"]([A-Za-z0-9_]+)['"]/.exec(after);
      const name = nm ? nm[1] : `?noname:${path.basename(hPath)}`;
      names.push(name);
      if (!nameToGroups.has(name)) nameToGroups.set(name, []);
      nameToGroups.get(name).push(g.replace('HandlersGroup.ts', ''));
      if (!descBytes.has(name)) {
        const d = /description:\s*([\s\S]*?)\n\s*inputSchema:/.exec(after);
        descBytes.set(name, d ? B(stringLiterals(d[1]).join('')) : 0);
      }
    }
    byGroup[g.replace('HandlersGroup.ts', '')] = names.length;
  }
  const distinct = [...nameToGroups.keys()].sort();
  const dupes = distinct.filter((n) => nameToGroups.get(n).length > 1);
  const defaultGroups = new Set(['ReadOnly', 'HighLevel', 'System', 'Search']); // 기본 exposition readonly,high + readonly→system + search 상시
  const defaultSurface = distinct.filter((n) => nameToGroups.get(n).some((g) => defaultGroups.has(g)));
  const descTotal = [...descBytes.values()].reduce((a, b) => a + b, 0);
  const handlerFiles = walk(path.join(POWERUP, 'src', 'handlers')).filter((p) => p.endsWith('.ts'));
  const defFiles = handlerFiles.filter((p) => /export const TOOL_DEFINITION/.test(readText(p))).length;
  fs.writeFileSync(path.join(RAW, 'powerup-registered-tools.csv'), 'name,groups,description_bytes_static\n' + distinct.map((n) => `${n},${nameToGroups.get(n).join('+')},${descBytes.get(n)}`).join('\n') + '\n');
  const src = path.join(POWERUP, 'src');
  return {
    available: true,
    name: pkg.name,
    version: pkg.version,
    head: head.status === 0 ? head.stdout.trim() : 'n/a',
    groups: byGroup,
    registered_distinct: distinct.length,
    duplicates_across_groups: dupes.length,
    default_surface_static: defaultSurface.length,
    handler_files_with_definition: defFiles,
    avg_description_static: distinct.length ? Math.round(descTotal / distinct.length) : 0,
    default_exposition: grepLines(path.join(src, 'lib', 'config', 'ServerConfigManager.ts'), /exposition\.length > 0 \? exposition : \[/),
    known_sets: grepLines(path.join(src, 'lib', 'config', 'ServerConfigManager.ts'), /s === 'readonly' \|\| s === 'high'/),
    tier_gate: grepLines(path.join(src, 'lib', 'readonlyGuard.ts'), /export function (checkToolAllowed|guardTool)|ERR_READONLY_TIER/),
    tier_default: grepLines(path.join(src, 'lib', 'profile.ts'), /SAP_TIER defaults to 'DEV'|let activeTier: Tier = 'DEV'/),
    blocklist: grepLines(path.join(src, 'lib', 'policy', 'tableBlocklist.ts'), /process\.env\.MCP_BLOCKLIST_PROFILE|readSetEnv\('MCP_ALLOW_TABLE'\)|`standard` — minimal/),
    blocklist_env_wiped: grepLines(path.join(src, 'lib', 'profile.ts'), /'MCP_BLOCKLIST_PROFILE'|'MCP_ALLOW_TABLE'|delete process\.env\[key\]/),
    unknown_args: walk(src).filter((p) => p.endsWith('.ts')).flatMap((p) => grepLines(p, /validateToolInput|additionalProperties|unknown argument/i).map((l) => ({ file: path.relative(POWERUP, p), ...l }))),
  };
}

function measureEngineStatic() {
  const eng = path.join(REPO, 'sapkit-engine', 'src');
  const reg = readText(path.join(eng, 'tools', 'registry.ts'));
  // 줄 머리 앵커(^ · m) — 머리주석의 예시 `* export const TOOL_REGISTRY`를 잡으면 import 블록까지 삼킨다
  const arr = /^export const TOOL_REGISTRY[^=]*=\s*\[([\s\S]*?)\n\];/m.exec(reg);
  const ids = arr ? arr[1].split('\n').map((l) => l.replace(/\/\/.*$/, '').trim()).filter((l) => /^[A-Za-z_]\w*,$/.test(l)).map((l) => l.slice(0, -1)) : [];
  return {
    registry_identifiers: ids.length,
    registry_distinct: new Set(ids).size,
    tier_gate: grepLines(path.join(eng, 'safety', 'tier.ts'), /UNKNOWN.*sentinel|fail-closed and positive/),
    blocklist: grepLines(path.join(eng, 'safety', 'blocklist.ts'), /DEFAULT_BLOCKLIST_PROFILE: BlocklistProfileName = |only in the tightening direction/),
    unknown_args: grepLines(path.join(eng, 'server', 'unknownArguments.ts'), /UNKNOWN_ARGUMENT_REJECTION =|seam\.validateToolInput = /),
    version_line: readText(path.join(INTERACTIVE, 'server', 'VERSION')).split('\n')[0],
    integrity: JSON.parse(fs.readFileSync(path.join(INTERACTIVE, 'server', 'integrity.json'), 'utf8')),
  };
}

// ── 보고 ────────────────────────────────────────────────────────────────────
// 표시 폭 — 한글·CJK·전각은 2칸 (고정폭 글꼴에서 표가 맞게)
function dw(s) {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    w += (c >= 0x1100 && c <= 0x11ff) || (c >= 0x2e80 && c <= 0x303f) || (c >= 0x3040 && c <= 0x33ff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xff60) ? 2 : 1;
  }
  return w;
}
function pad(s, n) { s = String(s); const w = dw(s); return w >= n ? s : s + ' '.repeat(n - w); }
function lpad(s, n) { s = String(s); const w = dw(s); return w >= n ? s : ' '.repeat(n - w) + s; }
function table(headers, rows, rightCols = []) {
  const widths = headers.map((h, i) => Math.max(dw(h), ...rows.map((r) => dw(r[i]))));
  const line = (r) => '| ' + r.map((c, i) => (rightCols.includes(i) ? lpad(c, widths[i]) : pad(c, widths[i]))).join(' | ') + ' |';
  return [line(headers), '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|', ...rows.map(line)].join('\n');
}

async function main() {
  const verify = spawnSync('node', [path.join(INTERACTIVE, 'server', 'verify-engine.mjs')], { cwd: REPO, encoding: 'utf8' });
  const verifyLine = (verify.stdout || verify.stderr || '').trim().split('\n')[0];

  const surfaces = await measureSurfaces();
  const product = measureProductFixed();
  const procs = measureProcedures();
  const workshop = measureWorkshop();
  const powerup = measurePowerup();
  const engine = measureEngineStatic();
  const dflt = surfaces.find((s) => s.label === 'default');
  const ro = surfaces.find((s) => s.label === 'readonly');

  const L = [];
  const H = (s) => L.push('', s, '='.repeat(Math.min(100, s.length * 2)));
  const h = (s) => L.push('', s, '-'.repeat(Math.min(100, s.length * 2)));

  L.push('판J T2 — 토큰 실측 (M-A)');
  L.push('=====================================================================');
  L.push(`측정일: ${DATE} · node ${process.version} · 플랫폼 ${process.platform}`);
  L.push(`번들: ${verifyLine}   ← verify-engine.mjs가 찍은 줄 그대로 (수치를 다른 문서에 복제하지 말 것)`);
  L.push(`토크나이저: ${TOK.available ? TOK.name + ' · cl100k_base (표의 tok 열) · o200k_base (summary.json)' : 'n/a — ' + TOK.reason + ' → ÷4만'}`);
  L.push('바이트 = UTF-8 · 파일은 CRLF→LF 정규화 후 측정(레포 정본은 LF) · ÷4 = 반올림 · 판정은 ÷4 값으로(D-156).');
  L.push('원자료: 20-tokens-raw/ (tools/list JSON 표면별 · 도구별 CSV · stderr · 훅 stdout · powerup 등록 목록 · summary.json)');

  // 1
  H('1. MCP 도구 설명 — tools/list 바이트 (프로파일 없음 · inspection-only · SAP 접속 0)');
  L.push('선 ⓑ: 평균 ≤500 B/도구 = 가볍다 · ~740 B(D-105 수준) = 축소 후보. 평균 = tools 배열 JSON 바이트 ÷ 도구 수 (D-105와 같은 셈).');
  L.push('names-only = 도구 이름만의 JSON 배열 — 스키마를 지연 적재하는 하네스가 세션 시작에 치르는 값. prefixed = Claude Code 지연 목록 형식(`mcp__plugin_sapkit_sap__<이름>` 줄바꿈 연결).');
  L.push('');
  L.push(
    table(
      ['exposition', '도구', 'tools JSON B', '÷4', 'tok', 'B/도구', 'desc B/도구', 'names-only B (÷4)', 'prefixed B', '판정 ⓑ'],
      surfaces.map((s) =>
        s.error
          ? [s.label, '실패', s.error, '', '', '', '', '', '', '측정 불가']
          : [s.label, s.count, fmt(s.bytes_tools), fmt(s.div4), s.tok == null ? 'n/a' : fmt(s.tok), s.avg, s.avg_description, `${fmt(s.names_json.bytes)} (${fmt(s.names_json.div4)})`, fmt(s.names_prefixed.bytes), s.count ? judgeB(s.avg) : '도구 0 — 판정 대상 아님']
      ),
      [1, 2, 3, 4, 5, 6, 7, 8]
    )
  );
  L.push('');
  for (const s of surfaces) L.push(`  · ${s.label}: ${s.note}${s.error ? '' : ` · JSON.stringify(result).length=${fmt(s.len16_result)}`}${s.stderr_first?.length ? ' · stderr: ' + s.stderr_first.join(' ⏎ ') : ''}`);
  L.push('');
  L.push('불가(프로파일 필요) — 접속 표면(RFC/connected 전용 31종이 더 뜨는 표면)은 이 판에서 띄우지 않았다(P0). D-105 ⓑ 실측(2026-08-23 · 소유자 머신 · 프로파일 활성)을 그 칸에 인용한다:');
  L.push('  | readonly (연결)       | 74  | 54,763 B  | ~13.7k | 740 B/도구 → 축소 후보 (D-105가 과녁으로 지목한 바로 그 수치) |');
  L.push('  | readonly,high (연결)  | 186 | 159,627 B | ~39.9k | 858 B/도구 → 축소 후보 |');
  if (ro && !ro.error) L.push(`  대조: 지금 inspection-only readonly는 ${ro.count}종 ${fmt(ro.bytes_tools)} B — D-105 연결 readonly(74종 54,763 B)보다 도구는 ${74 - ro.count}종 적은데 바이트는 거의 같다. 그 사이 설명 덧말(D-145·D-147·D-152 append-only)이 들어간 결과로 읽힌다(추정 · 같은 조건 재측정 아님).`);
  for (const s of [ro, dflt]) {
    if (!s || s.error) continue;
    L.push('');
    L.push(`상위 10 (${s.label} · 도구 항목 JSON 바이트 — D-105 ⓑ의 겨눌 자리 재확인):`);
    L.push(table(['#', '도구', '항목 B', 'description B', 'inputSchema B'], s.top10.map((t, i) => [i + 1, t.name, fmt(t.total), fmt(t.description), fmt(t.schema)]), [0, 2, 3, 4]));
  }

  // 2
  H('2. 제품 세션 고정 — 도구 설명 제외');
  L.push('선 ⓐ: 증분 ≤3k 토큰 = 가볍다 · >8k = 과함 · 사이 = 측정 후 결정.');
  h('2-a. 스킬 description 19 (interactive/skills/*/SKILL.md frontmatter)');
  L.push(table(['스킬', 'description', '호스트 렌더(- sapkit:<name>: <desc>)', 'frontmatter', 'SKILL.md 전체'], product.skills.map((s) => [s.skill, cell(s.description), cell(s.rendered), cell(s.frontmatter), cell(s.wrapper)])));
  const skillsDesc = sumM(product.skills.map((s) => s.description));
  const skillsRendered = sumM(product.skills.map((s) => s.rendered));
  const skillsWrapper = sumM(product.skills.map((s) => s.wrapper));
  L.push(`합계 description: ${cell(skillsDesc)}  · 렌더 합계: ${cell(skillsRendered)}  · (참고) SKILL.md 19 전체: ${cell(skillsWrapper)} — 전체는 호출 시 적재지 세션 고정이 아님`);
  h('2-b. 에이전트 2 (interactive/agents/*.md frontmatter)');
  L.push(table(['에이전트', 'description', 'frontmatter(disallowedTools 포함)', '호스트 렌더(Tools: All tools except …)', 'disallowed 수', '파일 전체'], product.agents.map((a) => [a.agent, cell(a.description), cell(a.frontmatter), cell(a.rendered), a.disallowed_count, cell(a.body)])));
  const agentsDesc = sumM(product.agents.map((a) => a.description));
  const agentsFm = sumM(product.agents.map((a) => a.frontmatter));
  const agentsRendered = sumM(product.agents.map((a) => a.rendered));
  L.push(`합계 description: ${cell(agentsDesc)} · frontmatter: ${cell(agentsFm)} · 렌더: ${cell(agentsRendered)}`);
  L.push('렌더 형식의 출처: 이 측정 세션 자체의 시스템 알림 — 에이전트 목록이 `sapkit:sap-reviewer: <description> (Tools: All tools except <disallowedTools 전체 열거>)`로 나왔다. 즉 disallowedTools 목록은 파일에만 있는 게 아니라 컨텍스트에 실린다.');
  h('2-c. project-context always-on 블록 (interactive/core/project-context.md — 모든 스킬 래퍼 1단계가 읽는다)');
  const pc = product.projectContext;
  L.push(table(['블록', '측정'], [
    ['project-context.md 전체 (래퍼 1단계가 읽는 단위)', cell(pc.whole)],
    ['  ├ "Consumption contract" L0~L5 사다리 (knowledge-sourcing.md가 「always-on compact ladder」로 지목)', pc.ladder ? cell(pc.ladder) : '절 부재'],
    ['  └ "How this talks to the user" (plain-language 요약 · DESIGN.md가 always-on 요약 블록으로 지목)', pc.talk ? cell(pc.talk) : '절 부재'],
    ['policies/sap-standards.md "Always-on summary" (파일 자체가 「every harness context에 verbatim 주입」이라 주장)', pc.sap_standards_always_on ? cell(pc.sap_standards_always_on) : '절 부재'],
  ]));
  L.push('관찰: sap-standards.md의 「주입」 주장은 Claude 어댑터에 배선이 없다 — interactive/ 안에서 그 블록을 주입하는 코드·훅·매니페스트가 없고, Antigravity README만 workspace 규칙으로 복사하라고 안내한다. 주장과 배선이 어긋난다(사실 vs 가설: 코드 grep은 사실 · 「그래서 비용 0」은 Claude 경로에 한한 추론).');
  h('2-c′. 소유자 프로젝트의 실인스턴스 — 크기만 (statSync · 디스크 바이트 · 내용 무접촉)');
  L.push(table(['프로젝트', '.sapkit/', ...Object.keys(product.instances[0]?.files ?? {})], product.instances.map((i) => [i.project, i.sapkit_dir ? '있음' : '없음', ...Object.values(i.files).map((v) => (v == null ? '부재' : fmt(v) + ' B (÷4 ' + fmt(div4(v)) + ')'))])));
  L.push('읽기 의무(project-context.md 사다리): config.json·active-profile은 매 스킬 호출 · RULES.md는 L0 — SAP 대면 행동마다 「scope-matched 규칙」을 읽는다(파일 전체를 읽으라는 말은 아니나 실제로는 전체를 읽게 된다) · LESSONS.md·knowledge/는 해당 절차에서만.');
  h('2-d. Claude 어댑터 매니페스트 — 호스트가 세션 시작에 파싱하는 것 (컨텍스트 주입분 아님)');
  L.push(table(['파일', '측정'], product.manifests.map((m) => [m.file, cell(m)])));
  L.push(`기본 설치 훅: ${product.hooksInstalledByDefault}개 (D-062 — 선택 기능 · 스위치 보존) → 훅 주입 0 B.`);
  h('2-e. 셀 합성과 판정 ⓐ');
  const S1 = sumM([skillsRendered, agentsRendered]);
  const S1fm = sumM([skillsDesc, agentsFm]);
  const blocks = [pc.ladder, pc.talk].filter(Boolean);
  const S2 = sumM([S1, ...blocks]);
  const S2fm = sumM([S1fm, ...blocks]);
  const S3 = sumM([S1, pc.whole]);
  L.push(table(['합성', '구성', '측정', '판정 ⓐ (÷4)'], [
    ['S1 호스트 주입', '스킬 렌더 19 + 에이전트 렌더 2 (매니페스트·훅 0)', cell(S1), judgeA(S1.div4)],
    ['S1′ (파일 기준)', '스킬 description 19 + 에이전트 frontmatter 2', cell(S1fm), judgeA(S1fm.div4)],
    ['S2 = 셀 (E-1 열거)', 'S1 + project-context always-on 블록 2 (사다리 + 말투)', cell(S2), judgeA(S2.div4)],
    ['S2′ (파일 기준)', 'S1′ + 같은 블록 2', cell(S2fm), judgeA(S2fm.div4)],
    ['S3 (참고)', 'S1 + project-context.md 전체 (첫 스킬 호출이 실제로 읽는 단위)', cell(S3), judgeA(S3.div4)],
  ]));
  L.push('판정 기준 칸 = S2 (사전 등록 열거와 같은 구성). 토크나이저 열이 ÷4보다 크면 영문 설명문의 ÷4 근사가 낙관적이라는 뜻 — 판정은 선이 정한 대로 ÷4로 한다.');

  // 3
  H('3. 절차 호출 적재 5종 — 절차 본문 + 1-hop 정적 참조 (2-hop은 별도 열)');
  L.push('선 ⓒ: 1-hop 적재 ≤15k = 가볍다 · >30k = 축소 후보. 「호출 시 읽히는 파일의 합」 = 래퍼(SKILL.md) + project-context.md(래퍼 1단계) + 절차 + 1-hop. 판정은 그 합(total)으로; 절차+1-hop만의 값도 병기.');
  L.push('TRACING RULE: 스크립트 머리의 주석(R1 링크 · R2 백틱 경로 · 중괄호 전개 · 자리표시=매개 · frontmatter·펜스·길 안내 절 제외 · 선택군(one-of-N)은 대표 1개 · core 실존만 · 자기 제외). 제외분·선택군은 아래 목록으로 재계산 가능.');
  L.push('「환산」 = 선택군(페르소나 라우팅 표 등 「하나만 고르라」는 열거)을 가장 큰 1개로 센 값 — 판정 칸. 「전수 상한」 = 선택군을 전부 더한 값 — 참고.');
  L.push('');
  L.push(table(
    ['절차', '래퍼', 'project-context', '절차 본문', '1-hop 수 환산/전수', '1-hop 합 환산', '절차+1-hop 환산', 'total 환산 (판정 칸)', '판정 ⓒ', 'total 전수 상한', '2-hop 수', '2-hop 합(별도)'],
    procs.rows.map((r) => [r.name, cell(r.wrapper), cell(r.projectContext), cell(r.procedure), `${r.hop1Files.length}/${r.hop1AllCount}`, cell(r.hop1Sum), cell(r.procPlusHop1), cell(r.total), judgeC(r.total.div4), cell(r.totalAll), r.hop2Files.length, cell(r.hop2Sum)])
  ));
  const pr = procs.personaRow;
  L.push('');
  L.push(`ask-consultant + sap-fi-consultant: 위 total 환산 ${cell(pr.base)} + 페르소나 ${cell(pr.persona)} + 페르소나 1-hop ${pr.personaHopFiles.length}파일 ${cell(pr.personaHopSum)} = ${cell(pr.total)} → 판정 ⓒ ${judgeC(pr.total.div4)}`);
  L.push(`  페르소나 1-hop(Knowledge_Loading의 Load: · Reference_Data의 See 지시 · 절차 1-hop과 겹치는 것 제외): ${pr.personaHopFiles.map((f) => `${f.file} ${fmt(f.bytes)}`).join(' · ')}`);
  for (const s of pr.personaSelections) L.push(`  페르소나 선택군 ${s.group} (줄 ${s.line} · 단서 「${s.cueText}」): 대표 ${s.representative} · 원소 ${s.members.join(', ')}`);
  L.push(`  페르소나 매개(합계 밖): ${pr.personaParametric.join(' · ') || '없음'}`);
  for (const r of procs.rows) {
    h(`3-${r.name} — 1-hop 파일 환산 ${r.hop1Files.length} (바이트)`);
    L.push(r.hop1Files.map((f) => `  ${lpad(fmt(f.bytes), 8)}  ${f.file}`).join('\n') || '  (없음)');
    for (const s of r.selections) L.push(`  선택군 ${s.group} (줄 ${s.line} · 단서 「${s.cueText}」): 대표 ${s.representative} · 원소 ${s.members.length}: ${s.members.join(', ')}`);
    L.push(`  선택군 대안(전수 상한에만 산입) ${r.selAlts.length}: ${r.selAlts.map((f) => `${path.basename(f.file)} ${fmt(f.bytes)}`).join(' · ') || '없음'}`);
    L.push(`  길 안내 절이라 제외한 core 링크 ${r.navExcluded.length}: ${r.navExcluded.join(' · ') || '없음'}`);
    L.push(`  매개(자리표시 · 합계 밖) ${r.parametric.length}: ${r.parametric.join(' · ') || '없음'}`);
    L.push(`  non-core(실존 · core 밖 · 합계 밖) ${r.nonCore.length}: ${r.nonCore.join(' · ') || '없음'}`);
    L.push(`  unresolved(.sapkit 산출물 이름·템플릿명 등 · 실존 아님) ${r.unresolved.length}: ${r.unresolved.join(' · ') || '없음'}`);
    L.push(`  2-hop ${r.hop2Files.length} (별도 열): ${r.hop2Files.map((f) => `${f.file} ${fmt(f.bytes)}`).join(' · ') || '없음'}`);
  }

  // 4
  H('4. 공방(workshop) 세션 고정 — CLAUDE.md(+@include) · HANDOFF.md · 세션 시작 훅 주입');
  L.push('선 ⓓ: ≤10k = 가볍다 · >20k = 과함.');
  L.push(table(['파일', '측정'], workshop.files.map((f) => [f.file, cell(f)])));
  if (workshop.hook.available) {
    L.push(`훅 stdout 전체: ${cell(workshop.hook.stdout)} · additionalContext(실제 주입분): ${workshop.hook.additionalContext ? cell(workshop.hook.additionalContext) : 'JSON 파싱 실패'}`);
    L.push(`  ${workshop.hook.note}`);
  } else L.push(`훅: 측정 불가 — ${workshop.hook.reason}`);
  L.push(`파일 3종 합: ${cell(workshop.cellFiles)}`);
  L.push(`셀 합계(파일 3종 + 훅 주입): ${cell(workshop.cellTotal)} → 판정 ⓓ ${judgeD(workshop.cellTotal.div4)}`);
  if (workshop.cellTotal.tok != null) L.push(`  ⚠ 이 셀은 한국어 위주라 ÷4와 토크나이저가 크게 갈린다(cl100k ${fmt(workshop.cellTotal.tok)} = ÷4의 ${(workshop.cellTotal.tok / workshop.cellTotal.div4).toFixed(2)}배). 판정은 등록된 대로 ÷4로 했고, 토큰 기준이면 ${judgeD(workshop.cellTotal.tok)} 쪽이다 — §5·§6 참고.`);
  L.push('참고 — 셀 밖이지만 이 머신의 세션에 같이 들어오는 것(상위 폴더 CLAUDE.md/AGENTS.md · 사용자 전역 CLAUDE.md):');
  L.push(workshop.refs.map((r) => `  ${r.label}: ${cell(r)}`).join('\n') || '  (없음)');
  L.push('HANDOFF.md는 자동 주입이 아니라 CLAUDE.md 「세션 시작 (필수) 1.」이 읽으라고 지시하는 파일 — 관례상 세션 고정이라 셀에 넣는다(E-1).');

  // 5
  H('5. 근사 두 가지 — ÷4 (D-105 관례) vs 토크나이저 (cl100k_base) · 셀별 비율');
  const ratioRows = [];
  const pushRatio = (label, m) => m && m.tok != null && ratioRows.push([label, fmt(m.bytes), fmt(m.div4), fmt(m.tok), (m.tok / m.div4).toFixed(2), m.tok_o200k == null ? 'n/a' : fmt(m.tok_o200k)]);
  const asM = (s) => ({ bytes: s.bytes_tools, div4: s.div4, tok: s.tok, tok_o200k: s.tok_o200k });
  if (dflt && !dflt.error) pushRatio('tools/list default (영문 JSON)', asM(dflt));
  if (ro && !ro.error) pushRatio('tools/list readonly (영문 JSON)', asM(ro));
  pushRatio('S2 제품 세션 고정', S2);
  pushRatio('create-program total', procs.rows.find((r) => r.name === 'create-program').total);
  pushRatio('troubleshooting total', procs.rows.find((r) => r.name === 'troubleshooting').total);
  pushRatio('CLAUDE.md (한국어 위주)', workshop.files[0]);
  pushRatio('HANDOFF.md (한국어 위주)', workshop.files[workshop.files.length - 1]);
  pushRatio('공방 셀 합계', workshop.cellTotal);
  L.push(ratioRows.length ? table(['셀', '바이트', '÷4', 'tok cl100k', 'tok/÷4', 'tok o200k'], ratioRows, [1, 2, 3, 4, 5]) : '토크나이저 없음 — ÷4만 기록 (' + TOK.reason + ')');
  L.push('읽는 법: tok/÷4 ≈ 1.0이면 ÷4가 맞는 자리(영문 산문·JSON) · >1.3이면 ÷4가 과소(한국어·기호). 판정은 선이 정한 대로 ÷4로 했고, 이 비율은 그 판정이 어느 쪽으로 치우쳤는지 읽는 보조선이다. (Claude 토크나이저는 로컬에 없다 — cl100k은 대용 근사.)');

  // 6
  H('6. 선 대비 판정 요약 (÷4 · D-156 사전 등록 선 그대로)');
  const summaryRows = [];
  const tokView = (m, j) => (m.tok == null ? 'n/a' : `${fmt(m.tok)} → ${j(m.tok)}`);
  for (const s of surfaces) if (!s.error && s.count) summaryRows.push(['ⓑ 도구 설명 평균', s.label, `${s.avg} B/도구`, judgeB(s.avg), '(바이트 기준 선 — 해당 없음)']);
  summaryRows.push(['ⓑ 도구 설명 평균', 'readonly (연결 · D-105 인용)', '740 B/도구', judgeB(740), '']);
  summaryRows.push(['ⓑ 도구 설명 평균', 'readonly,high (연결 · D-105 인용)', '858 B/도구', judgeB(858), '']);
  summaryRows.push(['ⓐ 제품 세션 고정(도구 제외)', 'S2', `${fmt(S2.div4)} tok(÷4)`, judgeA(S2.div4), tokView(S2, judgeA)]);
  for (const r of procs.rows) summaryRows.push(['ⓒ 절차 호출 적재', r.name, `${fmt(r.total.div4)} tok(÷4)`, judgeC(r.total.div4), tokView(r.total, judgeC)]);
  summaryRows.push(['ⓒ 절차 호출 적재', pr.name, `${fmt(pr.total.div4)} tok(÷4)`, judgeC(pr.total.div4), tokView(pr.total, judgeC)]);
  summaryRows.push(['ⓓ 공방 세션 고정', '파일 3종 + 훅', `${fmt(workshop.cellTotal.div4)} tok(÷4)`, judgeD(workshop.cellTotal.div4), tokView(workshop.cellTotal, judgeD)]);
  L.push(table(['선', '칸', '÷4 값 (판정 근거)', '판정 (÷4 · 등록된 선)', '참고 — cl100k 토큰으로 같은 선을 대면'], summaryRows));
  L.push('판정 열이 정본이다(D-156이 ÷4로 못박았다). 마지막 열은 ÷4가 한국어·기호를 과소평가하는 폭을 보이는 보조선이며 판정을 바꾸지 않는다 — 선을 다시 긋는 일은 이 판의 몫이 아니다.');

  // 7
  H('7. L5 기준선 대조 — abap-mcp-adt-powerup (실행 안 함 · 정적 grep) vs sapkit-engine');
  if (!powerup.available) L.push(`powerup: ${powerup.reason}`);
  else {
    L.push(`powerup 체크아웃: ${powerup.name}@${powerup.version} · HEAD ${powerup.head} (참고: 판7-b 직전 제품 번들은 같은 패키지 5.0.0이었다 — interactive/server/VERSION 「이전 번들」 줄)`);
    const allSets = surfaces.find((s) => s.label === 'all-sets');
    L.push(table(['항목', 'powerup (L5 기준선)', 'sapkit-engine (제품)'], [
      ['등록점', 'src/lib/handlers/groups/*HandlersGroup.ts 6개 (TOOL_DEFINITION import) → CompositeHandlersRegistry', 'src/tools/registry.ts TOOL_REGISTRY 단일 배열'],
      ['등록 도구 수', `그룹별 ${Object.entries(powerup.groups).map(([g, n]) => `${g} ${n}`).join(' · ')} · 중복 제거 ${powerup.registered_distinct} (그룹 간 중복 이름 ${powerup.duplicates_across_groups}) · 정의 파일 ${powerup.handler_files_with_definition}`, `registry 식별자 ${engine.registry_identifiers} (중복 제거 ${engine.registry_distinct}) · tools/list: 프로파일 없음 default ${dflt && !dflt.error ? dflt.count : 'n/a'} · all-sets ${allSets && !allSets.error ? allSets.count : 'n/a'} · 연결 186 (D-105)`],
      ['기본 표면(정적 추정)', `readonly,high 기본(ServerConfigManager.ts:${powerup.default_exposition[0]?.line ?? '?'}) → ReadOnly+HighLevel+System+Search 그룹 합집합 ${powerup.default_surface_static} (available_in 축 미적용 · 상한)`, `readonly,high 기본(exposition.ts DEFAULT_EXPOSITION) → tools/list default ${dflt && !dflt.error ? dflt.count : 'n/a'} (inspection-only) / 186 (연결)`],
      ['설명문 밀도', `description 문자열 정적 추출 평균 ${powerup.avg_description_static} B/도구 (TS 리터럴 결합 · 추정)`, `description 필드 평균 ${dflt && !dflt.error ? dflt.avg_description : 'n/a'} B/도구 (default · 실측) · 항목 전체 ${dflt && !dflt.error ? dflt.avg : 'n/a'} B/도구`],
      ['tier 게이트', `있음 — src/lib/readonlyGuard.ts (${powerup.tier_gate.map((l) => l.line).join(',')}) · 양성 분류 fail-closed · DEV/QA/PRD 행렬. 단 legacy 모드(active-profile 없음)는 SAP_TIER 기본 DEV (profile.ts:${powerup.tier_default.map((l) => l.line).join(',')})`, `있음 — src/safety/tier.ts (${engine.tier_gate.map((l) => l.line).join(',')}) · 양성 분류 fail-closed · DEV/QA/PRD/UNKNOWN — 해석 불능 tier는 가장 제한적 열(UNKNOWN=PRD 취급)`],
      ['테이블 blocklist', `있음 — src/lib/policy/tableBlocklist.ts (${powerup.blocklist.map((l) => l.line).join(',')}) · 기본 standard · 노브는 process.env에서 읽되 profile.ts가 apply 시 같은 키를 지운다(${powerup.blocklist_env_wiped.map((l) => l.line).join(',')}) → 사실상 프로파일 sap.env 통로만`, `있음 — src/safety/blocklist.ts (${engine.blocklist.map((l) => l.line).join(',')}) · 기본 standard · 두 통로(프로파일·프로세스 env) 중 env는 조이는 방향만 (D-096)`],
      ['모르는 인자 거절', `없음 — src/** 정적 grep 0건 (validateToolInput · additionalProperties · "unknown argument": ${powerup.unknown_args.length}건)`, `있음 — src/server/unknownArguments.ts (${engine.unknown_args.map((l) => l.line).join(',')}) · McpServer.validateToolInput 감싸기 (D-152 · 1.5.0)`],
    ]));
    L.push('근거 줄(정적 grep · 원문 요약):');
    const quote = (label, arr, root) => { for (const l of arr.slice(0, 4)) L.push(`  ${label} ${l.file ?? ''}:${l.line}  ${l.text}`); void root; };
    quote('powerup default_exposition', powerup.default_exposition);
    quote('powerup known_sets', powerup.known_sets);
    quote('powerup tier_gate', powerup.tier_gate);
    quote('powerup tier_default', powerup.tier_default);
    quote('powerup blocklist', powerup.blocklist);
    quote('powerup blocklist_env_wiped', powerup.blocklist_env_wiped);
    quote('engine tier_gate', engine.tier_gate);
    quote('engine blocklist', engine.blocklist);
    quote('engine unknown_args', engine.unknown_args);
    L.push(`  engine VERSION 1줄: ${engine.version_line}`);
  }

  H('8. 측정하지 못한 칸 · 유보');
  L.push('· 접속 표면(connected) 2칸 — 프로파일 없이 띄웠으므로 불가. D-105 수치 인용(§1). 같은 번들 판이 아니다(D-105는 1.2.x 이전 · 지금은 VERSION 줄의 판) — 도구 이름 186/155는 불변이나 설명 덧말(D-145·D-147·D-152 append)이 더해졌으므로 연결 표면의 바이트는 D-105보다 조금 클 것이다(추정 · 실측 아님).');
  L.push('· 토크나이저는 OpenAI cl100k_base/o200k_base 대용이다 — Claude 토크나이저는 로컬에 없다. 비율(§5)은 방향만 읽는다.');
  L.push('· 에이전트 「호스트 렌더」와 스킬 「호스트 렌더」는 이 세션에서 관측한 형식으로 재구성한 추정이다 — 호스트 버전에 따라 형식이 바뀔 수 있다. 파일 기준 값(S1′·S2′)을 함께 뒀다.');
  L.push('· 1-hop은 정적 규칙이다 — 모델이 실제로 무엇을 여는지는 블라인드 실행(T5~)이 잰다. 규칙을 바꾸면 수치가 바뀌므로 규칙·제외 목록을 그대로 남겼다.');
  {
    const mo = procs.rows.find((r) => r.name === 'modify-object');
    const big = mo.hop1Files.filter((f) => /create-program\.md|troubleshooting\.md$/.test(f.file));
    L.push(`· 정적 규칙은 「승격·탈출 포인터」도 읽기로 센다 — modify-object의 1-hop ${fmt(mo.hop1Sum.bytes)} B 중 ${fmt(big.reduce((a, f) => a + f.bytes, 0))} B가 create-program.md(「여기를 떠나 그리로 가라」)·troubleshooting.md(§8 두 항목만 가리킴)다. 절 단위가 아니라 파일 단위로 재므로 상한이다 — 그 둘을 빼도 ${fmt(mo.hop1Sum.bytes - big.reduce((a, f) => a + f.bytes, 0))} B(÷4 ${fmt(div4(mo.hop1Sum.bytes - big.reduce((a, f) => a + f.bytes, 0)))})가 남는다.`);
  }
  L.push('· 훅 주입분은 트리 상태(브랜치·status·최근 커밋)에 따라 수십 바이트 움직인다 — 결정성 확인은 같은 트리에서의 두 번 실행으로 한다.');
  L.push('· powerup 「기본 표면 정적 추정」은 available_in(배포 축) 필터를 적용하지 않은 상한이다 — 실행하지 않기로 했으므로(과업 조건) tools/list 실측은 없다.');

  fs.writeFileSync(OUT, L.join('\n') + '\n');
  fs.writeFileSync(
    SUMMARY,
    JSON.stringify(
      {
        date: DATE,
        node: process.version,
        verify_engine_line: verifyLine,
        tokenizer: TOK.available ? TOK.name : null,
        surfaces: surfaces.map(({ top10, stderr_first, entry, ...s }) => ({ ...s, entry: entry ? rel(entry) : null, top10 })),
        product: { ...product, S1, S1fm, S2, S2fm, S3 },
        procedures: procs,
        workshop,
        powerup,
        engine,
      },
      null,
      2
    ) + '\n'
  );
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(L.join('\n'));
  console.log(`\n→ ${rel(OUT)} · ${rel(SUMMARY)} 기록`);
}

main().catch((e) => {
  fs.rmSync(TMP, { recursive: true, force: true });
  console.error(e.stack || e.message);
  process.exit(1);
});
