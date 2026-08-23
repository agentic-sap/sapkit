/**
 * 게이트 자체의 음성시험 — **이 게이트가 정말 거부하는가.**
 *
 * 통과만 확인하는 게이트는 통째로 빠져도 초록이다. 여기서는 일부러 망가뜨린
 * 기준을 물려 게이트가 그것을 잡아내는지 본다. 잡아내지 못하면 게이트는
 * 장식이고, 그 사실을 아는 편이 초록 불보다 낫다.
 *
 * 이 파일을 짜는 동안 실제로 두 번 헛짚었다 — 한 번은 종료 코드를 파이프라인이
 * 잘라먹었고, 한 번은 줄바꿈 형식 때문에 변형이 적용조차 되지 않았는데 초록으로
 * 보였다. 그래서 여기서는 **변형이 실제로 적용됐는지부터** 확인한다.
 *
 * ## 부분 완성 판정을 시험하는 방법
 *
 * 표면 게이트는 이제 "발행 표면 = M1 19종"이 아니라 **등록점을 기준으로** 판정한다
 * (`surface.mjs` 머리주석 ⓐ~ⓓ). 그 규칙을 진짜로 시험하려면 "도구 하나만 지은
 * 상태"·"186종 전부 지은 상태"를 만들어 봐야 하는데, 엔진에 도구를 더했다 뺐다 할
 * 수는 없다. 그래서 판정을 **순수 함수 `judge`로 떼어** 두고, 여기서 채록본으로부터
 * 그 상태들을 **합성해** 물린다. 실제 서버를 도는 `run()` 시험은 그대로 남겨
 * 관찰(발행 표면 채집)과 판정이 이어 붙는지를 따로 확인한다.
 *
 * PowerShell로 실행할 것.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { CATALOG_DIR, run as runCatalog } from './catalog.mjs';
import { createReport, firstDifference, tempDir, cleanupTempDirs } from './lib.mjs';
import {
  CAPTURED_PATH,
  LEDGER_FILE,
  builtToolsFromLedger,
  judge,
  renamed,
  run as runSurface,
} from './surface.mjs';

const report = createReport('게이트 음성시험');

// ── ① 깊은 비교기가 정말 차이를 찾는가 ──────────────────────────────────────
report.check(
  '같은 값에는 차이가 없다고 답한다',
  firstDifference({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] }) === null,
);
report.check(
  '중첩된 한 글자 차이를 경로와 함께 짚는다',
  (firstDifference({ a: [1, { b: 'x' }] }, { a: [1, { b: 'y' }] }) ?? '').includes('/a/1/b'),
  firstDifference({ a: [1, { b: 'x' }] }, { a: [1, { b: 'y' }] }) ?? '(차이 없음이라 답했다)',
);
report.check(
  '키가 한쪽에만 있어도 차이로 잡는다',
  firstDifference({ a: 1, b: 2 }, { a: 1 }) !== null,
);

// ── ② 누적기가 실패를 삼키지 않는가 ─────────────────────────────────────────
{
  const probe = createReport('probe');
  probe.check('통과', true);
  probe.check('실패', false);
  const originalLog = console.log;
  console.log = () => {};
  const verdict = probe.print();
  console.log = originalLog;
  report.check('하나라도 실패하면 전체가 실패다', verdict === false, `print()가 ${verdict}를 냈다`);
}

const captured = JSON.parse(fs.readFileSync(CAPTURED_PATH, 'utf8'));
const ALL_TOOLS = Object.keys(captured.tools).sort();
const CONNECTED_ONLY = captured.connectedOnly;

// ── ③ 대장 파서 — 조용히 비지 않는가 ────────────────────────────────────────
//
// ⓓ는 대장의 `지음` 집합을 읽어야 성립한다. 파서가 형식 변화에 조용히 빈 집합을
// 내면 ⓓ는 "등록점 19 vs 대장 0"으로 시끄럽게 실패한다(fail-closed). 그 성질과,
// 표 머리줄을 도구로 세지 않는지를 여기서 못 박는다.
{
  const parsed = builtToolsFromLedger(fs.readFileSync(LEDGER_FILE, 'utf8'));
  report.check(
    '대장에서 상태 3절을 전부 읽는다',
    parsed.sections.size === 3,
    `읽은 절 [${[...parsed.sections].map((title) => `「${title}」`).join(' ')}]`,
  );
  report.check(
    '대장의 `지음` + `안 지음` 이 채록본 전량과 같다',
    parsed.built.size + parsed.notBuilt.size === ALL_TOOLS.length &&
      [...parsed.built, ...parsed.notBuilt].every((tool) => captured.tools[tool] !== undefined),
    `지음 ${parsed.built.size} · 안 지음 ${parsed.notBuilt.size} · 채록본 ${ALL_TOOLS.length}`,
  );
  report.check(
    '표 머리줄·구분줄을 도구로 세지 않는다',
    !parsed.built.has('도구') && !parsed.notBuilt.has('도구') && !parsed.built.has('---'),
  );

  const junk = builtToolsFromLedger('# 형식이 바뀐 대장\n\n아무 표도 없다.\n');
  report.check(
    '형식이 바뀌면 절을 못 읽었다고 답한다 (조용히 통과하지 않는다)',
    junk.sections.size !== 3 && junk.built.size === 0,
    `절 ${junk.sections.size}개 · 지음 ${junk.built.size}종`,
  );
}

// ── ④⑤ 판정 규칙 자체 — 채록본에서 상태를 합성해 물린다 ────────────────────

/**
 * 등록점에 `names`만 올라 있고, 발행 표면·대장이 그와 정확히 맞는 **성한 상태**를
 * 채록본으로부터 합성한다. 음성시험은 이 성한 상태를 한 군데만 비틀어 쓴다.
 */
