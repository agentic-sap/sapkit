/**
 * 표면 게이트 — 신 엔진이 발행하는 도구 표면이 구 엔진과 같은가.
 *
 * ## 왜 「정확 일치」가 아닌가 (다음 세션이 여기서 헤매지 않도록)
 *
 * 예전 이 게이트는 발행 표면이 **M1 19종과 정확히 일치**할 것을 요구했다. 19종만
 * 존재하던 동안에는 맞는 규칙이었지만, 이 판은 남은 167종을 묶음으로 지어 나간다 —
 * **첫 묶음이 등록되는 순간 그 규칙은 실패하고 186종째까지 계속 실패한다.** 이 판의
 * 유일한 상시 증거가 오프라인 게이트인데 그 주 게이트가 전 기간 빨가면, 무시되거나
 * 조용히 느슨해진다. 둘 다 이 판을 무증거로 만든다.
 *
 * 그래서 판정 기준을 **집합의 크기**에서 **등록점**으로 옮겼다. 규칙은 넷이다.
 *
 *   ⓐ **등록된 도구는 채록본과 글자 일치해야 한다** — 발행 선언(이름·설명·
 *      `inputSchema`·`execution`)을 구 번들 채록본과 통째로 대조한다. 수를 세는
 *      것만으로는 "이름은 같은데 인자가 다른" 표류를 못 잡는다.
 *   ⓑ **등록된 도구는 4개 노출 조건에서의 소속이 일치해야 한다** — 조건별 기대
 *      집합은 `채록본의 그 조건 이름 집합 ∩ 등록점`이다. 아직 안 지은 도구는
 *      양쪽에서 함께 빠지므로 부분 완성이 실패가 되지 않는다.
 *   ⓒ **채록본에 없는 이름을 발행하면 실패한다** — 부분 완성을 허용하는 방향은
 *      "덜 지은 쪽"뿐이다. 표면 밖으로 새 이름이 나가는 것은 여전히 표류다.
 *   ⓓ **대장의 `지음` 집합 = 등록점 집합** — 진척표가 실제보다 앞서 있으면 다음
 *      판이 이미 지은 도구를 다시 짓거나 안 지은 도구를 지었다고 계산한다.
 *
 * **부분 완성을 봐주는 것은 아직 안 지은 도구에 대해서뿐이고, 등록된 도구에는
 * 예전보다 엄격해졌다** — 예전 규칙은 M1 19종만 선언 대조했지만 지금은 발행되는
 * 전부를 대조하고, 노출 조건도 3개가 아니라 4개 전부를 본다. **남은 수는 게이트가
 * 아니라 대장이 보고한다**(`TOOL-LEDGER.md`).
 *
 * ## 155/65의 정본은 채록본이다
 *
 * 예전에는 무프로파일 155종·readonly 65종의 이름 집합을
 * `interactive/provenance/mcp-surface.json`에서 읽었다. 지금은 채록본
 * (`harness/old-surface/m1-tools.json`)의 `exposures`가 4개 조건을 전부 담으므로
 * **채록본이 정본**이고, provenance는 구 부품이라 참고로만 둔다(무접촉). 정본이
 * 둘이면 어느 쪽이 낡았는지 아무도 모른 채 게이트가 초록으로 남는다.
 *
 * ## 관찰과 판정을 갈라 둔 이유
 *
 * `run()`은 실제 MCP 왕복으로 표면을 **채집**하고, `judge()`는 채집된 표면만 보고
 * **판정**한다. 판정이 순수 함수라야 음성시험이 "도구 하나만 지은 상태"·"186종
 * 전부 지은 상태"를 합성해 물릴 수 있다 — 엔진에 도구를 더했다 뺐다 할 수는 없다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import {
  boot,
  cleanupTempDirs,
  createReport,
  firstDifference,
  here,
  requireDist,
  server,
  writeProfileEnv,
} from './lib.mjs';

export const CAPTURED_PATH = here('../harness/old-surface/m1-tools.json');

/**
 * 판S5 — SAP 자산 개명이 만든 **의도한 계약 변경**. ⓐ의 유일한 예외이고, 여기
 * 없는 글자가 움직이면 ⓐ는 그대로 실패한다.
 *
 * 채록본(`harness/old-surface/m1-tools.json`)은 **되뜰 수 없는 기준**이라 손대지
 * 않는다 — 대신 대조 직전에 이 표대로 개명해 물린다. 반대로 도구 설명이 구 이름을
 * 계속 말하게 두면 **SAP에 더 이상 없는 오브젝트를 찾으라고 시키는 셈**이라,
 * 「채록본과 글자 일치」를 그 자리에서만 개명 뒤 글자 일치로 바꾼 것이다.
 *
 * 지금 걸리는 것은 `GetBadiImplementations` 한 종뿐이다(ECC 브리지 FM 이름).
 */
