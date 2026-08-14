/**
 * 녹화 대상 검사 — **선언에서 읽는가**, 그리고 **덜 막지도 더 막지도 않는가**.
 *
 * 세 방향을 함께 겨눈다:
 *  ⓐ 선언을 가진 도구에 Z·Y 밖 대상을 주면 **SAP 호출 전에** 거부된다.
 *  ⓑ 하드코딩 15종이 하던 거부가 **그대로** 유지된다(회귀 없음).
 *  ⓒ 신 엔진이 아직 짓지 않은 도구는 **막지 않는다** — 지금처럼 사후 백스톱에만 걸린다.
 *
 * ⓒ가 없으면 이 판은 반대 방향으로 무너진다: 선언이 없다고 fail-closed로 막으면
 * 구 번들(도구 186종) 대상 녹화가 통째로 막힌다.
 */

import * as z from 'zod';

import { defineTool } from '../../src/server/toolDefinition';
import {
  TARGET_NAME_EXTRACTORS,
  buildTargetNameExtractors,
  checkSourceNamespace,
  detectUnguardedSource,
  isCustomerObject,
} from '../targetGuard';

/** 시나리오 한 벌을 만든다 — 검사가 보는 것은 `tool`과 `args`뿐이다. */
const scenarioOf = (...steps: ReadonlyArray<{ tool: string; args: unknown }>) => ({ steps });

/** 픽스처 한 벌 — 백스톱이 보는 것은 `index`·`tool`·`args`·`response`뿐이다. */
const fixtureOf = (...steps: ReadonlyArray<{ tool: string; args?: unknown; response?: unknown }>) => ({
  steps: steps.map((s, index) => ({ index, tool: s.tool, args: s.args ?? {}, response: s.response ?? null })),
});

/** 사후 백스톱이 ABAP 원본으로 읽는 모양. 0열 + CRLF는 SAP이 실제로 돌려주는 형태다. */
const ABAP_SOURCE = 'CLASS lcl DEFINITION.\r\nENDCLASS.\r\n';

// ── ⓑ 기존 15종의 거부 동작이 회귀하지 않는다 ────────────────────────────────

/**
 * 하드코딩 시절의 15종과 그 대상-이름 인자. **이 표가 회귀의 기준선이다** —
 * 값은 `record-attended.mjs`가 선언 이전에 들고 있던 `CUSTOMER_OBJECT_TOOLS`
 * 그대로이며, 여기서 줄어들면 SAP 호출 전에 막히던 것이 안 막히게 된다는 뜻이다.
 */