function scenario(names) {
  const registered = [...names].sort();
  const set = new Set(registered);
  const observed = {};
  for (const [key, condition] of Object.entries(captured.exposures)) {
    // 판S5 개명분을 여기서도 건다 — 실제 엔진이 발행하는 것은 개명본이므로,
    // 합성분만 구 이름이면 ⓐ가 없는 표류를 잡는다(`surface.mjs`의 `renamed`).
    observed[key] = condition.names
      .filter((name) => set.has(name))
      .map((name) => renamed(JSON.parse(JSON.stringify(captured.tools[name]))));
  }
  return {
    captured,
    observed,
    registered,
    ledger: {
      built: new Set(registered),
      notBuilt: new Set(ALL_TOOLS.filter((name) => !set.has(name))),
      sections: new Set(['안 지음', '지음 · 증거 대기', '증거 있음']),
    },
  };
}

function verdictOf(state) {
  const probe = createReport('판정');
  judge({ ...state, report: probe });
  return probe.failed;
}

function expectPass(label, state) {
  const failed = verdictOf(state);
  report.check(
    `${label} → 통과한다`,
    failed.length === 0,
    failed.length === 0 ? '' : `실패 [${failed.map((row) => row.name).join(' · ')}]`,
  );
}

/** `marker`가 이름에 든 판정이 실제로 실패했는지까지 본다 — 아무거나 실패해서는 안 된다. */
function expectReject(label, mutate, marker) {
  const state = scenario(BASELINE);
  const before = JSON.stringify(state.observed) + [...state.ledger.built].join() + state.registered.join();
  mutate(state);
  const after = JSON.stringify(state.observed) + [...state.ledger.built].join() + state.registered.join();
  report.check(`변형이 실제로 적용됐다 (${label})`, before !== after);

  const failed = verdictOf(state);
  const hit = failed.filter((row) => row.name.includes(marker));
  report.check(
    `${label} → ${marker} 판정이 거부한다`,
    hit.length > 0,
    hit.length > 0
      ? `${marker} 실패 ${hit.length}건`
      : `실패 ${failed.length}건 — [${failed.map((row) => row.name).join(' · ')}]`,
  );
}

// ④ 부분 완성 상태가 통과해야 한다 — 이 판이 존재하는 이유다.
const BASELINE = ['GetInclude', 'GetProgram', 'CreateProgram', 'GetSqlQuery'];
expectPass('도구를 하나만 지은 상태 (1/186)', scenario(['GetInclude']));
expectPass('연결 전용 도구 하나만 지은 상태 (1/186)', scenario([CONNECTED_ONLY[0]]));
expectPass(`지금 상태 모양 (${BASELINE.length}/186 · 연결 전용 섞임)`, scenario(BASELINE));
expectPass('186종 전부 지은 끝 상태', scenario(ALL_TOOLS));

