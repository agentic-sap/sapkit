/**
 * attended 녹화의 **저장 자리·강등** 판정. 부작용이 없다 — import해서 시험할 수 있다.
 *
 * `record-attended.mjs`는 톱레벨 부작용(산출물 require·인자 파싱·`process.exit`)을
 * 가진 진입점이라 시험이 import할 수 없다. 그래서 판정만 여기로 뺐다.
 * `auth-guard.mjs`가 이미 같은 모양이다.
 *
 * ## 왜 「저장 자리」가 판정에 들어오는가 (판7-b · D-095)
 *
 * 교체 전에는 규칙이 하나였다: **신 엔진을 채록하면 거부.** 채록의 목적이 「구 번들이
 * 무엇을 냈는가」를 대조 기준으로 남기는 것이었기 때문이다. 교체 뒤 제품 번들은 곧
 * 신 엔진이라 그 규칙은 **모든 녹화를 거부한다** — 증거를 한 건도 만들 수 없다.
 *
 * 그렇다고 규칙을 지우면 반대쪽이 무너진다. 재생 기준선(`fixtures/`)에 신 엔진의
 * 응답을 새로 채록해 넣으면, 신 엔진이 맞추는 기준이 **자기 자신**이 되어 재생 대조가
 * 동어반복이 된다. 그래서 규칙을 **저장 자리로 가른다**:
 *
 * | 자리 | 판정 |
 * |---|---|
 * | `<engine>/fixtures/attended-only/` (그 아래 포함) | **제품 엔진 이름을 요구**한다. 실기 기록이므로 신 엔진을 태우는 것이 맞다 |
 * | `<engine>/fixtures/` (그 디렉터리 자신 + `attended-only` 밖의 하위) | **무조건 거부** — 자기 대조라 증거가 아니다 |
 * | 그 밖 | 막지 않는다. 다만 **커밋 대상이 아님을 알린다** |
 *
 * 판정은 **절대 경로로 해석해** 엔진의 두 자리와 대조한다 — 문자열 접미사로 보면
 * 다른 트리의 같은 이름 디렉터리가 통과한다.
 *
 * ## 신원 뒷문 (2026-08-20)
 *
 * 픽스처는 커밋되고 레포는 PUBLIC인데, SAP은 객체 메타데이터의
 * `adtcore:responsible`·`changedBy`·`createdBy`와 `CreateTransport` 응답의 `owner`에
 * **접속 사용자의 로그인 아이디를 반드시 박는다**(실기: 픽스처 9편 중 4편에 22군데).
 * 가리는 일 자체는 정규화기(`recorder/normalize.ts`의 `principal`)가 하고, 여기 있는
 * 것은 **그것이 놓쳤을 때 저장을 막는 뒷문**이다 — `readRedactionNames`(어디서
 * 가릴 이름을 얻는가)와 `detectRedactionLeak`(가린 뒤에도 남았는가).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** `sapkit-engine/` 루트. 상대 `--out`은 cwd가 아니라 여기를 기준으로 푼다. */
export const ENGINE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/** 재생 기준선이 사는 자리. 교체 뒤 여기에 새 채록을 넣는 것은 자기 대조다. */
export const FIXTURES_DIR = path.join(ENGINE_ROOT, 'fixtures');

/** attended 실기 기록이 사는 자리. 녹화의 기본 저장 자리이기도 하다. */
export const ATTENDED_DIR = path.join(FIXTURES_DIR, 'attended-only');

/** 기본 저장 자리 — 기본값이 막힌 곳을 향하면 실수의 대가를 SAP write가 치른다. */
export const DEFAULT_OUT = ATTENDED_DIR;

/** 제품 번들이 싣는 엔진의 MCP `serverInfo.name`. attended 기록은 이것이어야 한다. */
export const PRODUCT_ENGINE_NAME = 'sapkit-engine';

/** 무접속 거부 어휘의 **정본**. 새 상수를 여기 박지 않고 이 파일에서 긁어온다. */
export const PRODUCT_GATE = path.join(
  ENGINE_ROOT,
  '..',
  'interactive',
  'scripts',
  'conformance-server-gates.mjs',
);