const LEGACY_15: ReadonlyArray<readonly [string, Record<string, unknown>, Record<string, unknown>]> = [
  // [도구, 표준 대상(거부돼야 함), 고객 대상(통과해야 함)]
  ['GetClass', { class_name: 'CL_ABAP_TYPEDESCR' }, { class_name: 'ZCL_SAPKIT_DEMO' }],
  ['GetProgram', { program_name: 'SAPMV45A' }, { program_name: 'ZSAPKIT_DEMO' }],
  ['GetInclude', { include_name: 'MV45AFZZ' }, { include_name: 'ZSAPKIT_DEMO_INC' }],
  [
    'GetFunctionModule',
    { function_module_name: 'BAPI_MATERIAL_GET_ALL', function_group_name: 'MG' },
    { function_module_name: 'Z_SAPKIT_DEMO', function_group_name: 'MG' },
  ],
  ['GetTable', { table_name: 'MARA' }, { table_name: 'ZSAPKIT_T001' }],
  ['GetStructure', { structure_name: 'BAPIRET2' }, { structure_name: 'ZSAPKIT_S001' }],
  [
    'GrepObjects',
    { objects: [{ object_type: 'CLAS', object_name: 'CL_ABAP_TYPEDESCR' }], pattern: 'X' },
    { objects: [{ object_type: 'CLAS', object_name: 'ZCL_SAPKIT_DEMO' }], pattern: 'X' },
  ],
  [
    'GetSourceDiff',
    { object_type_a: 'CLAS', object_name_a: 'ZCL_SAPKIT_DEMO', object_type_b: 'CLAS', object_name_b: 'CL_ABAP_TYPEDESCR' },
    { object_type_a: 'CLAS', object_name_a: 'ZCL_SAPKIT_DEMO', object_type_b: 'CLAS', object_name_b: 'ZCL_SAPKIT_DEMO2' },
  ],
  ['CreateProgram', { program_name: 'SAPMV45A', package_name: '$TMP' }, { program_name: 'ZSAPKIT_DEMO', package_name: '$TMP' }],
  [
    'CreateInclude',
    { include_name: 'ZSAPKIT_DEMO_INC', main_program: 'SAPMV45A', package_name: '$TMP' },
    { include_name: 'ZSAPKIT_DEMO_INC', main_program: 'ZSAPKIT_DEMO', package_name: '$TMP' },
  ],
  ['UpdateProgram', { program_name: 'SAPMV45A', source_code: 'X' }, { program_name: 'ZSAPKIT_DEMO', source_code: 'X' }],
  [
    'UpdateInclude',
    { include_name: 'ZSAPKIT_DEMO_INC', main_program: 'SAPMV45A', source_code: 'X' },
    { include_name: 'ZSAPKIT_DEMO_INC', main_program: 'ZSAPKIT_DEMO', source_code: 'X' },
  ],
  ['UpdateClass', { class_name: 'CL_ABAP_TYPEDESCR', source_code: 'X' }, { class_name: 'ZCL_SAPKIT_DEMO', source_code: 'X' }],
  [
    'UpdateSourceByPatch',
    { object_type: 'CLAS', object_name: 'CL_ABAP_TYPEDESCR', old_string: 'a', new_string: 'b' },
    { object_type: 'CLAS', object_name: 'ZCL_SAPKIT_DEMO', old_string: 'a', new_string: 'b' },
  ],
  [
    'ActivateObjects',
    { objects: [{ name: 'SAPMV45A', type: 'PROG/P' }] },
    { objects: [{ name: 'ZSAPKIT_DEMO', type: 'PROG/P' }] },
  ],
];

describe('기존 15종의 거부 동작이 회귀하지 않는다', () => {
  it.each(LEGACY_15.map(([name]) => name))('%s가 선언에서 뽑힌 검사 대상에 들어 있다', (name) => {
    expect(Object.keys(TARGET_NAME_EXTRACTORS)).toContain(name);
  });

  it.each(LEGACY_15)('%s — 표준 대상은 SAP 호출 전에 거부된다', (name, standardArgs) => {
    const offenders = checkSourceNamespace(scenarioOf({ tool: name, args: standardArgs }), {});
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain(name);
  });

  it.each(LEGACY_15)('%s — 고객 대상(Z·Y)은 통과한다', (name, _standardArgs, customerArgs) => {
    expect(checkSourceNamespace(scenarioOf({ tool: name, args: customerArgs }), {})).toEqual([]);
  });
});

// ── ⓒ 아직 안 지은 도구 · 선언 없는 도구는 막지 않는다 ───────────────────────

/**
 * 이 절의 예시는 **실물 도구 이름이 아니다.**
 *
 * 그동안 이 자리에는 "신 엔진이 아직 안 지은 도구"의 실물 이름을 넣어 왔다
 * (`ReadTable` → `DeleteTable`·`DeleteClass`·`ReadPackage`·`UpdateDomain`으로
 * 차례로 물러났다 — 그 도구들이 지어질 때마다 선언이 생겨 예시가 깨졌기 때문이다).
 * **꼬리 묶음 셋이 끝나면 안 지은 도구가 0이 되므로 그 방식은 더 이상 성립하지
 * 않는다.**
 *
 * 그래서 예시를 **구 번들에만 있는 이름**의 자리로 옮겼다. 검사기가 보는 것은
 * 등록된 도구 선언의 표이고, 그 표에 없는 이름이면 성격과 무관하게 건너뛴다 —
 * 판정의 입력은 "이 이름이 표에 있는가"뿐이므로 실물이 아니어도 같은 갈래를
 * 정확히 겨눈다. 아래 첫 단언이 그 전제(정말 표에 없다)를 함께 못 박으므로,
 * 어느 이름이 나중에 실물이 되어도 이 시험은 조용히 무의미해지지 않고 깨진다.
 */
