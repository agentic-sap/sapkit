/**
 * `CreateCdsUnitTest` — 발행 계약 · **와이어가 비어 있다는 실측** · 갈래.
 *
 * 기대값의 출처는 구현이 아니라 구 엔진이다:
 *  - 발행 선언 → 채록본 `harness/old-surface/m1-tools.json`의 `tools`
 *  - 두 오류 문구 → 구 핸들러
 *    `engine/src/handlers/unit_test/high/handleCreateCdsUnitTest.ts:80-86, 138-143`
 *    와 벤더 `.../dist/core/unitTest/AdtCdsUnitTest.js:82-84, 129-133`
 *  - **요청 0건** → 그 두 파일을 이어 읽으면 SAP 왕복이 시작되기 전에 던진다는 것이
 *    나온다. 이 시험이 그 사실을 못 박는다.
 */

import { CDS_UNIT_TEST_CREATE_UNREACHABLE, createCdsUnitTest } from '../createCdsUnitTest';
import { publish, publishedDeclaration } from './classPublication';
import { invoke, startWriteHarness, textOf } from './harness';
import type { WriteHarness } from './harness';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

/** 어떤 요청이 와도 터뜨린다 — 이 도구는 한 건도 보내면 안 된다. */
const forbidAll = ((request, response) => {
  response.statusCode = 500;
  response.end(`이 도구는 SAP에 요청을 보내지 않는다: ${request.method} ${request.url}`);
}) as Parameters<typeof startWriteHarness>[0];

const ARGS = {
  class_name: 'zcl_cds_test',
  package_name: '$TMP',
  cds_view_name: 'z_cds_view',
};

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publish(createCdsUnitTest)).toEqual(publishedDeclaration('CreateCdsUnitTest'));
  });

  it('노출·정책 선언 — default 두 집합, mutation, 대상 이름 선언 필수', () => {
    expect(createCdsUnitTest.definition.sets).toEqual(['high']);
    expect(createCdsUnitTest.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(createCdsUnitTest.definition.kind).toBe('mutation');
    expect(createCdsUnitTest.definition.targetNames).toEqual(['class_name']);
  });

  it('발행 스키마에 class_template·test_class_source가 **없다** — 이 도구가 죽어 있는 이유', async () => {
    const published = (await publish(createCdsUnitTest)).inputSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };

    expect(Object.keys(published.properties).sort()).toEqual([
      'cds_view_name',
      'class_name',
      'description',
      'package_name',
      'transport_request',
    ]);
    expect(published.required.sort()).toEqual(['cds_view_name', 'class_name', 'package_name']);
  });
});

describe('와이어 — 한 건도 나가지 않는다', () => {
  it('정상 인자를 줘도 SAP 요청이 0건이고 구의 문구로 거절한다', async () => {
    harness = await startWriteHarness(forbidAll);
    const result = await invoke(createCdsUnitTest, harness, ARGS);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`Error: ${CDS_UNIT_TEST_CREATE_UNREACHABLE}`);
    expect(harness.calls()).toHaveLength(0);
  });

  it('선택 인자를 다 채워도 결과가 같다 — 생성 가지에 닿는 통로가 없다', async () => {
    harness = await startWriteHarness(forbidAll);
    const result = await invoke(createCdsUnitTest, harness, {
      ...ARGS,
      description: 'CDS unit test',
      transport_request: 'E19K905635',
    });

    expect(textOf(result)).toBe(
      'Error: At least one test definition is required for test run',
    );
    expect(harness.calls()).toHaveLength(0);
  });

  it('스키마 밖 인자(class_template·test_class_source)는 핸들러에 닿아도 갈림을 못 바꾼다', async () => {
    // 발행 표면에서는 zod가 이 둘을 버리므로 실제로는 닿지도 않는다. 그래도
    // 직접 넘겨 보고 결과가 같은지 확인한다 — "몰래 실어 보내면 살아난다"는
    // 오해를 여기서 끊는다.
    harness = await startWriteHarness(forbidAll);
    const result = await invoke(createCdsUnitTest, harness, {
      ...ARGS,
      class_template: 'CLASS zcl_x DEFINITION.',
      test_class_source: 'CLASS ltcl_x DEFINITION.',
    });

    expect(textOf(result)).toBe(`Error: ${CDS_UNIT_TEST_CREATE_UNREACHABLE}`);
    expect(harness.calls()).toHaveLength(0);
  });
});

describe('갈래 — 필수 인자', () => {
  it.each([
    ['class_name', { ...ARGS, class_name: '' }],
    ['package_name', { ...ARGS, package_name: '' }],
    ['cds_view_name', { ...ARGS, cds_view_name: '' }],
  ])('%s가 비면 구의 한 문구로 거절한다', async (_name, args) => {
    harness = await startWriteHarness(forbidAll);
    const result = await invoke(createCdsUnitTest, harness, args);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Missing required parameters: class_name, package_name, cds_view_name',
    );
    expect(harness.calls()).toHaveLength(0);
  });

  it('필수 인자 검사가 **접속보다 앞**이다 — 빈 인자는 접속을 열지 않는다', async () => {
    let connections = 0;
    harness = await startWriteHarness(forbidAll);
    const counting = {
      ...harness.context,
      getConnection: async () => {
        connections += 1;
        return harness.client;
      },
    };
    const result = await createCdsUnitTest.handler(counting, { ...ARGS, class_name: '' });

    expect(result.isError).toBe(true);
    expect(connections).toBe(0);
  });
});
