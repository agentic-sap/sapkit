/**
 * test-refusal-vocab.mjs — 무접속 거부 어휘가 제품 적합성 러너에 잡히는지 (D18).
 *
 * D18은 「신 엔진의 무접속 거부 문구가 구 번들과 다르다」는 갈림이고, 방치하면
 * 교체 판에서 신 엔진의 **정상 거부**가 `conformance-server-gates.mjs`의
 * `OTHER(...)`로 떨어져 C1 판정이 어긋난다. 그 러너는 이제 두 어휘를 병기해
 * 인식한다 — 이 시험이 그 병기를 기계로 붙잡는다.
 *
 * 두 방향의 드리프트를 모두 막는다:
 *   ① 정규식은 **제품 게이트 파일에서 읽어온다** — 복제해 두면 그쪽이 좁아져도
 *      여기는 계속 통과한다.
 *   ② 신 문구 샘플은 **발신 3곳의 소스에 아직 있는지** 확인한다 — 채록본만
 *      들고 있으면 엔진이 문구를 바꿔도 여기는 계속 통과한다.
 *
 * 소스만 읽는다 — `dist/`도 접속도 필요 없다. 그래서 `gates/lib.mjs`(산출물
 * 의존)를 쓰지 않고 홀로 선다.
 *
 * 실행: node gates/test-refusal-vocab.mjs
 */
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const PRODUCT_GATE = here('../../interactive/scripts/conformance-server-gates.mjs');

// ── ① 판정 정규식을 제품 게이트에서 읽어온다 ────────────────────────────────
function noConnectionPattern() {
  const src = fs.readFileSync(PRODUCT_GATE, 'utf8');
  const m = src.match(/if \(\/(.+?)\/\.test\(t\)\) return 'NO_CONNECTION';/);
  if (!m) {
    console.error(
      `❌ 제품 게이트에서 NO_CONNECTION 분류 정규식을 찾지 못했다: ${PRODUCT_GATE}\n` +
        '   verdictOf()의 그 줄이 사라졌거나 모양이 바뀌었다. 어느 쪽이든 D18 이행이 무너진 것이므로 확인이 먼저다.',
    );
    process.exit(2);
  }
  return new RegExp(m[1]);
}

// ── 채록본 ──────────────────────────────────────────────────────────────────

/** 구 번들이 프로파일 없이 연결 필요 도구를 부를 때 내는 문구 (D18 실측). */
const OLD_SAMPLE = 'Basic authentication requires SAP_CLIENT to be provided';

/**
 * 신 엔진의 발신 3곳. `text`는 실제로 나가는 모양, `literal`은 그 소스에 박혀
 * 있는 조각이다 — 서버 코어는 뒤에 진단을 이어 붙이므로 둘이 갈린다.
 */
const NEW_SAMPLES = [
  {
    label: '서버 코어 (정본)',
    file: '../src/server/session.ts',
    literal:
      'ERR_NO_CONNECTION: this tool needs a SAP connection but none is configured — the server is running inspection-only. ',
    text:
      'ERR_NO_CONNECTION: this tool needs a SAP connection but none is configured — the server is running inspection-only. ' +
      'Point MCP_ENV_PATH at a profile sap.env, pass --env-path=<file>, or set an active profile.',
  },
  {
    label: 'RFC 통로 방어',
    file: '../src/tools/rfc-read/rfcChannel.ts',
    literal: 'ERR_NO_CONNECTION: this tool needs a SAP connection but none is configured.',
    text: 'ERR_NO_CONNECTION: this tool needs a SAP connection but none is configured.',
  },
  {
    label: 'ECC 우회로 방어',
    file: '../src/tools/rfc-read/ddicRead.ts',
    literal: 'ERR_NO_CONNECTION: this tool needs a SAP connection but none is configured.',
    text: 'ERR_NO_CONNECTION: this tool needs a SAP connection but none is configured.',
  },
];

/** 무관한 거부 — 이건 NO_CONNECTION이 아니라 tier 거부다. 물면 분류가 뭉갠 것이다. */
const UNRELATED_SAMPLE = 'ERR_READONLY_TIER: this tool is not exposed on a readonly tier';

// ── 판정 ────────────────────────────────────────────────────────────────────
const rows = [];
const check = (name, ok, detail = '') => rows.push({ name, ok: Boolean(ok), detail });

const re = noConnectionPattern();
console.log(`\nD18 무접속 거부 어휘 — 제품 게이트 정규식 /${re.source}/\n`);

check('구 번들 문구를 여전히 인식한다', re.test(OLD_SAMPLE), `"${OLD_SAMPLE}"`);

for (const s of NEW_SAMPLES) {
  check(`신 엔진 문구를 인식한다 — ${s.label}`, re.test(s.text), s.file);
  const src = fs.readFileSync(here(s.file), 'utf8');
  check(`채록본이 소스에 아직 있다 — ${s.label}`, src.includes(s.literal), s.file);
}

check('무관 문구는 물지 않는다', !re.test(UNRELATED_SAMPLE), `"${UNRELATED_SAMPLE}"`);

for (const r of rows) console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
const bad = rows.filter((r) => !r.ok).length;
console.log(
  bad === 0
    ? `\n✅ D18 거부 어휘 병기 — ${rows.length}건 전부 통과`
    : `\n❌ D18 거부 어휘 병기 — ${rows.length}건 중 ${bad}건 실패`,
);
process.exit(bad === 0 ? 0 : 1);