/** 재생 기준선 자리에 저장하려 할 때의 거부문. 자리 판정 하나로 두 곳(사전·사후)이 쓴다. */
const REPLAY_BASELINE_REFUSAL =
  `재생 기준선 자리에 저장하려 한다 (${FIXTURES_DIR}) — 교체(판7-b · D-095) 뒤 이 자리의 ` +
  '새 픽스처는 **신 엔진이 제 응답을 제 기준으로 삼는 자기 대조**라 증거가 아니다. ' +
  `실기 기록이라면 ${ATTENDED_DIR} 로 저장해라(기본값).`;

// ── 자리 판정 ────────────────────────────────────────────────────────────────

/** `base`와 같거나 그 아래인가. 절대 경로로 정규화해 견준다. */
function isWithin(base, target) {
  const rel = path.relative(path.resolve(base), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * 상대 `--out`을 **cwd가 아니라 엔진 루트 기준**으로 푼다.
 *
 * 왜 — 저장기는 없는 디렉터리를 만든다. cwd 기준이면 레포 루트에서
 * `--out=fixtures/attended-only`를 준 것이 `<repo>/fixtures/…`라는 엉뚱한 자리를
 * 새로 만들고, 그 자리는 3분기상 「그 밖」이라 **거부 없이 증거가 딴 데 쌓인다.**
 * 절대 경로는 준 대로 쓴다.
 */
export function resolveOutDir(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_OUT;
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(ENGINE_ROOT, value);
}

/** 저장 자리 3분기: `attended-only` · `replay-baseline` · `outside`. */
export function classifyOutDir(dir) {
  if (isWithin(ATTENDED_DIR, dir)) return 'attended-only';
  if (isWithin(FIXTURES_DIR, dir)) return 'replay-baseline';
  return 'outside';
}

/**
 * 그 자리에 저장하면 안 되는 이유. 없으면 `null`.
 *
 * 엔진 이름과 무관한 **자리만의** 판정이라 태우기 **전에도** 부를 수 있다 —
 * 사후 판정은 SAP 호출이 전부 나간 뒤에 돌기 때문에, 미리 막을 수 있는 것은 미리 막는다.
 */
export function outDirRefusal(dir) {
  return classifyOutDir(dir) === 'replay-baseline' ? REPLAY_BASELINE_REFUSAL : null;
}

/**
 * 막지는 않되 알릴 것. 「그 밖의 자리」에서만 나온다.
 *
 * 해석된 경로의 꼬리가 `fixtures` 또는 `fixtures/attended-only`인데 엔진 밖이면
 * cwd 착오·오타일 공산이 크므로 한 줄 더 얹는다. **막지는 않는다** — 레포 밖으로
 * 돌려 찍어 보는 것은 정당한 쓰임이다(시나리오 README의 상태 의존 판별).
 */
export function outDirNotices(dir) {
  if (classifyOutDir(dir) !== 'outside') return [];
  const resolved = path.resolve(dir);
  const notices = [
    `저장 자리가 엔진 밖이다 (${resolved}) — 여기 쌓이는 픽스처는 **커밋 대상이 아니다.** ` +
      `증거로 남길 것이라면 ${ATTENDED_DIR} 로 저장해라(기본값).`,
  ];
  const base = path.basename(resolved);
  const parent = path.basename(path.dirname(resolved));
  if (base === 'fixtures' || (base === 'attended-only' && parent === 'fixtures')) {
    notices.push(
      '이름은 엔진의 저장 자리와 같은데 **자리가 다르다** — cwd 착오나 오타일 공산이 크다. ' +
        '상대 경로는 엔진 루트 기준으로 풀리므로, 엔진 안을 노렸다면 `--out=fixtures/attended-only`로 ' +
        '충분하다(절대 경로를 줬다면 그 경로를 다시 봐라).',
    );
  }
  return notices;
}

// ── 무접속 어휘 (정본 스크레이프) ────────────────────────────────────────────

/**
 * 무접속 거부를 알아보는 정규식을 **제품 적합성 게이트에서 읽어온다.**
 *
 * 복제해 두면 그쪽이 넓어져도(구 번들 문구 → `ERR_NO_CONNECTION` 병기) 여기는 낡은 채
 * 통과한다. 실제로 그랬다 — 이 판정은 구 번들 문구 상수 하나에 걸려 있어서 신 엔진의
 * 무접속 거부(`ERR_NO_CONNECTION`)를 **못 잡았다.** 접속 없이 녹화해도 통과하는 상태였다.
 *
 * 못 찾으면 **던진다.** 조용히 넓은/빈 정규식으로 넘어가면 무접속 픽스처가 증거로
 * 커밋된다. 선례는 `gates/test-refusal-vocab.mjs`의 같은 스크레이프다.
 *
 * @param gateFile 정본 파일 경로. 시험이 「그 줄이 사라진 소스」를 물릴 수 있게 연다.
 */
export function noConnectionPattern(gateFile = PRODUCT_GATE) {
  let src;
  try {
    src = fs.readFileSync(gateFile, 'utf8');
  } catch (err) {
    throw new Error(
      `무접속 거부 어휘의 정본을 읽지 못했다: ${gateFile}\n` +
        `   ${err.message}\n` +
        '   이 판정은 정본을 긁어와야 성립한다. 상수를 여기 복제하지 말고 경로부터 확인해라.',
    );
  }
  const m = src.match(/if \(\/(.+?)\/\.test\(t\)\) return 'NO_CONNECTION';/);
  if (!m) {
    throw new Error(
      `제품 게이트에서 NO_CONNECTION 분류 정규식을 찾지 못했다: ${gateFile}\n` +
        '   verdictOf()의 그 줄이 사라졌거나 모양이 바뀌었다. 어느 쪽이든 무접속 감지가 무너진 것이므로\n' +
        '   확인이 먼저다 — 여기서 조용히 넘어가면 접속 없이 찍은 픽스처가 증거로 커밋된다.',
    );
  }
  return new RegExp(m[1]);
}

// ── 강등 판정 ────────────────────────────────────────────────────────────────

/**
 * 녹화가 **반쪽인지** 본다. 조용히 강등된 증거를 커밋하면 대장이 거짓을 센다.
 *
 * @param fixture 완성된 픽스처
 * @param outDir  **해석이 끝난** 저장 자리 (`resolveOutDir`의 결과)
 */
export function detectDegradation(fixture, { allowAllErrors = false, outDir, gateFile } = {}) {
  if (typeof outDir !== 'string' || outDir === '') {
    // 자리를 모르면 엔진 이름 규칙을 고를 수 없다. 기본값으로 눙치면 「그 밖의 자리」가
    // attended 규칙을 통과해 버린다 — 판정을 못 하는 것은 통과가 아니다.
    throw new Error('detectDegradation: outDir가 필요하다 (resolveOutDir의 결과를 넘겨라).');
  }

  const problems = [];
  const noConnection = noConnectionPattern(gateFile);

  const text = JSON.stringify(fixture.steps);
  if (noConnection.test(text)) {
    problems.push(
      `응답에 무접속 거부 문구가 있다 (/${noConnection.source}/) — 번들이 SAP에 붙지 못했다. ` +
        '--env-path가 가리키는 sap.env와 프로파일 홈을 확인해라. (구 번들 문구는 원인을 SAP_CLIENT로 ' +
        '잘못 말한다 — 실제로는 프로파일이 안 잡힌 것이다.)',
    );
  }

  const where = classifyOutDir(outDir);
  if (where === 'attended-only') {
    if (fixture.engine?.name !== PRODUCT_ENGINE_NAME) {
      problems.push(
        `attended 기록인데 제품 엔진(${PRODUCT_ENGINE_NAME})이 아니라 ` +
          `\`${fixture.engine?.name}\`을 채록했다 — 실기 증거는 제품이 싣는 엔진의 것이어야 한다. ` +
          '태울 대상이 `interactive/server/server.bundle.cjs`가 맞는지 확인해라.',
      );
    }
  } else if (where === 'replay-baseline') {
    problems.push(REPLAY_BASELINE_REFUSAL);
  }
  // 'outside' — 자리로는 막지 않는다. 알림은 `outDirNotices`가 낸다.

  if (!allowAllErrors && fixture.steps.every((s) => s.isError)) {
    problems.push(
      '전 단계가 오류다 — 강등의 전형적 징후다. 오류 경로만 노린 시나리오라면 --allow-all-errors 를 붙여라.',
    );
  }

  return problems;
}

// ── 신원 가리기 — 목록 읽기와 fail-closed 뒷문 ──────────────────────────────

/**
 * 가릴 이름의 최소 길이. `recorder/normalize.ts`의 `REDACT_MIN_LENGTH`와 **같은 수**여야
 * 한다 — 어긋나면 한쪽이 가리지 않은 것을 다른 쪽이 거부하거나(막다른 골목),
 * 다른 쪽이 통과시킨다(구멍). 두 수가 어긋나면 `gates/test-attended-guard.mjs`가 잡는다.
 */
export const REDACTION_MIN_LENGTH = 3;

/**
 * 프로파일에서 **가릴 이름이 들어 있는 키**.
 *
 * `SAP_USERNAME`은 접속 계정이라 SAP이 작성자 자리에 그대로 박는다. `SAP_RESPONSIBLE`을
 * 함께 보는 이유는 이 엔진 자신이 그렇게 쓰기 때문이다 — `src/tools/read/getTransport.ts`와
 * `listTransports.ts`가 세션 사용자를 `SAP_RESPONSIBLE || SAP_USERNAME`으로 정한다.
 * 둘 중 하나만 가리면 나머지 하나로 같은 사람이 새어 나간다.
 */
export const PRINCIPAL_ENV_KEYS = ['SAP_USERNAME', 'SAP_RESPONSIBLE'];

/** 거부문에 찍는 위치의 최대 개수. 22군데가 나온 실측이 있어 상한을 둔다. */
const MAX_LEAK_LOCATIONS = 8;

/**
 * `sap.env` 최소 파서.
 *
 * 받아들이는 꼴은 제품이 **같은 파일을 읽는 정본**(`src/profile/envFile.ts`)과 같다:
 * `KEY=VALUE` 한 줄씩 · `#`로 시작하는 줄은 주석 · 선택적 `export ` 접두 · 값을 감싼
 * 따옴표 **한 쌍**만 벗김 · **줄 안쪽 `#`는 주석이 아니다**(비밀번호에 들어갈 수 있다) ·
 * 같은 키가 두 번이면 마지막이 이긴다 · 키와 값의 앞뒤 공백은 버린다.
 *
 * 왜 그 정본을 import하지 않는가: 정본은 `dist/`를 거쳐야 하는 TS이고, 이 모듈과 그
 * 음성시험(`gates/test-attended-guard.mjs`)은 **산출물 없이 홀로 서는 것**이 계약이다
 * (그 파일 머리주석). 여기서 필요한 것은 키 두 개의 값뿐이라 계약을 깨면서까지 묶을
 * 값어치가 없다 — 대신 받아들이는 꼴을 위에 적고 정본을 가리킨다.
 */
export function parseEnvNames(text) {
  const out = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    let key = line.slice(0, eq).trim();
    if (key.startsWith('export ')) key = key.slice('export '.length).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    const first = value.charAt(0);
    if ((first === '"' || first === "'") && value.length >= 2 && value.charAt(value.length - 1) === first) {
      value = value.slice(1, -1).trim();
    }
    out[key] = value;
  }
  return out;
}

/**
 * 접속 프로파일에서 **가릴 이름 목록**을 읽는다.
 *
 * ⚠ 돌려주는 이름은 **비밀 취급**이다. 부르는 쪽은 이 값을 로그·콘솔·오류 문구
 * 어디에도 싣지 않는다. 이 함수도 실패 문구에 값을 담지 않는다 — 담는 순간 「가리기」의
 * 반대가 된다.
 *
 * @returns `{ names, tooShort }` — `tooShort`는 값이 있으나 하한보다 짧은 **키 이름**
 *          목록이다(값이 아니다). 그 판단은 부르는 쪽이 한다: 짧은 이름은 자동으로
 *          가릴 수 없으므로 조용히 버리지 않고 사람에게 돌려줘야 한다.
 */
export function readRedactionNames(envPath) {
  let text;
  try {
    text = fs.readFileSync(envPath, 'utf8');
  } catch (err) {
    throw new Error(
      `가릴 이름을 읽을 프로파일을 열지 못했다: ${envPath}\n` +
        `   ${err.message}\n` +
        '   이 목록 없이 채록하면 접속 사용자의 SAP 로그인 아이디가 픽스처에 실린 채 커밋된다.',
    );
  }
  const env = parseEnvNames(text);
  const names = [];
  const tooShort = [];
  for (const key of PRINCIPAL_ENV_KEYS) {
    const value = (env[key] ?? '').trim();
    if (value === '') continue;
    if (value.length < REDACTION_MIN_LENGTH) {
      tooShort.push(key);
      continue;
    }
    if (!names.some((n) => n.toUpperCase() === value.toUpperCase())) names.push(value);
  }
  return { names, tooShort };
}

/** 픽스처 안의 모든 문자열을 경로와 함께 훑는다. **객체의 키 이름도 문자열이다.** */
function walkStrings(value, at, visit) {
  if (typeof value === 'string') {
    visit(value, at === '' ? '/' : at);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkStrings(item, `${at}/${i}`, visit));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [i, [key, item]] of Object.entries(value).entries()) {
      // 키 이름 자체도 본다. 다만 **경로에는 키를 쓰지 않는다** — 유출된 이름이 키
      // 자리에 있으면 경로가 그 이름을 되싣게 된다(`recorder/masking.ts`가 같은 이유로
      // `<key#N>`을 쓴다).
      visit(key, `${at}/<key#${i}>`);
      walkStrings(item, `${at}/${key}`, visit);
    }
  }
}

