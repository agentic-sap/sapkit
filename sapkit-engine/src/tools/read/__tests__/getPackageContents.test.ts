/**
 * `GetPackageContents` — 발행 계약 · 노출 선언 · 와이어(여러 발) · 갈래.
 *
 * 기대값의 출처는 **구 엔진의 실측**이다:
 *  - 발행 선언 → 채록본 `harness/old-surface/m1-tools.json`의 `tools`
 *  - 와이어    → `@babamba2/mcp-abap-adt-clients/dist/core/shared/nodeStructure.js:29-56`
 *  - 훑는 순서 → `dist/core/shared/packageContentsList.js:160-236`
 *  - 문구·응답 → `engine/src/handlers/package/readonly/handleGetPackageContents.ts`
 *
 * SAP에 붙지 않는다 — 전송을 주입해 끊는다.
 */

import { getPackageContents } from '../getPackageContents';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';
import type { RecordedRequest } from './support';

const PATH = '/sap/bc/adt/repository/nodestructure';

const ACCEPT =
  'application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml';
const CONTENT_TYPE = 'application/vnd.sap.as+xml; charset=UTF-8; dataname=null';

function asx(inner: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">' +
    `<asx:values><DATA>${inner}</DATA></asx:values></asx:abap>`
  );
}

function node(name: string, type: string, description?: string): string {
  return (
    '<SEU_ADT_REPOSITORY_OBJ_NODE>' +
    `<OBJECT_NAME>${name}</OBJECT_NAME><OBJECT_TYPE>${type}</OBJECT_TYPE>` +
    (description === undefined ? '' : `<DESCRIPTION>${description}</DESCRIPTION>`) +
    '</SEU_ADT_REPOSITORY_OBJ_NODE>'
  );
}

/** 뿌리 응답 — 하위 패키지 한 종 + 오브젝트 종류 표 둘(그중 하나는 DEVC). */
const ROOT_XML = asx(
  `<TREE_CONTENT>${node('ZSUB_PKG', 'DEVC/K', 'Sub package')}</TREE_CONTENT>` +
    '<OBJECT_TYPES>' +
    '<SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>CLAS/OC</OBJECT_TYPE><NODE_ID>000012</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO>' +
    '<SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>DEVC/K</OBJECT_TYPE><NODE_ID>000001</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO>' +
    '</OBJECT_TYPES>',
);

/** 종류별 응답 — 클래스 하나. */
const CLASS_XML = asx(
  `<TREE_CONTENT>${node('ZCL_FIXTURE', 'CLAS/OC', 'Fixture class')}</TREE_CONTENT>`,
);

/** 하위 패키지의 뿌리 응답 — 프로그램 하나, 종류 표는 없다. */
const SUB_XML = asx(`<TREE_CONTENT>${node('ZFIXTURE_PROG', 'PROG/P', 'Fixture prog')}</TREE_CONTENT>`);

function paramsOf(request: RecordedRequest): URLSearchParams {
  return new URL(request.url).searchParams;
}

/** 요청의 `parent_name` + `node_id`로 응답을 고르는 응답기. */
function replyByTarget(request: RecordedRequest) {
  const params = paramsOf(request);
  const parent = params.get('parent_name');
  const nodeId = params.get('node_id');
  if (parent === 'ZFIXTURE_PKG') return { status: 200, body: nodeId ? CLASS_XML : ROOT_XML };
  if (parent === 'ZSUB_PKG') return { status: 200, body: SUB_XML };
  return { status: 200, body: asx('') };
}

afterAll(() => {
  cleanupTempDirs();
});

async function call(args: Record<string, unknown>, reply: Parameters<typeof runTool>[2]) {
  const { outcome, requests } = await runTool(getPackageContents, args, reply);
  return { outcome, sent: toolRequests(requests) };
}

