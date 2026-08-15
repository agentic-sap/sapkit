/**
 * `GetNodeStructureLow` — 발행 계약 · 노출 선언 · 와이어 · 세션 갈래 · 인자 갈래.
 *
 * 기대값의 출처(전부 구 엔진 실측):
 *  - 주소·본문·헤더 → `@babamba2/…/dist/core/shared/nodeStructure.js:29-56`
 *  - `node_id` 기본값 `'0000'`·`with_short_descriptions !== false`
 *    → `engine/src/handlers/system/low/handleGetNodeStructure.ts:111-116`
 *  - 인자 검증 문구 → 같은 파일 `:84-89`
 *  - 세션 복원 조건(`&&`)과 그 효과 → 같은 파일 `:92-101` +
 *    `engine/src/lib/utils.ts:763-788`
 *  - `sets` → `engine/src/lib/handlers/groups/SystemHandlersGroup.ts:331-333`
 *    (구 서버가 `system` 그룹에 등록했고 런처가 `readonly`에서 그 그룹을 켠다)
 */

import { getNodeStructureLow } from '../getNodeStructureLow';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const NODESTRUCTURE = '/sap/bc/adt/repository/nodestructure';
const OK_XML = '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values/></asx:abap>';

/** POST라 접속 계층이 CSRF 토큰을 먼저 긁어온다 — 그 왕복은 계약이 아니다. */
const csrf = (body = OK_XML) =>
  (request: { url: string }) =>
    request.url.includes('/discovery')
      ? { headers: { 'x-csrf-token': 'TEST-TOKEN' } }
      : { status: 200, body };

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getNodeStructureLow);
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
      }).toEqual(publishedDeclaration('GetNodeStructureLow'));
    } finally {
      await harness.close();
    }
  });

  it('`sets`는 구 폴더 이름 `low`가 아니라 `system`이다', () => {
    // 구 트리는 `handlers/system/low/`지만 구 서버는 SystemHandlersGroup에
    // 등록했고, 런처는 `--exposition=readonly`에서 그 그룹을 통째로 켠다.
    // 그래서 채록본의 네 노출 조건 **전부**에 뜬다 — `low`로 적으면 어디에도 안 뜬다.
    expect(getNodeStructureLow.definition.sets).toEqual(['system']);
    expect(getNodeStructureLow.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getNodeStructureLow.definition.kind).toBe('read');
  });

  it('`--exposition=readonly` 표면에 실제로 뜬다 (게이트 ⓑ가 보는 자리)', async () => {
    const harness = await harnessFor(getNodeStructureLow);
    try {
      // `harnessFor`는 `--exposition=readonly,high`로 세운다. readonly가
      // `system`을 함께 켜는 것이 이 도구가 뜨는 근거다.
      const listed = await harness.client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual(['GetNodeStructureLow']);
    } finally {
      await harness.close();
    }
  });
});

