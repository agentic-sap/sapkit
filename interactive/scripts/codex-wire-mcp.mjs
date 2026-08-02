#!/usr/bin/env node
// codex-wire-mcp.mjs — 설치된 Codex 플러그인의 bundled MCP wrapper를 **실경로로 배선**한다.
// 설계 정본: docs/reference/designs/2026-08-02-claude-onboarding-codex-parity-no-engine.md
//            §6-1(클라이언트별 wrapper 생성물) · §6-2(경로·cwd) · R-PORTABLE · R-IDEMPOTENT
//
// ───────────────────────── 왜 이 도구가 필요한가 (실측) ─────────────────────────
// 2026-08-02 clean-home probe(Codex CLI 0.146.0):
//   · Codex는 플러그인 wrapper(.mcp.json) **내부 값에 어떤 변수 치환·재기준화도 하지 않는다.**
//     `${CLAUDE_PLUGIN_ROOT}` 같은 변수가 없고, 상대경로 args는 **세션 cwd 기준**으로 풀려
//     기동에 실패한다.
//   · 반대로 **절대경로** wrapper면 실제 sapkit 서버가 Codex 경유로 정상 기동하고
//     tools/list까지 도달한다.
//   · 설치 캐시 경로는 결정적이다: `<CODEX_HOME>/plugins/cache/<마켓>/<플러그인>/<버전>/`.
// 그래서 커밋 생성물에는 절대경로를 넣을 수 없고(사용자·드라이브·버전마다 다르다 — R-PORTABLE)
// 상징 토큰 `{{SAPKIT_PLUGIN_ROOT}}`를 넣어두고, **설치 후** 이 도구가 실경로로 재작성한다.
// 토큰 상태에서는 MCP가 뜨지 않는 것이 정상이며, wrapper의 `required:false` 덕분에
// 스킬·절차·세션은 그대로 산다.
//
// ─────────────────────────────── 상태 모델 ────────────────────────────────────
//   WIRED_OK      경로가 이미 자기 버전 디렉터리를 정확히 가리킨다 → apply는 byte-noop
//   TOKEN_PENDING 아직 `{{SAPKIT_PLUGIN_ROOT}}` 토큰 상태 (= 갓 설치된 정상 상태)
//   STALE_PATH    절대경로이긴 한데 **자기 캐시 루트가 아니다** (업데이트로 버전이 바뀐 뒤)
//   NOT_FOUND     설치본을 못 찾았거나, wrapper에 플러그인 루트 경로 참조가 없다
//   PARSE_ERROR   wrapper가 JSON으로 읽히지 않는다 → **건드리지 않고** 오류로 보고
//
// ─────────────────────────────── 치환 규칙 ────────────────────────────────────
// 문자열 값 중 정규화(`\`→`/`) 후 아래 **꼬리 경로**로 끝나는 것만 통째로 재작성한다.
// 토큰형·스테일 절대경로·이미 올바른 값이 한 규칙으로 처리되므로 멱등이다.
//   · server/launch.cjs
//   · server/runtime-deps/keyring/node_modules
// 재작성은 **원문 문자열 리터럴 단위**로 한다(파싱→재직렬화가 아니다) — 들여쓰기·키 순서·
// EOL·다른 키가 그대로 보존되고, 이미 올바르면 바이트가 한 개도 바뀌지 않는다.
//
// 비접촉: codex CLI를 호출하지 않는다(캐시 패턴이 결정적이므로 파일시스템만으로 충분하고,
// CLI가 없는 머신에서도 돌아야 한다). SAP 자격증명·비밀은 읽지도 쓰지도 않는다.
//
// 사용:
//   node interactive/scripts/codex-wire-mcp.mjs status [--json]
//   node interactive/scripts/codex-wire-mcp.mjs apply  [--json]
//   옵션: --codex-home <dir>   (env CODEX_HOME보다 우선 — 시험·격리용)
// exit: status는 항상 0(발견 0건 포함 — 상태 보고가 목적) / apply는 0, 파싱·쓰기 오류 시 1
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..');

