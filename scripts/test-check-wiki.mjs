#!/usr/bin/env node
// check-wiki.mjs 음성시험 — 위키 게이트가 '통과만 하는 장식'이 아님을 증명한다. 판W · T2.
//
// OS 임시 디렉터리에 콜드 층을 축소 복제해 넣고 `--root`로 먹여, 게이트가 **정말
// 거부하는지** 본다. 원본 트리는 읽지도 고치지도 않는다(레포 안에 흔적 0).
// SAP 무접촉 · 오프라인 · 표준 라이브러리만.
//
// ── 이 시험의 두 규율 ──────────────────────────────────────────────────────
// ⑴ **한 케이스는 하나의 판정만 어긴다.** 두 개를 함께 어기면 「어느 판정이 잡았는가」를
//    말할 수 없고, 그러면 게이트의 한 칸이 죽어 있어도 시험이 초록으로 남는다.
// ⑵ **red를 `exit≠0`으로 세지 않는다.** 게이트의 요약 블록을 파싱해 **판정 6칸의
//    상태 지도**(ok / red:N / skip)를 만들고, 기대 지도와 **전체 일치**를 본다.
//    다른 판정에 걸려 우연히 red가 된 것은 여기서 불일치로 떨어진다.
//    ①에 두 종류의 위반(깨진 링크 · `[[` 문법)이 함께 실리므로, 그 둘은 **사유 문구**로
//    갈라 확인한다(want/deny).
//
// ── 초록 케이스가 왜 「실물 복제」가 아닌가 ────────────────────────────────
// 선례(`interactive/scripts/test-check-doc-size.mjs` ⑴)는 실물을 복제해 현행 초록을
// 고정한다. 판W의 이 시점 레포는 `wiki/INDEX.md`도 배선 앵커도 아직 없어(후속 작업
// 소관) 실물이 red다. 그래서 초록은 **합성 최소 트리**로 잡는다 — 6판정 전부를
// 만족하는 가장 작은 콜드 층이고, red 7계열은 그 트리에서 **한 곳만** 비틀어 만든다.
// ⚠ 그러므로 이 시험은 「게이트가 실물에서 초록이다」를 주장하지 않는다. 그 주장은
// 위키 본문과 배선이 선 뒤에 게이트 본체가 CI에서 직접 세운다.
//
// 고정하는 것 (계약분 8 — spec §1.3):
//   ⑴ 깨진 링크                        → red ①
//   ⑵ INDEX 미링크 콜드 문서(고아)     → red ②
//   ⑶ 유령 D-번호                      → red ③
//   ⑷ 파생물 배너 부재                 → red ④
//   ⑸ 위키 디렉터리 부재               → red ⑤ (+ ①~④는 건너뜀)
//   ⑹ `[[위키링크]]` 문법              → red ① (사유가 ⑴과 다른 문구다)
//   ⑺ 배선 앵커 제거                   → red ⑥
//   ⑻ 깨끗한 트리                      → green
// 추가분 8 (계약 초과 — 게이트의 실효성과 이 시험 자신의 유효성을 지킨다):
//   ⒜⒝⒞ 인용 구간 3종(펜스·HTML 주석·인라인 스팬) 안의 링크가 발견성을 대신
//        채워 주지 않는다              → red ②
//   ⒟ INDEX가 아카이브를 **이름만** 언급 → red ②
//   ⒢ **⑤의 두 번째 분기** — 위키 디렉터리는 있는데 `INDEX.md`만 없다 → red ⑤
//        (⑸와 달리 ①~④를 **건너뛰지 않는다** — 그 비대칭이 이 케이스가 잡는 것이다)
//   ⒣ **③의 `DECISIONS.md` 부재 분기** — 대조 정본이 없다 → red ③
//   ⒠ `--root=<dir>` 형태가 fixture를 정말 읽는다 (무시되면 이 시험 전체가 거짓이다)
//   ⒡ `--root` 값 없음 / `--root=` 빈 값 → exit 1
//
// exit 0 전부 통과 / 1 하나라도 어긋남
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-wiki.mjs');

let pass = 0;
let fail = 0;

