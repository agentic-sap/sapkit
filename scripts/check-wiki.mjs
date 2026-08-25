#!/usr/bin/env node
// check-wiki.mjs — 콜드 층 위키(`docs/reference/wiki/`)의 **구조 검사** 게이트. 판W.
// 설계 `docs/reference/designs/2026-08-23-project-brain-design.md` §2.11 · §4.6-3·5.
//
// ─────────────────────────── 이 게이트의 주장 ──────────────────────────────
// 콜드 층은 「원본이 불변인 기록」이다(설계 §2.11). 그 위에 주제별 합성 페이지를
// 얹으면 회수가 쉬워지지만, **합성 페이지는 원본이 아니라 파생물이라서 조용히
// 낡는다.** 그래서 이 게이트가 재는 것은 위키의 **내용이 옳은가**가 아니라 —
// 그건 사람이 읽어야 한다 — 위키가 **구조적으로 살아 있는가**다:
//
//   가리키는 곳이 실재하고(①③) · 아무도 안 가리키는 기록이 없고(②) ·
//   파생물임을 스스로 밝히며(④) · 애초에 존재하고(⑤) · 발견될 수 있다(⑥).
//
// ── ⓐ 왜 루트 `scripts/`인가 (자기서술 1) ─────────────────────────────────
// **이것은 공방 문서 게이트다 — 트랙 A 실행 설비가 아니고, 제품에 동봉되지 않는다.**
// 자리를 고른 근거:
//   · `interactive/scripts/`는 **제품 패키지에 통째로 실려 나간다.** 그래서 제품과
//     무관한 스크립트를 거기 두면 사용자 프로젝트에 딸려간다 — 실측·등재된 문제이고
//     (커밋 `333404d`) `check-doc-size.mjs`가 바로 그 「정리 대상」 사례다. 같은
//     실수를 한 번 더 저지르지 않기 위해 이 파일은 그리로 가지 않는다.
//   · `docs/`는 산문 층이다. 읽는 물건 사이에 도는 물건을 섞지 않는다.
//   · 루트 `scripts/`는 R1이 지운 이름이지만, R1이 지운 것은 **트랙 A 실행 설비**이지
//     이름 자체가 아니다. 재사용을 금지한 규범은 없다. 그러므로 이 파일이 그 이름의
//     첫 입주자이고, 뒤따르는 공방 게이트의 자리도 여기다.
//
// ── ⓑ 왜 ②의 분모가 「위키 페이지」가 아니라 「콜드 전수」인가 (자기서술 2) ──
// 설계 §4.6-5의 문언이 정본이다 — 「**어디서도 링크되지 않는 콜드 문서** 보고
// (§2.11). **아카이브 디렉터리는 제외**」. 즉 잡으려는 것은 「위키 안에서 뜬 페이지」가
// 아니라 **콜드 층 전체에서 아무도 안 가리키는 기록**이다. 위키만 분모로 잡으면 위키는
// 깨끗한데 그 위키가 콜드 기록의 절반을 안 덮는 상태가 통과한다 — 위키를 짓는 목적이
// 그 절반을 되찾는 것이었으므로, 그 상태를 통과시키면 게이트가 목적을 배신한다.
// 아카이브 2종(`handoff-archive/`·`run-archive/`)만 빼는 이유도 같은 §이 준다:
// 아카이브는 **의도적 고아**다(포인터 하나만 남기는 것이 이사의 목적). 빼지 않으면
// 고아 검출기와 이사 처방이 서로를 상쇄한다. 다만 그 2디렉터리가 **INDEX에서 이름으로
// 언급은 되는지**는 함께 잰다(②의 뒷절) — 제외가 「망각」으로 미끄러지지 않게.
//
// ── 판정 6종 ──────────────────────────────────────────────────────────────
//   ① 링크 무결성 — 위키 구역의 모든 상대 `.md` 링크가 실재 파일로 풀린다.
//                   위키 구역에 `[[`(위키링크 문법)가 나타나면 위반.
//   ② 고아 검출   — 분모 = `docs/reference/**/*.md` 전체 − 아카이브 2종 **내부 파일**
//                   − `wiki/INDEX.md` 자신. 각 파일이 위키 구역 어디에서도 링크되지
//                   않으면 위반. + INDEX가 아카이브 2디렉터리 이름을 담지 않으면 위반.
//   ③ D-번호 실재 — 위키 구역 본문의 `\bD-\d{3}\b`가 `DECISIONS.md`의 표제에 실재.
//                   표제 정규식은 `^## D-\d+`이고 **번호만** 대조한다 — 구 형식
//                   (`## D-001 · 날짜 · 제목`)과 신 형식(`## D-134 — 제목 (날짜)`)이
//                   병존하므로 제목 형태에 기대면 안 된다.
//   ④ 파생물 배너 — 위키 구역 모든 `.md`(INDEX 포함)에 문자열 `재생성 가능한 파생물`.
//   ⑤ 부재 = 위반 — 위키 디렉터리 또는 `INDEX.md`가 없으면 위반. 통과만 하는 장식
//                   게이트가 되지 않기 위해서다(`check-doc-size.mjs`의 철학 승계).
//   ⑥ 배선 앵커   — `CLAUDE.md`·`HANDOFF.md`에 `docs/reference/wiki/INDEX.md` 문자열.
//                   위키는 발견되지 않으면 없는 것과 같다 — 발견 배선을 기계로 고정한다.
//
// ── 측정 정의 (이 구현이 정본이다) ─────────────────────────────────────────
//   · **CRLF 정규화 후** 줄을 나눈다(`\r\n`·`\r` → `\n`). 이 레포는 `core.autocrlf=true`라
//     정규화 없이 줄 내용을 매칭하면 끝의 `\r`에 걸린다. 줄 번호는 정규화 기준 1-based.
//   · 링크는 **인라인 마크다운 링크**(`](target)`)만 본다. 프로토콜(`http:` 등)·절대
//     경로·순수 앵커(`#…`)는 대상 밖이고, 앵커(`#…`)는 잘라 낸 뒤 `.md`로 끝나는 것만
//     센다. 참조식 링크(`[a]: b.md`)는 이 레포에 쓰이지 않아 대상 밖이다.
//   · 경로 대조 키는 **소문자 정규화**한다 — Windows의 `existsSync`가 대소문자를
//     가리지 않으므로, ①이 통과한 링크가 ②에서 「대소문자가 달라 고아」로 뒤집히는
//     플랫폼 의존 오탐을 막기 위해서다. (대소문자만 다른 링크는 Linux CI의 ①이 잡는다.)
//   · ⑤가 위반(위키 디렉터리 자체가 없음)이면 ①~④는 **건너뛴다** — 분모 전체를
//     고아로 쏟아내 봐야 읽히지 않는다. ⑥은 위키와 무관하므로 그대로 잰다.
//
// 사용: node scripts/check-wiki.mjs [--root <dir>]
//   `--root`는 음성시험이 복제 트리를 먹이기 위한 것이다(`check-doc-size.mjs` 선례).
//
// exit 0 통과 / 1 위반
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// --root <dir>: 스캔 루트 override. 기본값은 이 스크립트 위치 기준 레포 루트.
const rootIdx = process.argv.indexOf('--root');
const ROOT = rootIdx >= 0 ? path.resolve(process.argv[rootIdx + 1]) : path.resolve(HERE, '..');