// gen-plugin-manifests.mjs가 wrapper에 심는 토큰·꼬리 경로와 **같은 값**이어야 한다.
// 갈라지면 배선이 조용히 실패하므로, test-codex-wire-mcp.mjs가 **실제 생성물**을 fixture로
// 먹여 "토큰이 하나도 남지 않는다"를 단언한다(상수를 직접 비교하지 않고 행동으로 잡는다).
const ROOT_TOKEN = '{{SAPKIT_PLUGIN_ROOT}}';
const ROOT_SUFFIXES = ['server/runtime-deps/keyring/node_modules', 'server/launch.cjs'];
const LAUNCHER = 'server/launch.cjs';

const STATES = ['PARSE_ERROR', 'NOT_FOUND', 'STALE_PATH', 'TOKEN_PENDING', 'WIRED_OK'];

// ── 인자 ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(
    [
      'codex-wire-mcp — 설치된 Codex 플러그인의 bundled MCP wrapper를 실경로로 배선한다.',
      '',
      '  node codex-wire-mcp.mjs status [--json]   상태만 보고 (쓰기 없음, 항상 exit 0)',
      '  node codex-wire-mcp.mjs apply  [--json]   토큰·스테일 경로를 실경로로 재작성 (멱등)',
      '',
      '  --codex-home <dir>   CODEX_HOME 대신 사용할 디렉터리 (기본: env CODEX_HOME → ~/.codex)',
    ].join('\n')
  );
  process.exit(0);
}

// 값을 받는 옵션이 있으므로 순진한 find()로 첫 비-플래그를 고르면 안 된다
// (`--codex-home C:/tmp apply`에서 경로가 명령으로 잡힌다).
let JSON_OUT = false;
let codexHomeArg;
let action;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') JSON_OUT = true;
  else if (a === '--codex-home' || a.startsWith('--codex-home=')) {
    codexHomeArg = a === '--codex-home' ? argv[++i] : a.slice('--codex-home='.length);
    // 값 없이 넘어오면 조용히 실 `~/.codex`로 폴백한다 — 격리 의도가 뒤집히므로 막는다.
    if (!codexHomeArg) {
      console.error('❌ --codex-home 에 디렉터리 값이 없다');
      process.exit(2);
    }
  }
  else if (a.startsWith('-')) {
    console.error(`❌ 알 수 없는 옵션: ${a}`);
    process.exit(2);
  } else if (action === undefined) action = a;
  else {
    console.error(`❌ 인자가 너무 많다: ${a}`);
    process.exit(2);
  }
}
action ??= 'status';
if (action !== 'status' && action !== 'apply') {
  console.error(`❌ 알 수 없는 명령: ${action} (status | apply)`);
  process.exit(2);
}

const CODEX_HOME = path.resolve(codexHomeArg || process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
const CACHE_ROOT = path.join(CODEX_HOME, 'plugins', 'cache');

// 플러그인 이름은 캐시 경로의 한 층이다. 하드코딩하면 개명 때 조용히 못 찾으므로 정본에서 읽는다.
function resolvePluginName() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'plugin-metadata.json'), 'utf8')).name || 'sapkit';
  } catch {
    return 'sapkit';
  }
}
const PLUGIN_NAME = resolvePluginName();

// ── 탐색 ───────────────────────────────────────────────────────────────────
const dirsIn = (d) => {
  try {
    return fs
      .readdirSync(d, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
};

// <CODEX_HOME>/plugins/cache/<마켓>/<플러그인>/<버전>/adapters/codex/.mcp.json
function discover() {
  const found = [];
  for (const marketplace of dirsIn(CACHE_ROOT)) {
    const pluginDir = path.join(CACHE_ROOT, marketplace, PLUGIN_NAME);
    for (const version of dirsIn(pluginDir)) {
      const wrapper = path.join(pluginDir, version, 'adapters', 'codex', '.mcp.json');
      if (fs.existsSync(wrapper)) found.push({ marketplace, version, wrapper });
    }
  }
  return found;
}

// ── 치환 ───────────────────────────────────────────────────────────────────
const toPosix = (p) => p.replace(/\\/g, '/');

function suffixOf(decoded) {
  const norm = toPosix(decoded);
  for (const s of ROOT_SUFFIXES) if (norm === s || norm.endsWith('/' + s)) return s;
  return null;
}

// 원문의 JSON 문자열 리터럴만 골라 대상 값을 재작성한다 (파싱→재직렬화 아님).
const STRING_LITERAL = /"(?:[^"\\]|\\.)*"/g;
function rewrite(text, rootPosix) {
  const refs = [];
  const next = text.replace(STRING_LITERAL, (lit) => {
    let decoded;
    try {
      decoded = JSON.parse(lit);
    } catch {
      return lit;
    }
    const suffix = suffixOf(decoded);
    if (!suffix) return lit;
    const target = `${rootPosix}/${suffix}`;
    refs.push({ from: decoded, to: target, changed: decoded !== target, token: decoded.includes(ROOT_TOKEN) });
    return JSON.stringify(target);
  });
  return { next, refs };
}