describe('와이어', () => {
  it('nodestructure로 POST 한 발 — 질의 인자·본문·헤더가 구 그대로다', async () => {
    const { requests } = await runTool(
      getNodeStructureLow,
      { parent_type: 'CLAS/OC', parent_name: 'ZCL_FIXTURE' },
      csrf(),
    );
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.url).toContain(NODESTRUCTURE);
    expect(sent[0]?.url).toContain('parent_type=CLAS%2FOC');
    expect(sent[0]?.url).toContain('parent_name=ZCL_FIXTURE');
    // 기술명 자리에도 이름이 들어간다 — 벤더 실측(nodeStructure.js:34).
    expect(sent[0]?.url).toContain('parent_tech_name=ZCL_FIXTURE');
    expect(sent[0]?.url).toContain('withShortDescriptions=true');
    // 기본 노드 키는 **네 자리**다 — `GetPackageTree`의 여섯 자리가 아니다.
    expect(sent[0]?.url).toContain('node_id=0000');
    expect(sent[0]?.body).toContain('<TV_NODEKEY>0000</TV_NODEKEY>');
    expect(sent[0]?.headers['Accept']).toBe(
      'application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, ' +
        'application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml',
    );
    expect(sent[0]?.headers['Content-Type']).toBe(
      'application/vnd.sap.as+xml; charset=UTF-8; dataname=null',
    );
  });

  it('node_id를 주면 질의 인자와 본문에 그대로 실린다', async () => {
    const { requests } = await runTool(
      getNodeStructureLow,
      { parent_type: 'DEVC/K', parent_name: 'ZPKG', node_id: '000012' },
      csrf(),
    );
    const sent = toolRequests(requests)[0];

    expect(sent?.url).toContain('node_id=000012');
    expect(sent?.body).toContain('<TV_NODEKEY>000012</TV_NODEKEY>');
  });

  it('빈 node_id는 falsy라 기본값 0000으로 바뀐다 (구의 `||`)', async () => {
    const { requests } = await runTool(
      getNodeStructureLow,
      { parent_type: 'DEVC/K', parent_name: 'ZPKG', node_id: '' },
      csrf(),
    );
    const sent = toolRequests(requests)[0];

    expect(sent?.url).toContain('node_id=0000');
    expect(sent?.body).toContain('<TV_NODEKEY>0000</TV_NODEKEY>');
  });

  it('with_short_descriptions는 false를 명시할 때만 거짓이다', async () => {
    const off = await runTool(
      getNodeStructureLow,
      { parent_type: 'DEVC/K', parent_name: 'ZPKG', with_short_descriptions: false },
      csrf(),
    );
    expect(toolRequests(off.requests)[0]?.url).toContain('withShortDescriptions=false');

    const on = await runTool(
      getNodeStructureLow,
      { parent_type: 'DEVC/K', parent_name: 'ZPKG', with_short_descriptions: true },
      csrf(),
    );
    expect(toolRequests(on.requests)[0]?.url).toContain('withShortDescriptions=true');
  });

  it('응답 본문을 손대지 않고 그대로 싣는다', async () => {
    const { outcome } = await runTool(
      getNodeStructureLow,
      { parent_type: 'DEVC/K', parent_name: 'ZPKG' },
      csrf('<RAW>본문 그대로</RAW>'),
    );

    expect(outcome.isError).toBe(false);
    expect(outcome.text).toBe('<RAW>본문 그대로</RAW>');
  });
});

describe('세션 복원 갈래', () => {
  it('session_id와 session_state가 **둘 다** 있어야 stateful로 나간다', async () => {
    const { requests } = await runTool(
      getNodeStructureLow,
      {
        parent_type: 'DEVC/K',
        parent_name: 'ZPKG',
        session_id: 'abc123',
        session_state: { cookies: 'x', csrf_token: 'y' },
      },
      csrf(),
    );
    const sent = toolRequests(requests)[0];

    expect(sent?.headers['x-sap-adt-sessiontype']).toBe('stateful');
  });

  it('session_id만 주면 복원하지 않는다 (구의 `&&`)', async () => {
    const { requests } = await runTool(
      getNodeStructureLow,
      { parent_type: 'DEVC/K', parent_name: 'ZPKG', session_id: 'abc123' },
      csrf(),
    );
    const sent = toolRequests(requests)[0];

    expect(sent?.headers['x-sap-adt-sessiontype']).toBeUndefined();
  });

  it('둘 다 없으면 stateless 그대로다', async () => {
    const { requests } = await runTool(
      getNodeStructureLow,
      { parent_type: 'DEVC/K', parent_name: 'ZPKG' },
      csrf(),
    );
    expect(toolRequests(requests)[0]?.headers['x-sap-adt-sessiontype']).toBeUndefined();
  });
});

describe('갈래', () => {
  it.each([
    ['parent_type', { parent_type: '', parent_name: 'ZPKG' }, 'parent_type is required'],
    ['parent_name', { parent_type: 'DEVC/K', parent_name: '' }, 'parent_name is required'],
  ])('빈 %s는 접속 전에 거절한다 — 요청 0건', async (_label, args, message) => {
    const { outcome, requests } = await runTool(getNodeStructureLow, args, csrf());

    expect(outcome.isError).toBe(true);
    // `return_error`라 `Error: ` 접두사가 붙는다.
    expect(outcome.text).toBe(`Error: ${message}`);
    expect(requests).toHaveLength(0);
  });

  it('ADT가 거절하면 `Error: ` 접두사를 단 오류로 접는다', async () => {
    const { outcome } = await runTool(
      getNodeStructureLow,
      { parent_type: 'DEVC/K', parent_name: 'ZPKG' },
      (request) =>
        request.url.includes('/discovery')
          ? { headers: { 'x-csrf-token': 'T' } }
          : { status: 500, body: 'boom' },
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('Error: ')).toBe(true);
  });
});