describe('발행 계약 — 채록본과 글자 일치', () => {
  it('tools/list의 네 필드가 구 번들과 같다', async () => {
    const harness = await harnessFor(getPackageContents);
    try {
      const listed = await harness.client.listTools();
      const published = listed.tools.find((tool) => tool.name === 'GetPackageContents');
      expect(published).toBeDefined();

      const expected = publishedDeclaration('GetPackageContents');
      expect(published?.name).toBe(expected.name);
      expect(published?.description).toBe(expected.description);
      expect(published?.inputSchema).toEqual(expected.inputSchema);
      expect((published as { execution?: unknown })?.execution).toEqual(expected.execution);
    } finally {
      await harness.close();
    }
  });
});

describe('노출 선언', () => {
  it('sets · available_in · kind', () => {
    // 구 경로는 `handlers/package/readonly/`이고 채록본 `exposures` 네 조건 전부에 뜬다.
    expect(getPackageContents.definition.sets).toEqual(['readonly']);
    expect(getPackageContents.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getPackageContents.definition.kind).toBe('read');
  });
});

describe('와이어 — nodestructure POST', () => {
  it('뿌리 요청의 주소·인자·본문·헤더', async () => {
    const { outcome, sent } = await call({ package_name: 'zfixture_pkg' }, replyByTarget);

    expect(outcome.isError).toBe(false);
    const root = sent[0];
    expect(root?.method).toBe('POST');
    expect(new URL(root?.url ?? '').pathname).toBe(PATH);

    const params = paramsOf(root as RecordedRequest);
    expect(params.get('parent_type')).toBe('DEVC/K');
    // 이름은 대문자로 올려 보낸다(`packageContentsList.js:213`).
    expect(params.get('parent_name')).toBe('ZFIXTURE_PKG');
    // 같은 값이 두 인자에 들어간다 — 구 그대로다(`nodeStructure.js:32-34`).
    expect(params.get('parent_tech_name')).toBe('ZFIXTURE_PKG');
    expect(params.get('withShortDescriptions')).toBe('true');
    expect(params.get('node_id')).toBeNull();

    expect(root?.headers['Accept']).toBe(ACCEPT);
    expect(root?.headers['Content-Type']).toBe(CONTENT_TYPE);
    expect(root?.body).toContain('<TV_NODEKEY>000000</TV_NODEKEY>');
  });

  it('DEVC 종류는 건너뛰고 나머지 종류마다 한 발 더 — NODE_ID의 앞자리 0은 사라진다', async () => {
    const { sent } = await call({ package_name: 'ZFIXTURE_PKG' }, replyByTarget);

    // 뿌리 1 + CLAS/OC 1 = 2. DEVC/K 종류는 뿌리 응답에 이미 있으므로 묻지 않는다.
    expect(sent).toHaveLength(2);
    const typed = sent[1];
    // `<NODE_ID>000012</NODE_ID>`가 수 12로 파싱돼 `node_id=12`로 나간다 — 구 그대로다.
    expect(paramsOf(typed as RecordedRequest).get('node_id')).toBe('12');
    expect(typed?.body).toContain('<TV_NODEKEY>12</TV_NODEKEY>');
  });

  it('평평한 목록을 구의 키로 돌려준다', async () => {
    const { outcome } = await call({ package_name: 'ZFIXTURE_PKG' }, replyByTarget);

    expect(JSON.parse(outcome.text)).toEqual([
      {
        name: 'ZSUB_PKG',
        adtType: 'DEVC/K',
        type: 'package',
        description: 'Sub package',
        packageName: 'ZFIXTURE_PKG',
        isPackage: true,
      },
      {
        name: 'ZCL_FIXTURE',
        adtType: 'CLAS/OC',
        type: 'class',
        description: 'Fixture class',
        packageName: 'ZFIXTURE_PKG',
        isPackage: false,
      },
    ]);
  });

  it('include_descriptions=false면 설명을 빼고 질의 인자도 false로 나간다', async () => {
    const { outcome, sent } = await call(
      { package_name: 'ZFIXTURE_PKG', include_descriptions: false },
      replyByTarget,
    );

    expect(paramsOf(sent[0] as RecordedRequest).get('withShortDescriptions')).toBe('false');
    const items = JSON.parse(outcome.text) as Array<Record<string, unknown>>;
    expect(items.every((item) => item.description === undefined)).toBe(true);
  });
});