function classify(refs) {
  if (!refs.length) return 'NOT_FOUND';
  if (refs.some((r) => r.token)) return 'TOKEN_PENDING';
  if (refs.some((r) => r.changed)) return 'STALE_PATH';
  return 'WIRED_OK';
}

// ── 검사 ───────────────────────────────────────────────────────────────────
function inspect({ marketplace, version, wrapper }) {
  const root = path.resolve(wrapper, '..', '..', '..'); // <버전>/adapters/codex/.mcp.json → <버전>
  const rootPosix = toPosix(root);
  const rec = {
    marketplace,
    version,
    root: rootPosix,
    wrapper: toPosix(wrapper),
    state: 'PARSE_ERROR',
    changed: false,
    bom: false,
    launcherMissing: !fs.existsSync(path.join(root, ...LAUNCHER.split('/'))),
    refs: [],
    error: null,
  };

  let raw;
  try {
    raw = fs.readFileSync(wrapper, 'utf8');
  } catch (e) {
    rec.error = `읽기 실패: ${e.message}`;
    return rec;
  }
  // BOM은 벗긴 본문으로 작업한다 — 쓸 때 다시 붙이지 않으므로 apply가 BOM을 제거한다
  // (JSON 소비자에게 BOM은 잠재 파싱 위험이고, 우리 생성물에는 애초에 없다).
  rec.bom = raw.charCodeAt(0) === 0xfeff;
  const body = rec.bom ? raw.slice(1) : raw;
  try {
    JSON.parse(body);
  } catch (e) {
    rec.error = `JSON 파싱 실패: ${e.message}`;
    return rec;
  }

  const { next, refs } = rewrite(body, rootPosix);
  rec.refs = refs;
  rec.state = classify(refs);
  rec._raw = raw;
  rec._next = next;
  return rec;
}

// ── 쓰기 (atomic · UTF-8 무BOM · 원문 포맷/EOL 보존) ────────────────────────
function applyOne(rec) {
  if (rec.state === 'PARSE_ERROR' || rec.state === 'NOT_FOUND') return rec;
  if (rec._next === rec._raw) return rec; // 이미 올바르다 → byte-noop

  // 쓰기 전 결과가 여전히 유효한 JSON인지 확인 — 반쯤 망가진 파일을 남기지 않는다.
  try {
    JSON.parse(rec._next);
  } catch (e) {
    rec.state = 'PARSE_ERROR';
    rec.error = `재작성 결과가 유효한 JSON이 아님 (쓰지 않음): ${e.message}`;
    return rec;
  }

  const file = path.resolve(rec.wrapper);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    // BOM 없이 UTF-8로 쓴다(D-060 인코딩 사고 교훈). EOL·들여쓰기는 원문 그대로다.
    fs.writeFileSync(tmp, rec._next, { encoding: 'utf8' });
    fs.renameSync(tmp, file);
  } catch (e) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* 임시파일 정리 실패는 원인이 아니다 */
    }
    rec.error = `쓰기 실패: ${e.message}`;
    return rec;
  }
  rec.changed = true;
  rec.state = 'WIRED_OK';
  return rec;
}

// ── 실행 ───────────────────────────────────────────────────────────────────
const installs = discover().map(inspect);
if (action === 'apply') for (const rec of installs) applyOne(rec);

