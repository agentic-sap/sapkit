/**
 * `GrepPackages` — 발행 계약 · 목록 만들기 와이어 · 훑기 · 갈래,
 * 그리고 **`GrepObjects`와의 차이**를 못박는 절.
 *
 * 파일 이름은 규약이다: `<모듈 디렉터리>/__tests__/<도구 이름의 소문자시작형>.test.ts`.
 *
 * 기대값은 구 엔진 실측에서 뽑았다 — 선언은 채록본
 * (`harness/old-surface/m1-tools.json`의 `tools`), 목록 만들기는 벤더
 * `@babamba2/mcp-abap-adt-clients/dist/core/shared/packageContentsList.js:103-237`,
 * 훑기·계수는 `engine/src/handlers/search/readonly/handleGrepPackages.ts:157-261`.
 *
 * 자식 프로세스도 실 SAP도 쓰지 않는다 — 전송은 주입된 가짜다.
 */

import { grepObjects } from '../grepObjects';
import { grepPackages } from '../grepPackages';
import {
  TEST_ORIGIN,
  cleanupTempDirs,
  csrfAware,
  harnessFor,
  publishedDeclaration,
  runTool,
  toolRequests,
} from './support';
import type { Reply, RecordedRequest } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const NODE_STRUCTURE = '/sap/bc/adt/repository/nodestructure';

interface Aggregate {
  total_matches: number;
  truncated: boolean;
  results: Array<{ object_type: string; object_name: string; matches: Array<{ line: number; text: string }> }>;
  skipped: Array<{ object: string; reason: string }>;
  packages_scanned: number;
  objects_scanned: number;
  objects_skipped: number;
}

// ── 가짜 SAP ───────────────────────────────────────────────────────────────

interface TypeNode {
  /** `OBJECT_TYPES` 표에 적히는 ADT 타입. */
  readonly adtType: string;
  /** XML에 **적히는 그대로**의 노드 번호. 앞자리 0을 일부러 남긴다. */
  readonly nodeId: string;
  readonly objects: readonly string[];
}

interface FakePackage {
  readonly types: readonly TypeNode[];
  /** 첫 응답의 트리에 실리는 하위 패키지들. */
  readonly subpackages?: readonly string[];
}

function objNode(type: string, name: string): string {
  return `<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>${type}</OBJECT_TYPE><OBJECT_NAME>${name}</OBJECT_NAME></SEU_ADT_REPOSITORY_OBJ_NODE>`;
}

function typeInfo(type: string, nodeId: string): string {
  return `<SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>${type}</OBJECT_TYPE><NODE_ID>${nodeId}</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO>`;
}

function structureXml(nodes: readonly string[], types: readonly string[] = []): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA>' +
    `<TREE_CONTENT>${nodes.join('')}</TREE_CONTENT>` +
    (types.length > 0 ? `<OBJECT_TYPES>${types.join('')}</OBJECT_TYPES>` : '') +
    '</DATA></asx:values></asx:abap>'
  );
}

function queryOf(url: string, name: string): string | null {
  return new URL(url).searchParams.get(name);
}

/**
 * 노드 구조 요청에 답하는 가짜 리포지터리.
 *
 * **되묻는 `node_id`는 XML에 적힌 `000012`가 아니라 `12`다** — 벤더 파서가
 * 태그 본문의 숫자를 숫자로 읽기 때문이다. 그래서 여기서도 숫자로 접어 찾는다.
 * 그 사실 자체는 아래 「목록 만들기」 절이 URL로 직접 확인한다.
 */
