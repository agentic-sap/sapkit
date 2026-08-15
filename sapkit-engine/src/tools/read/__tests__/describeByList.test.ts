/**
 * `DescribeByList` — 발행 계약 · SearchObject 재사용 · 타입 뺀 재시도 · 건너뛰기.
 *
 * 이 도구는 자기 요청을 조립하지 않으므로 와이어 시험은 **SearchObject의 것이
 * 실제로 나가는가**를 본다. 기대 경로·인자는 구
 * (`engine/src/handlers/search/readonly/handleSearchObject.ts:64-76`)와 이미 지어 둔
 * `searchObject` 모듈에서 왔다.
 *
 * 갈래 기대값은 구 핸들러
 * (`engine/src/handlers/system/readonly/handleDescribeByList.ts:64-144`)의 소스에서
 * 뽑았다. 특히 셋을 고정한다.
 *  - 타입을 준 첫 시도가 비면 **타입 없이 한 번 더** 부른다.
 *  - 두 번째도 비면 그 오브젝트만 **건너뛴다** — 목록 전체가 실패하지 않는다.
 *  - 아무것도 못 찾아도 `isError: false`에 빈 `content`다.
 */

import { describeByList } from '../describeByList';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';
import type { RecordedRequest, Reply } from './support';

const SEARCH_PATH = '/sap/bc/adt/repository/informationsystem/search';

/** ADT quickSearch가 참조 하나를 돌려줄 때의 모양. */
function referenceXml(name: string, type: string, description = 'desc'): string {
  return (
    '<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">' +
    `<adtcore:objectReference adtcore:name="${name}" adtcore:type="${type}" ` +
    `adtcore:description="${description}" adtcore:packageName="ZPKG"/>` +
    '</adtcore:objectReferences>'
  );
}

/** 아무것도 못 찾았을 때 ADT가 주는 빈 문서. */
const EMPTY_XML = '<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"/>';

afterEach(() => {
  cleanupTempDirs();
});

async function call(args: Record<string, unknown>, reply: (request: RecordedRequest) => Reply) {
  const { outcome, requests } = await runTool(describeByList, args, reply);
  const sent = toolRequests(requests);
  return {
    outcome,
    sent,
    // 각 검색 요청의 질의 인자만 뽑는다.
    queries: sent.map((request) => {
      const url = new URL(request.url);
      return {
        query: url.searchParams.get('query'),
        objectType: url.searchParams.get('objectType'),
      };
    }),
    // 응답은 오브젝트당 블록 하나다(`callTool`이 블록들을 개행으로 잇는다).
    // 오류 응답은 블록이 아니라 문구 하나이므로 풀지 않는다.
    blocks:
      outcome.isError || outcome.text === ''
        ? []
        : outcome.text.split('\n').map((line) => JSON.parse(line)),
  };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(describeByList);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('DescribeByList'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(describeByList.definition.sets).toEqual(['readonly']);
    expect(describeByList.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(describeByList.definition.kind).toBe('read');
  });
});

describe('SearchObject를 그대로 쓴다', () => {
  it('오브젝트마다 검색 경로로 한 번씩 나간다', async () => {
    const { sent, queries } = await call(
      { objects: [{ name: 'ZCL_A', type: 'CLAS/OC' }, { name: 'ZPROG_B', type: 'PROG/P' }] },
      () => ({ status: 200, body: referenceXml('X', 'CLAS/OC') }),
    );

    expect(sent).toHaveLength(2);
    expect(new URL(sent[0]?.url ?? '').pathname).toBe(SEARCH_PATH);
    expect(queries).toEqual([
      { query: 'ZCL_A', objectType: 'CLAS/OC' },
      { query: 'ZPROG_B', objectType: 'PROG/P' },
    ]);
  });

  it('오브젝트 하나가 블록 하나가 되고 results가 펼쳐진다', async () => {
    const { outcome, blocks } = await call(
      { objects: [{ name: 'ZCL_A', type: 'CLAS/OC' }] },
      () => ({ status: 200, body: referenceXml('ZCL_A', 'CLAS/OC', 'A class') }),
    );

    expect(outcome.isError).toBe(false);
    expect(blocks).toEqual([
      {
        name: 'ZCL_A',
        results: [
          { name: 'ZCL_A', type: 'CLAS/OC', description: 'A class', packageName: 'ZPKG' },
        ],
      },
    ]);
  });
});