// ── 상수 (tunable — 여기가 유일한 자리다) ──────────────────────────────────
const COLD_DIR = path.join(ROOT, 'docs', 'reference');
const WIKI_DIR = path.join(COLD_DIR, 'wiki');
const INDEX_MD = path.join(WIKI_DIR, 'INDEX.md');
const DECISIONS_MD = path.join(COLD_DIR, 'DECISIONS.md');
const ARCHIVE_DIRS = ['handoff-archive', 'run-archive'];
const BANNER = '재생성 가능한 파생물';
const WIRE_ANCHOR = 'docs/reference/wiki/INDEX.md';
const WIRE_FILES = ['CLAUDE.md', 'HANDOFF.md'];

// ── 공용 ────────────────────────────────────────────────────────────────────
const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');
/** 경로 대조 키 — 구분자 통일 + 소문자화(위 「측정 정의」 참조). */
const key = (abs) => path.resolve(abs).split(path.sep).join('/').toLowerCase();

/** CRLF 정규화 후 줄 배열. 이 함수가 「줄」의 정의다. */
function readLines(abs) {
  return fs.readFileSync(abs, 'utf8').replace(/\r\n?/g, '\n').split('\n');
}

function walkMd(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkMd(abs));
    else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) out.push(abs);
  }
  return out;
}

const LINK_RE = /\]\(\s*<?([^)\s<>]+)>?/g;