// ⑤ 그리고 아래는 전부 거부해야 한다.
expectReject(
  '채록본과 인자가 다른 가짜 도구',
  (state) => {
    const tool = state.observed.connected_default.find((t) => t.name === 'GetInclude');
    tool.inputSchema.properties.include_name.type = 'number';
  },
  'ⓐ',
);
expectReject(
  '채록본과 설명이 다른 도구',
  (state) => {
    const tool = state.observed.connected_default.find((t) => t.name === 'GetProgram');
    tool.description = `${tool.description} (변형)`;
  },
  'ⓐ',
);
expectReject(
  '인자 하나가 통째로 빠진 도구',
  (state) => {
    const tool = state.observed.connected_default.find((t) => t.name === 'GetSqlQuery');
    delete tool.inputSchema.properties.row_number;
  },
  'ⓐ',
);
expectReject(
  '채록본에 없는 이름을 발행',
  (state) => {
    const fake = { name: 'ZZZ_NotCaptured', description: '채록본 밖', inputSchema: {} };
    state.observed.connected_default.push(fake);
    state.registered.push(fake.name);
    state.ledger.built.add(fake.name);
  },
  'ⓒ',
);
expectReject(
  '연결 전용 도구가 무프로파일 조건으로 샌다',
  (state) => {
    const leaked = state.observed.connected_default.find((t) => CONNECTED_ONLY.includes(t.name));
    state.observed.noProfile_default.push(JSON.parse(JSON.stringify(leaked)));
  },
  'ⓑ',
);
expectReject(
  'readonly 조건에 write 도구가 섞인다',
  (state) => {
    const write = state.observed.connected_default.find(
      (t) => !captured.exposures.connected_readonly.names.includes(t.name),
    );
    state.observed.connected_readonly.push(JSON.parse(JSON.stringify(write)));
  },
  'ⓑ',
);
expectReject(
  '등록점에 있는데 발행되지 않는다',
  (state) => {
    state.registered.push('GetClass');
    state.ledger.built.add('GetClass');
    state.ledger.notBuilt.delete('GetClass');
  },
  '그대로 발행된다',
);
expectReject(
  '대장의 `지음` 집합이 등록점보다 앞서 있다',
  (state) => {
    state.ledger.built.add('GetClass');
    state.ledger.notBuilt.delete('GetClass');
  },
  'ⓓ',
);
expectReject(
  '대장의 `지음` 집합이 등록점보다 뒤처져 있다',
  (state) => {
    state.ledger.built.delete('GetInclude');
    state.ledger.notBuilt.add('GetInclude');
  },
  'ⓓ',
);
{
  // 대장이 아예 없으면 ⓓ는 판정할 수 없다 — 판정 못 함은 통과가 아니다.
  const state = scenario(BASELINE);
  state.ledger = null;
  const failed = verdictOf(state);
  report.check(
    '대장을 못 읽으면 거부한다 (판정 불가는 통과가 아니다)',
    failed.some((row) => row.name.includes('ⓓ')),
    `실패 [${failed.map((row) => row.name).join(' · ')}]`,
  );
}
{
  // 채록본 자체가 성치 않으면 그 위의 판정 전부가 의미를 잃는다.
  const state = scenario(BASELINE);
  state.captured = JSON.parse(JSON.stringify(captured));
  state.captured.exposures.noProfile_default.names = [...state.captured.exposures.connected_default.names];
  const failed = verdictOf(state);
  report.check(
    '네 조건이 서로 갈리지 않는 채록본을 거부한다 (정본 온전성)',
    failed.length > 0,
    `실패 ${failed.length}건`,
  );
}

// ── ⑥ 실제 서버를 돌린 채집 + 판정 — 망가뜨린 기준을 물린다 ─────────────────

const originalCaptured = JSON.parse(fs.readFileSync(CAPTURED_PATH, 'utf8'));

/** 원본을 건드리지 않고, 망가뜨린 사본의 경로를 돌려준다. */
function corrupt(mutate, label) {
  const copy = JSON.parse(JSON.stringify(originalCaptured));
  mutate(copy);
  const applied = JSON.stringify(copy) !== JSON.stringify(originalCaptured);
  report.check(`변형이 실제로 적용됐다 (${label})`, applied);
  const file = path.join(tempDir('sapkit-gate-neg-'), 'm1-tools.json');
  fs.writeFileSync(file, JSON.stringify(copy, null, 2), 'utf8');
  return file;
}

