/**
 * `ReadBehaviorDefinition` — 발행 계약 · 와이어 · 갈래 · **짝 대조**.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.ReadBehaviorDefinition`
 *  - 흐름:
 *    `engine/src/handlers/behavior_definition/readonly/handleReadBehaviorDefinition.ts:32-100`
 *  - 두 엔드포인트:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/behaviorDefinition/AdtBehaviorDefinition.js:154-208`
 *    → `.../core/behaviorDefinition/read.js:29-41`(메타데이터) · `:59-71`(소스)
 *  - 메타데이터의 `Accept`: `.../constants/contentTypes.js:100`의 `CT_BEHAVIOR_DEFINITION`
 */

import { getBehaviorDefinition } from '../getBehaviorDefinition';
import { readBehaviorDefinition } from '../readBehaviorDefinition';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

const BDEF_SOURCE = 'managed implementation in class zbp_i_demo unique;\n';
const BDEF_META =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" adtcore:name="Z_MY_BDEF"/>';

const CT_BEHAVIOR_DEFINITION = 'application/vnd.sap.adt.blues.v1+xml';

afterEach(() => {
  cleanupTempDirs();
});

interface Payload {
  success: boolean;
  behavior_definition_name: string;
  version: string;
  source_code: string | null;
  metadata: string | null;
}

/** 소스 → 메타데이터 순으로 답한다. */
function bothOk() {
  return (_request: unknown, index: number) => ({
    body: index === 0 ? BDEF_SOURCE : BDEF_META,
  });
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(readBehaviorDefinition);
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
      }).toEqual(publishedDeclaration('ReadBehaviorDefinition'));
    } finally {
      await harness.close();
    }
  });

  it('구 `readonly/` 자리 그대로 — 채록본의 네 노출 조건 전부에 뜬다', () => {
    expect(readBehaviorDefinition.definition.sets).toEqual(['readonly']);
    expect(readBehaviorDefinition.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(readBehaviorDefinition.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('**서로 다른 두 엔드포인트**로 GET을 두 번 보낸다', async () => {
    const { requests } = await runTool(
      readBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      bothOk(),
    );

    expect(requests).toHaveLength(2);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/bo/behaviordefinitions/z_my_bdef/source/main?version=active`,
    );
    expect(requests[0]?.headers['Accept']).toBe('text/plain');

    expect(requests[1]?.method).toBe('GET');
    expect(requests[1]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/bo/behaviordefinitions/z_my_bdef?version=inactive`,
    );
    expect(requests[1]?.headers['Accept']).toBe(CT_BEHAVIOR_DEFINITION);
  });

  it('메타데이터 요청의 version은 **인자를 따르지 않고 늘 inactive**다', async () => {
    const { outcome, requests } = await runTool(
      readBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF', version: 'active' },
      bothOk(),
    );

    expect(requests[0]?.url).toContain('/source/main?version=active');
    expect(requests[1]?.url).toContain('?version=inactive');
    expect((JSON.parse(outcome.text) as Payload).version).toBe('active');
  });

  it('version=inactive면 소스 요청만 따라 바뀐다', async () => {
    const { requests } = await runTool(
      readBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF', version: 'inactive' },
      bothOk(),
    );

    expect(requests[0]?.url).toContain('/source/main?version=inactive');
    expect(requests[1]?.url).toContain('?version=inactive');
  });
});

describe('응답 조립', () => {
  it('구와 같은 필드로, 두 칸 들여쓰기로 낸다', async () => {
    const { outcome } = await runTool(
      readBehaviorDefinition,
      { behavior_definition_name: 'z_my_bdef' },
      bothOk(),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      behavior_definition_name: 'Z_MY_BDEF',
      version: 'active',
      source_code: BDEF_SOURCE,
      metadata: BDEF_META,
    });
    expect(outcome.text.split('\n')[1]).toBe('  "success": true,');
  });
});

describe('갈래 — 실패를 삼킨다', () => {
  it('소스가 404여도 성공으로 답하고 source_code만 null이다', async () => {
    const { outcome } = await runTool(
      readBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      (_request, index) =>
        index === 0 ? { status: 404, body: '' } : { status: 200, body: BDEF_META },
    );

    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.success).toBe(true);
    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBe(BDEF_META);
  });

  it('메타데이터가 404여도 성공으로 답하고 metadata만 null이다', async () => {
    const { outcome, requests } = await runTool(
      readBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      (_request, index) =>
        index === 0 ? { status: 200, body: BDEF_SOURCE } : { status: 404, body: '' },
    );

    // 메타데이터 감싸개에는 404 삼킴이 없다 — 던지고, 핸들러가 warn으로 접는다.
    expect(requests).toHaveLength(2);
    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.source_code).toBe(BDEF_SOURCE);
    expect(payload.metadata).toBeNull();
  });

  it('둘 다 실패해도 success:true다 (구가 고른 갈래)', async () => {
    const { outcome } = await runTool(
      readBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      () => ({ status: 500, body: 'boom' }),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      behavior_definition_name: 'Z_MY_BDEF',
      version: 'active',
      source_code: null,
      metadata: null,
    });
  });

  it('빈 본문은 null이다 — 구의 falsy 판정 그대로', async () => {
    const { outcome } = await runTool(
      readBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      () => ({ status: 200, body: '' }),
    );

    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBeNull();
  });

  it('빈 이름은 요청을 보내기 전에 거부된다', async () => {
    const { outcome, requests } = await runTool(
      readBehaviorDefinition,
      { behavior_definition_name: '' },
      bothOk(),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: behavior_definition_name is required');
    expect(requests).toHaveLength(0);
  });
});

describe('짝 대조 — `Get*`와 `Read*`는 다른 도구다', () => {
  it('요청 수·엔드포인트가 다르다 (Get 1회 · Read 2회)', async () => {
    const get = await runTool(
      getBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      () => ({ body: BDEF_SOURCE }),
    );
    const read = await runTool(
      readBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      bothOk(),
    );

    expect(get.requests).toHaveLength(1);
    expect(read.requests).toHaveLength(2);
    // Get이 보내지 않는 요청 = 메타데이터 엔드포인트
    expect(get.requests.map((r) => r.url)).not.toContain(read.requests[1]?.url);
  });

  it('같은 404에서 Get은 오류, Read는 성공이다', async () => {
    const get = await runTool(
      getBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      () => ({ status: 404, body: '' }),
    );
    const read = await runTool(
      readBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      () => ({ status: 404, body: '' }),
    );

    expect(get.outcome.isError).toBe(true);
    expect(read.outcome.isError).toBe(false);
  });

  it('응답 필드 이름이 겹치지 않는다', async () => {
    const get = await runTool(
      getBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      () => ({ body: BDEF_SOURCE }),
    );
    const read = await runTool(
      readBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      bothOk(),
    );

    expect(Object.keys(JSON.parse(get.outcome.text) as object).sort()).toEqual([
      'behavior_definition_data',
      'behavior_definition_name',
      'status',
      'status_text',
      'success',
      'version',
    ]);
    expect(Object.keys(JSON.parse(read.outcome.text) as object).sort()).toEqual([
      'behavior_definition_name',
      'metadata',
      'source_code',
      'success',
      'version',
    ]);
  });

  it('노출 집합이 다르다 — Get은 high, Read는 readonly', () => {
    expect(getBehaviorDefinition.definition.sets).toEqual(['high']);
    expect(readBehaviorDefinition.definition.sets).toEqual(['readonly']);
  });
});
