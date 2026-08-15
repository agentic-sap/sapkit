/**
 * `GetBehaviorImplementation` — 발행 계약 · 와이어 · 갈래 · **BDEF 대조**.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.GetBehaviorImplementation`
 *  - 흐름·오류 문구:
 *    `engine/src/handlers/behavior_implementation/high/handleGetBehaviorImplementation.ts:51-132`
 *  - 주소: `@babamba2/.../core/behaviorImplementation/read.js:64-66` →
 *    `.../core/shared/AdtUtils.js:306-327`·`:743-748`
 *    (`/sap/bc/adt/oo/classes/{encodeSapObjectName(NAME)}/source/main?version=…`)
 *  - 404 삼킴: `.../core/behaviorImplementation/AdtBehaviorImplementation.js:133-137`
 */

import { getBehaviorDefinition } from '../getBehaviorDefinition';
import { getBehaviorImplementation } from '../getBehaviorImplementation';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

const BIMP_SOURCE =
  'CLASS zbp_i_demo DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF zi_demo.\nENDCLASS.\n';

afterEach(() => {
  cleanupTempDirs();
});

interface Payload {
  success: boolean;
  behavior_implementation_name: string;
  version: string;
  behavior_implementation_data: string;
  status: number;
  status_text: string;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getBehaviorImplementation);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as {
        name: string;
        description: string;
        inputSchema: unknown;
        execution: unknown;
      };

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetBehaviorImplementation'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리와 available_in을 그대로 옮겼다', () => {
    expect(getBehaviorImplementation.definition.sets).toEqual(['high']);
    expect(getBehaviorImplementation.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getBehaviorImplementation.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('**클래스** 소스 엔드포인트로 GET 한 번 — 이름은 대문자 그대로다', async () => {
    const { requests } = await runTool(
      getBehaviorImplementation,
      { behavior_implementation_name: 'ZBP_I_DEMO' },
      () => ({ body: BIMP_SOURCE }),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZBP_I_DEMO/source/main?version=active`,
    );
    expect(requests[0]?.headers['Accept']).toBe('text/plain');
  });

  it('version=inactive는 요청에 실린다', async () => {
    const { outcome, requests } = await runTool(
      getBehaviorImplementation,
      { behavior_implementation_name: 'ZBP_I_DEMO', version: 'inactive' },
      () => ({ body: BIMP_SOURCE }),
    );

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZBP_I_DEMO/source/main?version=inactive`,
    );
    expect((JSON.parse(outcome.text) as Payload).version).toBe('inactive');
  });

  it('이름은 대문자로 정규화되고 **인코딩된다** (BDEF와 다른 자리)', async () => {
    const { outcome, requests } = await runTool(
      getBehaviorImplementation,
      { behavior_implementation_name: '/ns/zbp_demo' },
      () => ({ body: BIMP_SOURCE }),
    );

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/oo/classes/%2FNS%2FZBP_DEMO/source/main?version=active`,
    );
    expect((JSON.parse(outcome.text) as Payload).behavior_implementation_name).toBe(
      '/NS/ZBP_DEMO',
    );
  });
});

describe('응답 조립', () => {
  it('구와 같은 필드로, 두 칸 들여쓰기로 낸다', async () => {
    const { outcome } = await runTool(
      getBehaviorImplementation,
      { behavior_implementation_name: 'ZBP_I_DEMO' },
      () => ({ status: 200, body: BIMP_SOURCE }),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      behavior_implementation_name: 'ZBP_I_DEMO',
      version: 'active',
      behavior_implementation_data: BIMP_SOURCE,
      status: 200,
      status_text: 'OK',
    });
  });
});

describe('갈래', () => {
  it('404는 감싸개가 삼켜 빈손이 되고, 핸들러가 "찾지 못했다"로 던진다', async () => {
    const { outcome } = await runTool(
      getBehaviorImplementation,
      { behavior_implementation_name: 'ZBP_I_DEMO' },
      () => ({ status: 404, body: '' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Error: Failed to read behavior implementation: BehaviorImplementation ZBP_I_DEMO not found',
    );
  });

  it('423은 잠금 문구로 접힌다', async () => {
    const { outcome } = await runTool(
      getBehaviorImplementation,
      { behavior_implementation_name: 'ZBP_I_DEMO' },
      () => ({ status: 423, body: '' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Error: BehaviorImplementation ZBP_I_DEMO is locked by another user.',
    );
  });

  it('그 밖의 실패는 "Failed to read behavior implementation:" 접두사를 단다', async () => {
    const { outcome } = await runTool(
      getBehaviorImplementation,
      { behavior_implementation_name: 'ZBP_I_DEMO' },
      () => ({ status: 500, body: 'boom' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toMatch(/^Error: Failed to read behavior implementation: /);
  });

  it('빈 이름은 요청을 보내기 전에 거부된다', async () => {
    const { outcome, requests } = await runTool(
      getBehaviorImplementation,
      { behavior_implementation_name: '' },
      () => ({ body: BIMP_SOURCE }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: behavior_implementation_name is required');
    expect(requests).toHaveLength(0);
  });
});

describe('BDEF 대조 — 짝이지만 오브젝트 축이 다르다', () => {
  it('BDEF는 `bo/behaviordefinitions` 소문자, BIMP는 `oo/classes` 대문자다', async () => {
    const bdef = await runTool(
      getBehaviorDefinition,
      { behavior_definition_name: 'Z_DEMO' },
      () => ({ body: 'x' }),
    );
    const bimp = await runTool(
      getBehaviorImplementation,
      { behavior_implementation_name: 'Z_DEMO' },
      () => ({ body: 'x' }),
    );

    expect(bdef.requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/bo/behaviordefinitions/z_demo/source/main?version=active`,
    );
    expect(bimp.requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/oo/classes/Z_DEMO/source/main?version=active`,
    );
  });

  it('인자 이름과 응답 필드가 다르다', () => {
    expect(Object.keys(getBehaviorDefinition.definition.inputSchema)).toEqual([
      'behavior_definition_name',
      'version',
    ]);
    expect(Object.keys(getBehaviorImplementation.definition.inputSchema)).toEqual([
      'behavior_implementation_name',
      'version',
    ]);
  });
});