const RENAMED_SAP_ASSETS = Object.freeze([['ZMCP_ADT_DDIC_BADI', 'ZSAPKIT_ADT_DDIC_BADI']]);

/**
 * 판A1 — 도구 설명에 **덧붙인 계약 문장**. ⓐ의 둘째 예외이고, 개명표와 성질이 같다:
 * 채록본은 되뜰 수 없어 손대지 않고, 대조 직전에 이 표대로 옮겨 문다.
 *
 * 왜 덧말인가 — 이 셋은 **없는 대상에 성공 모양으로 답한다**(실측: `GetPackageContents`
 * → `[]` · `ReadPackage` → `success: true`·`metadata: null` · `GetInactiveObjects` →
 * 0건). 채록본의 설명은 그 사실을 말하지 않고, 그래서 사람과 모델이 빈 결과를 「없음이
 * 확인됐다」로 읽어 왔다(D-133 · HANDOFF 부채). 절차 문서 세 곳이 이미 「믿지 말라」고
 * 적는데도 재발했다 — 계약 불일치는 계약이 있는 자리에서만 닫힌다.
 *
 * **구조가 개명표보다 좁다.** 여기 적는 것은 설명 **전문이 아니라 꼬리에 붙는 덧말**이고,
 * 게이트는 `채록본 원문 + 덧말`을 조립해 글자 일치를 요구한다. 그러므로 원문 문장이
 * 한 글자라도 움직이면 ⓐ는 그대로 실패하고, 덧말을 고치는 것도 이 표를 고쳐야만 된다.
 * 설명 전문을 여기 옮겨 적었다면 게이트가 무엇이든 통과시켰을 것이다.
 */
const AMENDED_DESCRIPTIONS = Object.freeze(
  Object.entries(
    JSON.parse(fs.readFileSync(here('../harness/old-surface/amendments.json'), 'utf8')).descriptions,
  ),
);

/**
 * 채록본의 발행 선언 하나를 개명 뒤 형태로 옮긴다. 설명 문구에만 건다. 덧말(`AMENDED_DESCRIPTIONS`)도 여기서 함께 붙인다.
 *
 * 음성시험(`gates/test-gates.mjs`)이 채록본에서 **발행 표면을 합성**할 때도 같은
 * 것을 써야 한다 — 실제 엔진이 개명본을 발행하므로, 합성분만 구 이름이면 그
 * 시험은 없는 표류를 잡는다. 그래서 내보낸다.
 */
export function amended(declaration, name) {
  if (typeof declaration?.description !== 'string') return declaration;
  let description = declaration.description;
  for (const [was, now] of RENAMED_SAP_ASSETS) description = description.replaceAll(was, now);
  for (const [tool, appendix] of AMENDED_DESCRIPTIONS) {
    if (tool === name) description += appendix;
  }
  return description === declaration.description ? declaration : { ...declaration, description };
}

/**
 * 가장 넓은 노출 조건 — 등록점의 도구가 전부 뜨는 자리이자 채록본 `tools`(전량
 * 선언)의 짝이다. ⓐ의 선언 대조와 「등록점 = 발행 집합」은 이 조건에서 본다.
 */
const WIDEST = 'connected_default';

// 대장의 자리는 `harness/ledger`가 소유한다 — 여기서 다시 정하지 않는다.
const ledgerModel = requireDist('harness/ledger/index.js');
export const LEDGER_FILE = path.join(ledgerModel.findEngineRoot(), ledgerModel.LEDGER_PATH);

/** 등록점 스냅샷 — 산출물에서 읽는다. 게이트는 소스가 아니라 실려 나가는 물건을 본다. */
export function registeredToolNames() {
  const { TOOL_REGISTRY } = requireDist('src/tools/registry.js');
  return TOOL_REGISTRY.map((tool) => tool.definition.name).sort();
}