function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  [ok ] ${label}`);
  } else {
    fail += 1;
    console.log(`  [FAIL] ${label}${detail ? ' — ' + detail : ''}`);
  }
}

// ── fixture 콜드 층 ────────────────────────────────────────────────────────
// 초록 최소 트리. ②의 분모는 아카이브 내부 2종과 INDEX 자신을 뺀 3개
// (ADR.md · DECISIONS.md · wiki/topic.md)이고, INDEX가 그 셋을 전부 가리킨다.
const INDEX_GREEN = [
  '# 콜드 층 위키 — INDEX (fixture)',
  '',
  '> 이 페이지는 **재생성 가능한 파생물**이다. 원본은 각 항목이 가리키는 문서다.',
  '',
  '## 콜드 기록',
  '- [ADR](../ADR.md)',
  '- [결정 로그](../DECISIONS.md)',
  '',
  '## 주제 페이지',
  '- [주제 하나](topic.md)',
  '',
  '## 아카이브 — 고아 분모에서 제외(포인터가 유일한 회수 경로)',
  '- docs/reference/handoff-archive/ — 판 이력',
  '- docs/reference/run-archive/ — 판 브리프',
  '',
].join('\n');

const TOPIC_GREEN = [
  '# 주제 하나 (fixture)',
  '',
  '> **재생성 가능한 파생물** — 원본은 결정 로그다.',
  '',
  '- 근거: D-001',
  '- 돌아가기: [INDEX](INDEX.md)',
  '',
].join('\n');

const W_INDEX = 'docs/reference/wiki/INDEX.md';
const W_TOPIC = 'docs/reference/wiki/topic.md';

function baseFiles() {
  return {
    'CLAUDE.md': ['# CLAUDE.md (fixture)', '', '콜드 층 위키의 입구는 docs/reference/wiki/INDEX.md 다.', ''].join('\n'),
    'HANDOFF.md': ['# HANDOFF (fixture)', '', '위키 입구: docs/reference/wiki/INDEX.md', ''].join('\n'),
    'docs/reference/ADR.md': ['# ADR (fixture)', '', '콜드 기록 하나.', ''].join('\n'),
    // 구·신 표제 형식 병존 — 게이트가 **번호만** 본다는 계약을 fixture가 함께 재현한다.
    'docs/reference/DECISIONS.md': [
      '# 결정 로그 (fixture)',
      '',
      '## D-001 · 2026-01-01 · 구 형식 표제',
      '',
      '본문.',
      '',
      '## D-002 — 신 형식 표제 (2026-01-02)',
      '',
      '본문.',
      '',
    ].join('\n'),
    'docs/reference/handoff-archive/HANDOFF-archive-2026-01.md': ['# 아카이브 (fixture)', '', '의도적 고아 — 분모에서 빠진다.', ''].join('\n'),
    'docs/reference/run-archive/RUN-PLAN-briefs-2026-01.md': ['# 아카이브 (fixture)', '', '의도적 고아 — 분모에서 빠진다.', ''].join('\n'),
    [W_INDEX]: INDEX_GREEN,
    [W_TOPIC]: TOPIC_GREEN,
  };
}

function buildTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-gate-'));
  for (const [rel, content] of Object.entries(files)) {
    if (content === null || content === undefined) continue;
    const abs = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

/** 초록 트리에서 **한 곳만** 비튼 트리를 만든다. */
function tree(mutate) {
  const files = baseFiles();
  if (mutate) mutate(files);
  return buildTree(files);
}

// ── 게이트 실행 + 판정 지도 파싱 ───────────────────────────────────────────
function runGate(args) {
  try {
    return { code: 0, out: execFileSync('node', [GATE, ...args], { encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const LABEL = {
  1: '① 링크 무결성',
  2: '② 고아 검출',
  3: '③ D-번호 실재',
  4: '④ 파생물 배너',
  5: '⑤ 부재 = 위반',
  6: '⑥ 배선 앵커',
};

/**
 * 게이트 요약 블록(`  <mark> <label> …`)에서 판정 6칸의 상태를 읽는다.
 * mark는 게이트 구현의 3종(`❌` / `--` / `OK`)이고, 위반 수는 `— 위반 N건`에서 온다.
 * 요약 줄이 사유 목록(`  - ① …`)보다 앞이라 첫 일치가 곧 요약 줄이다.
 */
function verdictMap(out) {
  const lines = out.split('\n').map((l) => l.replace(/^\s+/, ''));
  const map = {};
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const label = LABEL[n];
    const hit = lines.find((t) => ['❌', '--', 'OK'].some((m) => t.startsWith(`${m} ${label}`)));
    if (hit === undefined) {
      map[n] = '없음';
      continue;
    }
    if (hit.startsWith('❌')) {
      const c = /위반 (\d+)건/.exec(hit);
      map[n] = `red:${c ? c[1] : '?'}`;
    } else map[n] = hit.startsWith('--') ? 'skip' : 'ok';
  }
  return map;
}

const fmt = (map) => [1, 2, 3, 4, 5, 6].map((n) => `${n}=${map[n]}`).join(' ');

function wantMap({ red = {}, skip = [] }) {
  const map = {};
  for (const n of [1, 2, 3, 4, 5, 6]) {
    map[n] = red[n] !== undefined ? `red:${red[n]}` : skip.includes(n) ? 'skip' : 'ok';
  }
  return map;
}

/** root를 먹여 돌리고, exit·판정 지도·사유 문구를 확인한 뒤 fixture를 지운다. */
function assess(label, root, spec) {
  const args = spec.eqForm ? [`--root=${root}`] : ['--root', root];
  const r = runGate(args);
  check(`${label} — exit ${spec.code}`, r.code === spec.code, `실제 ${r.code}`);
  const got = fmt(verdictMap(r.out));
  const want = fmt(wantMap(spec));
  check('   └ 판정 지도', got === want, `기대 [${want}] / 실제 [${got}]`);
  for (const s of spec.want ?? []) check(`   └ 사유에 "${s}"`, r.out.includes(s));
  for (const s of spec.deny ?? []) check(`   └ 사유에 "${s}" 없음`, !r.out.includes(s));
  fs.rmSync(root, { recursive: true, force: true });
  return r;
}

console.log('check-wiki.mjs 음성시험 — 계약분 8 + 추가분 8\n');
console.log('[계약분]');

// ⑻ 먼저 초록을 세운다 — 이게 안 서면 나머지 red가 무엇을 잡았는지 말할 수 없다.
assess('⑻ 깨끗한 트리 (합성 최소 콜드 층)', tree(), { code: 0 });

// ⑴ 깨진 링크 → ① 만
assess(
  '⑴ 깨진 링크 (topic → ../missing.md)',
  tree((f) => {
    f[W_TOPIC] += '- [없는 문서](../missing.md)\n';
  }),
  { code: 1, red: { 1: 1 }, want: ['실재하지 않는다', 'missing.md'], deny: ['위키링크 문법'] },
);

// ⑵ 고아 → ② 만. 위키 밖 콜드 문서를 하나 더해 INDEX가 안 가리키게 둔다.
assess(
  '⑵ 고아 (INDEX 미링크 콜드 문서)',
  tree((f) => {
    f['docs/reference/orphan.md'] = ['# 고아 (fixture)', '', '아무도 안 가리킨다.', ''].join('\n');
  }),
  { code: 1, red: { 2: 1 }, want: ['orphan.md', '고아'] },
);

// ⑶ 유령 D-번호 → ③ 만. DECISIONS에 D-999 표제가 없다.
assess(
  '⑶ 유령 D-번호 (D-999)',
  tree((f) => {
    f[W_TOPIC] += '- 유령 인용: D-999\n';
  }),
  { code: 1, red: { 3: 1 }, want: ['D-999'] },
);

// ⑷ 배너 부재 → ④ 만. 배너 문구만 지운다(링크·D-번호는 그대로).
assess(
  '⑷ 파생물 배너 부재 (topic)',
  tree((f) => {
    f[W_TOPIC] = f[W_TOPIC].replace('재생성 가능한 파생물', '그냥 문서');
  }),
  { code: 1, red: { 4: 1 }, want: ['재생성 가능한 파생물', 'topic.md'] },
);

// ⑸ 위키 디렉터리 부재 → ⑤ 만, ①~④는 건너뜀(분모 전수를 고아로 쏟지 않는다).
assess(
  '⑸ 위키 디렉터리 부재',
  tree((f) => {
    delete f[W_INDEX];
    delete f[W_TOPIC];
  }),
  { code: 1, red: { 5: 1 }, skip: [1, 2, 3, 4], want: ['위키 디렉터리가 없다', '건너뜀'] },
);

// ⑹ `[[위키링크]]` → ①. ⑴과 같은 칸에 실리므로 **사유 문구**로 갈라 본다.
assess(
  '⑹ [[위키링크]] 문법',
  tree((f) => {
    f[W_TOPIC] += '- 해석기 없는 문법: [[topic]]\n';
  }),
  { code: 1, red: { 1: 1 }, want: ['위키링크 문법'], deny: ['실재하지 않는다'] },
);

// ⑺ 배선 앵커 제거 → ⑥ 만. HANDOFF에서만 지워 「어느 파일이 비었는지」를 함께 잰다.
assess(
  '⑺ 배선 앵커 제거 (HANDOFF)',
  tree((f) => {
    f['HANDOFF.md'] = ['# HANDOFF (fixture)', '', '위키 언급 없음.', ''].join('\n');
  }),
  { code: 1, red: { 6: 1 }, want: ['HANDOFF.md', 'docs/reference/wiki/INDEX.md'] },
);

console.log('\n[추가분]');

// ⒜⒝⒞ 인용 구간 3종 — 유일한 ADR 링크를 각 구간 안으로 옮긴다. 링크 대상은 실재하므로
// ①은 침묵해야 하고(①은 인용 구간 안까지 전수로 본다), ②만 red가 되어야 한다.
const QUOTES = {
  '⒜ 코드펜스 안의 링크는 발견이 아니다': ['```md', '- [ADR](../ADR.md)', '```'].join('\n'),
  '⒝ HTML 주석 안의 링크는 발견이 아니다': '<!-- - [ADR](../ADR.md) -->',
  '⒞ 인라인 코드 스팬 안의 링크는 발견이 아니다': '- 예시: `[ADR](../ADR.md)`',
};
for (const [label, replacement] of Object.entries(QUOTES)) {
  assess(
    label,
    tree((f) => {
      f[W_INDEX] = f[W_INDEX].replace('- [ADR](../ADR.md)', replacement);
    }),
    { code: 1, red: { 2: 1 }, want: ['ADR.md', '고아'] },
  );
}

// ⒟ 아카이브를 **이름만** 언급 — 포인터(경로 문자열)가 아니므로 2건 위반.
assess(
  '⒟ INDEX가 아카이브를 이름만 언급',
  tree((f) => {
    f[W_INDEX] = f[W_INDEX]
      .replace('- docs/reference/handoff-archive/ — 판 이력', '- handoff-archive 얘기가 어딘가 있다')
      .replace('- docs/reference/run-archive/ — 판 브리프', '- run-archive 얘기도 어딘가 있다');
  }),
  { code: 1, red: { 2: 2 }, want: ['아카이브 포인터', '경로 문자열'] },
);

// ⒢ ⑤의 **두 번째 분기** — 위키 디렉터리는 살아 있는데 입구 `INDEX.md`만 없다.
// ⑸(디렉터리 통째 부재)와 갈리는 자리는 **①~④를 건너뛰지 않는다**는 것이다: `scanWiki`가
// 참이므로 ③④는 그대로 재어져 `ok`로 남고, 그 `ok`가 「⑸의 skip과 다른 분기를 탔다」는
// 증거다. **한 곳만 비틀었는데 ①②가 함께 red가 되는 것은 구조적**이다 — INDEX가 이
// fixture의 유일한 허브라, 없어지면 ⓐ topic의 되돌아가기 링크가 댕글링이 되고(①)
// ⓑ 콜드 3편이 아무에게도 안 가리켜진다(②). 그래서 여기서는 「어느 판정이 잡았는가」를
// 판정 지도 전체와 사유 문구 둘로 갈라 확인한다.
assess(
  '⒢ ⑤의 두 번째 분기 — 위키 디렉터리는 있고 INDEX.md만 없다',
  tree((f) => {
    delete f[W_INDEX];
  }),
  {
    code: 1,
    red: { 1: 1, 2: 3, 5: 1 },
    want: ['입구 INDEX.md가 없다', '고아'],
    deny: ['건너뜀', '위키 디렉터리가 없다'],
  },
);

// ⒣ ③의 **`DECISIONS.md` 부재 분기** — D-번호를 대조할 정본이 통째로 없다.
// 「결정 로그가 없는 콜드 층」이라는 **하나의 시나리오**라서 파일 삭제와 INDEX 포인터
// 제거가 함께 간다(포인터만 남기면 그건 ③이 아니라 ①의 깨진 링크 케이스가 된다 —
// 그 자리는 ⑴이 이미 잡는다). 그 결과 이 케이스는 **③만** red다.
assess(
  '⒣ ③의 DECISIONS.md 부재 분기',
  tree((f) => {
    delete f['docs/reference/DECISIONS.md'];
    f[W_INDEX] = f[W_INDEX].replace('- [결정 로그](../DECISIONS.md)\n', '');
  }),
  { code: 1, red: { 3: 1 }, want: ['결정 로그가 없다', 'DECISIONS.md'], deny: ['표제에 없다'] },
);

// ⒠ `--root=<dir>` 형태가 fixture를 정말 읽는가. 조용히 무시되면 게이트는 **실트리**를
// 재고, 그러면 이 시험 전체가 거짓이 된다. 초록 1 + 고아 1로 양쪽을 확인한다.
assess('⒠ --root= 형태 · 깨끗한 트리', tree(), { code: 0, eqForm: true });
assess(
  '⒠ --root= 형태 · 고아 트리 (fixture를 읽었다는 증거)',
  tree((f) => {
    f['docs/reference/orphan.md'] = '# 고아 (fixture)\n';
  }),
  { code: 1, red: { 2: 1 }, want: ['orphan.md'], eqForm: true },
);

// ⒡ `--root` 값 부재 — 조용히 기본값(실트리)으로 흐르지 않고 죽어야 한다.
for (const [label, args] of [
  ['⒡ --root 값 없음', ['--root']],
  ['⒡ --root= 빈 값', ['--root=']],
]) {
  const r = runGate(args);
  check(`${label} — exit 1`, r.code === 1, `실제 ${r.code}`);
  check('   └ 한 줄 오류가 --root를 지목한다', r.out.includes('--root'), r.out.trim().slice(0, 120));
  check('   └ 실트리를 재지 않았다 (판정 요약 없음)', !r.out.includes(LABEL[1]));
}

console.log(`\n통과 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