/** 한 줄에서 상대 `.md` 링크 대상을 뽑는다(앵커 제거·프로토콜/절대경로 배제). */
function mdLinksIn(line) {
  const out = [];
  LINK_RE.lastIndex = 0;
  let m;
  while ((m = LINK_RE.exec(line)) !== null) {
    let raw = m[1];
    const hash = raw.indexOf('#');
    if (hash >= 0) raw = raw.slice(0, hash);
    if (!raw) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue; // http: · mailto: · …
    if (raw.startsWith('/') || raw.startsWith('\\')) continue; // 절대 경로
    let target = raw;
    try {
      target = decodeURIComponent(raw);
    } catch {
      /* 잘못 인코딩된 경로는 원문 그대로 본다 */
    }
    if (!target.toLowerCase().endsWith('.md')) continue;
    out.push({ raw, target });
  }
  return out;
}

// ── 수집 ────────────────────────────────────────────────────────────────────
const wikiDirExists = fs.existsSync(WIKI_DIR) && fs.statSync(WIKI_DIR).isDirectory();
const indexExists = fs.existsSync(INDEX_MD) && fs.statSync(INDEX_MD).isFile();
const wikiFiles = wikiDirExists ? walkMd(WIKI_DIR) : [];

const fails = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
const stats = { links: 0, denom: 0, dnums: 0, pages: wikiFiles.length };

// ⑤ 부재 = 위반 ─────────────────────────────────────────────────────────────
if (!wikiDirExists) {
  fails[5].push(
    `${rel(WIKI_DIR)} — 위키 디렉터리가 없다. 콜드 층 위키가 아직 없거나 이동됐다면 ` +
      `이 게이트의 WIKI_DIR을 함께 고칠 것(경로 변경은 계약 변경이다).`,
  );
} else if (!indexExists) {
  fails[5].push(`${rel(INDEX_MD)} — 위키의 입구 INDEX.md가 없다. 페이지만 있고 색인이 없으면 회수가 성립하지 않는다.`);
}

// 위키 구역이 통째로 없으면 ①~④는 잴 것이 없다(건너뜀 — 위 「측정 정의」).
const scanWiki = wikiDirExists;

// ── ① 링크 무결성 + 링크 대상 수집(②가 쓴다) ───────────────────────────────
const linked = new Set();
if (scanWiki) {
  for (const abs of wikiFiles) {
    const lines = readLines(abs);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const at = `${rel(abs)}:${i + 1}`;
      if (line.includes('[[')) {
        fails[1].push(`${at} — 위키링크 문법 \`[[\`가 있다. 이 레포의 위키는 **상대 경로 마크다운 링크**만 쓴다(해석기가 없다).`);
      }
      for (const { raw, target } of mdLinksIn(line)) {
        stats.links += 1;
        const resolved = path.resolve(path.dirname(abs), target);
        linked.add(key(resolved));
        if (!fs.existsSync(resolved)) {
          fails[1].push(`${at} — 링크 \`${raw}\`가 실재하지 않는다 (풀린 경로: ${rel(resolved)}).`);
        }
      }
    }
  }
}

// ── ② 고아 검출 ─────────────────────────────────────────────────────────────
if (scanWiki) {
  const coldFiles = walkMd(COLD_DIR).filter((abs) => {
    const r = path.relative(COLD_DIR, abs).split(path.sep);
    if (ARCHIVE_DIRS.includes(r[0]) && r.length > 1) return false; // 아카이브 **내부 파일**
    if (key(abs) === key(INDEX_MD)) return false; // INDEX 자신
    return true;
  });
  stats.denom = coldFiles.length;
  for (const abs of coldFiles) {
    if (!linked.has(key(abs))) {
      fails[2].push(`${rel(abs)} — 위키 어디에서도 링크되지 않는다(고아). INDEX나 주제 페이지에서 가리킬 것.`);
    }
  }
  if (indexExists) {
    const idx = readLines(INDEX_MD).join('\n');
    for (const d of ARCHIVE_DIRS) {
      if (!idx.includes(d)) {
        fails[2].push(
          `${rel(INDEX_MD)} — 아카이브 디렉터리 \`${d}\`가 언급되지 않는다. ` +
            `아카이브는 고아 분모에서 **의도적으로** 빠지므로, 언급이 없으면 그대로 잊힌다.`,
        );
      }
    }
  }
}