/** 대장 사본을 망가뜨린다 — 줄 단위라 변형이 적용됐는지부터 본다. */
function corruptLedger(mutate, label) {
  const original = fs.readFileSync(LEDGER_FILE, 'utf8');
  const copy = mutate(original);
  report.check(`변형이 실제로 적용됐다 (${label})`, copy !== original);
  const file = path.join(tempDir('sapkit-gate-neg-'), 'TOOL-LEDGER.md');
  fs.writeFileSync(file, copy, 'utf8');
  return file;
}

async function expectFailure(options, label, marker) {
  const originalLog = console.log;
  console.log = () => {};
  let result;
  try {
    result = await runSurface(options);
  } finally {
    console.log = originalLog;
  }
  const hit = result.failed.filter((row) => row.name.includes(marker));
  report.check(
    `${label} → ${marker} 판정이 거부한다`,
    hit.length > 0,
    hit.length > 0
      ? `${marker} 실패 ${hit.length}건`
      : `실패 ${result.failed.length}건 — [${result.failed.map((row) => row.name).join(' · ')}]`,
  );
  return result;
}

// ⑥-a 설명 문구 한 글자가 바뀌면 잡아야 한다.
await expectFailure(
  {
    capturedPath: corrupt((c) => {
      c.tools.GetInclude.description = `${c.tools.GetInclude.description} (변형)`;
    }, '설명 문구'),
  },
  '채록본의 설명이 실제 발행과 다르다',
  'ⓐ',
);

// ⑥-b 인자 하나가 사라지면 잡아야 한다 — 이름만 세는 게이트는 이걸 놓친다.
await expectFailure(
  {
    capturedPath: corrupt((c) => {
      delete c.tools.GetSqlQuery.inputSchema.properties.row_number;
    }, '인자 정의'),
  },
  '채록본의 인자 정의가 실제 발행과 다르다',
  'ⓐ',
);

// ⑥-c 채록본에 없는 이름을 발행하면 잡아야 한다.
await expectFailure(
  {
    capturedPath: corrupt((c) => {
      delete c.tools.GetInclude;
      for (const condition of Object.values(c.exposures)) {
        condition.names = condition.names.filter((name) => name !== 'GetInclude');
        condition.count = condition.names.length;
      }
      c.counts = Object.fromEntries(
        Object.entries(c.exposures).map(([key, condition]) => [key, condition.count]),
      );
    }, '채록본에서 이름 제거'),
  },
  '신 엔진이 채록본에 없는 이름을 발행한다',
  'ⓒ',
);

// ⑥-d 노출 조건 소속이 채록본과 다르면 잡아야 한다.
await expectFailure(
  {
    capturedPath: corrupt((c) => {
      // 무프로파일에서도 보이는 도구를 채록본에서만 연결 전용으로 바꿔 둔다 —
      // 실제 발행은 그대로이므로 소속이 어긋난다.
      c.exposures.noProfile_default.names = c.exposures.noProfile_default.names.filter(
        (name) => name !== 'GetInclude',
      );
      c.exposures.noProfile_default.count = c.exposures.noProfile_default.names.length;
    }, '노출 조건 소속'),
  },
  '채록본의 노출 조건 소속이 실제 발행과 다르다',
  'ⓑ',
);

// ⑥-e 대장이 등록점과 어긋나면 잡아야 한다.
await expectFailure(
  {
    ledgerPath: corruptLedger(
      (text) =>
        text
          .split('\n')
          .filter((line) => !line.startsWith('| GetInclude |'))
          .join('\n'),
      '대장에서 지은 도구 한 줄 제거',
    ),
  },
  '대장의 `지음` 집합이 등록점과 다르다',
  'ⓓ',
);

// ⑥-f 대장 파일이 없으면 잡아야 한다.
await expectFailure(
  { ledgerPath: path.join(tempDir('sapkit-gate-neg-'), '없는-대장.md') },
  '대장 파일이 없다',
  'ⓓ',
);

// ── ⑦ 그리고 멀쩡한 현 상태에는 통과해야 한다 (과수리 역검증) ───────────────
{
  const originalLog = console.log;
  console.log = () => {};
  const clean = await runSurface();
  console.log = originalLog;
  report.check(
    '멀쩡한 현 상태(부분 완성)에 통과한다 (과수리 역검증)',
    clean.failed.length === 0,
    clean.failed.length === 0
      ? ''
      : `실패 [${clean.failed.map((row) => row.name).join(' · ')}]`,
  );
}