function repository(packages: Readonly<Record<string, FakePackage>>) {
  return (request: RecordedRequest): Reply | null => {
    if (!request.url.includes(NODE_STRUCTURE)) return null;
    const name = queryOf(request.url, 'parent_name') ?? '';
    const nodeId = queryOf(request.url, 'node_id');
    const pkg = packages[name];
    if (!pkg) return { body: structureXml([]) };

    if (nodeId === null) {
      return {
        body: structureXml(
          (pkg.subpackages ?? []).map((sub) => objNode('DEVC/K', sub)),
          [
            // 하위 패키지 종류도 표에 실리지만 다시 묻지 않아야 한다.
            ...(pkg.subpackages && pkg.subpackages.length > 0 ? [typeInfo('DEVC/K', '000001')] : []),
            ...pkg.types.map((type) => typeInfo(type.adtType, type.nodeId)),
          ],
        ),
      };
    }

    const type = pkg.types.find((candidate) => String(Number(candidate.nodeId)) === nodeId);
    if (!type) return { body: structureXml([]) };
    return { body: structureXml(type.objects.map((object) => objNode(type.adtType, object))) };
  };
}

interface Outcome {
  readonly aggregate: Aggregate;
  readonly text: string;
  readonly isError: boolean;
  readonly sent: RecordedRequest[];
}

async function run(
  args: Record<string, unknown>,
  reply: (request: RecordedRequest) => Reply,
): Promise<Outcome> {
  const { outcome, requests } = await runTool(grepPackages, args, csrfAware(reply));
  return {
    aggregate: outcome.isError ? (null as unknown as Aggregate) : (JSON.parse(outcome.text) as Aggregate),
    text: outcome.text,
    isError: outcome.isError,
    sent: toolRequests(requests),
  };
}

/** 노드 구조 요청 + 소스 요청을 함께 다루는 응답기. */
function sap(
  packages: Readonly<Record<string, FakePackage>>,
  sources: Readonly<Record<string, Reply>> = {},
): (request: RecordedRequest) => Reply {
  const tree = repository(packages);
  return (request) => {
    const fromTree = tree(request);
    if (fromTree) return fromTree;
    for (const [fragment, reply] of Object.entries(sources)) {
      if (request.url.includes(fragment)) return reply;
    }
    return { body: '' };
  };
}

const ONE_CLASS: Readonly<Record<string, FakePackage>> = {
  ZPKG: { types: [{ adtType: 'CLAS/OC', nodeId: '000012', objects: ['ZCL_A'] }] },
};