describe('타입을 뺀 재시도', () => {
  it('타입을 준 첫 시도가 비면 타입 없이 한 번 더 부른다', async () => {
    let call1 = true;
    const { queries, blocks } = await call(
      { objects: [{ name: 'ZCL_A', type: 'WRONG/TY' }] },
      () => {
        if (call1) {
          call1 = false;
          return { status: 200, body: EMPTY_XML };
        }
        return { status: 200, body: referenceXml('ZCL_A', 'CLAS/OC') };
      },
    );

    expect(queries).toEqual([
      { query: 'ZCL_A', objectType: 'WRONG/TY' },
      // 두 번째에는 objectType이 아예 실리지 않는다.
      { query: 'ZCL_A', objectType: null },
    ]);
    expect(blocks[0].results).toHaveLength(1);
  });

  it('두 번째도 비면 그 오브젝트만 건너뛰고 나머지는 살린다', async () => {
    const { queries, blocks } = await call(
      {
        objects: [
          { name: 'ZNOPE', type: 'CLAS/OC' },
          { name: 'ZCL_OK', type: 'CLAS/OC' },
        ],
      },
      (request) =>
        new URL(request.url).searchParams.get('query') === 'ZNOPE'
          ? { status: 200, body: EMPTY_XML }
          : { status: 200, body: referenceXml('ZCL_OK', 'CLAS/OC') },
    );

    // ZNOPE는 두 번(타입 있음/없음), ZCL_OK는 한 번.
    expect(queries).toEqual([
      { query: 'ZNOPE', objectType: 'CLAS/OC' },
      { query: 'ZNOPE', objectType: null },
      { query: 'ZCL_OK', objectType: 'CLAS/OC' },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe('ZCL_OK');
  });

  it('검색이 오류를 내도 타입 없이 재시도하고, 그래도 실패하면 건너뛴다', async () => {
    const { queries, outcome } = await call(
      { objects: [{ name: 'ZCL_A', type: 'CLAS/OC' }] },
      () => ({ status: 500, body: 'boom' }),
    );

    expect(queries).toHaveLength(2);
    // 하나도 못 담았지만 오류가 아니다.
    expect(outcome.isError).toBe(false);
    expect(outcome.text).toBe('');
  });
});

describe('구를 그대로 옮긴 갈래', () => {
  it('아무것도 못 찾아도 isError:false에 빈 content다', async () => {
    const { outcome } = await call({ objects: [{ name: 'ZNOPE' }] }, () => ({
      status: 200,
      body: EMPTY_XML,
    }));

    expect(outcome.isError).toBe(false);
    expect(outcome.text).toBe('');
  });

  it('빈 배열은 구와 같은 문구로 거절한다', async () => {
    const { outcome, sent } = await call({ objects: [] }, () => ({ status: 200, body: EMPTY_XML }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Missing or invalid parameters: objects (array) is required and must not be empty.',
    );
    expect(sent).toHaveLength(0);
  });

  it('name이 없는 원소는 조용히 건너뛴다 (스키마가 name을 필수로 두지 않는다)', async () => {
    const { outcome } = await call({ objects: [{ type: 'CLAS/OC' }] }, () => ({
      status: 200,
      body: referenceXml('ZCL_A', 'CLAS/OC'),
    }));

    // SearchObject가 두 번 다 object_name 없음으로 거절 → 건너뜀.
    expect(outcome.isError).toBe(false);
    expect(outcome.text).toBe('');
  });
});
