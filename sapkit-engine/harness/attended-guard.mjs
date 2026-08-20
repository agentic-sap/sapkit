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