/** 대장의 상태 3절 — 글자는 `harness/ledger/render.ts`의 `SECTIONS`가 정한다. */
const LEDGER_SECTIONS = Object.freeze({
  '안 지음': 'notBuilt',
  '지음 · 증거 대기': 'built',
  '증거 있음': 'built',
});

/**
 * 커밋된 대장에서 `지음`/`안 지음` 집합을 읽는다.
 *
 * 대장을 **다시 계산하지 않고 글자에서 읽는** 이유는, ⓓ가 물어야 하는 것이
 * "계산이 맞는가"가 아니라 **"커밋돼 있는 진척표가 지금 등록점과 맞는가"**이기
 * 때문이다. 계산 대 커밋본의 대조는 대장 게이트(`gates/ledger.mjs`)가 이미 한다 —
 * 여기서 겹쳐 하지 않는다.
 *
 * 형식이 바뀌어 못 읽으면 집합이 비고, 그러면 ⓓ가 시끄럽게 실패한다(fail-closed).
 * `sections`는 그 실패의 원인을 형식 변화로 지목하기 위한 값이다.
 */
export function builtToolsFromLedger(markdown) {
  const built = new Set();
  const notBuilt = new Set();
  const sections = new Set();
  let bucket = null;

  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('## ')) {
      const heading = /^##\s+(.+?)\s*\(\d+\)\s*$/.exec(line);
      const title = heading === null ? null : heading[1];
      bucket = title !== null && title in LEDGER_SECTIONS ? LEDGER_SECTIONS[title] : null;
      if (bucket !== null) sections.add(title);
      continue;
    }
    if (bucket === null) continue;
    // 표 머리줄(`| 도구 |`)과 구분줄(`|---|`)은 도구 이름이 아니다 — 도구 이름은
    // 전부 ASCII 식별자다.
    const row = /^\|\s*([A-Za-z][A-Za-z0-9_]*)\s*\|/.exec(line);
    if (row === null) continue;
    (bucket === 'built' ? built : notBuilt).add(row[1]);
  }

  return { built, notBuilt, sections };
}