/**
 * **fail-closed 뒷문** — 정규화가 끝난 뒤에도 가려야 할 이름이 픽스처에 남아 있는가.
 *
 * 정규화기의 경계 규칙을 여기 **다시 구현하지 않는다.** 뒷받침하는 규칙을 그대로
 * 베낀 뒷문은 그 규칙과 **함께 틀린다** — 정규화가 놓친 이유가 규칙 자체면 뒷문도
 * 똑같이 놓친다. 그래서 여기는 **대소문자만 무시하는 맨 부분 문자열 검사**로,
 * 정규화기보다 의도적으로 **더 넓게** 본다. 넓은 쪽으로만 틀리므로 새는 일은 없고,
 * 과잉 거부는 `recorder/masking.ts`가 정한 이 집의 방향(「오탐이 조금 있는 편이 누락보다
 * 낫다」)과 같다.
 *
 * 넓어서 생기는 유일한 대가: 이름을 **부분 문자열로 품은** 값(`TESTUSER2` 같은 다른
 * 계정, 사람이 시나리오 `description`·`note`에 적은 아이디)이 거부를 부른다. 그건
 * 막다른 골목이 아니라 **사람이 볼 자리**다 — 어느 쪽이든 신원이 커밋되려던 참이고,
 * 고칠 자리는 픽스처가 아니라 시나리오 파일이다(그 파일도 커밋된다).
 *
 * ⚠ 거부문에 **원본 이름을 싣지 않는다.** 위치만 말한다.
 *
 * @param fixture 정규화가 끝난 픽스처
 * @param names   가려야 했던 이름 목록 (`readRedactionNames`의 `names`)
 * @returns 문제 문구 배열 — 없으면 빈 배열
 */
