/**
 * `ReadInterface` — 발행 계약 · 두 왕복의 와이어 · **실패를 성공으로 답하는** 계약.
 *
 * 이 도구의 성격은 세 번째다. 구는 소스와 메타데이터를 각각 `try/catch`로 감싸
 * 실패를 `logger.warn`으로만 남기고 그 자리에 `null`을 채운 뒤 언제나
 * `success: true`로 답한다(`engine/src/handlers/interface/readonly/handleReadInterface.ts:46-89`).
 * 마지막 절이 **`GetInterface` ↔ `ReadInterface`의 차이**를 못박는다. 둘은 이름이
 * 닮았고 같은 오브젝트를 읽지만 계약이 다르며, 대충 같게 지으면 그 차이가 조용히
 * 사라진다. 두 도구를 **같은 가짜 전송에 나란히 물려** 실측으로 가른다.
 */

import { getInterface } from '../getInterface';
import { readInterface } from '../readInterface';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const SOURCE = 'INTERFACE zif_test PUBLIC.\n  METHODS run.\nENDINTERFACE.';
const METADATA =
  '<?xml version="1.0" encoding="UTF-8"?><intf:abapInterface xmlns:intf="http://www.sap.com/adt/oo/interfaces" adtcore:name="ZIF_TEST"/>';

const SOURCE_URL = `${TEST_ORIGIN}/sap/bc/adt/oo/interfaces/ZIF_TEST/source/main?version=active`;
const METADATA_URL = `${TEST_ORIGIN}/sap/bc/adt/oo/interfaces/ZIF_TEST`;

/** 소스 요청과 메타데이터 요청을 갈라 답하는 전송. */
function replyBoth(source: { status?: number; body?: string }, metadata: { status?: number; body?: string }) {
  return (request: { url: string }) => (request.url.includes('/source/main') ? source : metadata);
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(readInterface);
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
      }).toEqual(publishedDeclaration('ReadInterface'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/interface/readonly/` → 채록본의 네 조건 전부에 뜬다
    // (`*_readonly` 포함) → readonly 집합.
    expect(readInterface.definition.sets).toEqual(['readonly']);
    expect(readInterface.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(readInterface.definition.kind).toBe('read');
    expect(readInterface.definition.targetNames).toEqual(['interface_name']);
  });
});

describe('와이어 — 두 왕복', () => {
  it('소스와 메타데이터를 구와 같은 경로·Accept로 차례로 읽는다', async () => {
    const { outcome, requests } = await runTool(
      readInterface,
      { interface_name: 'zif_test' },
      replyBoth({ body: SOURCE }, { body: METADATA }),
    );

    expect(requests).toHaveLength(2);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(SOURCE_URL);
    expect(requests[0]?.headers['Accept']).toBe('text/plain');

    expect(requests[1]?.method).toBe('GET');
    // 메타데이터는 질의 인자가 없다 — 구가 version도 withLongPolling도 넘기지 않는다.
    expect(requests[1]?.url).toBe(METADATA_URL);
    expect(requests[1]?.headers['Accept']).toBe(
      'application/vnd.sap.adt.oo.interfaces.v5+xml, application/vnd.sap.adt.oo.interfaces.v4+xml, application/vnd.sap.adt.oo.interfaces.v3+xml, application/vnd.sap.adt.oo.interfaces.v2+xml, application/vnd.sap.adt.oo.interfaces+xml',
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      interface_name: 'ZIF_TEST',
      version: 'active',
      source_code: SOURCE,
      metadata: METADATA,
    });
  });

  it('version=inactive는 소스 요청에만 붙는다', async () => {
    const { requests } = await runTool(
      readInterface,
      { interface_name: 'ZIF_TEST', version: 'inactive' },
      replyBoth({ body: SOURCE }, { body: METADATA }),
    );

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/oo/interfaces/ZIF_TEST/source/main?version=inactive`,
    );
    expect(requests[1]?.url).toBe(METADATA_URL);
  });
});

describe('실패를 성공으로 답한다 (구 계약)', () => {
  it('소스만 못 읽으면 source_code가 null이고 메타데이터는 그대로 실린다', async () => {
    const { outcome, requests } = await runTool(
      readInterface,
      { interface_name: 'zif_test' },
      replyBoth({ status: 404, body: '' }, { body: METADATA }),
    );

    // 첫 왕복이 죽어도 둘째를 포기하지 않는다.
    expect(requests).toHaveLength(2);
    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      interface_name: 'ZIF_TEST',
      version: 'active',
      source_code: null,
      metadata: METADATA,
    });
  });

  it('메타데이터만 못 읽으면 metadata가 null이다', async () => {
    const { outcome } = await runTool(
      readInterface,
      { interface_name: 'zif_test' },
      replyBoth({ body: SOURCE }, { status: 500, body: 'boom' }),
    );

    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text) as Record<string, unknown>;
    expect(payload.source_code).toBe(SOURCE);
    expect(payload.metadata).toBeNull();
  });

  it('빈 본문은 빈 문자열이 아니라 null이다 — 구의 `if (data)`', async () => {
    const { outcome } = await runTool(
      readInterface,
      { interface_name: 'zif_test' },
      replyBoth({ body: '' }, { body: '' }),
    );

    const payload = JSON.parse(outcome.text) as Record<string, unknown>;
    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBeNull();
  });
});

describe('GetInterface ↔ ReadInterface — 같은 오브젝트, 다른 계약', () => {
  const both = async (reply: Parameters<typeof runTool>[2]) => {
    const get = await runTool(getInterface, { interface_name: 'zif_test' }, reply);
    const read = await runTool(readInterface, { interface_name: 'zif_test' }, reply);
    return { get, read };
  };

  it('왕복 수가 다르다 — Get은 소스만, Read는 소스+메타데이터', async () => {
    const { get, read } = await both(() => ({ body: SOURCE }));

    expect(get.requests.map((request) => request.url)).toEqual([SOURCE_URL]);
    expect(read.requests.map((request) => request.url)).toEqual([SOURCE_URL, METADATA_URL]);
  });

  it('소스를 담는 필드 이름이 다르다', async () => {
    const { get, read } = await both(() => ({ body: SOURCE }));

    expect(Object.keys(JSON.parse(get.outcome.text) as object).sort()).toEqual([
      'interface_data',
      'interface_name',
      'status',
      'status_text',
      'success',
      'version',
    ]);
    expect(Object.keys(JSON.parse(read.outcome.text) as object).sort()).toEqual([
      'interface_name',
      'metadata',
      'source_code',
      'success',
      'version',
    ]);
  });

  it('읽기 실패의 처리가 정반대다 — Get은 오류, Read는 성공 + null', async () => {
    const { get, read } = await both(() => ({ status: 404, body: '' }));

    expect(get.outcome.isError).toBe(true);
    expect(get.outcome.text).toBe(
      'Error: Failed to read interface: Interface ZIF_TEST not found',
    );
    expect(read.outcome.isError).toBe(false);
    expect(JSON.parse(read.outcome.text)).toEqual({
      success: true,
      interface_name: 'ZIF_TEST',
      version: 'active',
      source_code: null,
      metadata: null,
    });
  });

  it('노출 집합이 다르다 — Read만 읽기 전용 표면에 뜬다', () => {
    expect(getInterface.definition.sets).toEqual(['high']);
    expect(readInterface.definition.sets).toEqual(['readonly']);
  });
});