/** 실제 MCP 왕복으로 `tools/list`를 받아 온다 — 내부 상태를 훔쳐보지 않는다. */
async function listTools({ exposition, envPath }) {
  const startup = boot({ exposition, envPath });
  const core = server.createServerCore({ startup, stderr: () => {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await core.server.connect(serverTransport);
  const client = new Client({ name: 'surface-gate', version: '0.0.0' });
  await client.connect(clientTransport);
  try {
    const listed = await client.listTools();
    return listed.tools;
  } finally {
    await client.close();
    await core.server.close();
  }
}

/** 채록본이 적어 둔 4개 조건 그대로 서버를 세워 발행 표면을 채집한다. */
async function observe(captured) {
  const conditions = captured.exposures;
  if (conditions === null || typeof conditions !== 'object') {
    throw new Error('채록본에 exposures(노출 조건별 이름 집합)가 없다 — 155/65의 정본이 비었다.');
  }
  const onprem = writeProfileEnv({ SAP_SYSTEM_TYPE: 'onprem' });
  const observed = {};
  for (const [key, condition] of Object.entries(conditions)) {
    if (typeof condition?.exposition !== 'string') {
      throw new Error(`노출 조건 ${key}에 exposition이 없다.`);
    }
    if (condition.profile !== null && condition.profile !== 'onprem') {
      throw new Error(`노출 조건 ${key}의 프로파일 «${condition.profile}»을 게이트가 세울 줄 모른다.`);
    }
    observed[key] = await listTools({
      exposition: condition.exposition,
      envPath: condition.profile === null ? null : onprem,
    });
  }
  return observed;
}

/**
 * 채집된 표면을 ⓐ~ⓓ로 판정한다. **순수 함수** — 파일도 서버도 건드리지 않는다.
 *
 * @param captured   구 번들 표면 채록본 (정본)
 * @param observed   조건 키 → `tools/list` 결과 배열
 * @param registered 등록점에 올라 있는 도구 이름
 * @param ledger     커밋된 대장에서 읽은 `{ built, notBuilt, sections }` · 없으면 null
 * @param report     판정 누적기
 */
export function judge({ captured, observed, registered, ledger, report }) {
  const conditions = captured?.exposures ?? {};
  const keys = Object.keys(conditions);
  const allTools = Object.keys(captured?.tools ?? {}).sort();
  const registeredSet = new Set(registered);
  const inCatalog = new Set(allTools);

  const sorted = (names) => [...names].sort();
  const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
  const diffSets = (want, got) => {
    const w = new Set(want);
    const g = new Set(got);
    return {
      missing: sorted([...w].filter((name) => !g.has(name))),
      extra: sorted([...g].filter((name) => !w.has(name))),
    };
  };
  const describe = ({ missing, extra }) =>
    `빠짐 ${missing.length}[${missing.slice(0, 6).join(', ')}] · 여분 ${extra.length}[${extra.slice(0, 6).join(', ')}]`;

  // ── 0. 정본 온전성 — 무엇에 대고 판정하는가 ───────────────────────────────
  // 채록본이 성치 않으면 그 위의 ⓐ~ⓒ가 전부 의미를 잃는다. 155/65의 정본이 여기로
  // 옮겨 왔으므로, 그 정본 자체를 먼저 확인한다.
  const shapeOk =
    keys.length === 4 &&
    allTools.length > 0 &&
    keys.every((key) => Array.isArray(conditions[key]?.names));
  report.check(
    '채록본이 4개 노출 조건과 전량 선언을 담는다 (155/65의 정본)',
    shapeOk,
    `조건 ${keys.length}개 · 전량 선언 ${allTools.length}종`,
  );
  if (!shapeOk) return;

  report.check(
    '조건별 이름 수가 채록본이 적어 둔 수와 같다',
    keys.every((key) => conditions[key].count === conditions[key].names.length),
    keys.map((key) => `${key} ${conditions[key].names.length}/${conditions[key].count}`).join(' · '),
  );
  report.check(
    `가장 넓은 조건(${WIDEST})의 이름 집합이 전량 선언과 같다`,
    conditions[WIDEST] !== undefined && same(conditions[WIDEST].names, allTools),
    `${conditions[WIDEST]?.names.length ?? 0} vs ${allTools.length}`,
  );
  const distinct = new Set(keys.map((key) => sorted(conditions[key].names).join('\n')));
  report.check(
    '네 조건이 서로 다른 집합이다 (노출 제어를 실제로 가른다)',
    distinct.size === keys.length,
    `서로 다른 집합 ${distinct.size}/${keys.length}`,
  );

  const published = {};
  for (const key of keys) published[key] = sorted((observed?.[key] ?? []).map((tool) => tool.name));
  const widest = published[WIDEST] ?? [];

  // ── ⓒ 채록본에 없는 이름을 발행하면 실패 ──────────────────────────────────
  const everywhere = new Set(keys.flatMap((key) => published[key]));
  const outside = sorted([...everywhere].filter((name) => !inCatalog.has(name)));
  report.check(
    'ⓒ 채록본에 없는 이름을 발행하지 않는다',
    outside.length === 0,
    outside.length === 0
      ? `발행 ${everywhere.size}종 전부가 채록본 ${allTools.length}종 안에 있다`
      : `표면 밖 이름 ${outside.length}종 [${outside.slice(0, 6).join(', ')}]`,
  );

  // ── 등록점 ↔ 발행 (spec §4.5-1) ───────────────────────────────────────────
  // ⓐ·ⓑ가 "등록된 도구는"으로 시작하므로, 등록점과 발행이 같다는 것부터 못 박는다.
  // 등록해 놓고 발행되지 않는 도구는 대장에서는 「지음」인데 표면에는 없는 유령이다.
  const registryGap = diffSets([...registeredSet], widest);
  report.check(
    `등록점 ${registeredSet.size}종이 그대로 발행된다 (§4.5-1)`,
    registryGap.missing.length === 0 && registryGap.extra.length === 0,
    registryGap.missing.length === 0 && registryGap.extra.length === 0
      ? `${widest.length}종`
      : describe(registryGap),
  );
  report.check('발행 표면이 비어 있지 않다 (판정이 공허하지 않다)', widest.length > 0, `${widest.length}종`);

  // ── ⓑ 4개 노출 조건에서의 소속 ────────────────────────────────────────────
  for (const key of keys) {
    const expected = conditions[key].names.filter((name) => registeredSet.has(name));
    const gap = diffSets(expected, published[key]);
    const ok = gap.missing.length === 0 && gap.extra.length === 0;
    report.check(
      `ⓑ ${key} 소속 일치 — 채록본 ${conditions[key].names.length}종 ∩ 등록점 ${registeredSet.size}종 = ${expected.length}종`,
      ok,
      ok ? `${published[key].length}종` : describe(gap),
    );
  }

  // 안전 바닥선 — 연결 전용 도구가 무프로파일 조건으로 새면 안 된다. ⓑ가 함께
  // 잡지만, 새는 방향은 실패 문구가 그 자체로 안전 사고를 가리켜야 한다.
  const connectedOnly = new Set(captured.connectedOnly ?? []);
  for (const key of keys.filter((k) => conditions[k].profile === null)) {
    const leaked = published[key].filter((name) => connectedOnly.has(name));
    report.check(
      `무프로파일 조건(${key})에 연결 전용 도구가 새지 않는다`,
      leaked.length === 0,
      leaked.length === 0
        ? `연결 전용 ${connectedOnly.size}종 중 0종`
        : `샌 이름 [${leaked.slice(0, 6).join(', ')}]`,
    );
  }

  // ── ⓐ 발행 선언 글자 일치 ─────────────────────────────────────────────────
  const listed = observed?.[WIDEST] ?? [];
  let compared = 0;
  for (const tool of listed) {
    const captured0 = captured.tools[tool.name];
    if (captured0 === undefined) continue; // 표면 밖 이름은 ⓒ가 이미 잡았다.
    // 판S5 개명분·판A1 덧말만 옮겨 물린다 — 나머지는 여전히 채록본과 글자 대조다.
    const want = amended(captured0, tool.name);
    // 발행 객체에는 SDK가 undefined 필드(annotations·_meta)를 얹으므로 채록본이
    // 가진 키만 대조한다 — 채록본 자체가 구 엔진의 발행 결과다.
    const trimmed = Object.fromEntries(Object.keys(want).map((k) => [k, tool[k]]));
    const difference = firstDifference(want, trimmed);
    report.check(`ⓐ 선언 대조 ${tool.name}`, difference === null, difference ?? '');
    compared += 1;
  }
  report.check('ⓐ 발행된 도구를 빠짐없이 대조했다', compared === listed.length, `${compared}/${listed.length}`);

  // ── ⓓ 대장의 `지음` 집합 = 등록점 집합 ────────────────────────────────────
  if (ledger === null || ledger === undefined) {
    report.check(
      'ⓓ 대장을 읽었다',
      false,
      `커밋된 대장이 없다 (${ledgerModel.LEDGER_PATH}) — \`node harness/render-ledger.mjs\`로 만들어라`,
    );
    return;
  }
  report.check(
    'ⓓ 대장의 상태 3절을 읽었다',
    ledger.sections.size === 3,
    `읽은 절 [${[...ledger.sections].map((title) => `「${title}」`).join(' ')}] — 못 읽었다면 대장 형식이 바뀐 것이다`,
  );
  const ledgerGap = diffSets([...registeredSet], [...ledger.built]);
  const ledgerOk = ledgerGap.missing.length === 0 && ledgerGap.extra.length === 0;
  report.check(
    'ⓓ 대장의 「지음」 집합 = 등록점 집합',
    ledgerOk,
    ledgerOk
      ? `${ledger.built.size}종 · 안 지음 ${ledger.notBuilt.size}종`
      : `${describe(ledgerGap)} — \`node harness/render-ledger.mjs\`로 다시 만들어라`,
  );
}

/**
 * @param capturedPath 대조 기준이 될 채록본. 게이트 자체의 음성시험이
 *   일부러 망가뜨린 사본을 물려 "이 게이트가 정말 거부하는지"를 확인한다.
 * @param ledgerPath   대조할 대장. 같은 이유로 갈아끼울 수 있다.
 */
export async function run({ capturedPath = CAPTURED_PATH, ledgerPath = LEDGER_FILE } = {}) {
  const captured = JSON.parse(fs.readFileSync(capturedPath, 'utf8'));
  const report = createReport('표면 게이트');

  let observed;
  try {
    observed = await observe(captured);
  } catch (error) {
    // 채집이 죽은 것은 통과가 아니다 — 판정을 못 했다는 뜻이다.
    report.check('채록본의 노출 조건대로 발행 표면을 채집했다', false, String(error?.message ?? error));
    cleanupTempDirs();
    return report;
  }

  const committed = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : null;

  judge({
    captured,
    observed,
    registered: registeredToolNames(),
    ledger: committed === null ? null : builtToolsFromLedger(committed),
    report,
  });

  cleanupTempDirs();
  return report;
}
