/**
 * `GetVirtualFoldersLow` — 발행 계약 · 노출 선언 · 와이어 · 본문 조립 · 갈래.
 *
 * 기대값의 출처(전부 구 엔진 실측):
 *  - 주소·질의 인자·헤더·본문 순서
 *    → `@babamba2/…/dist/core/shared/virtualFolders.js:10-73`
 *  - `Accept`/`Content-Type` 글자 → `dist/constants/contentTypes.js:50-51`
 *  - 기본값 채우기 → `engine/src/handlers/system/low/handleGetVirtualFolders.ts:93-99`
 *  - `sets` → `engine/src/lib/handlers/groups/SystemHandlersGroup.ts:325-327`
 */

import { getVirtualFoldersLow } from '../getVirtualFoldersLow';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const VIRTUAL_FOLDERS = '/sap/bc/adt/repository/informationsystem/virtualfolders/contents';
const OK_XML = '<vfs:virtualFoldersResult/>';

/** POST라 접속 계층이 CSRF 토큰을 먼저 긁어온다 — 그 왕복은 계약이 아니다. */
const csrf = (body = OK_XML) =>
  (request: { url: string }) =>
    request.url.includes('/discovery')
      ? { headers: { 'x-csrf-token': 'TEST-TOKEN' } }
      : { status: 200, body };

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getVirtualFoldersLow);
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
      }).toEqual(publishedDeclaration('GetVirtualFoldersLow'));
    } finally {
      await harness.close();
    }
  });

  it('`sets`는 구 폴더 이름 `low`가 아니라 `system`이다', () => {
    expect(getVirtualFoldersLow.definition.sets).toEqual(['system']);
    expect(getVirtualFoldersLow.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getVirtualFoldersLow.definition.kind).toBe('read');
  });

  it('대상 인자가 검색 패턴이라 targetNames는 빈 선언이다', () => {
    // 표준 마스크(`*`·`SAP*`)를 받는 것이 정상 사용이므로 사전 검사를 걸지 않는다.
    // 빈 배열은 "대상 이름 인자가 없다"는 **명시 선언**이다.
    expect(getVirtualFoldersLow.definition.targetNames).toEqual([]);
  });

  it('`--exposition=readonly` 표면에 실제로 뜬다 (게이트 ⓑ가 보는 자리)', async () => {
    const harness = await harnessFor(getVirtualFoldersLow);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual(['GetVirtualFoldersLow']);
    } finally {
      await harness.close();
    }
  });
});

