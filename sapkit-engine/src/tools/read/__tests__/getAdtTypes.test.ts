/**
 * `GetAdtTypes` — 발행 계약 · 노출 선언 · 와이어 · 파싱 · 갈래.
 *
 * 기대값은 구 엔진의 실측에서 뽑았다:
 *  - 주소·질의 인자·`Accept` — `@babamba2/…/dist/core/shared/allTypes.js:20-35`
 *  - 고정 세 인자 — `engine/src/handlers/system/readonly/handleGetAllTypes.ts:85`
 *  - 파싱 — 같은 파일 `:53-77`(`extractNamedItems`)
 *  - `validate_type`을 쓰지 않는다 — 같은 파일 `:79`의 `_args`
 */

import { getAdtTypes, OBJECT_TYPES_PATH } from '../getAdtTypes';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const namedItemList = (
  items: ReadonlyArray<{ name: string; description: string }>,
): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<nameditem:namedItemList xmlns:nameditem="http://www.sap.com/adt/nameditems">',
    ...items.map(
      (item) =>
        `<nameditem:namedItem><nameditem:name>${item.name}</nameditem:name>` +
        `<nameditem:description>${item.description}</nameditem:description></nameditem:namedItem>`,
    ),
    '</nameditem:namedItemList>',
  ].join('');

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getAdtTypes);
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
      }).toEqual(publishedDeclaration('GetAdtTypes'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언이 구 핸들러의 소속·available_in과 같다', () => {
    // `handlers/system/readonly/` → SystemHandlersGroup 등록
    // (`engine/src/lib/handlers/groups/SystemHandlersGroup.ts:279-281`).
    // 채록본의 네 노출 조건 전부에 뜨므로 readonly 계열이다.
    expect(getAdtTypes.definition.sets).toEqual(['readonly']);
    expect(getAdtTypes.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getAdtTypes.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('정보시스템 objecttypes로 GET 한 발 — 질의 인자 세 개가 고정값이다', async () => {
    const { requests } = await runTool(getAdtTypes, {}, () => ({
      status: 200,
      body: namedItemList([]),
    }));
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(sent[0]?.url).toContain(OBJECT_TYPES_PATH);
    // 순서까지 구 `URLSearchParams` 조립 그대로다.
    expect(sent[0]?.url).toContain('?maxItemCount=999&name=*&data=usedByProvider');
    expect(sent[0]?.headers['Accept']).toBe('application/xml');
    expect(sent[0]?.body).toBeUndefined();
  });

  it('validate_type을 줘도 요청이 달라지지 않는다 (구는 인자를 쓰지 않는다)', async () => {
    const { requests } = await runTool(getAdtTypes, { validate_type: 'CLAS' }, () => ({
      status: 200,
      body: namedItemList([]),
    }));
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).not.toContain('CLAS');
    expect(sent[0]?.url).toContain('?maxItemCount=999&name=*&data=usedByProvider');
  });
});

describe('파싱', () => {
  it('namedItem을 name·description 쌍으로 접는다 (들여쓰기 없는 JSON)', async () => {
    const body = namedItemList([
      { name: 'CLAS/OC', description: 'Class' },
      { name: 'PROG/P', description: 'Program' },
    ]);
    const { outcome } = await runTool(getAdtTypes, {}, () => ({ status: 200, body }));

    expect(outcome.isError).toBe(false);
    // `JSON.stringify(items)` — 구는 들여쓰기를 주지 않는다(`handleGetAllTypes.ts:93`).
    expect(outcome.text).toBe(
      '[{"name":"CLAS/OC","description":"Class"},{"name":"PROG/P","description":"Program"}]',
    );
  });

  it('항목이 하나면 파서가 객체를 주는데 그 갈래도 배열로 접는다', async () => {
    const body = namedItemList([{ name: 'DEVC/K', description: 'Package' }]);
    const { outcome } = await runTool(getAdtTypes, {}, () => ({ status: 200, body }));

    expect(JSON.parse(outcome.text)).toEqual([{ name: 'DEVC/K', description: 'Package' }]);
  });

  it('알아볼 수 없는 문서는 빈 배열이다 (오류가 아니다)', async () => {
    const { outcome } = await runTool(getAdtTypes, {}, () => ({
      status: 200,
      body: '<opr:objectTypes xmlns:opr="x"><opr:objectType name="CLAS"/></opr:objectTypes>',
    }));

    expect(outcome.isError).toBe(false);
    expect(outcome.text).toBe('[]');
  });
});

describe('갈래', () => {
  it('HTTP 실패는 `ADT error: ` 접두사로 접는다 (`Error: `가 아니다)', async () => {
    const { outcome } = await runTool(getAdtTypes, {}, () => ({ status: 500, body: 'boom' }));

    expect(outcome.isError).toBe(true);
    // 구 `:104` — `ADT error: ${String(error)}`. 접두사가 계약이다.
    expect(outcome.text.startsWith('ADT error: ')).toBe(true);
  });
});