// ── ③ D-번호 인용 실재 ──────────────────────────────────────────────────────
if (scanWiki) {
  const known = new Set();
  if (!fs.existsSync(DECISIONS_MD)) {
    fails[3].push(`${rel(DECISIONS_MD)} — 결정 로그가 없다. D-번호 인용을 대조할 정본이 없으면 ③은 성립하지 않는다.`);
  } else {
    for (const line of readLines(DECISIONS_MD)) {
      const m = /^## D-(\d+)/.exec(line);
      if (m) known.add(Number(m[1])); // 구·신 표제 형식 병존 — **번호만** 본다
    }
    stats.dnums = known.size;
    for (const abs of wikiFiles) {
      const lines = readLines(abs);
      for (let i = 0; i < lines.length; i += 1) {
        const re = /\bD-(\d{3})\b/g;
        let m;
        while ((m = re.exec(lines[i])) !== null) {
          if (!known.has(Number(m[1]))) {
            fails[3].push(`${rel(abs)}:${i + 1} — D-${m[1]}이(가) ${rel(DECISIONS_MD)}의 표제에 없다.`);
          }
        }
      }
    }
  }
}

// ── ④ 파생물 배너 ───────────────────────────────────────────────────────────
if (scanWiki) {
  for (const abs of wikiFiles) {
    if (!readLines(abs).join('\n').includes(BANNER)) {
      fails[4].push(`${rel(abs)}:1 — 문자열 \`${BANNER}\`가 없다. 위키 페이지는 원본이 아니라 파생물임을 스스로 밝혀야 한다.`);
    }
  }
}

// ── ⑥ 배선 앵커 ─────────────────────────────────────────────────────────────
for (const name of WIRE_FILES) {
  const abs = path.join(ROOT, name);
  if (!fs.existsSync(abs)) {
    fails[6].push(`${name} — 파일이 없다. 배선 앵커를 걸 자리가 없다.`);
    continue;
  }
  if (!readLines(abs).join('\n').includes(WIRE_ANCHOR)) {
    fails[6].push(`${name}:1 — 문자열 \`${WIRE_ANCHOR}\`가 없다. 위키는 발견 배선이 없으면 없는 것과 같다.`);
  }
}

// ── 보고 ────────────────────────────────────────────────────────────────────
const LABELS = {
  1: ['① 링크 무결성', () => (scanWiki ? `상대 .md 링크 ${stats.links}개` : '건너뜀 (위키 구역 부재)')],
  2: ['② 고아 검출', () => (scanWiki ? `분모 ${stats.denom}개 (아카이브 2종 내부·INDEX 자신 제외)` : '건너뜀 (위키 구역 부재)')],
  3: ['③ D-번호 실재', () => (scanWiki ? `표제 ${stats.dnums}개 대조` : '건너뜀 (위키 구역 부재)')],
  4: ['④ 파생물 배너', () => (scanWiki ? `페이지 ${stats.pages}개` : '건너뜀 (위키 구역 부재)')],
  5: ['⑤ 부재 = 위반', () => `${rel(WIKI_DIR)} ${wikiDirExists ? '있음' : '없음'} · INDEX.md ${indexExists ? '있음' : '없음'}`],
  6: ['⑥ 배선 앵커', () => `${WIRE_FILES.join('·')} ← "${WIRE_ANCHOR}"`],
};

console.log(`스캔 루트   : ${ROOT}`);
console.log(`위키 구역   : ${rel(WIKI_DIR)} (페이지 ${stats.pages}개)`);
console.log(`측정 정의   : CRLF 정규화 후 줄 번호 1-based · 인라인 마크다운 링크만`);
for (const n of [1, 2, 3, 4, 5, 6]) {
  const [label, note] = LABELS[n];
  const bad = fails[n].length;
  const skipped = !scanWiki && n <= 4;
  const mark = bad ? '❌' : skipped ? '--' : 'OK';
  console.log(`  ${mark} ${label.padEnd(16)} ${note()}${bad ? ` — 위반 ${bad}건` : ''}`);
}

const total = Object.values(fails).reduce((a, b) => a + b.length, 0);
if (total) {
  console.log(`\n❌ 위반 ${total}건:`);
  for (const n of [1, 2, 3, 4, 5, 6]) {
    for (const f of fails[n]) console.log(`  - ${LABELS[n][0]} · ${f}`);
  }
  process.exit(1);
}
console.log('\n✅ 위키 게이트 통과 — 콜드 층 위키가 구조적으로 살아 있다');