// ── 시험 ───────────────────────────────────────────────────────────────────

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(grepPackages);
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
      }).toEqual(publishedDeclaration('GrepPackages'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/search/readonly/` → readonly 집합.
    expect(grepPackages.definition.sets).toEqual(['readonly']);
    expect(grepPackages.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(grepPackages.definition.kind).toBe('read');
  });

  it('대상-이름 선언이 `packages`를 가리킨다 — 응답에 원본 소스가 실리는 도구다', () => {
    expect(grepPackages.definition.targetNames).toEqual([{ arg: 'packages', element: 'name' }]);
  });
});

describe('목록 만들기 (와이어)', () => {
  it('첫 요청엔 node_id가 없고, 본문 노드 키는 000000이며, 설명은 끄고 묻는다', async () => {
    const { sent } = await run(
      { packages: ['zpkg'], pattern: 'SELECT' },
      sap(ONE_CLASS, { '/oo/classes/': { body: 'no hits' } }),
    );

    const first = sent[0];
    expect(first?.method).toBe('POST');
    expect(queryOf(first?.url ?? '', 'parent_name')).toBe('ZPKG');
    expect(queryOf(first?.url ?? '', 'node_id')).toBeNull();
    // 구는 `includeDescriptions: false`로 부른다(`handleGrepPackages.ts:141-144`).
    expect(queryOf(first?.url ?? '', 'withShortDescriptions')).toBe('false');
    expect(first?.body).toContain('<TV_NODEKEY>000000</TV_NODEKEY>');
  });

  it('종류마다 한 번 더 묻는다 — 그때 node_id는 000012가 아니라 **12**다', async () => {
    // 벤더 파서가 태그 본문의 숫자를 숫자로 읽어 앞자리 0이 사라진다.
    // 같은 XML을 정규식으로 읽는 GetObjectsByType 쪽과 갈리는 자리다.
    const { sent } = await run(
      { packages: ['ZPKG'], pattern: 'SELECT' },
      sap(ONE_CLASS, { '/oo/classes/': { body: 'no hits' } }),
    );

    const structure = sent.filter((request) => request.url.includes(NODE_STRUCTURE));
    expect(structure).toHaveLength(2);
    expect(queryOf(structure[1]?.url ?? '', 'node_id')).toBe('12');
    expect(structure[1]?.body).toContain('<TV_NODEKEY>12</TV_NODEKEY>');
  });

  it('DEVC/K 종류는 다시 묻지 않는다 — 하위 패키지는 첫 응답에 이미 있다', async () => {
    const { sent } = await run(
      { packages: ['ZPKG'], pattern: 'SELECT' },
      sap(
        { ZPKG: { types: [{ adtType: 'CLAS/OC', nodeId: '000012', objects: [] }], subpackages: ['ZSUB'] } },
        {},
      ),
    );

    const nodeIds = sent
      .filter((request) => request.url.includes(NODE_STRUCTURE))
      .map((request) => queryOf(request.url, 'node_id'));
    // 첫 요청(null) + CLAS 종류(12). DEVC/K의 1은 없다.
    expect(nodeIds).toEqual([null, '12']);
  });

  it('include_subpackages를 켜야 하위 패키지를 편다', async () => {
    const packages = {
      ZPKG: { types: [{ adtType: 'CLAS/OC', nodeId: '000012', objects: ['ZCL_A'] }], subpackages: ['ZSUB'] },
      ZSUB: { types: [{ adtType: 'CLAS/OC', nodeId: '000012', objects: ['ZCL_SUB'] }] },
    };
    const sources = { '/oo/classes/': { body: 'SELECT * FROM mara.' } };

    const off = await run({ packages: ['ZPKG'], pattern: 'SELECT' }, sap(packages, sources));
    expect(off.aggregate.results.map((result) => result.object_name)).toEqual(['ZCL_A']);

    const on = await run(
      { packages: ['ZPKG'], pattern: 'SELECT', include_subpackages: true },
      sap(packages, sources),
    );
    expect(on.aggregate.results.map((result) => result.object_name).sort()).toEqual(['ZCL_A', 'ZCL_SUB']);
  });
});

describe('훑기', () => {
  it('일치 줄을 모으고 구가 덧붙이던 계수 세 가지를 함께 싣는다', async () => {
    const { aggregate, sent } = await run(
      { packages: ['ZPKG'], pattern: 'SELECT' },
      sap(ONE_CLASS, {
        '/oo/classes/': { body: 'CLASS zcl_a DEFINITION.\n  SELECT * FROM mara.\nENDCLASS.' },
      }),
    );

    expect(sent.some((request) => request.url.includes('/oo/classes/ZCL_A/source/main?version=active'))).toBe(
      true,
    );
    expect(aggregate.total_matches).toBe(1);
    expect(aggregate.results[0]?.matches[0]).toEqual({
      line: 2,
      text: '  SELECT * FROM mara.',
      context_before: [],
      context_after: [],
    });
    expect(aggregate.packages_scanned).toBe(1);
    expect(aggregate.objects_scanned).toBe(1);
    expect(aggregate.objects_skipped).toBe(0);
  });

  it('소스가 없는 타입과 함수모듈은 **조용히** 빠진다 — skipped에 남지 않는다', async () => {
    const { aggregate, sent } = await run(
      { packages: ['ZPKG'], pattern: 'SELECT' },
      sap(
        {
          ZPKG: {
            types: [
              { adtType: 'TABL/DT', nodeId: '000002', objects: ['ZTAB_A'] },
              { adtType: 'DTEL/DE', nodeId: '000003', objects: ['ZDTEL_A'] },
              { adtType: 'FUGR/FF', nodeId: '000004', objects: ['Z_FM_A'] },
            ],
          },
        },
        {},
      ),
    );

    expect(aggregate.skipped).toEqual([]);
    expect(aggregate.objects_skipped).toBe(0);
    // 소스를 가지러 나간 요청이 아예 없다.
    expect(sent.every((request) => request.url.includes(NODE_STRUCTURE))).toBe(true);
  });

  it('object_types 필터는 같은 분류기를 지난다 — `CLAS/OC`로 써도 받는다', async () => {
    const packages = {
      ZPKG: {
        types: [
          { adtType: 'CLAS/OC', nodeId: '000012', objects: ['ZCL_A'] },
          { adtType: 'PROG/P', nodeId: '000013', objects: ['ZPROG_A'] },
        ],
      },
    };
    const sources = { '/source/main': { body: 'SELECT * FROM mara.' } };

    const { aggregate } = await run(
      { packages: ['ZPKG'], pattern: 'SELECT', object_types: ['CLAS/OC'] },
      sap(packages, sources),
    );

    expect(aggregate.results.map((result) => result.object_name)).toEqual(['ZCL_A']);
  });

  it('소스를 못 읽은 오브젝트는 skipped에 남고 나머지는 계속 훑는다', async () => {
    const { aggregate } = await run(
      { packages: ['ZPKG'], pattern: 'WRITE' },
      sap(
        { ZPKG: { types: [{ adtType: 'PROG/P', nodeId: '000013', objects: ['ZPROG_MISSING', 'ZPROG_OK'] }] } },
        {
          ZPROG_MISSING: { status: 404, body: '' },
          ZPROG_OK: { body: "REPORT zprog_ok.\nWRITE 'x'." },
        },
      ),
    );

    expect(aggregate.results.map((result) => result.object_name)).toEqual(['ZPROG_OK']);
    expect(aggregate.skipped[0]?.object).toBe('PROG ZPROG_MISSING');
    expect(aggregate.skipped[0]?.reason).toMatch(/^Failed to fetch source: /);
    expect(aggregate.objects_skipped).toBe(1);
  });

  it('예산이 바닥나면 남은 오브젝트는 **가져오지도 않는다**', async () => {
    // 동시 5벌까지만 먼저 나가고, 그 다음 것은 가져오기 전에 잘린다.
    const names = ['ZCL_1', 'ZCL_2', 'ZCL_3', 'ZCL_4', 'ZCL_5', 'ZCL_6'];
    const { aggregate, sent } = await run(
      { packages: ['ZPKG'], pattern: 'SELECT', max_results: 1 },
      sap({ ZPKG: { types: [{ adtType: 'CLAS/OC', nodeId: '000012', objects: names }] } }, {
        '/oo/classes/': { body: 'SELECT * FROM mara.' },
      }),
    );

    const sourceGets = sent.filter((request) => request.url.includes('/oo/classes/'));
    expect(sourceGets).toHaveLength(5);
    expect(aggregate.total_matches).toBe(1);
    expect(aggregate.truncated).toBe(true);
    expect(aggregate.objects_scanned).toBe(1);
    expect(aggregate.skipped).toHaveLength(5);
    expect(new Set(aggregate.skipped.map((entry) => entry.reason))).toEqual(
      new Set(['max_results reached; object not scanned']),
    );
  });
});

describe('GrepObjects와의 차이 (실측)', () => {
  it('미지원 타입: GrepObjects는 이유를 남기고, GrepPackages는 목록에서 뺀다', async () => {
    const objects = await runTool(
      grepObjects,
      { objects: [{ object_type: 'TABL', object_name: 'ZTAB_A' }], pattern: 'SELECT' },
      () => ({ body: '' }),
    );
    const fromObjects = JSON.parse(objects.outcome.text) as Aggregate;
    expect(fromObjects.skipped).toEqual([
      {
        object: 'TABL ZTAB_A',
        reason:
          'Unsupported object_type "TABL" for source search (supported: CLAS, PROG, INTF, INCL, FUGR)',
      },
    ]);

    const { aggregate } = await run(
      { packages: ['ZPKG'], pattern: 'SELECT' },
      sap({ ZPKG: { types: [{ adtType: 'TABL/DT', nodeId: '000002', objects: ['ZTAB_A'] }] } }, {}),
    );
    expect(aggregate.skipped).toEqual([]);
  });

  it('max_results 기본값이 다르다 — 채록본 실측으로 100 대 200', () => {
    const schemaOf = (name: string) =>
      publishedDeclaration(name).inputSchema as {
        properties: Record<string, { default?: number }>;
      };

    expect(schemaOf('GrepObjects').properties.max_results?.default).toBe(100);
    expect(schemaOf('GrepPackages').properties.max_results?.default).toBe(200);
  });

  it('응답 필드가 다르다 — GrepPackages만 계수 셋을 덧붙인다', async () => {
    const objects = await runTool(
      grepObjects,
      { objects: [{ object_type: 'CLAS', object_name: 'ZCL_A' }], pattern: 'SELECT' },
      () => ({ body: 'SELECT * FROM mara.' }),
    );
    expect(Object.keys(JSON.parse(objects.outcome.text) as object)).toEqual([
      'total_matches',
      'truncated',
      'results',
      'skipped',
    ]);

    const { text } = await run(
      { packages: ['ZPKG'], pattern: 'SELECT' },
      sap(ONE_CLASS, { '/oo/classes/': { body: 'SELECT * FROM mara.' } }),
    );
    expect(Object.keys(JSON.parse(text) as object)).toEqual([
      'total_matches',
      'truncated',
      'results',
      'skipped',
      'packages_scanned',
      'objects_scanned',
      'objects_skipped',
    ]);
  });

  it('상한이 다르다 — 오브젝트 50벌 대 패키지 10벌', async () => {
    const eleven = Array.from({ length: 11 }, (_, index) => `ZPKG${index}`);
    const { text, isError, sent } = await run({ packages: eleven, pattern: 'x' }, sap({}, {}));

    expect(isError).toBe(true);
    expect(text).toBe('packages must contain at most 10 entries');
    expect(sent).toHaveLength(0);
  });
});

describe('갈래', () => {
  it('빈 packages 배열은 인자 오류다 — SAP에 한 바이트도 안 나간다', async () => {
    const { text, isError, sent } = await run({ packages: [], pattern: 'x' }, sap({}, {}));

    expect(isError).toBe(true);
    expect(text).toBe('packages must be a non-empty array (1-10 entries)');
    expect(sent).toHaveLength(0);
  });

  it('나쁜 정규식은 목록을 만들기도 전에 거절된다', async () => {
    const { text, isError, sent } = await run(
      { packages: ['ZPKG'], pattern: '([unclosed' },
      sap(ONE_CLASS, {}),
    );

    expect(isError).toBe(true);
    expect(text).toMatch(/^Invalid regex pattern "\(\[unclosed": /);
    expect(sent).toHaveLength(0);
  });

  it('이름이 빈 패키지는 건너뛰되 packages_scanned에는 그대로 센다', async () => {
    const { aggregate, sent } = await run(
      { packages: ['ZPKG', '  '], pattern: 'SELECT' },
      sap(ONE_CLASS, { '/oo/classes/': { body: 'SELECT * FROM mara.' } }),
    );

    const structure = sent.filter((request) => request.url.includes(NODE_STRUCTURE));
    // 빈 이름으로는 묻지 않는다 — ZPKG의 첫 요청 + 종류 하나뿐이다.
    expect(structure).toHaveLength(2);
    // 그런데 계수는 인자 배열의 길이 그대로다(구 `:252`).
    expect(aggregate.packages_scanned).toBe(2);
  });
});
