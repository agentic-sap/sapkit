#!/usr/bin/env node
/**
 * 12-sample.mjs — 판J T1 표본 추출기 + 항목표 검증기 (고정 시드 20261105)
 *
 * 무엇을 하는가
 *   (기본)      지식 팩에서 「검증 가능한 사실형 후보 줄」을 긁어 범주별로 고정 시드 난수 순서로
 *               나열한다. 같은 커밋에서 두 번 돌리면 글자 하나 다르지 않게 같은 목록이 나온다 —
 *               마지막 줄의 sha256 이 그 증명이다.
 *   --check F   10-knowledge-items.json(F)을 기계 검증한다 — 계수(모듈 15×2 · 국가 16×1 ·
 *               업종 7 · ABAP 7 = 60) · 국가 비싼 항목 ≥ 8 · 정답 키가 인용 파일의 그 줄(±2)에
 *               실재 · id 고유 · 빈 필드 0 · 질문이 정답 키를 그대로 담지 않음 · 그리고
 *               **걷기 일관성**(아래 「걷기 규칙」) — 어긋나면 FAIL(exit 1).
 *   --limit N   (기본 모드) 하위 범주마다 앞 N건만 보인다. 해시는 언제나 전체 목록으로 잰다.
 *
 * 설계 (사전 등록 — 이 커밋 이후 바꾸지 않는다)
 *   후보 줄    = 코드 펜스·인용(>)·제목·표 구분선·표 머리행·한글 주석행을 뺀 줄 가운데
 *                「검증 가능한 식별자 신호」를 하나 이상 가진 줄. 신호 = SAP 객체 이름 무늬
 *                (글자+숫자 · 밑줄 이름 · 4자 이상 대문자) · 백틱 코드 · 백분율 · 「n digits」류
 *                수치 규격 · 신고 주기 낱말 · 릴리스 번호(7xx) · 4자리 이상 숫자.
 *                country·industry 두 범주는 여기에 **불릿 줄 전부**를 더한다 — 그 팩들은 불릿만으로
 *                쓰였고 SAP 객체 토큰이 드물어 신호 규칙만으로는 업종 후보가 0~5건이었다(실측).
 *   범주·출처  = module(15 디렉터리 · common 제외 · 「Required MCP Tools」 절 제외) ·
 *                country(16 파일 · README 제외) · industry(14 파일 · README 제외 · 시드 순서 앞 7개
 *                업종만 할당) · abap(conventions/ 가운데 01-convention-split.txt 가 「일반 작법」으로
 *                가른 파일·절만 — 아래 ABAP_SOURCES 의 include/exclude 가 그 갈래표의 기계 옮김).
 *   집·도구 줄 = 제품 도구 이름(GetXxx · CreateXxx …) · .sapkit · spec.md · Phase · sapkit · MCP 등을
 *                담은 줄은 모든 범주에서 후보에서 뺀다(01 의 해석 주석 A). 그래도 새는 집 규칙은
 *                걷기에서 「house rule」로 기각한다 — 기각 사유가 10 의 rejections 에 남는다.
 *   섞기       = 하위 범주(모듈 1개 · 국가 1개 · 업종 1개 · abap 전체)마다 따로, 시드 = SEED xor
 *                fnv1a(하위 범주 키). 한 파일이 고쳐져도 다른 하위 범주의 순서는 흔들리지 않는다.
 *   국가 비싼  = 국가 시드 순서의 앞 8개국은 「비싼 힌트」(세금·신고·전자세금계산서·개인정보 절 또는
 *     항목 ≥ 8   낱말)를 가진 후보를 목록 앞으로 안정 분할한다(그 안의 순서는 섞인 그대로). 뒤 8개국은
 *                섞인 그대로다. 그래서 ≥ 8 은 운이 아니라 구조로 보장되고, 나머지 절반은 형식·은행·
 *                마스터 같은 다른 사실도 뽑힌다. 항목의 expensive 값 자체는 정의(세법·국가 규정·이송·
 *                삭제·보안·개인정보)에 따라 사람이 적고 --check 가 ≥ 8 을 센다.
 *   걷기 규칙  = 하위 범주 목록을 위에서부터 한 줄씩 보며 「받는다」 또는 「기각한다(사유)」. 할당량
 *                (module 2 · country 1 · industry 1 · abap 7)이 차면 멈춘다. 건너뛴 줄이 있으면
 *                (받지도 기각하지도 않은 줄) --check 가 「walk gap」으로 FAIL 한다. 그래서 60개
 *                항목의 선택은 사람 손이 아니라 이 순서 + 기록된 기각 사유로 재현된다.
 *
 * 쓰는 법 (레포 루트에서)
 *   node docs/reference/audits/2026-11-05-harness-necessity-review-data/12-sample.mjs > listing.txt
 *   node docs/reference/audits/2026-11-05-harness-necessity-review-data/12-sample.mjs --check \
 *        docs/reference/audits/2026-11-05-harness-necessity-review-data/10-knowledge-items.json
 *
 * 기록 (T1 확정 시점 · 2026-11-05 · 이 커밋의 지식 팩 기준)
 *   sha256(listing) = 8f54f55d3f0acbf02ef7ad7419d17efba3e571f1b5c29f11a198866775893ca6  (4760줄 · 두 번 실행 동일)
 *   10-knowledge-items.json 은 이 목록을 걸어 만든 것이다. 지식 팩이 바뀌면 해시도 바뀌고 --check 의
 *   「걷기 일관성」이 깨질 수 있다 — 그때는 항목표를 고치지 말고 이 기록된 커밋에서 다시 재는 것이 원칙이다.
 *
 * 외부 의존 0 — node:fs · node:crypto · node:path 만 쓴다.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEED = 20261105;
const HERE = dirname(fileURLToPath(import.meta.url));
// docs/reference/audits/<폴더>/12-sample.mjs → 레포 루트
const ROOT = resolve(HERE, '..', '..', '..', '..');
const KB = 'interactive/core/knowledge';

const QUOTA = { module: 2, country: 1, industry: 1, abap: 7 };
const EXPECT = { modules: 15, countries: 16, industries: 14, industrySelected: 7 };
const COUNTRY_EXPENSIVE_FIRST = 8;
const COUNTRY_MIN_EXPENSIVE = 8;

// ---------------------------------------------------------------------------
// 난수 — mulberry32, 하위 범주 키로 부시드
// ---------------------------------------------------------------------------
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (const ch of str) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, key) {
  const rnd = mulberry32((SEED ^ fnv1a(key)) >>> 0);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// 후보 줄 판정
// ---------------------------------------------------------------------------
const ID_RX = [
  /\b[A-Z][A-Z0-9]*[0-9][A-Z0-9_]*\b/g, // FS00 · F110 · KNA1 · T001 · ME21N
  /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g, // BAPI_ACC_DOCUMENT_POST · V_T001 · CI_COBL
  /\b[A-Z]{4,}\b/g, // ACDOCA · BKPF · SEPA · IBAN
];
const ID_STOP = new Set([
  'S4', 'S4HANA', 'ECC6', 'B2B', 'B2C', 'B2G', 'G2B', 'P2P', 'O2C', 'R2R', 'H2R', 'UTF8', 'UTF16',
  'MUST', 'NEVER', 'ONLY', 'STOP', 'HARD', 'RULE', 'MAJOR', 'CRITICAL', 'TODO', 'FIXME', 'MANDATORY',
  'NOTE', 'WHY', 'WHAT', 'ALWAYS', 'DONE', 'YYYY', 'XXXX', 'XXXXX',
]);
const OTHER_SIGNALS = [
  /`[^`]+`/,
  /\d+(?:[.,]\d+)?\s?%/,
  /\b\d+\s*(?:digits?|characters?|chars?|decimals?|days?|months?|years?|hours?|minutes?|seconds?|bytes?|rows?|lines?|levels?|positions?|places)\b/i,
  /\b(?:monthly|quarterly|annual(?:ly)?|semi-annual(?:ly)?|bi-?annual(?:ly)?|weekly|daily)\b/i,
  /\b7[0-9]{2}\b/,
  /\b\d{4,}\b/,
];
function hasSignal(text) {
  for (const rx of ID_RX) {
    for (const m of text.matchAll(rx)) {
      const tok = m[0];
      if (tok.length >= 3 && !ID_STOP.has(tok)) return true;
    }
  }
  return OTHER_SIGNALS.some((rx) => rx.test(text));
}

// 제품 도구·집 배선을 가리키는 낱말 — 모든 범주에서 그 줄을 뺀다 (01 해석 주석 A).
const TOOL_RX = /\b(?:Get|Create|Update|Delete|Read|Run|Check|Grep|Search|Activate|Runtime|Validate|Release|Reload|Patch|Write)[A-Z][A-Za-z]+\b/;
const HOUSE_TOKENS = [
  '.sapkit', 'sap.env', 'spec.md', 'plan.md', 'sapkit', 'MCP', 'Phase 0', 'Phase 1', 'Phase 2', 'Phase 4',
  'Phase 6', 'sap-code-reviewer', 'skills/', 'agents/', 'configs/', 'D-147', 'D-152', 'interview', 'executor',
  'acknowledge_risk', 'data-extraction-policy', 'table_exception',
];
function tokenExcluded(text, cfg) {
  if (TOOL_RX.test(text)) return true;
  if (HOUSE_TOKENS.some((t) => text.includes(t))) return true;
  if (cfg.excludeLines && cfg.excludeLines.some((rx) => rx.test(text))) return true;
  return false;
}

// 표 머리행 낱말 — 첫 칸이 이것이면 머리행으로 보고 뺀다 (구분선 뒤따름 검사의 보조).
const HEADER_WORDS = new Set([
  'tcode', 'table', 'bapi/fm', 'config name', 'name', 'event', 'object', 'transaction', 'append', 'artifact',
  'feature', 'area', 'category', 'request type', 'target release', 'table/view', 'description', 'system',
  'usage', 'step', 'no', 'no.', '#', 'field', 'item', 'type', 'rule', 'pattern', 'when', 'symptom',
]);

function normHeading(s) {
  return s.toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim();
}
function sectionAllowed(section, cfg) {
  const n = normHeading(section);
  if (cfg.include) return cfg.include.some((s) => n.includes(normHeading(s)));
  if (cfg.exclude) return !cfg.exclude.some((s) => n.includes(normHeading(s)));
  return true;
}

/** 파일 하나를 훑어 후보 줄을 문서 순서로 돌려준다. */
function scanFile(rel, cfg = {}) {
  const lines = readFileSync(join(ROOT, rel), 'utf8').split(/\r?\n/);
  const out = [];
  let inFence = false;
  let h2 = '';
  let h3 = '';
  let skipIndented = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].replace(/\s+$/, '');
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const hm = /^(#{1,6})\s+(.*)$/.exec(line);
    if (hm) {
      const t = hm[2].trim();
      if (hm[1].length <= 2) { h2 = t; h3 = ''; } else { h3 = t; }
      skipIndented = false;
      continue;
    }
    if (!line.trim()) { skipIndented = false; continue; }
    if (/^\s*>/.test(line)) continue; // 인용 블록
    if (/^\s*[ㄱ-힝]/.test(line)) continue; // 한글 주석행 (영문 줄의 번역)
    if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) continue;
    const section = h3 ? `${h2} › ${h3}` : h2;
    if (!sectionAllowed(section, cfg)) continue;
    const indented = /^\s+\S/.test(line);
    if (!indented) skipIndented = false;
    if (indented && skipIndented) continue;
    const text = line.trim();
    if (text.startsWith('|')) {
      if (/^\|\s*:?-{2,}/.test(text)) continue; // 구분선
      const next = (lines[i + 1] ?? '').trim();
      if (/^\|\s*:?-{2,}/.test(next)) continue; // 머리행
      const cells = text.split('|').map((c) => c.trim());
      if (cells[0] === '') cells.shift();
      if (cells.length && cells[cells.length - 1] === '') cells.pop();
      if (cells.length < 2 || !cells[0]) continue;
      if (HEADER_WORDS.has(cells[0].replace(/[`*]/g, '').toLowerCase())) continue;
    }
    if (tokenExcluded(text, cfg)) { if (!indented) skipIndented = true; continue; }
    // country·industry 팩은 전부 불릿 목록이고 SAP 객체 토큰이 드물다(업종 팩은 신호 규칙만으로는
    // 후보 0~5건). 그 두 범주는 불릿 줄 전부를 후보로 삼고 검증 가능성은 걷기에서 가린다.
    const isBullet = /^(?:[-*+]|\d+[.)])\s+/.test(text);
    if (!hasSignal(text) && !(cfg.allBullets && isBullet)) continue;
    out.push({ file: rel, line: i + 1, section, text });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 범주별 출처
// ---------------------------------------------------------------------------
function assert(cond, msg) {
  if (!cond) { throw new Error(`12-sample: ${msg}`); }
}
function mdFiles(dirRel, { excludeReadme = true } = {}) {
  return readdirSync(join(ROOT, dirRel))
    .filter((f) => f.endsWith('.md') && !(excludeReadme && f === 'README.md'))
    .sort(); // 코드 단위 순서 — 로캘 무관
}

export function moduleNames() {
  const names = readdirSync(join(ROOT, KB, 'modules'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'common')
    .map((d) => d.name)
    .sort();
  assert(names.length === EXPECT.modules, `modules: expected ${EXPECT.modules}, found ${names.length}`);
  return names;
}
export function countryNames() {
  const names = mdFiles(`${KB}/country`).map((f) => f.slice(0, -3));
  assert(names.length === EXPECT.countries, `country: expected ${EXPECT.countries}, found ${names.length}`);
  return names;
}
export function industryNames() {
  const names = mdFiles(`${KB}/industry`).map((f) => f.slice(0, -3));
  assert(names.length === EXPECT.industries, `industry: expected ${EXPECT.industries}, found ${names.length}`);
  return names;
}
export function ccOf(name) {
  return name === 'eu-common' ? 'EU' : name.toUpperCase();
}

// abap/conventions — 01-convention-split.txt 의 「일반 작법」 갈래를 기계로 옮긴 것.
// include = 그 절만 · exclude = 그 절 빼고 전부 · 없음 = 파일 전체 (전부 일반인 4파일).
const ABAP_SOURCES = [
  { file: 'abap-release-reference.md' },
  { file: 'abap-release-examples.md' },
  { file: 'sap-version-reference.md' },
  { file: 'cloud-abap-constraints.md', exclude: ['6. External References'] },
  {
    file: 'clean-code.md',
    exclude: ['Review Checklist'],
    excludeLines: [/Prefer explicit typed internal tables/, /secondary keys?/i, /mandatory pre-count/i, /Blocked tables/],
  },
  {
    file: 'clean-code-oop.md',
    exclude: ['Mandatory Main Program Template'],
    excludeLines: [/two-class split/i, /ZCX_\{MODULE\}_ERROR/, /\.abap_formatter/],
  },
  {
    file: 'clean-code-procedural.md',
    exclude: ['Mandatory Main Program Template'],
    excludeLines: [/_\{screen_no\}/, /procedural-form-naming/, /gv_okcode|OK_CODE|ok-code-pattern/, /One-line header above each FORM/, /testing scope/, /include-structure\.md/],
  },
  {
    file: 'function-module-rule.md',
    exclude: ['Integration Points', 'Enforcement Checklist'],
    excludeLines: [/completion report/, /abapgit-roundtrip-rule/, /source-repair-protocol/],
  },
  {
    file: 'alv-rules.md',
    include: ['Editable Grids', 'GUI Status (CUA)', 'Value Help (F4)', 'Master-Data Texts', 'REUSE_ALV_FIELDCATALOG_MERGE', 'SALV and Dialog Popups'],
  },
  {
    file: 'field-typing-rule.md',
    include: ['Priority (MANDATORY', 'HARD RULE — Semantic Categories', 'Common Standard DE Reference', 'Anti-Patterns (STOP', 'Anti-Pattern — Field Name', 'DDIC Activation Constraint'],
    excludeLines: [/ZMM[ED]\{NN\}/],
  },
  { file: 'rap-odata-rules.md', excludeLines: [/binding_category/, /allowedAction/] },
  { file: 'odata-gateway-rules.md' },
  { file: 'ecc-ddic-fallback.md', include: ['2. Why the branch exists'] },
  { file: 'text-element-rule.md', include: ['Four Text Pool Types', 'Selection Texts', 'Large Text Pools'] },
  { file: 'constant-rule.md', include: ['1. What must become a constant', '2. Where a literal may still stand'] },
  { file: 'include-structure.md', include: ['Event Blocks — Placement and Order', 'Activation Protocol'] },
  { file: 'ok-code-pattern.md', include: ['Why — what goes wrong'] },
  {
    file: 'abapgit-roundtrip-rule.md',
    include: ['Function Groups — Pull Every Member', 'The Pull Popup', 'Screens Missing From the XML', 'Overwrite-All on Pull', 'Skip SUSH Delete Proposals', 'Diffs and Warnings That Are Harmless', 'FM Signature Serialization Differs From ADT', 'Structure Serialization Fields'],
  },
  { file: 'source-repair-protocol.md', include: ['Inactive-Version Trap', 'Sibling-Defect False Failure'] },
].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

const EXPENSIVE_SECTION_RX = /tax|statutory|fiscal|e-invoic|pii|personal/i;
const EXPENSIVE_TEXT_RX = /\b(?:VAT|GST|tax|withholding|invoice|statutory|filing|return|PII|personal data|national ID|RRN|SSN|social security|encrypt|mask|audit)\b/i;
function expensiveHint(c) {
  return EXPENSIVE_SECTION_RX.test(c.section) || EXPENSIVE_TEXT_RX.test(c.text);
}

/** 표본 전체 — 범주 → 하위 범주(순서 있음) → 후보 목록. */
export function sample() {
  const module = new Map();
  for (const m of moduleNames()) {
    let cands = [];
    for (const f of mdFiles(`${KB}/modules/${m}`, { excludeReadme: false })) {
      cands = cands.concat(scanFile(`${KB}/modules/${m}/${f}`, { exclude: ['Required MCP Tools'] }));
    }
    module.set(m, { key: `module/${m}`, quota: QUOTA.module, list: shuffle(cands, `module/${m}`) });
  }

  const countryOrder = shuffle(countryNames(), 'country/order');
  const country = new Map();
  countryOrder.forEach((name, idx) => {
    const cands = scanFile(`${KB}/country/${name}.md`, { allBullets: true }).map((c) => ({ ...c, hint: expensiveHint(c) }));
    let list = shuffle(cands, `country/${name}`);
    const expensiveFirst = idx < COUNTRY_EXPENSIVE_FIRST;
    if (expensiveFirst) list = [...list.filter((c) => c.hint), ...list.filter((c) => !c.hint)];
    country.set(ccOf(name), { key: `country/${name}`, file: name, expensiveFirst, quota: QUOTA.country, list });
  });

  const industryOrder = shuffle(industryNames(), 'industry/order');
  const industrySelected = industryOrder.slice(0, EXPECT.industrySelected);
  const industry = new Map();
  for (const name of industrySelected) {
    industry.set(name, { key: `industry/${name}`, quota: QUOTA.industry, list: shuffle(scanFile(`${KB}/industry/${name}.md`, { allBullets: true }), `industry/${name}`) });
  }

  let abapCands = [];
  for (const src of ABAP_SOURCES) {
    abapCands = abapCands.concat(scanFile(`${KB}/abap/conventions/${src.file}`, src));
  }
  const abap = new Map([['abap', { key: 'abap', quota: QUOTA.abap, list: shuffle(abapCands, 'abap') }]]);

  return { module, country, countryOrder, industry, industryOrder, industrySelected, abap };
}

// ---------------------------------------------------------------------------
// 기본 모드 — 목록 출력
// ---------------------------------------------------------------------------
function renderListing(s, limit) {
  const full = [];
  const shown = [];
  const emit = (line, always = true) => { full.push(line); if (always) shown.push(line); };
  const emitSub = (title, entry, extra = '') => {
    emit(`### ${title} (n=${entry.list.length}) quota=${entry.quota}${extra}`);
    entry.list.forEach((c, i) => {
      const row = `${String(i + 1).padStart(3, '0')} | ${c.file}:${c.line} | §${c.section} | ${c.text}`;
      emit(row, limit === Infinity || i < limit);
    });
  };
  emit(`# 판J T1 표본 — 후보 목록 (seed ${SEED})`);
  emit('# 형식: 순번 | 파일:줄 | §절 | 본문   (순번은 하위 범주 안에서의 시드 순서 · 걷기는 001 부터)');
  emit('## category=module');
  for (const [m, entry] of s.module) emitSub(`module/${m}`, entry);
  emit(`## category=country  order=${s.countryOrder.map(ccOf).join(',')}  expensive-first=${COUNTRY_EXPENSIVE_FIRST}`);
  for (const [cc, entry] of s.country) emitSub(`country/${cc}`, entry, ` file=${entry.file}.md${entry.expensiveFirst ? ' expensive-first' : ''}`);
  emit(`## category=industry  order=${s.industryOrder.join(',')}  selected=${s.industrySelected.join(',')}`);
  for (const [name, entry] of s.industry) emitSub(`industry/${name}`, entry);
  emit('## category=abap');
  for (const [name, entry] of s.abap) emitSub(name, entry);
  const hash = createHash('sha256').update(full.join('\n'), 'utf8').digest('hex');
  shown.push(`# sha256(listing)=${hash}`);
  return shown.join('\n');
}

// ---------------------------------------------------------------------------
// --check 모드 — 항목표 검증
// ---------------------------------------------------------------------------
const CATS = ['module', 'country', 'industry', 'abap'];
function normText(s) {
  return String(s).replace(/[`*]/g, '').replace(/\s+/g, ' ').trim();
}
function coreIdentifier(answerKey) {
  const toks = [];
  for (const rx of ID_RX) for (const m of answerKey.matchAll(rx)) if (m[0].length >= 3 && !ID_STOP.has(m[0])) toks.push(m[0]);
  toks.sort((a, b) => b.length - a.length);
  return toks[0] ?? null;
}

function check(jsonPath) {
  const fails = [];
  const fail = (m) => fails.push(m);
  let doc;
  try {
    doc = JSON.parse(readFileSync(resolve(jsonPath), 'utf8'));
  } catch (e) {
    console.log(`FAIL: cannot read/parse ${jsonPath}: ${e.message}`);
    return 1;
  }
  if (doc._schema !== 'judge-item-v1') fail(`_schema must be judge-item-v1 (got ${JSON.stringify(doc._schema)})`);
  if (doc.seed !== SEED) fail(`seed must be ${SEED} (got ${JSON.stringify(doc.seed)})`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(doc.generated))) fail(`generated must be YYYY-MM-DD (got ${JSON.stringify(doc.generated)})`);
  const items = Array.isArray(doc.items) ? doc.items : (fail('items must be an array'), []);
  const rejections = Array.isArray(doc.rejections) ? doc.rejections : (fail('rejections must be an array'), []);

  const s = sample();
  const modules = new Set(moduleNames());
  const countries = new Set(countryNames().map(ccOf));
  const industries = new Set(s.industrySelected);

  // 항목별 검사
  const ids = new Set();
  const byCat = { module: 0, country: 0, industry: 0, abap: 0 };
  const perSub = new Map();
  let expensiveCountry = 0;
  let verbatim = 0;
  let identifier = 0;
  let leaks = 0;
  const itemByRef = new Map();
  items.forEach((it, idx) => {
    const where = `item[${idx}] ${it?.id ?? '?'}`;
    const req = ['id', 'kind', 'category', 'subcategory', 'question', 'answer_key', 'grading_rule'];
    for (const k of req) if (typeof it?.[k] !== 'string' || !it[k].trim()) fail(`${where}: field '${k}' empty or not a string`);
    if (it?.kind !== 'knowledge') fail(`${where}: kind must be 'knowledge'`);
    if (typeof it?.expensive !== 'boolean') fail(`${where}: expensive must be boolean`);
    if (!CATS.includes(it?.category)) { fail(`${where}: category must be one of ${CATS.join('/')}`); return; }
    byCat[it.category] += 1;
    if (ids.has(it.id)) fail(`${where}: duplicate id`); ids.add(it.id);
    const idRx = {
      module: /^K-MOD-([A-Za-z]+)-(\d{2})$/,
      country: /^K-CTY-([A-Z]{2})-(\d{2})$/,
      industry: /^K-IND-([a-z-]+)-(\d{2})$/,
      abap: /^K-ABAP-(\d{2})$/,
    }[it.category];
    const im = idRx.exec(String(it.id));
    if (!im) fail(`${where}: id does not match the ${it.category} pattern`);
    const sub = String(it.subcategory);
    if (it.category === 'module') {
      if (!modules.has(sub)) fail(`${where}: unknown module subcategory '${sub}'`);
      if (im && im[1] !== sub) fail(`${where}: id module '${im[1]}' != subcategory '${sub}'`);
    } else if (it.category === 'country') {
      if (!countries.has(sub)) fail(`${where}: unknown country subcategory '${sub}'`);
      if (im && im[1] !== sub) fail(`${where}: id country '${im[1]}' != subcategory '${sub}'`);
      if (it.expensive === true) expensiveCountry += 1;
    } else if (it.category === 'industry') {
      if (!industries.has(sub)) fail(`${where}: industry '${sub}' is not among the sampler's selected 7 (${[...industries].join(',')})`);
      if (im && im[1] !== sub) fail(`${where}: id industry '${im[1]}' != subcategory '${sub}'`);
    }
    const subKey = it.category === 'abap' ? 'abap' : `${it.category}/${sub}`;
    perSub.set(subKey, (perSub.get(subKey) ?? 0) + 1);

    // 정답 키 ↔ 출처
    const ks = it.key_source;
    if (!ks || typeof ks.file !== 'string' || !Number.isInteger(ks.line) || ks.line < 1) { fail(`${where}: key_source needs {file, line>=1}`); return; }
    const abs = join(ROOT, ks.file);
    if (!existsSync(abs)) { fail(`${where}: key_source.file not found: ${ks.file}`); return; }
    const expectedDir = {
      module: `${KB}/modules/${sub}/`, country: `${KB}/country/`, industry: `${KB}/industry/${sub}.md`, abap: `${KB}/abap/conventions/`,
    }[it.category];
    if (!ks.file.startsWith(expectedDir)) fail(`${where}: key_source.file ${ks.file} is outside ${expectedDir}`);
    if (it.category === 'country') {
      const expectCc = ccOf(ks.file.slice(`${KB}/country/`.length).replace(/\.md$/, ''));
      if (expectCc !== sub) fail(`${where}: key_source.file is ${expectCc} but subcategory is ${sub}`);
    }
    const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
    if (ks.line > lines.length) { fail(`${where}: key_source.line ${ks.line} beyond end of file (${lines.length})`); return; }
    const window = normText(lines.slice(Math.max(0, ks.line - 3), ks.line + 2).join(' '));
    const ak = normText(it.answer_key);
    if (ak && window.includes(ak)) verbatim += 1;
    else {
      const core = coreIdentifier(String(it.answer_key));
      if (core && window.includes(core)) identifier += 1;
      else fail(`${where}: answer_key not found at ${ks.file}:${ks.line}±2 (neither verbatim nor core identifier '${core}')`);
    }
    const q = normText(it.question);
    if (q === ak || (ak.length >= 12 && q.includes(ak))) { leaks += 1; fail(`${where}: question contains the answer_key verbatim`); }
    const ref = `${ks.file}:${ks.line}`;
    if (itemByRef.has(ref)) fail(`${where}: same key_source as ${itemByRef.get(ref)}`);
    itemByRef.set(ref, it.id);
  });

  // 계수
  if (byCat.module !== 30) fail(`module items: expected 30, got ${byCat.module}`);
  if (byCat.country !== 16) fail(`country items: expected 16, got ${byCat.country}`);
  if (byCat.industry !== 7) fail(`industry items: expected 7, got ${byCat.industry}`);
  if (byCat.abap !== 7) fail(`abap items: expected 7, got ${byCat.abap}`);
  if (items.length !== 60) fail(`total items: expected 60, got ${items.length}`);
  for (const m of modules) if ((perSub.get(`module/${m}`) ?? 0) !== 2) fail(`module/${m}: expected 2 items, got ${perSub.get(`module/${m}`) ?? 0}`);
  for (const c of countries) if ((perSub.get(`country/${c}`) ?? 0) !== 1) fail(`country/${c}: expected 1 item, got ${perSub.get(`country/${c}`) ?? 0}`);
  for (const i of industries) if ((perSub.get(`industry/${i}`) ?? 0) !== 1) fail(`industry/${i}: expected 1 item, got ${perSub.get(`industry/${i}`) ?? 0}`);
  if (expensiveCountry < COUNTRY_MIN_EXPENSIVE) fail(`country expensive items: expected >= ${COUNTRY_MIN_EXPENSIVE}, got ${expensiveCountry}`);

  // 기각 기록
  const rejByRef = new Map();
  rejections.forEach((r, idx) => {
    if (typeof r?.candidate !== 'string' || !/^.+:\d+$/.test(r.candidate)) fail(`rejections[${idx}]: candidate must be 'file:line'`);
    if (typeof r?.reason !== 'string' || !r.reason.trim()) fail(`rejections[${idx}]: reason empty`);
    if (r?.candidate) {
      if (rejByRef.has(r.candidate)) fail(`rejections[${idx}]: duplicate candidate ${r.candidate}`);
      rejByRef.set(r.candidate, r.reason);
      if (itemByRef.has(r.candidate)) fail(`rejections[${idx}]: ${r.candidate} is both accepted and rejected`);
    }
  });

  // 걷기 일관성 — 하위 범주마다 위에서부터 할당량이 찰 때까지 받음/기각이 빠짐없이 이어져야 한다.
  let gaps = 0;
  let offList = 0;
  let walked = 0;
  const seenRefs = new Set();
  const walkSub = (label, entry) => {
    let accepted = 0;
    for (const c of entry.list) {
      if (accepted >= entry.quota) break;
      const ref = `${c.file}:${c.line}`;
      seenRefs.add(ref);
      walked += 1;
      if (itemByRef.has(ref)) accepted += 1;
      else if (rejByRef.has(ref)) continue;
      else { gaps += 1; fail(`walk gap: ${label} #${entry.list.indexOf(c) + 1} ${ref} neither accepted nor rejected`); }
    }
    if (accepted < entry.quota) fail(`${label}: quota ${entry.quota} not reached (accepted ${accepted})`);
  };
  for (const [m, e] of s.module) walkSub(`module/${m}`, e);
  for (const [c, e] of s.country) walkSub(`country/${c}`, e);
  for (const [i, e] of s.industry) walkSub(`industry/${i}`, e);
  for (const [a, e] of s.abap) walkSub(a, e);
  const allRefs = new Set();
  for (const map of [s.module, s.country, s.industry, s.abap]) for (const e of map.values()) for (const c of e.list) allRefs.add(`${c.file}:${c.line}`);
  for (const [ref, id] of itemByRef) if (!allRefs.has(ref)) { offList += 1; fail(`${id}: key_source ${ref} is not a sampled candidate`); }
  for (const ref of rejByRef.keys()) if (!seenRefs.has(ref)) fail(`rejection ${ref} is not on any walked prefix (unreached or not a candidate)`);

  // 요약
  console.log(`--check ${jsonPath}`);
  console.log(`  items: ${items.length} (module ${byCat.module} · country ${byCat.country} · industry ${byCat.industry} · abap ${byCat.abap})`);
  console.log(`  module per-sub at 2: ${[...modules].filter((m) => perSub.get(`module/${m}`) === 2).length}/${modules.size}`);
  console.log(`  country per-sub at 1: ${[...countries].filter((c) => perSub.get(`country/${c}`) === 1).length}/${countries.size} · expensive ${expensiveCountry} (>= ${COUNTRY_MIN_EXPENSIVE})`);
  console.log(`  industry selected: ${[...industries].join(',')} · covered ${[...industries].filter((i) => perSub.get(`industry/${i}`) === 1).length}/${industries.size}`);
  console.log(`  answer_key at source ±2: verbatim ${verbatim} · core-identifier ${identifier} · leaks ${leaks}`);
  console.log(`  ids unique: ${ids.size === items.length ? 'yes' : 'NO'} · rejections ${rejections.length} · walked ${walked} · gaps ${gaps} · off-list ${offList}`);
  if (fails.length) {
    console.log(`  failures (${fails.length}):`);
    for (const f of fails) console.log(`   - ${f}`);
    console.log('RESULT: FAIL');
    return 1;
  }
  console.log('RESULT: PASS');
  return 0;
}

// ---------------------------------------------------------------------------
// 진입점
// ---------------------------------------------------------------------------
function main(argv) {
  if (argv.includes('--help')) {
    console.log('usage: node 12-sample.mjs [--limit N] | node 12-sample.mjs --check <10-knowledge-items.json>');
    return 0;
  }
  const ci = argv.indexOf('--check');
  if (ci !== -1) {
    const p = argv[ci + 1];
    if (!p) { console.log('FAIL: --check needs a path'); return 2; }
    return check(p);
  }
  const li = argv.indexOf('--limit');
  const limit = li !== -1 ? Number(argv[li + 1]) : Infinity;
  if (li !== -1 && !(Number.isInteger(limit) && limit > 0)) { console.log('FAIL: --limit needs a positive integer'); return 2; }
  process.stdout.write(`${renderListing(sample(), limit)}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