const NOT_IN_REGISTRY = [
  'DeleteThingThatOnlyExistsInTheOldBundle',
  'ReadThingThatOnlyExistsInTheOldBundle',
  'UpdateThingThatOnlyExistsInTheOldBundle',
] as const;

describe('선언이 없는 도구는 사전 검사에서 막히지 않는다', () => {
  /**
   * 구 번들에는 있고 신 엔진에는 없는 도구들. 여기서 fail-closed로 바꾸면
   * 구 번들(도구 186종) 대상 녹화가 통째로 막힌다 — 계획서가 못 박은 자리다.
   */
  it.each(NOT_IN_REGISTRY)('%s — 애초에 검사 대상 표에 없다 (예시의 전제)', (tool) => {
    expect(Object.keys(TARGET_NAME_EXTRACTORS)).not.toContain(tool);
  });

  it.each(NOT_IN_REGISTRY)('%s — 표준 대상을 줘도 사전 검사는 통과시킨다', (tool) => {
    expect(checkSourceNamespace(scenarioOf({ tool, args: { object_name: 'MARA' } }), {})).toEqual([]);
  });

  it('지어진 삭제 도구는 반대로 **사전 검사가 막는다** — 이 판이 사전 검사를 지은 이유', () => {
    // 실물 `Delete*`가 검사 대상이 되었다는 것이 위 예시가 물러난 사유다.
    const offenders = checkSourceNamespace(
      scenarioOf({ tool: 'DeleteClass', args: { class_name: 'CL_ABAP_TYPEDESCR' } }),
      {},
    );
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain('DeleteClass');
  });

  it('신 엔진에 등록됐어도 선언이 없으면 검사 대상이 아니다 — 사후 백스톱이 계속 소유한다', () => {
    // 이 넷은 일부러 선언하지 않는다. SearchObject는 표준 마스크를 받는 것이
    // 정상 사용이고(`harness/scenarios/example-read-only.json`), CheckSyntax는
    // `source_code` 인자로 표준 원본이 실려 올 수 있어 백스톱이 계속 봐야 한다.
    for (const tool of ['SearchObject', 'CheckSyntax', 'GetInactiveObjects', 'GetSqlQuery']) {
      expect(Object.keys(TARGET_NAME_EXTRACTORS)).not.toContain(tool);
    }
  });

  it('선언 없는 도구가 원본 소스를 실어 오면 사후 백스톱이 잡는다', () => {
    // 여기도 같은 이유로 실물 이름(`DeleteTable`)에서 물러났다 — 그 도구가 선언을
    // 갖게 되면 백스톱은 그것을 **건너뛰는 것이 옳고**, 그러면 이 시험이 겨누던
    // 갈래(선언 없는 도구)가 통째로 사라진다.
    const tool = NOT_IN_REGISTRY[0];
    const problems = detectUnguardedSource(fixtureOf({ tool, response: { source: ABAP_SOURCE } }), {});
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(tool);
  });

  it('선언 없는 도구의 인자에 원본 소스가 실려도 잡는다', () => {
    const problems = detectUnguardedSource(fixtureOf({ tool: 'CheckSyntax', args: { source_code: ABAP_SOURCE } }), {});
    expect(problems).toHaveLength(1);
  });

  it('선언을 가진 도구는 백스톱이 건너뛴다 — 이미 네임스페이스로 제한됐다', () => {
    expect(
      detectUnguardedSource(fixtureOf({ tool: 'GetClass', response: { source: ABAP_SOURCE } }), {}),
    ).toEqual([]);
  });
});

// ── 선언 해석 규칙 ───────────────────────────────────────────────────────────