describe('와이어', () => {
  it('virtualfolders/contents로 POST 한 발 — 헤더 두 줄이 구 그대로다', async () => {
    const { requests } = await runTool(getVirtualFoldersLow, {}, csrf());
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.url).toContain(VIRTUAL_FOLDERS);
    expect(sent[0]?.headers['Accept']).toBe(
      'application/vnd.sap.adt.repository.virtualfolders.result.v1+xml',
    );
    expect(sent[0]?.headers['Content-Type']).toBe(
      'application/vnd.sap.adt.repository.virtualfolders.request.v1+xml',
    );
  });

  it('아무 인자도 안 주면 질의 인자가 **하나도** 붙지 않는다', async () => {
    // `withVersions`·`ignoreShortDescriptions`는 `!== undefined`일 때만 실린다
    // (`virtualFolders.js:57-62`). 발행 스키마의 `default: false`는 선언에만 있다.
    const { requests } = await runTool(getVirtualFoldersLow, {}, csrf());
    const sent = toolRequests(requests)[0];

    expect(sent?.url).not.toContain('?');
  });

  it('두 불리언은 준 값이 문자열로 실린다 — false도 실린다', async () => {
    const { requests } = await runTool(
      getVirtualFoldersLow,
      { with_versions: false, ignore_short_descriptions: true },
      csrf(),
    );
    const sent = toolRequests(requests)[0];

    expect(sent?.url).toContain('withVersions=false');
    expect(sent?.url).toContain('ignoreShortDescriptions=true');
  });

  it('기본 본문은 패턴 `*`와 세 facet 순서다', async () => {
    const { requests } = await runTool(getVirtualFoldersLow, {}, csrf());

    expect(toolRequests(requests)[0]?.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" ' +
        'objectSearchPattern="*">' +
        '<vfs:facetorder><vfs:facet>package</vfs:facet><vfs:facet>group</vfs:facet>' +
        '<vfs:facet>type</vfs:facet></vfs:facetorder>' +
        '</vfs:virtualFoldersRequest>',
    );
  });

  it('preselection이 facetorder **앞**에 온다 (구의 조립 순서)', async () => {
    const { requests } = await runTool(
      getVirtualFoldersLow,
      {
        object_search_pattern: 'Z*',
        preselection: [{ facet: 'package', values: ['ZPKG_A', 'ZPKG_B'] }],
        facet_order: ['type'],
      },
      csrf(),
    );
    const body = toolRequests(requests)[0]?.body ?? '';

    expect(body).toContain('objectSearchPattern="Z*"');
    expect(body).toContain(
      '<vfs:preselection facet="package"><vfs:value>ZPKG_A</vfs:value>' +
        '<vfs:value>ZPKG_B</vfs:value></vfs:preselection>',
    );
    expect(body).toContain('<vfs:facetorder><vfs:facet>type</vfs:facet></vfs:facetorder>');
    expect(body.indexOf('<vfs:preselection')).toBeLessThan(body.indexOf('<vfs:facetorder>'));
  });

  it('빈 facet_order는 falsy가 아니므로 facetorder 요소 자체가 사라진다', async () => {
    const { requests } = await runTool(getVirtualFoldersLow, { facet_order: [] }, csrf());
    const body = toolRequests(requests)[0]?.body ?? '';

    expect(body).not.toContain('<vfs:facetorder>');
    expect(body).toContain('objectSearchPattern="*"');
  });

  it('빈 문자열 패턴은 falsy라 `*`로 바뀐다 (구의 `||`)', async () => {
    const { requests } = await runTool(
      getVirtualFoldersLow,
      { object_search_pattern: '' },
      csrf(),
    );

    expect(toolRequests(requests)[0]?.body).toContain('objectSearchPattern="*"');
  });

  it('다섯 글자를 이스케이프한다 — `&`가 맨 먼저라 두 번 escape 되지 않는다', async () => {
    const { requests } = await runTool(
      getVirtualFoldersLow,
      {
        object_search_pattern: 'A&B<C>D"E\'F',
        preselection: [{ facet: 'p&q', values: ['<v>'] }],
      },
      csrf(),
    );
    const body = toolRequests(requests)[0]?.body ?? '';

    expect(body).toContain('objectSearchPattern="A&amp;B&lt;C&gt;D&quot;E&apos;F"');
    expect(body).toContain('<vfs:preselection facet="p&amp;q">');
    expect(body).toContain('<vfs:value>&lt;v&gt;</vfs:value>');
    // `&amp;` 가 다시 `&amp;amp;` 로 접히지 않았다.
    expect(body).not.toContain('&amp;amp;');
  });

  it('응답 본문을 손대지 않고 그대로 싣는다', async () => {
    const { outcome } = await runTool(getVirtualFoldersLow, {}, csrf('<RAW>본문</RAW>'));

    expect(outcome.isError).toBe(false);
    expect(outcome.text).toBe('<RAW>본문</RAW>');
  });
});

describe('갈래', () => {
  it('필수 인자가 없는 도구라 인자 검증도 없다 (구 그대로)', async () => {
    const { outcome, requests } = await runTool(getVirtualFoldersLow, {}, csrf());

    expect(outcome.isError).toBe(false);
    expect(toolRequests(requests)).toHaveLength(1);
  });

  it('ADT가 거절하면 `Error: ` 접두사를 단 오류로 접는다', async () => {
    const { outcome } = await runTool(getVirtualFoldersLow, {}, (request) =>
      request.url.includes('/discovery')
        ? { headers: { 'x-csrf-token': 'T' } }
        : { status: 500, body: 'boom' },
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('Error: ')).toBe(true);
  });
});
