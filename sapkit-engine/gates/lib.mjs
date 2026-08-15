/**
 * 게이트 공용 도구.
 *
 * 게이트는 **빌드 산출물(`dist/`)에 대고** 돈다 — 시험이 소스를 보는 것과 달리,
 * 여기서는 실제로 실려 나가는 물건이 계약을 지키는지 본다. 자식 프로세스를
 * 띄우지 않고(이 머신의 수거 함정) in-memory 전송으로 서버를 세운다.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const require = createRequire(import.meta.url);

export const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const DIST = here('../dist/src/server/index.js');

if (!fs.existsSync(DIST)) {
  console.error(
    `[gates] 빌드 산출물이 없다: ${DIST}\n` +
      '        `npm run build`를 먼저 돌려라. 게이트는 소스가 아니라 산출물을 검사한다.',
  );
  process.exit(2);
}

export const server = require(DIST);

/**
 * 산출물 안의 모듈을 그대로 부른다 — 게이트는 소스가 아니라 **실려 나가는 물건**을
 * 본다. 등록점 스냅샷(`src/tools/registry.ts`)과 대장 모델(`harness/ledger`)을
 * 여기로 가져온다: 둘 다 이미 있는 부품이므로 게이트가 다시 구현하지 않는다.
 */
export const requireDist = (rel) => require(here(`../dist/${rel}`));

const created = [];

export function tempDir(prefix = 'sapkit-gate-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

export function cleanupTempDirs() {
  while (created.length > 0) {
    const dir = created.pop();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // 임시 디렉터리 정리 실패는 판정이 아니다.
    }
  }
}

/**
 * 죽은 루프백 주소를 가리키는 프로파일 한 장. 비밀은 없다.
 * 접속을 실제로 열지 않는다 — 목록 조회와 게이트 판정에는 접속이 필요 없다.
 */
export function writeProfileEnv(overrides = {}) {
  const values = {
    SAP_URL: 'http://127.0.0.1:1',
    SAP_CLIENT: '100',
    SAP_AUTH_TYPE: 'basic',
    SAP_USERNAME: 'gate-fixture',
    SAP_PASSWORD: 'not-a-secret',
    SAP_TIER: 'DEV',
    ...overrides,
  };
  const file = path.join(tempDir(), 'sap.env');
  fs.writeFileSync(
    file,
    `${Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')}\n`,
    'utf8',
  );
  return file;
}

/** 셰임이 하는 그대로 — argv 꼬리에 `--exposition` 하나, env로 `MCP_ENV_PATH`. */
export function boot({ exposition = 'readonly,high', envPath = null, env = {} } = {}) {
  const startup = server.resolveStartup({
    argv: ['node', 'entry', `--exposition=${exposition}`],
    env: { ...(envPath ? { MCP_ENV_PATH: envPath } : {}), ...env },
    cwd: tempDir(),
    homedir: tempDir(),
  });
  return startup;
}

export function exposedNames(options) {
  const startup = boot(options);
  const core = server.createServerCore({ startup, stderr: () => {} });
  const names = [...core.exposedToolNames].sort();
  return { names, core, startup };
}

// ── 판정 누적 ────────────────────────────────────────────────────────────────

export function createReport(title) {
  const rows = [];
  return {
    title,
    check(name, ok, detail = '') {
      rows.push({ name, ok: Boolean(ok), detail });
      return Boolean(ok);
    },
    get failed() {
      return rows.filter((r) => !r.ok);
    },
    print() {
      for (const r of rows) {
        console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
      }
      const bad = rows.filter((r) => !r.ok).length;
      console.log(
        bad === 0
          ? `✅ ${title} — ${rows.length}건 전부 통과`
          : `❌ ${title} — ${rows.length}건 중 ${bad}건 실패`,
      );
      return bad === 0;
    },
  };
}

/** 두 값이 깊게 같은지. 다르면 첫 차이 경로를 문자열로 돌려준다. */
export function firstDifference(expected, actual, at = '') {
  if (expected === actual) return null;
  if (
    typeof expected !== 'object' ||
    typeof actual !== 'object' ||
    expected === null ||
    actual === null
  ) {
    return `${at || '/'}: 기대 ${JSON.stringify(expected)} · 실제 ${JSON.stringify(actual)}`;
  }
  if (Array.isArray(expected) !== Array.isArray(actual)) {
    return `${at || '/'}: 한쪽만 배열이다`;
  }
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const k of [...keys].sort()) {
    const d = firstDifference(expected[k], actual[k], `${at}/${k}`);
    if (d) return d;
  }
  return null;
}