describe('선언 해석', () => {
  it('배열 인자는 선언한 원소 키에서 이름을 뽑는다 — 도구마다 키가 다르다', () => {
    // GrepObjects는 object_name, ActivateObjects는 name이다. 키를 섞으면 못 뽑는다.
    expect(
      checkSourceNamespace(scenarioOf({ tool: 'GrepObjects', args: { objects: [{ name: 'ZCL_X' }] } }), {}),
    ).toHaveLength(1);
    expect(
      checkSourceNamespace(scenarioOf({ tool: 'ActivateObjects', args: { objects: [{ object_name: 'ZCL_X' }] } }), {}),
    ).toHaveLength(1);
  });

  it('배열 원소가 문자열이면 원소 자체를 이름으로 본다', () => {
    expect(checkSourceNamespace(scenarioOf({ tool: 'ActivateObjects', args: { objects: ['ZSAPKIT_DEMO'] } }), {})).toEqual([]);
    expect(
      checkSourceNamespace(scenarioOf({ tool: 'ActivateObjects', args: { objects: ['SAPMV45A'] } }), {}),
    ).toHaveLength(1);
  });

  it('이름을 하나도 못 뽑으면 막는다 (fail-closed) — 인자 이름이 어긋났다는 뜻이다', () => {
    const offenders = checkSourceNamespace(scenarioOf({ tool: 'UpdateProgram', args: {} }), {});
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain('대상 객체 이름을 하나도 찾지 못했다');
  });

  it('선택 인자가 비어 있는 것은 위반이 아니다 — 하나라도 뽑히면 된다', () => {
    // UpdateInclude.main_program은 선택이다.
    expect(
      checkSourceNamespace(scenarioOf({ tool: 'UpdateInclude', args: { include_name: 'ZSAPKIT_INC', source_code: 'X' } }), {}),
    ).toEqual([]);
  });

  it('한 단계에 어긋난 이름이 둘이면 둘 다 보고한다', () => {
    const offenders = checkSourceNamespace(
      scenarioOf({
        tool: 'GetSourceDiff',
        args: { object_type_a: 'CLAS', object_name_a: 'CL_A', object_type_b: 'CLAS', object_name_b: 'CL_B' },
      }),
      {},
    );
    expect(offenders).toHaveLength(2);
  });

  it('선언은 도구 정의에서 온다 — 가짜 도구 하나로도 검사기가 만들어진다', () => {
    const fake = defineTool(
      {
        name: 'FakeDeleteThing',
        description: 'fake',
        inputSchema: { thing_name: z.string() },
        available_in: ['onprem'],
        sets: ['high'],
        kind: 'mutation',
        targetNames: ['thing_name'],
      },
      () => ({ isError: false, content: [] }),
    );
    const extractors = buildTargetNameExtractors([fake]);
    expect(Object.keys(extractors)).toEqual(['FakeDeleteThing']);
    expect(checkSourceNamespace(scenarioOf({ tool: 'FakeDeleteThing', args: { thing_name: 'MARA' } }), { extractors })).toHaveLength(1);
    expect(checkSourceNamespace(scenarioOf({ tool: 'FakeDeleteThing', args: { thing_name: 'ZMARA' } }), { extractors })).toEqual([]);
  });

  it('빈 선언은 검사 대상을 만들지 않는다 — 고객 네임스페이스 대상이 없다는 명시다', () => {
    const fake = defineTool(
      {
        name: 'FakeReleaseTransport',
        description: 'fake',
        inputSchema: { transport_number: z.string() },
        available_in: ['onprem'],
        sets: ['high'],
        kind: 'mutation',
        targetNames: [],
      },
      () => ({ isError: false, content: [] }),
    );
    expect(Object.keys(buildTargetNameExtractors([fake]))).toEqual([]);
  });
});

// ── 네임스페이스 판정 · 우회 스위치 ──────────────────────────────────────────

describe('네임스페이스 판정', () => {
  it.each(['ZCL_X', 'Y_FOO', 'zcl_x', '/SAPKIT/ZFOO'])('%s는 고객 객체다', (name) => {
    expect(isCustomerObject(name)).toBe(true);
  });

  it.each(['MARA', 'CL_ABAP_TYPEDESCR', '/SAPKIT/FOO', ''])('%s는 고객 객체가 아니다', (name) => {
    expect(isCustomerObject(name)).toBe(false);
  });

  it('--allow-standard-source는 두 검사를 모두 끈다', () => {
    expect(
      checkSourceNamespace(scenarioOf({ tool: 'GetClass', args: { class_name: 'CL_ABAP_TYPEDESCR' } }), {
        allowStandardSource: true,
      }),
    ).toEqual([]);
    expect(
      detectUnguardedSource(fixtureOf({ tool: 'ReadTable', response: { source: ABAP_SOURCE } }), {
        allowStandardSource: true,
      }),
    ).toEqual([]);
  });
});
