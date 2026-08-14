/**
 * `ReadBehaviorImplementation` — 발행 계약 · 와이어 · 갈래 · **짝 대조 둘**.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.ReadBehaviorImplementation`
 *  - 흐름:
 *    `engine/src/handlers/behavior_implementation/readonly/handleReadBehaviorImplementation.ts:32-103`
 *  - 두 엔드포인트:
 *    `@babamba2/.../core/behaviorImplementation/AdtBehaviorImplementation.js:121-174`
 *    → `.../core/behaviorImplementation/read.js:55-66`
 *    → `.../core/shared/AdtUtils.js:269-293`(메타데이터) · `:306-327`(소스)
 *  - 메타데이터 `Accept`: `AdtUtils.js:700-704`가 고르는 `ACCEPT_CLASS`
 *    (`constants/contentTypes.js:63`)
 */

import { getBehaviorImplementation } from '../getBehaviorImplementation';
import { readBehaviorDefinition } from '../readBehaviorDefinition';
import { readBehaviorImplementation } from '../readBehaviorImplementation';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

const BIMP_SOURCE = 'CLASS zbp_i_demo DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF zi_demo.\n';
const BIMP_META =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes" adtcore:name="ZBP_I_DEMO"/>';

const ACCEPT_CLASS =
  'application/vnd.sap.adt.oo.classes.v4+xml, application/vnd.sap.adt.oo.classes.v3+xml, ' +
  'application/vnd.sap.adt.oo.classes.v2+xml, application/vnd.sap.adt.oo.classes.v1+xml';

afterEach(() => {
  cleanupTempDirs();
});

interface Payload {
  success: boolean;
  behavior_implementation_name: string;
  version: string;
  source_code: string | null;
  metadata: string | null;
}

function bothOk() {
  return (_request: unknown, index: number) => ({
    body: index === 0 ? BIMP_SOURCE : BIMP_META,
  });
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(readBehaviorImplementation);
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
      }).toEqual(publishedDeclaration('ReadBehaviorImplementation'));
    } finally {
      await harness.close();
    }
  });

  it('구 `readonly/` 자리 그대로 — 채록본의 네 노출 조건 전부에 뜬다', () => {
    expect(readBehaviorImplementation.definition.sets).toEqual(['readonly']);
    expect(readBehaviorImplementation.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(readBehaviorImplementation.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('GET 두 번 — 메타데이터에는 **질의 인자가 하나도 붙지 않는다**', async () => {
    const { requests } = await runTool(
      readBehaviorImplementation,
      { behavior_implementation_name: 'ZBP_I_DEMO' },
      bothOk(),
    );

    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZBP_I_DEMO/source/main?version=active`,
    );
    expect(requests[0]?.headers['Accept']).toBe('text/plain');

    expect(requests[1]?.url).toBe(`${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZBP_I_DEMO`);
    expect(requests[1]?.url).not.toContain('?');
    expect(requests[1]?.headers['Accept']).toBe(ACCEPT_CLASS);
  });

  it('version은 소스 요청에만 실린다', async () => {
    const { requests } = await runTool(
      readBehaviorImplementation,
      { behavior_implementation_name: 'ZBP_I_DEMO', version: 'inactive' },
      bothOk(),
    );

    expect(requests[0]?.url).toContain('?version=inactive');
    expect(requests[1]?.url).not.toContain('version');
  });
});

describe('응답 조립', () => {
  it('구와 같은 필드로, 두 칸 들여쓰기로 낸다', async () => {
    const { outcome } = await runTool(
      readBehaviorImplementation,
      { behavior_implementation_name: 'zbp_i_demo' },
      bothOk(),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      behavior_implementation_name: 'ZBP_I_DEMO',
      version: 'active',
      source_code: BIMP_SOURCE,
      metadata: BIMP_META,
    });
    expect(outcome.text.split('\n')[1]).toBe('  "success": true,');
  });
});

describe('갈래 — 실패를 삼킨다', () => {
  it('소스 404는 조용히 null이 되고 메타데이터는 살아 있다', async () => {
    const { outcome } = await runTool(
      readBehaviorImplementation,
      { behavior_implementation_name: 'ZBP_I_DEMO' },
      (_request, index) =>
        index === 0 ? { status: 404, body: '' } : { status: 200, body: BIMP_META },
    );

    const payload = JSON.parse(outcome.text) as Payload;
    expect(outcome.isError).toBe(false);
    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBe(BIMP_META);
  });

  it('둘 다 실패해도 success:true다', async () => {
    const { outcome } = await runTool(
      readBehaviorImplementation,
      { behavior_implementation_name: 'ZBP_I_DEMO' },
      () => ({ status: 500, body: 'boom' }),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      behavior_implementation_name: 'ZBP_I_DEMO',
      version: 'active',
      source_code: null,
      metadata: null,
    });
  });

  it('빈 이름은 요청을 보내기 전에 거부된다', async () => {
    const { outcome, requests } = await runTool(
      readBehaviorImplementation,
      { behavior_implementation_name: '' },
      bothOk(),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: behavior_implementation_name is required');
    expect(requests).toHaveLength(0);
  });
});

describe('짝 대조 ① — `Get*`와 `Read*`', () => {
  it('Get은 1회·오류로 올리고, Read는 2회·삼킨다', async () => {
    const get = await runTool(
      getBehaviorImplementation,
      { behavior_implementation_name: 'ZBP_I_DEMO' },
      () => ({ status: 404, body: '' }),
    );
    const read = await runTool(
      readBehaviorImplementation,
      { behavior_implementation_name: 'ZBP_I_DEMO' },
      () => ({ status: 404, body: '' }),
    );

    expect(get.requests).toHaveLength(1);
    expect(get.outcome.isError).toBe(true);
    expect(read.requests).toHaveLength(2);
    expect(read.outcome.isError).toBe(false);
  });
});

describe('짝 대조 ② — BDEF와 BIMP의 `Read*`', () => {
  it('메타데이터 요청의 주소·Accept·질의 인자가 전부 다르다', async () => {
    const bdef = await runTool(
      readBehaviorDefinition,
      { behavior_definition_name: 'Z_DEMO' },
      bothOk(),
    );
    const bimp = await runTool(
      readBehaviorImplementation,
      { behavior_implementation_name: 'Z_DEMO' },
      bothOk(),
    );

    expect(bdef.requests[1]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/bo/behaviordefinitions/z_demo?version=inactive`,
    );
    expect(bdef.requests[1]?.headers['Accept']).toBe('application/vnd.sap.adt.blues.v1+xml');

    expect(bimp.requests[1]?.url).toBe(`${TEST_ORIGIN}/sap/bc/adt/oo/classes/Z_DEMO`);
    expect(bimp.requests[1]?.headers['Accept']).toBe(ACCEPT_CLASS);
  });
});