// ── ⑧ 카탈로그 게이트 — 손으로 고친 카탈로그를 거부하는가 ────────────────────
//
// `interactive/server/tool-catalog/`의 네 파일은 등록점에서 생성된다. 그 전에는 사람이
// 도구 이름을 손으로 옮겨 적었고 맞는지 재는 것이 없어 카탈로그가 조용히 낡을 수
// 있었다. 게이트를 새로 달았으니 **그 게이트가 정말 거부하는지**를 여기서 못 박는다.
//
// 레포의 진짜 파일을 고쳤다 되돌리는 대신 **임시 사본을 물린다**(위 ⑥의 `corrupt`와
// 같은 방식). 되돌리기는 프로세스가 중간에 죽으면 실행되지 않지만, 애초에 건드리지
// 않은 파일은 되돌릴 것이 없다 — finally보다 강한 보장이다.
{
  const READ_FILE = 'sapkit-mcp-tools-read.md';

  function catalogCopy() {
    const dir = tempDir('sapkit-gate-catalog-');
    for (const name of fs.readdirSync(CATALOG_DIR)) {
      fs.copyFileSync(path.join(CATALOG_DIR, name), path.join(dir, name));
    }
    return dir;
  }

  /** 사본의 파일 하나를 비틀고, 변형이 실제로 적용됐는지부터 확인한다. */
  function catalogCorrupt(file, mutate, label) {
    const dir = catalogCopy();
    const target = path.join(dir, file);
    const before = fs.readFileSync(target, 'utf8');
    const after = mutate(before);
    report.check(`변형이 실제로 적용됐다 (${label})`, after !== before);
    fs.writeFileSync(target, after, 'utf8');
    return dir;
  }

  async function expectCatalogReject(label, dir, marker) {
    const result = await runCatalog({ catalogDir: dir });
    const hit = result.failed.filter((row) => row.name.includes(marker));
    report.check(
      `${label} → ${marker} 판정이 거부한다`,
      hit.length > 0,
      hit.length > 0
        ? `${marker} 실패 ${hit.length}건`
        : `실패 ${result.failed.length}건 — [${result.failed.map((row) => row.name).join(' · ')}]`,
    );
  }

  async function expectCatalogPass(label, dir) {
    const result = await runCatalog({ catalogDir: dir });
    report.check(
      `${label} → 통과한다`,
      result.failed.length === 0,
      result.failed.length === 0
        ? ''
        : `실패 [${result.failed.map((row) => row.name).join(' · ')}]`,
    );
  }

  // ⑧-a 도구 한 줄이 사라지면 잡아야 한다 — 카탈로그가 낡는 가장 흔한 모양이다.
  await expectCatalogReject(
    '카탈로그에서 도구 한 줄을 지웠다',
    catalogCorrupt(
      READ_FILE,
      (text) =>
        text
          .split('\n')
          .filter((line) => line !== '- `GetInclude`')
          .join('\n'),
      '도구 한 줄 제거',
    ),
    READ_FILE,
  );

  // ⑧-b 이름이 바뀌면 잡아야 한다 — 줄 수만 세는 대조는 이걸 놓친다.
  await expectCatalogReject(
    '카탈로그의 도구 이름을 손으로 고쳤다',
    catalogCorrupt(READ_FILE, (text) => text.replace('- `GetInclude`\n', '- `GetIncludeZ`\n'), '도구 이름 변경'),
    READ_FILE,
  );

  // ⑧-c 파일이 아예 없으면 잡아야 한다 — 판정 불가는 통과가 아니다.
  {
    const dir = catalogCopy();
    fs.rmSync(path.join(dir, READ_FILE));
    report.check('변형이 실제로 적용됐다 (파일 제거)', !fs.existsSync(path.join(dir, READ_FILE)));
    await expectCatalogReject('카탈로그 파일이 없다', dir, READ_FILE);
  }

  // ⑧-d 줄바꿈만 다른 사본은 통과해야 한다 — CRLF로 체크아웃한 Windows에서 빨간
  //     게이트는 사람을 게이트가 아니라 줄바꿈을 의심하게 만들고, 그 습관이 진짜
  //     표류도 같이 넘긴다.
  {
    const dir = catalogCopy();
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/\r?\n/g, '\r\n'), 'utf8');
    }
    await expectCatalogPass('CRLF로 체크아웃된 카탈로그', dir);
  }

  // ⑧-e 그리고 레포의 현 상태에는 통과해야 한다 (과수리 역검증).
  await expectCatalogPass('멀쩡한 현 상태의 카탈로그', CATALOG_DIR);
}

cleanupTempDirs();
process.exit(report.print() ? 0 : 1);
