/**
 * test-attended-guard.mjs — attended 녹화 관문이 **정말 거부하는가**.
 *
 * `harness/attended-guard.mjs`가 판7-b(D-095) 교체 뒤의 규칙을 소유한다. 통과만
 * 확인하는 관문은 통째로 빠져도 초록이므로, 여기서는 **거부해야 하는 입력**을 물려
 * 거부가 실제로 나오는지 본다. 특히 이 관문의 판정은 SAP 호출이 **전부 나간 뒤**에도
 * 한 번 돌기 때문에, 느슨해지면 그 대가를 실 SAP이 치른다.
 *
 * 여섯 갈래:
 *   ① 재생 기준선 자리(`fixtures/`)로 저장 시도 → 거부 (이유를 말한다)
 *   ② `attended-only`에 제품 엔진이 아닌 이름 → 거부
 *   ③ 무접속 응답 → 거부. **신 어휘(`ERR_NO_CONNECTION`)와 구 어휘 둘 다**
 *   ④ 어휘 정본 스크레이프 실패 → 죽는다 (조용히 통과하지 않는다)
 *   ⑤ 기본 저장 자리가 `fixtures/attended-only`다
 *   ⑥ 「그 밖의 자리」는 막지 않되 알린다
 *   ⑧ 가려야 할 신원이 픽스처에 남아 있으면 → 거부. **거부문에 그 이름을 싣지 않는다**
 *   ⑨ 가릴 이름을 접속 프로파일에서 읽는다 (없거나 너무 짧으면 부르는 쪽이 막는다)
 *   ⑩ 진입점 배선 — 태우기 전에 읽고, 값을 로그에 찍지 않는다
 *
 * 소스와 임시 파일만 본다 — `dist/`도 SAP 접속도 필요 없다. 그래서 `gates/lib.mjs`
 * (산출물 의존)를 쓰지 않고 홀로 선다. 선례는 `gates/test-refusal-vocab.mjs`.
 *
 * 실행: node gates/test-attended-guard.mjs
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  ATTENDED_DIR,
  DEFAULT_OUT,
  ENGINE_ROOT,
  FIXTURES_DIR,
  PRODUCT_ENGINE_NAME,
  PRODUCT_GATE,
  REDACTION_MIN_LENGTH,
  classifyOutDir,
  detectDegradation,
  detectRedactionLeak,
  noConnectionPattern,
  outDirNotices,
  outDirRefusal,
  parseEnvNames,
  readRedactionNames,
  resolveOutDir,
} from '../harness/attended-guard.mjs';

const rows = [];
const check = (name, ok, detail = '') => rows.push({ name, ok: Boolean(ok), detail });

/** 판정을 부르되 던진 것도 결과로 받는다 — ④가 「죽는다」를 단언할 수 있게. */
function judge(fixture, options) {
  try {
    return { problems: detectDegradation(fixture, options), threw: null };
  } catch (err) {
    return { problems: null, threw: err };
  }
}