export function detectRedactionLeak(fixture, names) {
  const targets = [
    ...new Set(
      (names ?? [])
        .map((n) => (typeof n === 'string' ? n.trim().toUpperCase() : ''))
        .filter((n) => n.length >= REDACTION_MIN_LENGTH),
    ),
  ];
  if (targets.length === 0) return [];

  const hits = [];
  walkStrings(fixture, '', (text, where) => {
    const upper = text.toUpperCase();
    if (targets.some((t) => upper.includes(t)) && !hits.includes(where)) hits.push(where);
  });
  if (hits.length === 0) return [];

  const shown = hits.slice(0, MAX_LEAK_LOCATIONS);
  const more = hits.length - shown.length;
  return [
    '가려야 할 이름이 픽스처에 남아 있다 — 정규화가 놓쳤다. ' +
      `위치: ${shown.join(', ')}${more > 0 ? ` 외 ${more}곳` : ''} ` +
      `(총 ${hits.length}곳). 이름 자체는 여기 싣지 않는다 — 거부문도 새면 안 된다. ` +
      '가리기 목록이 채록에 실제로 넘어갔는지, 시나리오의 대상 이름·설명·메모에 그 이름이 ' +
      '박혀 있지는 않은지 확인해라. 시나리오 쪽이면 고칠 자리는 그 파일이다(그 파일도 커밋된다).',
  ];
}