const worst = (recs) => {
  if (!recs.length) return 'NOT_FOUND';
  for (const s of STATES) if (recs.some((r) => r.state === s)) return s;
  return 'WIRED_OK';
};

const errors = installs.filter((r) => r.error);
const summary = {
  found: installs.length,
  wired: installs.filter((r) => r.state === 'WIRED_OK').length,
  pending: installs.filter((r) => r.state === 'TOKEN_PENDING').length,
  stale: installs.filter((r) => r.state === 'STALE_PATH').length,
  notFound: installs.filter((r) => r.state === 'NOT_FOUND').length,
  parseErrors: installs.filter((r) => r.state === 'PARSE_ERROR').length,
  changed: installs.filter((r) => r.changed).length,
};
const exitCode = action === 'apply' && errors.length ? 1 : 0;

const report = {
  tool: 'codex-wire-mcp',
  action,
  codexHome: toPosix(CODEX_HOME),
  cacheRoot: toPosix(CACHE_ROOT),
  pluginName: PLUGIN_NAME,
  token: ROOT_TOKEN,
  overall: worst(installs),
  installations: installs.map(({ _raw, _next, ...pub }) => pub),
  summary,
  exitCode,
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(exitCode);
}

const MARK = {
  WIRED_OK: '✅',
  TOKEN_PENDING: '⏳',
  STALE_PATH: '⚠️',
  NOT_FOUND: '❓',
  PARSE_ERROR: '❌',
};
console.log(`CODEX_HOME : ${toPosix(CODEX_HOME)}`);
console.log(`캐시       : ${toPosix(CACHE_ROOT)}/<마켓>/${PLUGIN_NAME}/<버전>/adapters/codex/.mcp.json`);
console.log(`동작       : ${action}\n`);

if (!installs.length) {
  console.log('❓ 설치본 0건 — 이 CODEX_HOME에 sapkit 플러그인 캐시가 없다.');
  console.log('   설치 후 다시 실행: codex plugin marketplace add … · codex plugin add sapkit@<마켓>');
} else {
  for (const r of installs) {
    console.log(`${MARK[r.state] ?? '·'} ${r.marketplace}/${PLUGIN_NAME}/${r.version} — ${r.state}${r.changed ? ' (재작성함)' : ''}`);
    console.log(`   ${r.wrapper}`);
    if (r.error) console.log(`   ↳ ${r.error}`);
    if (r.bom) console.log(`   ↳ BOM 발견 — apply가 UTF-8 무BOM으로 다시 쓴다`);
    if (r.launcherMissing) console.log(`   ↳ 주의: ${r.root}/${LAUNCHER} 가 없다 — 설치본이 손상됐을 수 있다`);
    for (const ref of r.refs) {
      if (action === 'apply' && r.changed) console.log(`   ↳ ${ref.changed ? '재작성' : '유지'}: ${ref.to}`);
      else if (ref.changed) console.log(`   ↳ 필요: ${ref.from}  →  ${ref.to}`);
    }
  }
}

console.log(
  `\n요약: 발견 ${summary.found} · 정상 ${summary.wired} · 토큰대기 ${summary.pending} · ` +
    `스테일 ${summary.stale} · 미발견 ${summary.notFound} · 파싱오류 ${summary.parseErrors}` +
    (action === 'apply' ? ` · 재작성 ${summary.changed}` : '')
);

if (action === 'status') {
  if (summary.pending || summary.stale || installs.some((r) => r.bom && r.state !== 'NOT_FOUND'))
    console.log('\n→ 배선: node scripts/codex-wire-mcp.mjs apply');
  else if (summary.found && !summary.parseErrors && !summary.notFound) console.log('\n✅ 배선 완료 상태 — 할 일 없음');
} else if (!errors.length) {
  if (summary.changed) console.log('\n✅ 배선 완료 — 새 Codex 세션에서 MCP가 뜬다');
  else if (summary.found) console.log('\n✅ 변경 없음 (이미 배선됨)');
}

if (errors.length) {
  console.log(`\n❌ 오류 ${errors.length}건 — 해당 wrapper는 건드리지 않았다:`);
  for (const r of errors) console.log(`  - ${r.wrapper}: ${r.error}`);
}

process.exit(exitCode);