/** 최소 픽스처 한 벌. 실제 채록물의 모양(`harness/recorder/types.ts`)만 따른다. */
function fixtureOf({ engineName = PRODUCT_ENGINE_NAME, text = '정상 응답', isError = false } = {}) {
  return {
    formatVersion: 1,
    sequenceId: 'probe',
    description: '시험용',
    engine: { name: engineName, version: '1.0.0', protocolVersion: '2024-11-05', exposition: 'readonly,high' },
    steps: [
      { index: 0, tool: 'GetProgram', args: { object_name: 'ZPROBE' }, response: { content: [{ type: 'text', text }] }, isError, note: null },
    ],
    placeholders: [],
  };
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-attended-guard-'));

console.log('\nattended 녹화 관문 음성시험 — 관문이 정말 거부하는가\n');

// ── ① 재생 기준선 자리는 무조건 거부 ────────────────────────────────────────
for (const dir of [FIXTURES_DIR, path.join(FIXTURES_DIR, 'nested')]) {
  const { problems } = judge(fixtureOf(), { outDir: dir });
  check(
    `재생 기준선 자리는 거부한다 — ${path.relative(ENGINE_ROOT, dir) || 'fixtures'}`,
    problems?.length >= 1,
    `문제 ${problems?.length ?? '(던짐)'}건`,
  );
  check(
    `거부문이 이유를 말한다 (자기 대조) — ${path.relative(ENGINE_ROOT, dir) || 'fixtures'}`,
    (problems ?? []).some((p) => p.includes('자기 대조')),
  );
  check(`태우기 전 거부도 같은 판정이다 — ${path.relative(ENGINE_ROOT, dir) || 'fixtures'}`, outDirRefusal(dir) !== null);
}
check('제품 엔진 이름이어도 재생 자리면 거부한다', judge(fixtureOf({ engineName: PRODUCT_ENGINE_NAME }), { outDir: FIXTURES_DIR }).problems.length >= 1);

// ── ② attended 자리는 제품 엔진 이름을 요구한다 ─────────────────────────────
{
  const wrong = judge(fixtureOf({ engineName: 'mcp-abap-adt' }), { outDir: ATTENDED_DIR }).problems;
  check('attended 자리에 구 엔진 이름을 채록하면 거부한다', wrong.length >= 1, `문제 ${wrong.length}건`);
  check('거부문이 제품 엔진 이름을 말한다', wrong.some((p) => p.includes(PRODUCT_ENGINE_NAME)));

  const right = judge(fixtureOf(), { outDir: ATTENDED_DIR }).problems;
  check('attended 자리에 제품 엔진을 채록하면 통과한다 (양성 대조)', right.length === 0, right.join(' / '));

  const nested = judge(fixtureOf({ engineName: 'mcp-abap-adt' }), { outDir: path.join(ATTENDED_DIR, 'sub') }).problems;
  check('attended 자리의 하위도 같은 규칙이다', nested.length >= 1);
}

// ── ③ 무접속 어휘 — 구·신 둘 다 잡는다 ──────────────────────────────────────
{
  const NEW_VOCAB =
    'ERR_NO_CONNECTION: this tool needs a SAP connection but none is configured — the server is running inspection-only.';
  const OLD_VOCAB = 'Basic authentication requires SAP_CLIENT to be provided';
  const UNRELATED = 'ERR_READONLY_TIER: this tool is not exposed on a readonly tier';

  const re = noConnectionPattern();
  check('정본 정규식을 제품 게이트에서 읽어온다', re instanceof RegExp, `/${re.source}/ ← ${path.relative(ENGINE_ROOT, PRODUCT_GATE)}`);

  const withNew = judge(fixtureOf({ text: NEW_VOCAB, isError: true }), { outDir: ATTENDED_DIR, allowAllErrors: true }).problems;
  check('신 어휘(ERR_NO_CONNECTION) 무접속 응답을 거부한다', withNew.length >= 1, `문제 ${withNew.length}건`);

  const withOld = judge(fixtureOf({ text: OLD_VOCAB, isError: true }), { outDir: ATTENDED_DIR, allowAllErrors: true }).problems;
  check('구 어휘도 여전히 거부한다', withOld.length >= 1, `문제 ${withOld.length}건`);

  const unrelated = judge(fixtureOf({ text: UNRELATED, isError: true }), { outDir: ATTENDED_DIR, allowAllErrors: true }).problems;
  check('무관한 거부(tier)는 무접속으로 읽지 않는다', unrelated.length === 0, unrelated.join(' / '));

  const allError = judge(fixtureOf({ text: '404', isError: true }), { outDir: ATTENDED_DIR }).problems;
  check('전 단계 오류는 여전히 거부한다 (기존 규칙 회귀)', allError.length >= 1);
}

// ── ④ 어휘 정본을 못 읽으면 죽는다 ──────────────────────────────────────────
{
  const original = fs.readFileSync(PRODUCT_GATE, 'utf8');
  // 줄 단위로 걷어낸다 — 여러 줄에 걸친 정규식으로 지우려다 **줄바꿈 형식(CRLF) 때문에
  // 변형이 적용조차 되지 않는데 초록으로 보이는** 함정을 실제로 밟았다(`test-gates.mjs`
  // 머리주석이 경고하는 바로 그 자리다). JS의 `.`은 `\r`도 물지 않는다.
  const mutated = original
    .split('\n')
    .filter((line) => !/return 'NO_CONNECTION';/.test(line))
    .join('\n');
  // 변형이 실제로 적용됐는지부터 본다 — 안 바뀐 소스를 물리면 이 갈래는 공허하다.
  check('변형이 실제로 적용됐다 (그 줄이 사라졌다)', mutated !== original && !/return 'NO_CONNECTION';/.test(mutated));

  const missingLine = path.join(tmpRoot, 'gate-without-line.mjs');
  fs.writeFileSync(missingLine, mutated, 'utf8');
  const scraped = judge(fixtureOf(), { outDir: ATTENDED_DIR, gateFile: missingLine });
  check('정규식 줄이 사라진 정본을 물리면 던진다', scraped.threw !== null, scraped.threw?.message?.split('\n')[0] ?? '(던지지 않았다)');
  check('조용히 통과하지 않는다', scraped.problems === null);

  const absent = path.join(tmpRoot, 'does-not-exist.mjs');
  check('정본 파일 자체가 없어도 던진다', judge(fixtureOf(), { outDir: ATTENDED_DIR, gateFile: absent }).threw !== null);

  // 판정 자리를 모르면 규칙을 고를 수 없다 — 기본값으로 눙치지 않는다.
  check('outDir 없이 부르면 던진다', judge(fixtureOf(), {}).threw !== null);
}

// ── ⑤ 기본 저장 자리 ────────────────────────────────────────────────────────
check(
  '기본 저장 자리가 fixtures/attended-only 다',
  path.resolve(DEFAULT_OUT) === path.resolve(ENGINE_ROOT, 'fixtures', 'attended-only'),
  DEFAULT_OUT,
);
check('기본 저장 자리는 attended 갈래로 분류된다', classifyOutDir(DEFAULT_OUT) === 'attended-only');
check('인자 없는 --out은 기본 저장 자리다', path.resolve(resolveOutDir(undefined)) === path.resolve(DEFAULT_OUT));

// 상대 `--out`은 cwd가 아니라 엔진 루트 기준 — ⑵의 기본값이 옳아도 여기가 새면 소용없다.
{
  const cwdBefore = process.cwd();
  try {
    process.chdir(tmpRoot);
    check(
      '상대 --out은 cwd가 아니라 엔진 루트 기준으로 푼다',
      path.resolve(resolveOutDir('fixtures/attended-only')) === path.resolve(ATTENDED_DIR),
      resolveOutDir('fixtures/attended-only'),
    );
    check(
      '절대 --out은 준 대로 쓴다',
      path.resolve(resolveOutDir(path.join(tmpRoot, 'elsewhere'))) === path.resolve(tmpRoot, 'elsewhere'),
    );
  } finally {
    process.chdir(cwdBefore);
  }
}

// ── ⑥ 그 밖의 자리 — 막지 않되 알린다 ───────────────────────────────────────
{
  const outside = path.join(tmpRoot, 'scratch');
  check('그 밖의 자리는 outside로 분류된다', classifyOutDir(outside) === 'outside');
  check('그 밖의 자리는 막지 않는다', judge(fixtureOf({ engineName: 'mcp-abap-adt' }), { outDir: outside }).problems.length === 0);
  check('그 밖의 자리는 태우기 전에도 막지 않는다', outDirRefusal(outside) === null);
  const notices = outDirNotices(outside);
  check('그 밖의 자리는 알린다', notices.length >= 1, notices[0] ?? '(알림 없음)');
  check('알림이 커밋 대상이 아님을 말한다', notices.some((n) => n.includes('커밋 대상이 아니다')));

  for (const look of [path.join(tmpRoot, 'fixtures'), path.join(tmpRoot, 'fixtures', 'attended-only')]) {
    const loud = outDirNotices(look);
    check(`이름만 같고 엔진 밖이면 더 크게 알린다 — ${path.relative(tmpRoot, look)}`, loud.length >= 2, `알림 ${loud.length}건`);
    check(`그래도 막지는 않는다 — ${path.relative(tmpRoot, look)}`, outDirRefusal(look) === null);
  }

  check('엔진 안의 자리는 「그 밖」 알림을 내지 않는다', outDirNotices(ATTENDED_DIR).length === 0);
}

// ── ⑦ 진입점이 두 판정을 **태우기 전에** 세우는가 ────────────────────────────
//
// 계약이 요구하는 fail-closed는 저장 직전에도 서지만, 그때는 P3 write가 이미 나간
// 뒤다 — 「저장이 안 됐다」는 「SAP이 안 바뀌었다」가 아니다. 그래서 진입점은 자리
// 판정과 무접속 어휘를 **`recordSequence` 앞에서** 한 번 세운다. 그 배선이 뒤로
// 밀리면 이 시험이 잡는다(순서를 소스에서 본다 — 진입점은 톱레벨 부작용이 있어
// import할 수 없다).
{
  const entry = fs.readFileSync(path.join(ENGINE_ROOT, 'harness', 'record-attended.mjs'), 'utf8');
  const at = (needle) => entry.indexOf(needle);
  const burn = at('recordSequence(');
  check('진입점이 recordSequence를 부른다 (기준점)', burn > 0);
  check(
    '자리 거부가 태우기 전에 선다',
    at('outDirRefusal(') > 0 && at('outDirRefusal(') < burn,
  );
  check(
    '무접속 어휘 정본이 태우기 전에 선다',
    at('noConnectionPattern(') > 0 && at('noConnectionPattern(') < burn,
  );
  check(
    '세우지 못하면 녹화를 시작하지 않는다',
    /무접속 판정을 세우지 못했다/.test(entry),
  );
}


// ── ⑧ 신원 뒷문 — 가려야 할 이름이 남아 있으면 저장을 막는가 ──────────────────
//
// 정규화기(`recorder/normalize.ts`의 `principal`)가 놓쳤을 때 마지막으로 막는 자리다.
// 통과만 보는 시험은 이 뒷문이 통째로 빠져도 초록이므로, 여기서는 **거부해야 하는
// 입력**을 물린다. 그리고 거부문 자체가 새면 뒷문이 유출 경로가 되므로, **거부문에
// 이름이 안 실리는지**를 같은 무게로 본다.
//
// 시험용 이름은 명백한 가짜다 — 실제 계정 아이디를 이 레포에 쓰지 않는다.
{
  const USER = 'TESTUSER';
  const leaky = (text) => ({
    ...fixtureOf(),
    steps: [
      { index: 0, tool: 'GetClass', args: { object_name: 'ZCL_PROBE' }, response: { content: [{ type: 'text', text }] }, isError: false, note: null },
    ],
  });
  /**
   * 거부문이 이름을 되싣지 않는가 — 대소문자를 접어 본다.
   *
   * 이 단언은 항상 **거부가 실제로 나왔음**과 함께 쓴다. 빈 배열은 이름을 담을 수 없어
   * 마음대로 통과하므로, 똍어놓으면 뒷문을 무력화했을 때도 초록으로 남는다(사보타주로 실측).
   */
  const carriesName = (problems) => problems.some((p) => p.toUpperCase().includes(USER));

  const clean = detectRedactionLeak(fixtureOf(), [USER]);
  check('가릴 이름이 없는 픽스처는 통과한다 (양성 대조)', clean.length === 0, clean.join(' / '));

  const inResponse = detectRedactionLeak(leaky(`adtcore:responsible="${USER}"`), [USER]);
  check('응답에 남은 이름을 거부한다', inResponse.length >= 1, `문제 ${inResponse.length}건`);
  check('거부문에 원본 이름을 싣지 않는다 (응답)', inResponse.length >= 1 && !carriesName(inResponse), inResponse[0] ?? '');
  check('거부문이 위치를 말한다', inResponse.some((p) => p.includes('/steps/0/response')));

  const lower = detectRedactionLeak(leaky(`/sap/bc/adt/oo/classes/zcl_demo?user=${USER.toLowerCase()}`), [USER]);
  check('소문자 꼴도 거부한다 (대소문자 무시)', lower.length >= 1);

  const inArgs = detectRedactionLeak(
    { ...fixtureOf(), steps: [{ index: 0, tool: 'ListTransports', args: { user: USER }, response: {}, isError: false, note: null }] },
    [USER],
  );
  check('인자에 남은 이름도 거부한다', inArgs.length >= 1);
  check('거부문에 원본 이름을 싣지 않는다 (인자)', inArgs.length >= 1 && !carriesName(inArgs));

  const inKey = detectRedactionLeak(
    { ...fixtureOf(), steps: [{ index: 0, tool: 'GetClass', args: { [USER]: 1 }, response: {}, isError: false, note: null }] },
    [USER],
  );
  check('키 이름 자리에 실린 이름도 거부한다', inKey.length >= 1);
  check('거부문에 원본 이름을 싣지 않는다 (키 자리)', inKey.length >= 1 && !carriesName(inKey));
  check('키 자리 경로는 키를 되쓰지 않는다 (<key#N>)', inKey.some((p) => p.includes('<key#')));

  // 시나리오가 소유한 자리 — 정규화는 손대지 않는다(고칠 자리가 시나리오 파일이다).
  const inDescription = detectRedactionLeak({ ...fixtureOf(), description: `${USER}의 시퀀스` }, [USER]);
  check('시나리오 description에 박힌 이름도 거부한다', inDescription.length >= 1);
  check('거부문에 원본 이름을 싣지 않는다 (description)', inDescription.length >= 1 && !carriesName(inDescription));

  // 목록이 비면 이 판정은 아무 일도 하지 않는다 — 자리·무접속 판정과 섞이지 않게.
  check('가릴 목록이 비면 판정하지 않는다', detectRedactionLeak(leaky(USER), []).length === 0);
  check('가릴 목록이 undefined여도 던지지 않는다', detectRedactionLeak(leaky(USER), undefined).length === 0);
  check(
    '하한보다 짧은 이름은 목록에서 버린다 — 아니면 모든 픽스처가 거부된다',
    detectRedactionLeak(leaky('ZCL_AB_DEMO'), ['AB']).length === 0,
  );

  // 뒷문은 정규화기보다 **넓다**(맨 부분 문자열). 규칙을 베끼면 함께 틀리기 때문이다.
  const wider = detectRedactionLeak(leaky(`${USER}2`), [USER]);
  check('정규화기가 남긴 부분 문자열도 뒷문은 거부한다 (의도적 과잉)', wider.length >= 1, `문제 ${wider.length}건`);

  // 하한 상수가 정규화기와 어긋나면 한쪽은 막다른 골목, 다른 쪽은 구멍이 된다.
  const normalizeSrc = fs.readFileSync(path.join(ENGINE_ROOT, 'harness', 'recorder', 'normalize.ts'), 'utf8');
  const declared = /REDACT_MIN_LENGTH\s*=\s*(\d+)/.exec(normalizeSrc);
  check(
    '최소 길이가 정규화기와 같다',
    declared !== null && Number(declared[1]) === REDACTION_MIN_LENGTH,
    `normalize.ts=${declared?.[1] ?? '(못 찾음)'} · attended-guard=${REDACTION_MIN_LENGTH}`,
  );
}

// ── ⑨ 가릴 이름을 프로파일에서 읽는다 ────────────────────────────────────────
//
// 값은 비밀 취급이다 — 읽기가 실패해도 문구에 값이 실리면 안 되고, 진입점이 그 값을
// 찍어서도 안 된다. 여기서 쓰는 값은 전부 명백한 가짜다.
{
  const envOf = (name, lines) => {
    const file = path.join(tmpRoot, name);
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
    return file;
  };

  const plain = readRedactionNames(envOf('plain.env', ['SAP_URL=https://sap.example.test', 'SAP_USERNAME=TESTUSER']));
  check('SAP_USERNAME을 읽는다', plain.names.length === 1 && plain.names[0] === 'TESTUSER', plain.names.join(','));

  const fancy = readRedactionNames(
    envOf('fancy.env', [
      '# 주석 줄은 건너뛴다',
      '',
      'export SAP_USERNAME = "TESTUSER"  ',
      "SAP_RESPONSIBLE='OTHERUSER'",
      'SAP_PASSWORD=pw#not-a-comment',
    ]),
  );
  check(
    '따옴표·공백·export·주석을 정본과 같은 규칙으로 다룬다',
    fancy.names.length === 2 && fancy.names[0] === 'TESTUSER' && fancy.names[1] === 'OTHERUSER',
    fancy.names.join(','),
  );
  check(
    '줄 안쪽 #는 주석이 아니다 (비밀번호에 들어갈 수 있다)',
    parseEnvNames('SAP_PASSWORD=pw#not-a-comment')['SAP_PASSWORD'] === 'pw#not-a-comment',
  );
  check('같은 키가 두 번이면 마지막이 이긴다', parseEnvNames('SAP_USERNAME=A\nSAP_USERNAME=TESTUSER')['SAP_USERNAME'] === 'TESTUSER');

  const dup = readRedactionNames(envOf('dup.env', ['SAP_USERNAME=TESTUSER', 'SAP_RESPONSIBLE=testuser']));
  check('같은 신원의 두 꼴은 한 건으로 센다', dup.names.length === 1, dup.names.join(','));

  const none = readRedactionNames(envOf('none.env', ['SAP_URL=https://sap.example.test']));
  check('키가 없으면 빈 목록이다 — 부르는 쪽이 막는다', none.names.length === 0 && none.tooShort.length === 0);

  const short = readRedactionNames(envOf('short.env', ['SAP_USERNAME=AB']));
  check('짧은 값은 조용히 버리지 않고 키 이름으로 돌려준다', short.names.length === 0 && short.tooShort.includes('SAP_USERNAME'));
  check('돌려주는 것은 키 이름이지 값이 아니다', !short.tooShort.some((k) => k.includes('AB')));

  let threw = null;
  try {
    readRedactionNames(path.join(tmpRoot, 'does-not-exist.env'));
  } catch (err) {
    threw = err;
  }
  check('프로파일을 못 읽으면 던진다 — 빈 목록으로 넘어가지 않는다', threw !== null, threw?.message?.split('\n')[0] ?? '(던지지 않았다)');
}

// ── ⑩ 진입점 배선 — 태우기 전에 읽고, 값은 찍지 않는가 ───────────────────────
{
  const entry = fs.readFileSync(path.join(ENGINE_ROOT, 'harness', 'record-attended.mjs'), 'utf8');
  const at = (needle) => entry.indexOf(needle);
  const burn = at('recordSequence(');

  check('가릴 이름을 태우기 전에 읽는다', at('readRedactionNames(') > 0 && at('readRedactionNames(') < burn);
  check('읽은 목록을 채록기에 넘긴다', /redact:\s*redactNames/.test(entry));
  check('저장 전에 뒷문을 부른다', at('detectRedactionLeak(') > burn);
  check('읽지 못하면 녹화를 시작하지 않는다', /가릴 이름을 프로파일에서 읽지 못했다/.test(entry));
  // 뒷문 거부는 저장 직전 = SAP 호출이 전부 나간 뒤다. 기존 거부 경로를 함께 쓰므로
  // `SAP_ALREADY_RAN`이 같이 나간다.
  check(
    '뒷문 거부가 SAP_ALREADY_RAN과 같은 경로로 나간다',
    entry.indexOf('SAP_ALREADY_RAN', at('detectRedactionLeak(')) > 0,
  );

  // ⚠ 값이 로그에 실리면 가리는 의미가 없다. 이름을 담은 변수를 출력 줄에서 찾는다.
  const printsNames = entry
    .split('\n')
    .filter((line) => /console\.(log|warn|error)/.test(line) && /redactNames|read\.names/.test(line))
    .filter((line) => !/redactNames\.length/.test(line));
  check('가릴 이름 값을 로그에 찍지 않는다 (건수만)', printsNames.length === 0, printsNames[0] ?? '');
}

fs.rmSync(tmpRoot, { recursive: true, force: true });

for (const r of rows) console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
const bad = rows.filter((r) => !r.ok).length;
console.log(
  bad === 0
    ? `\n✅ attended 녹화 관문 — ${rows.length}건 전부 통과`
    : `\n❌ attended 녹화 관문 — ${rows.length}건 중 ${bad}건 실패`,
);
process.exit(bad === 0 ? 0 : 1);