describe('하위 패키지 되풀이', () => {
  it('기본값은 들어가지 않는다 (구: === true 일 때만)', async () => {
    const { sent } = await call({ package_name: 'ZFIXTURE_PKG' }, replyByTarget);

    expect(sent.some((request) => paramsOf(request).get('parent_name') === 'ZSUB_PKG')).toBe(false);
  });

  it('include_subpackages=true면 하위 패키지 안까지 훑는다', async () => {
    const { outcome, sent } = await call(
      { package_name: 'ZFIXTURE_PKG', include_subpackages: true },
      replyByTarget,
    );

    expect(sent.some((request) => paramsOf(request).get('parent_name') === 'ZSUB_PKG')).toBe(true);
    const items = JSON.parse(outcome.text) as Array<Record<string, unknown>>;
    expect(items.map((item) => item.name)).toEqual(['ZSUB_PKG', 'ZCL_FIXTURE', 'ZFIXTURE_PROG']);
    // 하위 항목의 packageName은 그 하위 패키지 이름이다.
    expect(items[2]?.packageName).toBe('ZSUB_PKG');
  });

  it('max_depth=0이면 하위 패키지 요청이 한 발도 나가지 않는다', async () => {
    // 벤더는 `options?.maxDepth ?? 5`로 읽으므로 0이 0으로 산다
    // (`packageContentsList.js:212`) — `GetPackageTree`의 `|| 5`와 다른 자리다.
    const { sent } = await call(
      { package_name: 'ZFIXTURE_PKG', include_subpackages: true, max_depth: 0 },
      replyByTarget,
    );

    expect(sent.some((request) => paramsOf(request).get('parent_name') === 'ZSUB_PKG')).toBe(false);
  });
});

describe('갈래', () => {
  it('package_name이 비면 요청을 보내지 않는다', async () => {
    const { outcome, sent } = await call({ package_name: '' }, replyByTarget);

    expect(outcome.isError).toBe(true);
    // 구는 `McpError(InvalidParams, …)`의 메시지를 그대로 실어
    // `MCP error -32602: Package name is required`였다. 접두사가 빠지는 것은
    // 등재된 축소분이다(`harness/DIVERGENCES.md` D34).
    expect(outcome.text).toBe('Package name is required');
    expect(sent).toHaveLength(0);
  });

  it('뿌리 요청 실패는 오류로 답한다 — Error: 접두사는 붙지 않는다', async () => {
    const { outcome } = await call({ package_name: 'ZFIXTURE_PKG' }, () => ({
      status: 500,
      body: '<boom/>',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).not.toMatch(/^Error: /);
  });

  it('종류별 요청 하나가 실패해도 그 종류만 빠지고 계속 간다', async () => {
    const { outcome, sent } = await call({ package_name: 'ZFIXTURE_PKG' }, (request) => {
      const params = paramsOf(request);
      if (params.get('node_id')) return { status: 500, body: '<boom/>' };
      return { status: 200, body: ROOT_XML };
    });

    expect(outcome.isError).toBe(false);
    expect(sent).toHaveLength(2);
    const items = JSON.parse(outcome.text) as Array<Record<string, unknown>>;
    expect(items.map((item) => item.name)).toEqual(['ZSUB_PKG']);
  });

  it('알아볼 수 없는 XML은 빈 목록으로 접힌다', async () => {
    const { outcome } = await call({ package_name: 'ZFIXTURE_PKG' }, () => ({
      status: 200,
      body: '<weird/>',
    }));

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual([]);
  });
});
